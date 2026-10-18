# AIVES helper targets: AWS ops (stop/start the app host, restore Postgres)
# and Terraform checks.
#
# Windows: run from Git Bash or WSL. make is not bundled with Git Bash
# (install it with `winget install ezwinports.make`). AWS targets need AWS CLI v2
# and team (non-root) credentials for the account that runs the stack.
# The same Makefile is shipped to /opt/aives on the EC2 host for db-restore.

SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:
.DEFAULT_GOAL := help

AWS_REGION ?= ap-southeast-1
ENV ?= prod
TF_DIR := infrastructure/terraform
TERRAFORM ?= terraform
INSTANCE_NAME ?= aives-$(ENV)-app
COMPOSE_FILE ?= docker-compose.yml
PG_EXEC ?= docker compose -f $(COMPOSE_FILE) exec -T postgres
BACKUP_BUCKET ?=
BACKUP_KEY ?=
CONFIRM ?=

INSTANCE_ID_CMD = aws ec2 describe-instances --region $(AWS_REGION) \
  --filters Name=tag:Name,Values=$(INSTANCE_NAME) Name=tag:Project,Values=aives \
            Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId' --output text

# Resolves exactly one instance id into $id (shell variable).
define RESOLVE_INSTANCE
ids="$$($(INSTANCE_ID_CMD))"
set -- $$ids
if [ "$$#" -ne 1 ]; then
  echo "expected exactly 1 instance tagged Name=$(INSTANCE_NAME), Project=aives; found $$#: $$ids" >&2
  exit 1
fi
id="$$1"
endef

IP_NOTE = Note: with use_elastic_ip=true (default) the Elastic IP stays attached while stopped (~3.6 USD/month) and CloudFront keeps working after aws-start. With use_elastic_ip=false the public IP is released on stop; run `terraform apply` after aws-start to repoint CloudFront.

.PHONY: help instance-id aws-stop aws-start db-restore tf-validate tf-plan

help:
	@echo "AIVES make targets (Windows: Git Bash or WSL)"
	echo "  instance-id   print the app host EC2 instance id (tag Name=$(INSTANCE_NAME))"
	echo "  aws-stop      stop the app host (saves EC2 cost; EBS + EIP still billed)"
	echo "  aws-start     start the app host and print its public IP"
	echo "  db-restore    restore the latest (or BACKUP_KEY) pg_dump from S3; needs CONFIRM=yes"
	echo "                local:  make db-restore CONFIRM=yes BACKUP_BUCKET=<bucket>"
	echo "                on EC2: cd /opt/aives && sudo make db-restore CONFIRM=yes PG_EXEC=\"docker exec -i aives-postgres\" BACKUP_BUCKET=<bucket>"
	echo "  tf-validate   terraform fmt -check, init -backend=false, validate (no AWS calls)"
	echo "  tf-plan       terraform init + plan -out=tfplan (team only; credentials + terraform.tfvars)"

instance-id:
	@$(RESOLVE_INSTANCE)
	echo "$$id"

aws-stop:
	@$(RESOLVE_INSTANCE)
	aws ec2 stop-instances --region $(AWS_REGION) --instance-ids "$$id" >/dev/null
	echo "stopping $$id ..."
	aws ec2 wait instance-stopped --region $(AWS_REGION) --instance-ids "$$id"
	echo "stopped $$id"
	echo '$(IP_NOTE)'

aws-start:
	@$(RESOLVE_INSTANCE)
	aws ec2 start-instances --region $(AWS_REGION) --instance-ids "$$id" >/dev/null
	echo "starting $$id ..."
	aws ec2 wait instance-running --region $(AWS_REGION) --instance-ids "$$id"
	ip="$$(aws ec2 describe-instances --region $(AWS_REGION) --instance-ids "$$id" \
	  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
	echo "running $$id, public IP $$ip (port 80 is reachable only from CloudFront)"
	echo '$(IP_NOTE)'

# Restores a gzip'd pg_dump (made with --clean --if-exists) into the aives DB.
# Local stack:  make db-restore CONFIRM=yes [BACKUP_BUCKET=...] [BACKUP_KEY=pg/aives-...sql.gz]
# EC2 host:     cd /opt/aives && sudo make db-restore CONFIRM=yes \
#                 PG_EXEC="docker exec -i aives-postgres" BACKUP_BUCKET=<backups bucket>
db-restore:
	@if [ "$(CONFIRM)" != "yes" ]; then
	  echo "db-restore drops and recreates objects in the target DB. Stop the backend first" >&2
	  echo "(docker stop aives-backend on EC2), then re-run with CONFIRM=yes." >&2
	  exit 1
	fi
	bucket="$(BACKUP_BUCKET)"
	if [ -z "$$bucket" ]; then
	  bucket="$$($(TERRAFORM) -chdir=$(TF_DIR) output -raw backups_bucket 2>/dev/null || true)"
	fi
	if [ -z "$$bucket" ]; then
	  echo "set BACKUP_BUCKET=<backups bucket> (terraform output backups_bucket)" >&2
	  exit 1
	fi
	key="$(BACKUP_KEY)"
	if [ -z "$$key" ]; then
	  key="$$(aws s3api list-objects-v2 --region $(AWS_REGION) --bucket "$$bucket" --prefix pg/ \
	    --query 'sort_by(Contents || `[]`, &LastModified)[-1].Key' --output text)"
	fi
	if [ -z "$$key" ] || [ "$$key" = "None" ]; then
	  echo "no backups found under s3://$$bucket/pg/" >&2
	  exit 1
	fi
	tmp="$$(mktemp)"
	trap 'rm -f "$$tmp"' EXIT
	echo "restoring s3://$$bucket/$$key ..."
	aws s3 cp --region $(AWS_REGION) "s3://$$bucket/$$key" "$$tmp"
	gunzip -c "$$tmp" | $(PG_EXEC) psql -v ON_ERROR_STOP=1 -q -U aives -d aives
	echo "restored $$key"

tf-validate:
	$(TERRAFORM) -chdir=$(TF_DIR) fmt -check -recursive
	$(TERRAFORM) -chdir=$(TF_DIR) init -backend=false -input=false
	$(TERRAFORM) -chdir=$(TF_DIR) validate

# Team only: needs AWS credentials and $(TF_DIR)/terraform.tfvars.
tf-plan:
	$(TERRAFORM) -chdir=$(TF_DIR) init -input=false
	$(TERRAFORM) -chdir=$(TF_DIR) plan -input=false -out=tfplan
