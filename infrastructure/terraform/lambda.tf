# STT (speech-to-text) Lambda from a container image in the stt ECR repo.
# Bootstrap: leave stt_image_uri empty on the first apply, push an image to
# ecr_stt_url (Step 9, lambda/stt/), then set stt_image_uri and apply again.
# After creation the deploy workflow owns the code (update-function-code).
resource "aws_iam_role" "stt_lambda" {
  name = "${local.name}-stt-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "stt_basic" {
  role       = aws_iam_role.stt_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "stt" {
  name              = "/aws/lambda/${local.stt_function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "stt" {
  count = var.stt_image_uri == "" ? 0 : 1

  function_name = local.stt_function_name
  package_type  = "Image"
  image_uri     = var.stt_image_uri
  architectures = [var.stt_architecture]
  memory_size   = var.stt_memory_mb
  timeout       = var.stt_timeout_sec
  role          = aws_iam_role.stt_lambda.arn

  depends_on = [
    aws_cloudwatch_log_group.stt,
    aws_ecr_repository_policy.stt,
    aws_iam_role_policy_attachment.stt_basic,
  ]

  lifecycle {
    # deploy.yml updates code
    ignore_changes = [image_uri]
  }
}

# TTS (text-to-speech, Kokoro-82M) Lambda from a container image in the tts
# ECR repo (lambda/tts/). Same bootstrap as STT: leave tts_image_uri empty on
# the first apply, push an image to ecr_tts_url, then set it and apply again.
resource "aws_iam_role" "tts_lambda" {
  name = "${local.name}-tts-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "tts_basic" {
  role       = aws_iam_role.tts_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "tts" {
  name              = "/aws/lambda/${local.tts_function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "tts" {
  count = var.tts_image_uri == "" ? 0 : 1

  function_name = local.tts_function_name
  package_type  = "Image"
  image_uri     = var.tts_image_uri
  architectures = [var.tts_architecture]
  memory_size   = var.tts_memory_mb
  timeout       = var.tts_timeout_sec
  role          = aws_iam_role.tts_lambda.arn

  depends_on = [
    aws_cloudwatch_log_group.tts,
    aws_ecr_repository_policy.tts,
    aws_iam_role_policy_attachment.tts_basic,
  ]

  lifecycle {
    # deploy.yml updates code
    ignore_changes = [image_uri]
  }
}
