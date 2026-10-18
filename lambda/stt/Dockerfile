FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies including ffmpeg for audio decoding
RUN microdnf update -y && \
    microdnf install -y ffmpeg tar gzip && \
    microdnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function handler
COPY handler.py .

CMD [ "handler.handler" ]
