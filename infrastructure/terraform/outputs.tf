output "api_gateway_url" {
  value       = aws_apigatewayv2_stage.default.invoke_url
  description = "API Gateway URL fronting backend"
}

output "cloudfront_domain" {
  value       = aws_cloudfront_distribution.frontend.domain_name
  description = "CloudFront domain for React application"
}

output "audio_bucket" {
  value       = aws_s3_bucket.audio.bucket
  description = "S3 bucket for uploaded audio"
}

output "session_table" {
  value       = aws_dynamodb_table.sessions.name
  description = "DynamoDB table storing session context"
}

output "rds_endpoint" {
  value       = aws_db_instance.postgres.address
  description = "RDS endpoint for transactional data"
}
