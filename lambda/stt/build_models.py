"""Build-time model preparation for the STT Lambda image.

- Vietnamese: vinai/PhoWhisper-small is published in Hugging Face Transformers
  format, which faster-whisper cannot load. Convert it to CTranslate2 (int8)
  and write the tokenizer.json / preprocessor_config.json faster-whisper needs.
- English: PhoWhisper is fine-tuned on Vietnamese only, so English exams use
  the stock Whisper small model, already published in CTranslate2 format.

Fails the build loudly if anything is missing, instead of letting the Lambda
fall back to another model at runtime.
"""
import argparse
import os
import shutil
import sys
import tempfile

REQUIRED_FILES = ("model.bin", "config.json", "tokenizer.json")
VOCABULARY_FILES = ("vocabulary.json", "vocabulary.txt")


def convert_transformers_model(model_id, out_dir):
    from ctranslate2.converters import TransformersConverter
    from transformers import WhisperFeatureExtractor, WhisperTokenizerFast

    with tempfile.TemporaryDirectory() as tmp:
        TransformersConverter(model_id).convert(tmp, quantization="int8", force=True)
        WhisperTokenizerFast.from_pretrained(model_id).save_pretrained(tmp)
        WhisperFeatureExtractor.from_pretrained(model_id).save_pretrained(tmp)
        shutil.copytree(tmp, out_dir)


def download_ct2_model(model_id, out_dir):
    from huggingface_hub import snapshot_download

    snapshot_download(repo_id=model_id, local_dir=out_dir)


def check(out_dir):
    missing = [f for f in REQUIRED_FILES if not os.path.exists(os.path.join(out_dir, f))]
    if not any(os.path.exists(os.path.join(out_dir, f)) for f in VOCABULARY_FILES):
        missing.append("vocabulary.json|txt")
    if missing:
        sys.exit(f"{out_dir} is missing {', '.join(missing)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--vi", required=True)
    parser.add_argument("--en", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    vi_dir = os.path.join(args.out, "vi")
    en_dir = os.path.join(args.out, "en")
    convert_transformers_model(args.vi, vi_dir)
    download_ct2_model(args.en, en_dir)
    for d in (vi_dir, en_dir):
        check(d)
        print(f"ready: {d}: {sorted(os.listdir(d))}")


if __name__ == "__main__":
    main()
