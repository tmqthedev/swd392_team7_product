# Latest Amazon Linux 2023 AMI for the chosen architecture (public SSM param).
data "aws_ssm_parameter" "al2023" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${var.instance_architecture}"
}

# ---------------------------------------------------------------------------
# Instance role (least privilege)
# ---------------------------------------------------------------------------
resource "aws_iam_role" "ec2" {
  name = "${local.name}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Session Manager shell access (replaces SSH) + SSM Run Command for deploys.
resource "aws_iam_role_policy_attachment" "ec2_ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "app" {
  name = "${local.name}-app"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPullBackend"
        Effect = "Allow"
        Action = [
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchCheckLayerAvailability",
        ]
        Resource = aws_ecr_repository.this["backend"].arn
      },
      {
        Sid    = "AppObjects"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.this["audio"].arn}/*",
          "${aws_s3_bucket.this["materials"].arn}/*",
        ]
      },
      {
        Sid    = "ListBuckets"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = [
          aws_s3_bucket.this["audio"].arn,
          aws_s3_bucket.this["materials"].arn,
          aws_s3_bucket.this["backups"].arn,
        ]
      },
      {
        Sid      = "BackupsWrite"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.this["backups"].arn}/pg/*"
      },
      {
        Sid    = "BackupsAndDeployRead"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "${aws_s3_bucket.this["backups"].arn}/pg/*",
          "${aws_s3_bucket.this["backups"].arn}/deploy/*",
        ]
      },
      {
        Sid    = "SessionTable"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:DescribeTable",
        ]
        Resource = aws_dynamodb_table.session.arn
      },
      {
        Sid      = "InvokeSpeech"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = [local.stt_function_arn, local.tts_function_arn]
      },
      {
        Sid    = "Bedrock"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = [
          "arn:aws:bedrock:*::foundation-model/*",
          "arn:aws:bedrock:${var.aws_region}:${local.account_id}:inference-profile/*",
        ]
      },
      {
        Sid    = "AppConfig"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter${local.ssm_prefix}",
          "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter${local.ssm_prefix}/*",
        ]
      },
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2"
  role = aws_iam_role.ec2.name
}

# ---------------------------------------------------------------------------
# Postgres data volume: separate from the root disk so it survives instance
# replacement (new AMI, instance_type change, user_data change).
# ---------------------------------------------------------------------------
resource "aws_ebs_volume" "data" {
  availability_zone = local.az
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  final_snapshot    = true

  tags = { Name = "${local.name}-pgdata" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name

  root_block_device {
    volume_size = var.root_volume_gb
    volume_type = "gp3"
    encrypted   = true
  }

  # IMDSv2 only; hop limit 2 so containers can reach the role credentials.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  dynamic "credit_specification" {
    for_each = startswith(var.instance_type, "t") ? [1] : []
    content {
      cpu_credits = var.cpu_credits
    }
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    aws_region            = var.aws_region
    environment           = var.environment
    ssm_prefix            = local.ssm_prefix
    backups_bucket        = aws_s3_bucket.this["backups"].bucket
    data_volume_id_nodash = replace(aws_ebs_volume.data.id, "-", "")
    compose_version       = var.docker_compose_version
    ecr_registry          = local.ecr_registry
    backend_repo_url      = aws_ecr_repository.this["backend"].repository_url
    cron_tz               = var.backup_cron_timezone
  })

  # The host downloads the deploy files and reads SSM on first boot.
  # (aws_ssm_parameter.config is NOT listed: APP_BASE_URL needs the CloudFront
  # domain, which needs this instance's DNS -> cycle. The first boot deploy is
  # expected to be skipped anyway until the team sets the SSM secrets.)
  depends_on = [aws_s3_object.deploy, aws_iam_role_policy.app, aws_ssm_parameter.team]

  tags = { Name = "${local.name}-app" }

  lifecycle {
    # New AL2023 releases must not replace the box.
    ignore_changes = [ami]
  }
}

resource "aws_volume_attachment" "data" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.data.id
  instance_id                    = aws_instance.app.id
  stop_instance_before_detaching = true
}

resource "aws_eip" "app" {
  count    = var.use_elastic_ip ? 1 : 0
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = "${local.name}-app" }
}

locals {
  origin_dns = var.use_elastic_ip ? aws_eip.app[0].public_dns : aws_instance.app.public_dns
  public_ip  = var.use_elastic_ip ? aws_eip.app[0].public_ip : aws_instance.app.public_ip
}
