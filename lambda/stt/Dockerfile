# Stage 1: fetch and convert the speech models once, at build time.
# Runs on the build host's own platform (no QEMU) because the CTranslate2
# output is platform-independent. torch only lives in this stage.
FROM --platform=$BUILDPLATFORM python:3.12-slim AS models

ARG STT_VI_MODEL=vinai/PhoWhisper-small
ARG STT_EN_MODEL=Systran/faster-whisper-small

RUN pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      "torch>=2.2,<3" "transformers>=4.40,<5" "ctranslate2>=4.3,<5" "huggingface_hub>=0.23"

COPY build_models.py /build_models.py
RUN python /build_models.py --vi "$STT_VI_MODEL" --en "$STT_EN_MODEL" --out /opt/models

# Stage 2: the Lambda runtime image.
# python:3.12 is built on Amazon Linux 2023 (glibc 2.34). The 3.11 image is
# Amazon Linux 2 (glibc 2.26), for which current PyAV publishes no wheels, so
# pip tried to build it from source and failed.
FROM public.ecr.aws/lambda/python:3.12

# No system packages needed: faster-whisper decodes audio through PyAV, whose
# wheels bundle FFmpeg.

WORKDIR ${LAMBDA_TASK_ROOT}

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Models are baked into the image: Lambda's filesystem is read-only outside
# /tmp, so nothing may be downloaded at cold start.
COPY --from=models /opt/models /opt/models
ENV STT_MODEL_DIR_VI=/opt/models/vi \
    STT_MODEL_DIR_EN=/opt/models/en \
    HF_HUB_OFFLINE=1

COPY handler.py .

CMD [ "handler.handler" ]
