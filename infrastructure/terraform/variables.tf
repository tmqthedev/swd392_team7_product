variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "viva-hybrid"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "backend_base_url" {
  description = "HTTP endpoint of EC2/ECS backend service fronted by API Gateway"
  type        = string
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "vivaadmin"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}
