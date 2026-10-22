import base64
import json
import logging
import os
import tempfile

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# One CTranslate2 model per exam language, baked into the image by
# build_models.py: PhoWhisper-small for Vietnamese, Whisper small for English.
MODEL_DIRS = {
    "vi": os.environ.get("STT_MODEL_DIR_VI", "/opt/models/vi"),
    "en": os.environ.get("STT_MODEL_DIR_EN", "/opt/models/en"),
}
DEVICE = os.environ.get("STT_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("STT_COMPUTE_TYPE", "int8")

_models = {}


def normalize_language(language):
    return "en" if str(language or "vi").lower().startswith("en") else "vi"


def get_model(language="vi"):
    language = normalize_language(language)
    if language not in _models:
        model_dir = MODEL_DIRS[language]
        logger.info(f"Loading speech model for {language}: {model_dir} on {DEVICE} ({COMPUTE_TYPE})")
        from faster_whisper import WhisperModel
        # No fallback: a missing model is a broken image and must fail loudly.
        _models[language] = WhisperModel(model_dir, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _models[language]

def handler(event, context):
    """
    AWS Lambda entrypoint for speech-to-text.
    Supports warm-up pings and audio transcription.
    """
    # 1. Warm-up invocation
    if event.get("action") == "warmup":
        logger.info("Executing warm-up ping...")
        language = normalize_language(event.get("language", "vi"))
        get_model(language)
        return {"status": "warm", "language": language, "model": MODEL_DIRS[language]}

    audio_b64 = event.get("audio_base64")
    if not audio_b64:
        return {
            "text": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
        }

    audio_bytes = base64.b64decode(audio_b64)
    language = normalize_language(event.get("language", "vi"))
    content_type = event.get("content_type", "audio/webm")
    suffix = ".webm" if "webm" in content_type else ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        whisper = get_model(language)
        segments, info = whisper.transcribe(
            tmp_path,
            language=language,
            word_timestamps=True,
            beam_size=5,
        )

        full_text_parts = []
        words_list = []
        prob_sum = 0.0
        prob_count = 0

        for segment in segments:
            full_text_parts.append(segment.text.strip())
            if segment.words:
                for w in segment.words:
                    word_str = w.word.strip()
                    if word_str:
                        words_list.append({
                            "word": word_str,
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "confidence": round(w.probability, 3),
                        })
                        prob_sum += w.probability
                        prob_count += 1

        full_text = " ".join(full_text_parts).strip()
        avg_confidence = round(prob_sum / prob_count, 3) if prob_count > 0 else 0.9

        return {
            "text": full_text,
            "confidence": avg_confidence,
            "duration": round(info.duration, 3) if hasattr(info, "duration") else 0.0,
            "words": words_list,
        }
    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        raise e
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
