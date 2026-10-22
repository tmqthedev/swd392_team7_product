# Stage 1: fetch the Kokoro models once, at build time.
# Runs on the build host's own platform (no QEMU) because ONNX models and the
# .npy voicepacks are platform-independent. torch only lives in this stage
# (to read the Vietnamese .pt voicepacks).
FROM --platform=$BUILDPLATFORM python:3.12-slim AS models

ARG TTS_VI_MODEL=contextboxai/Kokoro-Vietnamese

RUN pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      "torch>=2.2,<3" "numpy>=2" "huggingface_hub>=0.23"

COPY build_models.py /build_models.py
RUN python /build_models.py --vi "$TTS_VI_MODEL" --out /opt/models

# Stage 2: the Lambda runtime image (Amazon Linux 2023, as for STT).
FROM public.ecr.aws/lambda/python:3.12

# No system packages needed: kokoro-onnx phonemizes English through the
# espeak-ng library bundled in the espeakng-loader wheel, and Vietnamese G2P
# (vig2p / sea-g2p) ships as wheels.

WORKDIR ${LAMBDA_TASK_ROOT}

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Models are baked into the image: Lambda's filesystem is read-only outside
# /tmp, so nothing may be downloaded at cold start.
COPY --from=models /opt/models /opt/models
ENV TTS_MODEL_DIR_VI=/opt/models/vi \
    TTS_MODEL_DIR_EN=/opt/models/en \
    HF_HUB_OFFLINE=1

COPY handler.py .

CMD [ "handler.handler" ]
