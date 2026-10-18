# Buckets: web (SPA, CloudFront OAC only), audio, materials, backups
# (pg/ dumps + deploy/ files). All private, encrypted, TLS-only.
resource "aws_s3_bucket" "this" {
  for_each = local.bucket_names

  bucket        = each.value
  force_destroy = false

  tags = { Name = each.value }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = aws_s3_bucket.this

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.this["backups"].id

  # Only pg_dump files expire; deploy/ files are kept.
  rule {
    id     = "expire-pg-dumps"
    status = "Enabled"

    filter {
      prefix = "pg/"
    }

    expiration {
      days = var.backup_retention_days
    }
  }

  rule {
    id     = "abort-mpu"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [each.value.arn, "${each.value.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }],
      each.key == "web" ? [{
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${each.value.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
      }] : []
    )
  })

  depends_on = [aws_s3_bucket_public_access_block.this]
}

# The backend hands out presigned PUT/GET URLs for audio (awsClients.getUploadUrl),
# so the browser talks to the audio bucket directly from the CloudFront origin.
resource "aws_s3_bucket_cors_configuration" "audio" {
  bucket = aws_s3_bucket.this["audio"].id

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = ["https://${aws_cloudfront_distribution.main.domain_name}"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Deploy artifacts the EC2 host pulls on first boot. deploy.yml re-uploads
# them on every deploy, so Terraform may show drift here after a deploy that
# changed them; `terraform apply` just re-uploads the committed version.
resource "aws_s3_object" "deploy" {
  for_each = local.deploy_files

  bucket = aws_s3_bucket.this["backups"].id
  key    = "deploy/${each.value}"
  source = "${path.module}/../../${each.value}"
  etag   = filemd5("${path.module}/../../${each.value}")

  depends_on = [aws_s3_bucket_server_side_encryption_configuration.this]
}
