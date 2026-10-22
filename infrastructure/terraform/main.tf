# AIVES production infrastructure (Step 11).
#
# Browser -> CloudFront -> S3 (SPA via OAC)
#                       -> EC2:80 (/api/*, /socket.io/*) -> Docker: backend + pgvector
# EC2 -> S3 audio/materials/backups, DynamoDB session context, STT + TTS Lambdas,
#        Bedrock, SSM parameters. GitHub Actions deploys through OIDC.

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  az         = var.availability_zone != "" ? var.availability_zone : "${var.aws_region}a"
  ssm_prefix = "/${var.project}/${var.environment}"

  stt_function_name = "${local.name}-stt"
  stt_function_arn  = "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${local.stt_function_name}"

  tts_function_name = "${local.name}-tts"
  tts_function_arn  = "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${local.tts_function_name}"

  bucket_names = { for k in ["web", "audio", "materials", "backups"] : k => "${local.name}-${k}-${local.account_id}" }

  ecr_registry = "${local.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  # Files the EC2 host pulls from s3://<backups>/deploy/ (re-uploaded by deploy.yml).
  deploy_files = toset([
    "Makefile", # db-restore on the host
    "docker-compose.prod.yml",
    "scripts/fetch-ssm-env.sh",
    "scripts/deploy-on-host.sh",
    "scripts/pg-backup.sh",
  ])
}
