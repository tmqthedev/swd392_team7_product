FROM public.ecr.aws/lambda/python:3.11

# No system packages needed: faster-whisper decodes audio through PyAV, whose
# wheels bundle FFmpeg. (This base image is Amazon Linux 2: it has yum, not
# microdnf.)

WORKDIR ${LAMBDA_TASK_ROOT}

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function handler
COPY handler.py .

CMD [ "handler.handler" ]
