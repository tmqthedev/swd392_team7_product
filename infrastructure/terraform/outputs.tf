output "cloudfront_domain" {
  description = "CloudFront domain name of the app."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "app_url" {
  description = "Public URL of the app (SPA + /api)."
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (cache invalidation)."
  value       = aws_cloudfront_distribution.main.id
}

output "instance_id" {
  description = "EC2 app host instance ID (aws ssm start-session --target <id>)."
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Public IPv4 of the app host (Elastic IP when use_elastic_ip = true). Port 80 is reachable only from CloudFront."
  value       = local.public_ip
}

output "ecr_backend_url" {
  description = "ECR repository URL for the backend image."
  value       = aws_ecr_repository.this["backend"].repository_url
}

output "ecr_stt_url" {
  description = "ECR repository URL for the STT Lambda image."
  value       = aws_ecr_repository.this["stt"].repository_url
}

output "ecr_tts_url" {
  description = "ECR repository URL for the TTS Lambda image."
  value       = aws_ecr_repository.this["tts"].repository_url
}

output "bucket_names" {
  description = "S3 bucket names by role (web, audio, materials, backups)."
  value       = { for k, b in aws_s3_bucket.this : k => b.bucket }
}

output "backups_bucket" {
  description = "Backups bucket (pg/ dumps, deploy/ files); used by make db-restore."
  value       = aws_s3_bucket.this["backups"].bucket
}

output "session_table_name" {
  description = "DynamoDB session-context table name."
  value       = aws_dynamodb_table.session.name
}

output "stt_function_name" {
  description = "STT Lambda function name (empty until stt_image_uri is set)."
  value       = length(aws_lambda_function.stt) > 0 ? aws_lambda_function.stt[0].function_name : ""
}

output "tts_function_name" {
  description = "TTS Lambda function name (empty until tts_image_uri is set)."
  value       = length(aws_lambda_function.tts) > 0 ? aws_lambda_function.tts[0].function_name : ""
}

output "ec2_role_arn" {
  description = "IAM role ARN of the EC2 instance."
  value       = aws_iam_role.ec2.arn
}

output "github_deploy_role_arn" {
  description = "IAM role ARN assumed by the GitHub deploy workflow (AWS_DEPLOY_ROLE_ARN)."
  value       = aws_iam_role.github_deploy.arn
}

output "ssm_parameter_prefix" {
  description = "SSM prefix holding the runtime config and secrets."
  value       = local.ssm_prefix
}

output "github_actions_variables" {
  description = "Repository variables for .github/workflows/deploy.yml (gh variable set NAME --body VALUE)."
  value = {
    AWS_DEPLOY_ROLE_ARN        = aws_iam_role.github_deploy.arn
    AWS_REGION                 = var.aws_region
    AWS_INSTANCE_ID            = aws_instance.app.id
    ECR_BACKEND_REPOSITORY     = aws_ecr_repository.this["backend"].repository_url
    ECR_STT_REPOSITORY         = aws_ecr_repository.this["stt"].repository_url
    STT_FUNCTION_NAME          = length(aws_lambda_function.stt) > 0 ? aws_lambda_function.stt[0].function_name : ""
    ECR_TTS_REPOSITORY         = aws_ecr_repository.this["tts"].repository_url
    TTS_FUNCTION_NAME          = length(aws_lambda_function.tts) > 0 ? aws_lambda_function.tts[0].function_name : ""
    WEB_BUCKET                 = aws_s3_bucket.this["web"].bucket
    BACKUPS_BUCKET             = aws_s3_bucket.this["backups"].bucket
    CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.main.id
  }
}
