terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State: local backend (terraform.tfstate in this directory, gitignored) by
  # default. For shared team state, bootstrap a versioned S3 bucket by hand
  # (see README "Deploy lên AWS" -> "Bootstrap state"), uncomment the block
  # below and run `terraform init -migrate-state`.
  #
  # backend "s3" {
  #   bucket       = "aives-tfstate-<account_id>"
  #   key          = "aives/prod/terraform.tfstate"
  #   region       = "ap-southeast-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}
