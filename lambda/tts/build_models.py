"""Build-time model preparation for the TTS Lambda image.

- Vietnamese: contextboxai/Kokoro-Vietnamese (Kokoro-82M fine-tune, Apache-2.0)
  ships an ONNX export plus PyTorch voicepacks. The voicepacks are converted
  to .npy here so the runtime image needs onnxruntime only, not torch.
- English: stock Kokoro-82M (hexgrad/Kokoro-82M, Apache-2.0) as the ONNX
  export published by kokoro-onnx (model + voices bin).

Fails the build loudly if anything is missing, instead of letting the Lambda
fall back to another model at runtime.
"""
import argparse
import os
import shutil
import sys
import urllib.request

VI_FILES = ("kokoro_vi.onnx", "config.json")
VI_VOICES = (
    "diem_trinh", "duc_an", "duc_duy", "hung_thinh", "mai_linh", "mai_loan", "manh_dung",
    "my_yen", "ngoc_huyen", "phat_tai", "storyvert", "thanh_dat", "thuc_trinh", "tuan_ngoc",
)
EN_RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
EN_FILES = ("kokoro-v1.0.onnx", "voices-v1.0.bin")


def prepare_vi(repo_id, out_dir):
    import numpy as np
    import torch
    from huggingface_hub import hf_hub_download

    os.makedirs(os.path.join(out_dir, "voices"), exist_ok=True)
    for name in VI_FILES:
        shutil.copy(hf_hub_download(repo_id=repo_id, filename=name), os.path.join(out_dir, name))
    for voice in VI_VOICES:
        pack = torch.load(
            hf_hub_download(repo_id=repo_id, filename=f"voicepacks/{voice}.pt"),
            map_location="cpu",
            weights_only=True,
        )
        array = pack.detach().cpu().numpy().astype(np.float32)
        if array.ndim != 3 or array.shape[1:] != (1, 256):
            sys.exit(f"voicepack {voice} has unexpected shape {array.shape}")
        np.save(os.path.join(out_dir, "voices", f"{voice}.npy"), array)


def prepare_en(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for name in EN_FILES:
        urllib.request.urlretrieve(f"{EN_RELEASE}/{name}", os.path.join(out_dir, name))


def check(out_dir, names):
    missing = [n for n in names if not os.path.exists(os.path.join(out_dir, n))]
    if missing:
        sys.exit(f"{out_dir} is missing {', '.join(missing)}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--vi", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    vi_dir = os.path.join(args.out, "vi")
    en_dir = os.path.join(args.out, "en")
    prepare_vi(args.vi, vi_dir)
    prepare_en(en_dir)
    check(vi_dir, VI_FILES + tuple(f"voices/{v}.npy" for v in VI_VOICES))
    check(en_dir, EN_FILES)
    for d in (vi_dir, en_dir):
        print(f"ready: {d}: {sorted(os.listdir(d))}")


if __name__ == "__main__":
    main()
