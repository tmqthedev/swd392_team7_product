import base64
import io
import json
import logging
import os
import re
import wave

import numpy as np

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Kokoro-82M ONNX models baked into the image by build_models.py:
# the Vietnamese fine-tune (contextboxai/Kokoro-Vietnamese) and stock English.
MODEL_DIRS = {
    "vi": os.environ.get("TTS_MODEL_DIR_VI", "/opt/models/vi"),
    "en": os.environ.get("TTS_MODEL_DIR_EN", "/opt/models/en"),
}
# Female voices by default for both languages.
DEFAULT_VOICES = {
    "vi": os.environ.get("TTS_VOICE_VI", "diem_trinh"),
    "en": os.environ.get("TTS_VOICE_EN", "af_heart"),
}
SAMPLE_RATE = 24000
CROSSFADE_MS = 50

_engines = {}


def normalize_language(language):
    return "en" if str(language or "vi").lower().startswith("en") else "vi"


class VietnameseEngine:
    """ONNX inference for Kokoro-Vietnamese, following the Apache-2.0
    reference in github.com/iamdinhthuan/Kokoro-Vietnamese (onnx_cli.py)."""

    def __init__(self, model_dir):
        import onnxruntime as ort

        self.model_dir = model_dir
        with open(os.path.join(model_dir, "config.json"), encoding="utf-8") as fh:
            config = json.load(fh)
        self.vocab = config["vocab"]
        self.context_length = config["plbert"]["max_position_embeddings"]
        self.session = ort.InferenceSession(
            os.path.join(model_dir, "kokoro_vi.onnx"), providers=["CPUExecutionProvider"]
        )
        self._voices = {}

    def _voicepack(self, voice):
        if voice not in self._voices:
            path = os.path.join(self.model_dir, "voices", f"{voice}.npy")
            if not os.path.exists(path):
                raise ValueError(f"Unknown Vietnamese voice {voice!r}")
            self._voices[voice] = np.load(path)
        return self._voices[voice]

    def synthesize(self, text, voice, speed=1.0):
        from vig2p import phonemize_text

        pack = self._voicepack(voice)
        chunks = []
        for sentence in split_sentences(text):
            phonemes = phonemize_text(sentence)
            if not phonemes:
                continue
            ids = [self.vocab[p] for p in phonemes if p in self.vocab]
            if len(ids) + 2 > self.context_length:
                raise ValueError(f"Sentence too long for TTS: {len(ids) + 2} phonemes")
            style = pack[min(len(phonemes), pack.shape[0]) - 1].astype(np.float32)
            waveform, _ = self.session.run(None, {
                "input_ids": np.asarray([[0, *ids, 0]], dtype=np.int64),
                "ref_s": style,
                "speed": np.asarray(float(speed), dtype=np.float32),
            })
            chunks.append(np.asarray(waveform, dtype=np.float32).reshape(-1))
        return merge_chunks(chunks, round(SAMPLE_RATE * CROSSFADE_MS / 1000))


class EnglishEngine:
    def __init__(self, model_dir):
        from kokoro_onnx import Kokoro

        self.kokoro = Kokoro(
            os.path.join(model_dir, "kokoro-v1.0.onnx"),
            os.path.join(model_dir, "voices-v1.0.bin"),
        )

    def synthesize(self, text, voice, speed=1.0):
        samples, sample_rate = self.kokoro.create(text, voice=voice, speed=speed, lang="en-us")
        if sample_rate != SAMPLE_RATE:
            raise RuntimeError(f"Unexpected sample rate {sample_rate}")
        return np.asarray(samples, dtype=np.float32)


def get_engine(language):
    if language not in _engines:
        logger.info(f"Loading TTS model for {language}: {MODEL_DIRS[language]}")
        engine_cls = EnglishEngine if language == "en" else VietnameseEngine
        # No fallback: a missing model is a broken image and must fail loudly.
        _engines[language] = engine_cls(MODEL_DIRS[language])
    return _engines[language]


def split_sentences(text):
    normalized = re.sub(r"\s+", " ", text.strip())
    parts = re.split(r"(?<=[.!?…])\s+", normalized)
    return [p for p in parts if p]


def merge_chunks(chunks, crossfade):
    chunks = [c for c in chunks if len(c) > 0]
    if not chunks:
        return np.array([], dtype=np.float32)
    merged = chunks[0]
    for chunk in chunks[1:]:
        overlap = min(crossfade, len(merged), len(chunk))
        if overlap <= 0:
            merged = np.concatenate([merged, chunk])
            continue
        fade_out = np.linspace(1.0, 0.0, overlap + 2, dtype=np.float32)[1:-1]
        mixed = merged[-overlap:] * fade_out + chunk[:overlap] * (1.0 - fade_out)
        merged = np.concatenate([merged[:-overlap], mixed, chunk[overlap:]])
    return merged


def to_wav(samples):
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def handler(event, context):
    """
    AWS Lambda entrypoint for text-to-speech.
    Supports warm-up pings and synthesis; errors are raised, never masked.
    """
    language = normalize_language(event.get("language", "vi"))

    if event.get("action") == "warmup":
        logger.info("Executing warm-up ping...")
        get_engine(language)
        return {"status": "warm", "language": language, "model": MODEL_DIRS[language]}

    text = str(event.get("text") or "").strip()
    if not text:
        raise ValueError("text is required")
    voice = event.get("voice") or DEFAULT_VOICES[language]

    samples = get_engine(language).synthesize(text, voice)
    if len(samples) == 0:
        raise RuntimeError("TTS produced no audio")

    return {
        "audio_base64": base64.b64encode(to_wav(samples)).decode("ascii"),
        "content_type": "audio/wav",
        "duration": round(len(samples) / SAMPLE_RATE, 3),
        "language": language,
        "voice": voice,
    }
