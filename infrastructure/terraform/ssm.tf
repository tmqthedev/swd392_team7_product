# Runtime config for the EC2 host, read by scripts/fetch-ssm-env.sh
# (every parameter under /aives/<env>/ becomes one env var).

# Team-set values. Terraform only creates the placeholder; the real value is
# set with `aws ssm put-parameter --overwrite` and never lives in tf or git.
locals {
  team_params = {
    JWT_SECRET          = "SecureString"
    POSTGRES_PASSWORD   = "SecureString"
    SMTP_PASS           = "SecureString"
    GOOGLE_TTS_KEY_JSON = "SecureString"
    SMTP_USER           = "String"
  }

  # Terraform-managed (non-secret) values.
  config_params = {
    AWS_REGION                 = var.aws_region
    APP_BASE_URL               = "https://${aws_cloudfront_distribution.main.domain_name}"
    AUDIO_BUCKET_NAME          = aws_s3_bucket.this["audio"].bucket
    MATERIALS_BUCKET_NAME      = aws_s3_bucket.this["materials"].bucket
    BACKUP_BUCKET              = aws_s3_bucket.this["backups"].bucket
    SESSION_TABLE_NAME         = aws_dynamodb_table.session.name
    AUDIO_LAMBDA_FUNCTION_NAME = local.stt_function_name
  }
}

resource "aws_ssm_parameter" "team" {
  for_each = local.team_params

  name        = "${local.ssm_prefix}/${each.key}"
  type        = each.value
  value       = "CHANGE_ME"
  description = "Set by the team with aws ssm put-parameter --overwrite; never in tf/git"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "config" {
  for_each = local.config_params

  name        = "${local.ssm_prefix}/${each.key}"
  type        = "String"
  value       = each.value
  description = "Managed by Terraform"
}
