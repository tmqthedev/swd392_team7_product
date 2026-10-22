variable "project" {
  description = "Name prefix for every resource (resources are named <project>-<environment>-*)."
  type        = string
  default     = "aives"
}

variable "environment" {
  description = "Environment name; also the SSM prefix /aives/<environment>/."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for all regional resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "availability_zone" {
  description = "AZ for the subnet, instance and data volume. Empty means <aws_region>a."
  type        = string
  default     = ""
}

variable "vpc_cidr" {
  description = "CIDR of the VPC."
  type        = string
  default     = "10.30.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR of the single public subnet (no NAT, no private subnets)."
  type        = string
  default     = "10.30.1.0/24"
}

variable "instance_type" {
  description = "EC2 instance type for the app host. Must match instance_architecture."
  type        = string
  default     = "t4g.small"
}

variable "instance_architecture" {
  description = "CPU architecture of the instance AMI (arm64 for t4g, x86_64 for t3)."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.instance_architecture)
    error_message = "instance_architecture must be arm64 or x86_64."
  }
}

variable "cpu_credits" {
  description = "CPU credit mode for T-family instances. standard avoids surprise 'unlimited' charges."
  type        = string
  default     = "standard"
}

variable "root_volume_gb" {
  description = "Root (OS + Docker images) gp3 volume size in GiB."
  type        = number
  default     = 8
}

variable "data_volume_gb" {
  description = "Separate gp3 data volume for Postgres in GiB (survives instance replacement)."
  type        = number
  default     = 10
}

variable "use_elastic_ip" {
  description = "Attach an Elastic IP so the CloudFront origin hostname survives stop/start (~3.6 USD/month). With false, run terraform apply after every aws-start."
  type        = bool
  default     = true
}

variable "docker_compose_version" {
  description = "Docker Compose plugin release installed by user_data (checksum-verified)."
  type        = string
  default     = "v2.29.7"
}

variable "backup_retention_days" {
  description = "Days to keep pg_dump backups under s3://<backups>/pg/."
  type        = number
  default     = 14
}

variable "backup_cron_timezone" {
  description = "CRON_TZ for the 02:00 pg_dump cron job."
  type        = string
  default     = "Asia/Ho_Chi_Minh"
}

variable "ecr_keep_images" {
  description = "Number of images kept per ECR repository."
  type        = number
  default     = 10
}

variable "session_ttl_attribute" {
  description = "TTL attribute of the DynamoDB session-context table (backend sessionContextStore uses expiresAt)."
  type        = string
  default     = "expiresAt"
}

variable "stt_image_uri" {
  description = "Initial container image URI for the STT Lambda. Empty skips creating the function (push an image to the stt ECR repo first). The deploy workflow owns the code afterwards."
  type        = string
  default     = ""
}

variable "stt_architecture" {
  description = "Architecture of the STT Lambda image. x86_64: CTranslate2 int8 kernels are ~2x faster than on arm64."
  type        = string
  default     = "x86_64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.stt_architecture)
    error_message = "stt_architecture must be arm64 or x86_64."
  }
}

variable "stt_memory_mb" {
  description = "Memory of the STT Lambda in MB (more memory = more vCPU; new accounts are capped at 3008)."
  type        = number
  default     = 3008
}

variable "stt_timeout_sec" {
  description = "Timeout of the STT Lambda in seconds (a long answer takes about as long as it lasts to transcribe)."
  type        = number
  default     = 120
}

variable "tts_image_uri" {
  description = "Initial container image URI for the TTS (Kokoro) Lambda. Empty skips creating the function (push an image to the tts ECR repo first). The deploy workflow owns the code afterwards."
  type        = string
  default     = ""
}

variable "tts_architecture" {
  description = "Architecture of the TTS Lambda image."
  type        = string
  default     = "arm64"

  validation {
    condition     = contains(["arm64", "x86_64"], var.tts_architecture)
    error_message = "tts_architecture must be arm64 or x86_64."
  }
}

variable "tts_memory_mb" {
  description = "Memory of the TTS Lambda in MB."
  type        = number
  default     = 2048
}

variable "tts_timeout_sec" {
  description = "Timeout of the TTS Lambda in seconds."
  type        = number
  default     = 30
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_All includes the Singapore edge."
  type        = string
  default     = "PriceClass_All"
}

variable "budget_limit_usd" {
  description = "Monthly AWS Budgets cost limit in USD."
  type        = string
  default     = "20"
}

variable "budget_alert_email" {
  description = "Email address for AWS Budgets alerts (must confirm the subscription email)."
  type        = string

  validation {
    condition     = can(regex("@", var.budget_alert_email))
    error_message = "budget_alert_email must be an email address."
  }
}

variable "github_repo" {
  description = "GitHub repository (owner/name) allowed to assume the deploy role."
  type        = string
  default     = "tmqthedev/swd392_team7_product"
}

variable "github_branch" {
  description = "Branch allowed to assume the deploy role."
  type        = string
  default     = "main"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub Actions OIDC provider. Set false if the account already has token.actions.githubusercontent.com."
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the STT Lambda."
  type        = number
  default     = 14
}
