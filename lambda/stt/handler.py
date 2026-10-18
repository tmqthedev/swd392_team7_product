import base64
import json
import logging
import os
import tempfile

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Configuration for PhoWhisper / faster-whisper CTranslate2
MODEL_SIZE = os.environ.get("STT_MODEL_SIZE", "vinai/PhoWhisper-small")
DEVICE = os.environ.get("STT_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("STT_COMPUTE_TYPE", "int8")

_model = None

def get_model():
    global _model
    if _model is None:
        logger.info(f"Loading speech model: {MODEL_SIZE} on {DEVICE} ({COMPUTE_TYPE})")
        from faster_whisper import WhisperModel
        try:
            _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)
        except Exception as e:
            logger.warning(f"Failed to load {MODEL_SIZE}: {e}. Falling back to 'small'")
            _model = WhisperModel("small", device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model

def handler(event, context):
    """
    AWS Lambda entrypoint for speech-to-text.
    Supports warm-up pings and audio transcription.
    """
    # 1. Warm-up invocation
    if event.get("action") == "warmup":
        logger.info("Executing warm-up ping...")
        get_model()
        return {"status": "warm", "model": MODEL_SIZE}

    audio_b64 = event.get("audio_base64")
    if not audio_b64:
        return {
            "text": "",
            "confidence": 0.0,
            "words": [],
            "duration": 0.0,
        }

    audio_bytes = base64.b64decode(audio_b64)
    language = event.get("language", "vi")
    content_type = event.get("content_type", "audio/webm")
    suffix = ".webm" if "webm" in content_type else ".wav"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        whisper = get_model()
        segments, info = whisper.transcribe(
            tmp_path,
            language=language if language in ["vi", "en"] else "vi",
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
