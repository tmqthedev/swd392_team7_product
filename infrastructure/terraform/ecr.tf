resource "aws_ecr_repository" "this" {
  for_each = toset(["backend", "stt", "tts"])

  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE" # :latest is moved on every deploy
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last ${var.ecr_keep_images} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.ecr_keep_images
      }
      action = { type = "expire" }
    }]
  })
}

# Lambda pulls the STT image from this repo.
resource "aws_ecr_repository_policy" "stt" {
  repository = aws_ecr_repository.this["stt"].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LambdaPull"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
      Condition = {
        StringLike = {
          "aws:sourceArn" = "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:*"
        }
      }
    }]
  })
}

# Lambda pulls the TTS image from this repo.
resource "aws_ecr_repository_policy" "tts" {
  repository = aws_ecr_repository.this["tts"].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LambdaPull"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
      Condition = {
        StringLike = {
          "aws:sourceArn" = "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:*"
        }
      }
    }]
  })
}
