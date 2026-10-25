# Step 11 Implementation Plan: AWS deploy (code only, no apply)

WT = `d:\Workspace\swd392_team7_product\.worktrees\e2e-step11-deploy`. Every path below is absolute under WT. Relative paths resolve to the parent repo, so use absolute paths in every tool call and pass `cwd` = WT (or a subdirectory) on every shell command.

## Hard rules (read before starting)

- Do not run `terraform plan`, `terraform apply`, or any AWS CLI command that writes or creates anything. The AWS session is ROOT and not approved. `terraform validate` makes no AWS calls, so it is allowed.
- Do not create or edit `WT\.github\workflows\ci.yml` or `WT\scripts\ci-smoke.mjs`. Another workflow owns them (branch `feat/ci-actions`, workflow `name: CI`).
- Do not edit backend application code (`WT\backend\src\**`), `WT\backend\Dockerfile`, the local `WT\docker-compose.yml`, or `WT\nginx\**`. Step 6 (`feat/e2e-step6-interview`) is unmerged and edits `docker-compose.yml` and the tail of `.env.example` (from line ~103). Touch `.env.example` only in the places named in item 8, so the merge stays clean.
- Tools:
  - Terraform: `D:\tools\terraform\terraform.exe`. Set `$env:TF_PLUGIN_CACHE_DIR='D:\tools\terraform\plugin-cache'` in every shell (the cache is empty, so the first `init` downloads the provider).
  - Bash syntax checks: Git Bash at `D:\Git\bin\bash.exe` (`bash -n file.sh`).
  - `docker compose` v5 CLI is available. The daemon is off, but `config` does not need it.
  - `make`, `shellcheck`, and `actionlint` are NOT installed. Do not install them. Record them as unverified.
- Write all `.sh`, `.tftpl`, `Makefile`, `docker-compose.prod.yml`, and `.tf` files with LF line endings.
- In `.tftpl` files, bash variables must be written `$VAR` (no braces) or `$${VAR}`, because Terraform interpolates `${...}`.
- Time budget is ~75 min. Priority order is items 1–7 (working, validated IaC, compose, scripts, workflow), then 8–10 (docs). If time runs short, shrink the Mermaid ERD (item 9) to core tables. Never cut validation or the verification note.

## Design decisions (made here; do not re-decide)

1. **No nginx in prod.** CloudFront serves the SPA from S3 and forwards `/api/*` and `/socket.io/*` to EC2:80. The backend container publishes `80:3000` directly. A proxy would add memory use on a 2 GB box and nothing else.
2. **SPA deep links use a CloudFront Function (viewer-request rewrite on the default S3 behavior), not `custom_error_response`.** Custom error responses apply to the whole distribution, so they would turn the API's JSON 403/404 responses into `index.html`.
3. **Origin = EC2 public DNS.** `use_elastic_ip` defaults to `true` so the origin hostname survives stop/start. That costs about $3.6/month even while stopped. With `false`, the team must run `terraform apply` after every `aws-start` to repoint CloudFront. The Makefile prints this note.
4. **Config delivery.** Every runtime value lives in SSM under `/aives/<env>/<ENV_VAR_NAME>`:
   - Team-set values (SecureString `JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS`, `GOOGLE_TTS_KEY_JSON`, plus String `SMTP_USER`) are created with the value `CHANGE_ME` and `ignore_changes = [value]`.
   - Terraform-managed String params hold bucket names, the table name, `APP_BASE_URL`, and so on.
   - `scripts/fetch-ssm-env.sh` uses `get-parameters-by-path` and turns them into `/opt/aives/.env.prod`. `docker-compose.prod.yml` maps every variable explicitly via `${VAR:?}` / `${VAR:-default}` interpolation (`docker compose --env-file .env.prod`). There is no `env_file:` key, so validation does not depend on a host path.
   - The Google key JSON is multi-line, so it goes to a file (`/opt/aives/secrets/google-tts-key.json`) that is mounted read-only.
5. **Deploy artifacts (compose file + 3 scripts)** live in the backups bucket under `deploy/`. Terraform uploads them (`aws_s3_object`, so the first boot finds them), and the deploy workflow re-uploads them on every deploy. The backups lifecycle expires only the `pg/` prefix.
6. **STT Lambda bootstrap.** `count = var.stt_image_uri == "" ? 0 : 1`, with `ignore_changes = [image_uri]`, because CI owns the code after creation. The EC2 role's `lambda:InvokeFunction` uses the deterministic function ARN, so it is valid even before the function exists.
7. **DynamoDB.** Table `aives-<env>-session-context`, hash key `sessionId` (S), TTL attribute `expiresAt` (variable). This matches the backend `AwsSessionStore` and Step 6's `sessionContextStore` (`TTL_ATTRIBUTE = 'expiresAt'`, `SESSION_TABLE_AUTO_CREATE=false` in prod).
8. **Provider defaults in prod compose.**
   - `EMBEDDING_PROVIDER` and `LLM_PROVIDER` default to `bedrock`, since those adapters exist on main.
   - `STT_PROVIDER` and `TTS_PROVIDER` default to `mock` until Step 9 lands.
   - All four can be overridden through SSM params of the same name, because fetch-ssm-env writes every param under the prefix.
   - The Bedrock IDs default to `apac.amazon.nova-pro-v1:0` and `amazon.titan-embed-text-v2:0`, and are overridable the same way.
9. **Instance hardening.**
   - IMDSv2 is required with `http_put_response_hop_limit = 2`, so containers get role credentials.
   - `cpu_credits = "standard"` on T-family instances (no surprise "unlimited" charges).
   - `lifecycle { ignore_changes = [ami] }`, so new AL2023 releases do not replace the box.
   - Data volume: `prevent_destroy`, plus `final_snapshot = true`.
   - Attachment: `stop_instance_before_detaching = true`.
10. **Old `lambda/` (Transcribe/Polly orchestrator) is deleted.** Only the Terraform used it, and CI does not touch it. Step 9 adds `lambda/stt/`.
11. **Workflow security.**
    - `workflow_run` deploys only when `event == 'push'` and `head_repository.full_name == github.repository` (blocks fork PRs whose branch is named `main`).
    - No `environment:` key, because that would change the OIDC `sub` claim.
    - Lambda images are built with `provenance: false` (Lambda rejects attestation manifests).
12. **Action majors.**
    - `actions/checkout@v7` and `actions/setup-node@v7`, matching `d:\Workspace\swd392_team7_product\.worktrees\ci-actions\.github\workflows\ci.yml`.
    - `aws-actions/configure-aws-credentials@v6` (6.1.3 is the latest per its releases page) and `aws-actions/amazon-ecr-login@v2`.
    - `docker/setup-qemu-action@v3`, `docker/setup-buildx-action@v3`, and `docker/build-push-action@v6`.
    - The coder may confirm each major with read-only `gh release view --repo <owner>/<repo>` and bump it if a newer major exists. Record the result.
13. **AWS provider `~> 6.0`, `required_version >= 1.6`.** Use v6 syntax, for example `aws_eip { domain = "vpc" }` and `aws_vpc_security_group_*_rule` resources.

---

# Implementation Plan

- [ ] 1. Repo hygiene and remove legacy code.
      - Create `WT\.gitattributes`:
        ```
        *.sh text eol=lf
        *.tftpl text eol=lf
        *.tf text eol=lf
        Makefile text eol=lf
        docker-compose*.yml text eol=lf
        ```
      - Append to `WT\.gitignore`: `.env.prod`, `infrastructure/terraform/tfplan`, `infrastructure/terraform/*.tfplan`. Keep `.terraform.lock.hcl` tracked.
      - `git rm -r` the legacy Lambda: `WT\lambda\src` (handlers.js, providers/, contracts/), `WT\lambda\package.json`, `WT\lambda\package-lock.json`.
      - `git rm` the old Terraform files: `WT\infrastructure\terraform\main.tf` and `outputs.tf`. variables.tf, versions.tf, and terraform.tfvars.example are rewritten in item 3.
      Files: WT\.gitattributes, WT\.gitignore, WT\lambda\**, WT\infrastructure\terraform\{main,outputs}.tf
      Verify: `git -C WT status --short` shows the deletions and the two new/modified files, and nothing under backend/, ci.yml, or docker-compose.yml.

- [ ] 2. Prod compose file, env example, and host scripts. These come before Terraform because Terraform uploads them (item 3 `filemd5`).
      a) `WT\docker-compose.prod.yml`. Header comment: same images as local, differs only by env, run as `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`. Top-level `name: aives`.
         - `postgres`:
           - `image: pgvector/pgvector:pg16`, `container_name: aives-postgres`, `restart: unless-stopped`.
           - `command: ["postgres","-c","shared_buffers=256MB","-c","effective_cache_size=512MB","-c","work_mem=4MB","-c","maintenance_work_mem=64MB","-c","max_connections=40"]`.
           - env: `POSTGRES_USER: aives`, `POSTGRES_DB: aives`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD missing}`.
           - `volumes: ["${AIVES_PG_DATA_DIR:-/data/postgres}:/var/lib/postgresql/data"]` (the mounted EBS data volume). No `ports:`, so Postgres is reachable only on the compose network.
           - `mem_limit: 640m`, `shm_size: 128m`.
           - healthcheck `pg_isready -U aives -d aives`.
           - `logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}`.
         - `backend`:
           - `image: ${BACKEND_IMAGE:?BACKEND_IMAGE missing}`, `container_name: aives-backend`, `restart: unless-stopped`, depends_on postgres `service_healthy`.
           - `ports: ["80:3000"]`, `mem_limit: 768m`, same logging block.
           - healthcheck `wget -qO- http://localhost:3000/health || exit 1`.
           - Volume `./secrets/google-tts-key.json:/run/secrets/google-tts-key.json:ro`.
           - `environment` (explicit map):
             - Fixed values: `PORT: "3000"`, `NODE_ENV: production`, `NODE_OPTIONS: --max-old-space-size=512`, `DB_MOCK_MODE: "false"`, `AWS_MOCK_MODE: "false"`, `DATABASE_URL: postgres://aives:${POSTGRES_PASSWORD:?}@postgres:5432/aives`.
             - Real-endpoint values: `DYNAMODB_ENDPOINT: ""`, `S3_ENDPOINT: ""`, `LAMBDA_ENDPOINT: ""`, `AWS_REGION: ${AWS_REGION:?}`.
             - Resource names from SSM: `AUDIO_BUCKET_NAME: ${AUDIO_BUCKET_NAME:?}`, `MATERIALS_BUCKET_NAME: ${MATERIALS_BUCKET_NAME:?}`, `SESSION_TABLE_NAME: ${SESSION_TABLE_NAME:?}`, `SESSION_TABLE_AUTO_CREATE: "false"`, `AUDIO_LAMBDA_FUNCTION_NAME: ${AUDIO_LAMBDA_FUNCTION_NAME:?}`.
             - URLs and auth: `APP_BASE_URL: ${APP_BASE_URL:?}`, `COOKIE_SECURE: "true"`, `JWT_SECRET: ${JWT_SECRET:?}`.
             - SMTP: `SMTP_HOST: smtp.gmail.com`, `SMTP_PORT: "587"`, `SMTP_SECURE: "false"`, `SMTP_USER: ${SMTP_USER:-}`, `SMTP_PASS: ${SMTP_PASS:-}`, `SMTP_FROM: ${SMTP_FROM:-${SMTP_USER:-no-reply@aives.local}}`.
             - Providers: `EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER:-bedrock}`, `LLM_PROVIDER: ${LLM_PROVIDER:-bedrock}`, `STT_PROVIDER: ${STT_PROVIDER:-mock}`, `TTS_PROVIDER: ${TTS_PROVIDER:-mock}`, `BEDROCK_MODEL_ID: ${BEDROCK_MODEL_ID:-apac.amazon.nova-pro-v1:0}`, `BEDROCK_EMBED_MODEL_ID: ${BEDROCK_EMBED_MODEL_ID:-amazon.titan-embed-text-v2:0}`, `GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/google-tts-key.json`.
             - Jobs: `JOB_QUEUE_CONCURRENCY: ${JOB_QUEUE_CONCURRENCY:-2}`.
           - No AWS keys anywhere: the SDK uses the EC2 role via IMDSv2.
      b) `WT\.env.prod.example`. Committed, placeholders only. It lists exactly the keys fetch-ssm-env produces: `AIVES_ENV=prod`, `AWS_REGION=ap-southeast-1`, `JWT_SECRET=CHANGE_ME`, `POSTGRES_PASSWORD=CHANGE_ME`, `SMTP_USER=`, `SMTP_PASS=`, `APP_BASE_URL=https://dxxxxxxxx.cloudfront.net`, `AUDIO_BUCKET_NAME=aives-prod-audio-123456789012`, `MATERIALS_BUCKET_NAME=...`, `BACKUP_BUCKET=...`, `SESSION_TABLE_NAME=aives-prod-session-context`, `AUDIO_LAMBDA_FUNCTION_NAME=aives-prod-stt`, `BACKEND_IMAGE=123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/aives-prod-backend:latest`, `AIVES_PG_DATA_DIR=./.pgdata-example`. Header comment: "Generated on the host from SSM by scripts/fetch-ssm-env.sh — never fill real values here."
      c) `WT\scripts\fetch-ssm-env.sh` (bash, `set -euo pipefail`). Usage `fetch-ssm-env.sh [out=/opt/aives/.env.prod]`.
         - Sources `/opt/aives/instance.env` if present (provides `AIVES_ENV`, `AWS_REGION`, `SSM_PREFIX`).
         - Runs `aws ssm get-parameters-by-path --path "$SSM_PREFIX/" --with-decryption --recursive --region "$AWS_REGION" --output json`.
         - Uses `jq` to emit `NAME=value` with `NAME` = the last path segment.
         - Writes `GOOGLE_TTS_KEY_JSON` to `/opt/aives/secrets/google-tts-key.json` (dir 700, file 600). It writes `{}` when the value is missing or `CHANGE_ME`, so the bind mount source is always a file and never an auto-created directory. That key is never written into the env file.
         - Rejects (exit 2) any other value containing a newline or a single quote.
         - Writes each line as `KEY='value'` to a temp file, then `chmod 600` and `mv` atomically. Appends `AIVES_ENV`/`AWS_REGION` if they did not come from SSM.
         - Exits 3 with a clear message if `JWT_SECRET` or `POSTGRES_PASSWORD` is missing or still `CHANGE_ME`.
      d) `WT\scripts\deploy-on-host.sh <image-uri>` (bash, `set -euo pipefail`). Steps in order:
         1. `cd /opt/aives` and source `instance.env`.
         2. Run `scripts/fetch-ssm-env.sh /opt/aives/.env.prod`.
         3. ECR login: `aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"`.
         4. `export BACKEND_IMAGE="$1"` (fall back to the contents of `/opt/aives/.backend-image` if no argument).
         5. `docker compose --env-file .env.prod -f docker-compose.prod.yml pull backend`, then `up -d --remove-orphans`.
         6. Write `$BACKEND_IMAGE` to `.backend-image`, then `docker image prune -f`.
         7. Wait up to 120 s for `docker inspect -f '{{.State.Health.Status}}' aives-backend` to be `healthy`, printing `docker logs --tail 50 aives-backend` and exiting 1 on timeout.
      e) `WT\scripts\pg-backup.sh` (bash, `set -euo pipefail`).
         - Sources `/opt/aives/instance.env` (needs `BACKUPS_BUCKET`, `AWS_REGION`). `KEY="pg/aives-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"`.
         - Runs `docker exec aives-postgres pg_dump -U aives -d aives --clean --if-exists --no-owner | gzip -9 | aws s3 cp - "s3://$BACKUPS_BUCKET/$KEY" --region "$AWS_REGION"`, then logs the key. pipefail makes any failure exit non-zero.
         - Comment: retention is the S3 lifecycle on `pg/` (14 days). The "dump when an exam closes" hook is backend logic and is deferred.
      Files: WT\docker-compose.prod.yml, WT\.env.prod.example, WT\scripts\fetch-ssm-env.sh, WT\scripts\deploy-on-host.sh, WT\scripts\pg-backup.sh
      Verify (cwd = WT):
      - `docker compose --env-file .env.prod.example -f docker-compose.prod.yml config --quiet` exits 0.
      - Remove `POSTGRES_PASSWORD` from a temp copy and confirm `config` fails with "POSTGRES_PASSWORD missing", then delete the temp copy.
      - `& 'D:\Git\bin\bash.exe' -n scripts/fetch-ssm-env.sh` (and the same for the other two) exits 0.

- [ ] 3. Terraform core: providers, variables, network, compute, storage, data, ECR, SSM. Split into these files under `WT\infrastructure\terraform\`. `local.name = "${var.project}-${var.environment}"` gives "aives-prod".
      - `versions.tf`:
        - `required_version = ">= 1.6"`, aws `~> 6.0`.
        - A commented `# backend "s3" { bucket = "aives-tfstate-<account_id>", key = "aives/prod/terraform.tfstate", region = "ap-southeast-1", use_lockfile = true, encrypt = true }`, with a comment pointing to the README bootstrap. The default is local state.
      - `providers.tf`: `provider "aws" { region = var.aws_region; default_tags { tags = { Project = var.project, Environment = var.environment, ManagedBy = "terraform" } } }`, plus `data "aws_caller_identity" "current" {}`.
      - `variables.tf`, each with a description:

        | Variable | Default / notes |
        | :---- | :---- |
        | `project` | `"aives"` |
        | `environment` | `"prod"` |
        | `aws_region` | `"ap-southeast-1"` |
        | `availability_zone` | `""` (empty means `${aws_region}a`) |
        | `vpc_cidr` | `"10.30.0.0/16"` |
        | `public_subnet_cidr` | `"10.30.1.0/24"` |
        | `instance_type` | `"t4g.small"` |
        | `instance_architecture` | `"arm64"`, validation in `["arm64","x86_64"]` |
        | `cpu_credits` | `"standard"` |
        | `root_volume_gb` | `8` |
        | `data_volume_gb` | `10` |
        | `use_elastic_ip` | `true` |
        | `docker_compose_version` | `"v2.29.7"` |
        | `backup_retention_days` | `14` |
        | `backup_cron_timezone` | `"Asia/Ho_Chi_Minh"` |
        | `ecr_keep_images` | `10` |
        | `session_ttl_attribute` | `"expiresAt"` |
        | `stt_image_uri` | `""` |
        | `stt_architecture` | `"arm64"`, validation |
        | `stt_memory_mb` | `2048` |
        | `stt_timeout_sec` | `30` |
        | `cloudfront_price_class` | `"PriceClass_All"` |
        | `budget_limit_usd` | `"20"` |
        | `budget_alert_email` | no default; validation `can(regex("@", ...))` |
        | `github_repo` | `"tmqthedev/swd392_team7_product"` |
        | `github_branch` | `"main"` |
        | `create_github_oidc_provider` | `true` |
        | `log_retention_days` | `14` |

      - `main.tf` (locals):
        - `name`, `account_id`, `az`, `ssm_prefix = "/aives/${var.environment}"`, `stt_function_name = "${local.name}-stt"`, `stt_function_arn` (built from region/account/name).
        - `bucket_names = { for k in ["web","audio","materials","backups"] : k => "${local.name}-${k}-${local.account_id}" }`.
        - `ecr_registry = "${account}.dkr.ecr.${region}.amazonaws.com"`.
        - `deploy_files = toset(["docker-compose.prod.yml","scripts/fetch-ssm-env.sh","scripts/deploy-on-host.sh","scripts/pg-backup.sh"])`.
      - `network.tf`:
        - `aws_vpc` (DNS support and hostnames on), `aws_internet_gateway`, one `aws_subnet` public (`map_public_ip_on_launch = true`, az `local.az`), `aws_route_table` with 0.0.0.0/0 → IGW plus an association. No NAT and no private subnets.
        - `data "aws_ec2_managed_prefix_list" "cloudfront" { name = "com.amazonaws.global.cloudfront.origin-facing" }`.
        - `aws_security_group` "app" with no inline rules, plus `aws_vpc_security_group_ingress_rule`: tcp 80 from `prefix_list_id = data...cloudfront.id`, description "HTTP from CloudFront only". Plus `aws_vpc_security_group_egress_rule`: all, `0.0.0.0/0`. No port 22 anywhere. Comment that access is via SSM Session Manager.
      - `ec2.tf`:
        - `data "aws_ssm_parameter" "al2023"`: name `"/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-${var.instance_architecture}"`.
        - IAM role `${local.name}-ec2`, trust `ec2.amazonaws.com`, plus `aws_iam_role_policy_attachment` for `arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore`, plus `aws_iam_role_policy` "app" (jsonencode) whose statements are:
          - ECR: `ecr:GetAuthorizationToken` on `*`; `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchCheckLayerAvailability` on the backend repo ARN.
          - S3: `s3:GetObject`, `PutObject`, `DeleteObject` on the audio/* and materials/* buckets; `s3:ListBucket` on the audio, materials, and backups buckets; `s3:PutObject` on `backups/pg/*`; `s3:GetObject` on `backups/pg/*` and `backups/deploy/*`.
          - DynamoDB: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `DescribeTable` on the table ARN.
          - Lambda: `lambda:InvokeFunction` on `local.stt_function_arn`.
          - Bedrock: `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on `arn:aws:bedrock:*::foundation-model/*` and `arn:aws:bedrock:${region}:${account}:inference-profile/*`.
          - SSM: `ssm:GetParameter`, `GetParameters`, `GetParametersByPath` on `arn:aws:ssm:${region}:${account}:parameter${local.ssm_prefix}/*` and `...parameter${local.ssm_prefix}`.
          - Instance profile.
        - `aws_ebs_volume` "data": az `local.az`, size `var.data_volume_gb`, `type = "gp3"`, `encrypted = true`, `final_snapshot = true` (drop it only if validate rejects it, and note that), tag Name `${local.name}-pgdata`, `lifecycle { prevent_destroy = true }`.
        - `aws_instance` "app":
          - `ami = data.aws_ssm_parameter.al2023.value`, `instance_type`, subnet, SG, profile.
          - `root_block_device { volume_size = var.root_volume_gb, volume_type = "gp3", encrypted = true }`.
          - `metadata_options { http_endpoint = "enabled", http_tokens = "required", http_put_response_hop_limit = 2 }`.
          - `dynamic "credit_specification"` only when `startswith(var.instance_type, "t")`.
          - `user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {...})`.
          - `depends_on = [aws_s3_object.deploy, aws_iam_role_policy.app]`, `lifecycle { ignore_changes = [ami] }`, tag Name `${local.name}-app` (the Makefile looks this up).
        - `aws_volume_attachment`: `device_name = "/dev/sdf"`, `stop_instance_before_detaching = true`.
        - `aws_eip` "app": `count = var.use_elastic_ip ? 1 : 0`, `domain = "vpc"`, `instance = aws_instance.app.id`.
        - `local.origin_dns = var.use_elastic_ip ? aws_eip.app[0].public_dns : aws_instance.app.public_dns`.
      - `templates/user_data.sh.tftpl` (bash, `set -euxo pipefail`, output to `/var/log/aives-bootstrap.log`). Template vars: `aws_region`, `environment`, `ssm_prefix`, `backups_bucket`, `data_volume_id_nodash` (`replace(id,"-","")`), `compose_version`, `ecr_registry`, `backend_repo_url`, `cron_tz`. Steps, each idempotent:
        1. `dnf install -y docker cronie jq make`, then `systemctl enable --now docker crond`.
        2. Compose plugin: download `https://github.com/docker/compose/releases/download/${compose_version}/docker-compose-linux-$(uname -m)` and its `.sha256`, verify with `sha256sum -c`, and install to `/usr/local/lib/docker/cli-plugins/docker-compose` with chmod +x.
        3. Swap: 1 GiB `/swapfile` via `dd` (if absent), `chmod 600`, `mkswap`, `swapon`, a fstab line, and `sysctl vm.swappiness=10` (persist in `/etc/sysctl.d/99-aives.conf`).
        4. Data volume: wait up to 300 s for `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${data_volume_id_nodash}`. Run `mkfs.xfs` ONLY IF `blkid` finds no filesystem (comment: never reformat existing data). Then `mkdir -p /data`, add a fstab line by `UUID=... /data xfs defaults,nofail 0 2`, `mount -a`, `mkdir -p /data/postgres`.
        5. `mkdir -p /opt/aives/scripts /opt/aives/secrets`. Write `/opt/aives/instance.env` (`AIVES_ENV`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `SSM_PREFIX`, `BACKUPS_BUCKET`, `ECR_REGISTRY`, `BACKEND_REPO_URL`).
        6. `aws s3 cp s3://${backups_bucket}/deploy/ /opt/aives/ --recursive`, then `sed -i 's/\r$//' /opt/aives/scripts/*.sh` and `chmod +x`.
        7. Write `/etc/cron.d/aives-pg-backup` (mode 644) containing `CRON_TZ=${cron_tz}` and `0 2 * * * root /opt/aives/scripts/pg-backup.sh >> /var/log/aives-pg-backup.log 2>&1`.
        8. `/opt/aives/scripts/deploy-on-host.sh "${backend_repo_url}:latest" || echo "initial deploy skipped (no image or SSM secrets yet); run the GitHub deploy workflow"`.
      - `storage.tf`:
        - `aws_s3_bucket` `for_each = local.bucket_names` (`force_destroy = false`).
        - `aws_s3_bucket_public_access_block` (all four true) for each bucket.
        - `aws_s3_bucket_server_side_encryption_configuration` (AES256, `bucket_key_enabled = true`) for each.
        - `aws_s3_bucket_ownership_controls` (`BucketOwnerEnforced`) for each.
        - `aws_s3_bucket_lifecycle_configuration` on backups: rule `expire-pg-dumps` (filter prefix `pg/`, expiration days `var.backup_retention_days`) and rule `abort-mpu` (empty filter, `abort_incomplete_multipart_upload` 1 day).
        - `aws_s3_bucket_policy` for each bucket, `depends_on` the PAB, with statement `DenyInsecureTransport` (`aws:SecureTransport = false`, Deny `s3:*`). The web bucket also gets an `AllowCloudFrontOAC` statement: `s3:GetObject` for service `cloudfront.amazonaws.com`, condition `AWS:SourceArn = aws_cloudfront_distribution.main.arn`. Build the statements with a `concat` on `each.key == "web"`.
        - `aws_s3_object` "deploy": `for_each = local.deploy_files`, bucket backups, `key = "deploy/${each.value}"`, `source = "${path.module}/../../${each.value}"`, `etag = filemd5("${path.module}/../../${each.value}")`.
      - `data.tf`: `aws_dynamodb_table` "session": name `${local.name}-session-context`, `PAY_PER_REQUEST`, hash_key `sessionId` (S), `ttl { attribute_name = var.session_ttl_attribute, enabled = true }`, `server_side_encryption { enabled = true }`.
      - `ecr.tf`:
        - `aws_ecr_repository` for_each `["backend","stt"]`, named `${local.name}-${each.key}`, `image_tag_mutability = "MUTABLE"`, `image_scanning_configuration { scan_on_push = true }`, `encryption_configuration { encryption_type = "AES256" }`.
        - `aws_ecr_lifecycle_policy`, one rule: tagStatus any, countType imageCountMoreThan, countNumber `var.ecr_keep_images`, expire.
        - `aws_ecr_repository_policy` on stt: allow principal service `lambda.amazonaws.com` `ecr:BatchGetImage` and `ecr:GetDownloadUrlForLayer`, condition `StringLike aws:sourceArn = arn:aws:lambda:${region}:${account}:function:*`.
      - `ssm.tf`:
        - `local.team_params = { JWT_SECRET = "SecureString", POSTGRES_PASSWORD = "SecureString", SMTP_PASS = "SecureString", GOOGLE_TTS_KEY_JSON = "SecureString", SMTP_USER = "String" }`. Resource `aws_ssm_parameter` "team": `for_each`, name `"${local.ssm_prefix}/${each.key}"`, `type = each.value`, `value = "CHANGE_ME"`, `lifecycle { ignore_changes = [value] }`, description "Set by the team with aws ssm put-parameter --overwrite; never in tf/git".
        - `local.config_params = { AWS_REGION, APP_BASE_URL = "https://${aws_cloudfront_distribution.main.domain_name}", AUDIO_BUCKET_NAME, MATERIALS_BUCKET_NAME, BACKUP_BUCKET, SESSION_TABLE_NAME, AUDIO_LAMBDA_FUNCTION_NAME = local.stt_function_name }`. Resource `aws_ssm_parameter` "config": for_each, `type = "String"`, no ignore_changes.
        - Item 3 must still validate on its own. If you write ssm.tf before cloudfront.tf exists, add ssm.tf at the end of item 4 instead.
      - Rewrite `WT\infrastructure\terraform\terraform.tfvars.example` with the non-default inputs (`budget_alert_email = "team@example.com"`, commented `stt_image_uri`, `use_elastic_ip`, `instance_type`) and a header saying copy it to terraform.tfvars, which is gitignored.
      Files: WT\infrastructure\terraform\{versions,providers,variables,main,network,ec2,storage,data,ecr,ssm}.tf, WT\infrastructure\terraform\templates\user_data.sh.tftpl, WT\infrastructure\terraform\terraform.tfvars.example
      Depends on: item 2 (filemd5 of the deploy files).
      Verify (cwd = WT\infrastructure\terraform, with TF_PLUGIN_CACHE_DIR set):
      - `D:\tools\terraform\terraform.exe fmt -recursive`, then `fmt -check -recursive` exits 0.
      - `init -backend=false -input=false` succeeds.
      - `validate` reports "Success!".
      - If cross-references to item-4 resources (CloudFront, Lambda) make validate fail, do items 3 and 4 back-to-back and validate once at the end of item 4.

- [ ] 4. Terraform edge and CI-facing resources, plus outputs.
      - `lambda.tf`:
        - IAM role `${local.name}-stt-lambda` (trust `lambda.amazonaws.com`) plus attachment of `arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`.
        - `aws_cloudwatch_log_group` `/aws/lambda/${local.stt_function_name}`, retention `var.log_retention_days`.
        - `aws_lambda_function` "stt": `count = var.stt_image_uri == "" ? 0 : 1`, `function_name = local.stt_function_name`, `package_type = "Image"`, `image_uri = var.stt_image_uri`, `architectures = [var.stt_architecture]`, `memory_size`, `timeout`, `role`, `depends_on` the log group and the ECR repo policy, `lifecycle { ignore_changes = [image_uri] }` with the comment "deploy.yml updates code".
      - `cloudfront.tf`:
        - Data sources: `aws_cloudfront_cache_policy` "disabled" (`name = "Managed-CachingDisabled"`) and "optimized" (`"Managed-CachingOptimized"`); `aws_cloudfront_origin_request_policy` "all_viewer" (`"Managed-AllViewer"`).
        - `aws_cloudfront_origin_access_control` (s3, always, sigv4).
        - `aws_cloudfront_function` "spa_rewrite" (`runtime = "cloudfront-js-2.0"`, `publish = true`, `code = file("${path.module}/cloudfront/spa-rewrite.js")`).
        - Create `WT\infrastructure\terraform\cloudfront\spa-rewrite.js`: a `handler(event)` that sets `request.uri = '/index.html'` when the last path segment has no `.`, and otherwise returns the request unchanged.
        - `aws_cloudfront_distribution` "main":
          - `enabled = true`, `is_ipv6_enabled = true`, `http_version = "http2and3"`, `default_root_object = "index.html"`, `price_class = var.cloudfront_price_class`, comment.
          - Origin `s3-web`: `bucket_regional_domain_name` plus OAC.
          - Origin `ec2-app`: `domain_name = local.origin_dns`, `custom_origin_config { http_port = 80, https_port = 443, origin_protocol_policy = "http-only", origin_ssl_protocols = ["TLSv1.2"], origin_read_timeout = 60, origin_keepalive_timeout = 5 }`.
          - Default behavior: target `s3-web`, GET/HEAD/OPTIONS, `redirect-to-https`, `compress = true`, cache policy optimized, `function_association { event_type = "viewer-request", function_arn = aws_cloudfront_function.spa_rewrite.arn }`.
          - Two `ordered_cache_behavior` blocks, `/api/*` and `/socket.io/*`: target `ec2-app`, all 7 methods, cached GET/HEAD, `viewer_protocol_policy = "https-only"`, `compress = false`, cache policy disabled, origin request policy all_viewer. Comment: WebSocket upgrade is supported automatically.
          - `restrictions { geo_restriction { restriction_type = "none" } }`, `viewer_certificate { cloudfront_default_certificate = true }`.
      - `budget.tf`: `aws_budgets_budget` "monthly": name `${local.name}-monthly`, `budget_type = "COST"`, `limit_amount = var.budget_limit_usd`, `limit_unit = "USD"`, `time_unit = "MONTHLY"`. Two `notification` blocks: ACTUAL > 80% and FORECASTED > 100%, `subscriber_email_addresses = [var.budget_alert_email]`.
      - `github_oidc.tf`:
        - `aws_iam_openid_connect_provider` "github" (`count = var.create_github_oidc_provider ? 1 : 0`, url `https://token.actions.githubusercontent.com`, `client_id_list = ["sts.amazonaws.com"]`, `thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1","1c58a3a8518e8759bf075b76b750d4f2df264fcd"]`). Else `data "aws_iam_openid_connect_provider"` (count inverse). `local.github_oidc_arn` picks whichever exists.
        - Role `${local.name}-github-deploy`: trust `sts:AssumeRoleWithWebIdentity` with `StringEquals` `token.actions.githubusercontent.com:aud = sts.amazonaws.com` and `token.actions.githubusercontent.com:sub = "repo:${var.github_repo}:ref:refs/heads/${var.github_branch}"`. `max_session_duration = 3600`.
        - Inline policy:
          - ECR: `ecr:GetAuthorizationToken` on `*`; `ecr:BatchCheckLayerAvailability`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `PutImage`, `BatchGetImage`, `GetDownloadUrlForLayer` on both repo ARNs.
          - Lambda: `UpdateFunctionCode`, `GetFunction`, `GetFunctionConfiguration` on `local.stt_function_arn`.
          - S3: `s3:ListBucket` on the web and backups buckets; `s3:PutObject`, `GetObject`, `DeleteObject` on `web/*`; `s3:PutObject` on `backups/deploy/*`.
          - CloudFront: `cloudfront:CreateInvalidation` and `GetInvalidation` on the distribution ARN.
          - SSM: `ssm:SendCommand` on `arn:aws:ssm:${region}::document/AWS-RunShellScript` and the instance ARN; `ssm:GetCommandInvocation` and `ssm:ListCommandInvocations` on `*`.
      - `outputs.tf`:
        - `cloudfront_domain`, `app_url`, `cloudfront_distribution_id`, `instance_id`, `public_ip` (EIP or instance), `ecr_backend_url`, `ecr_stt_url`, `bucket_names` (the map), `backups_bucket` (string; used by `make db-restore`), `session_table_name`, `stt_function_name` (`""` when count = 0), `ec2_role_arn`, `github_deploy_role_arn`, `ssm_parameter_prefix`.
        - `github_actions_variables`: a map of `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `AWS_INSTANCE_ID`, `ECR_BACKEND_REPOSITORY`, `ECR_STT_REPOSITORY`, `STT_FUNCTION_NAME`, `WEB_BUCKET`, `BACKUPS_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.
      - If ssm.tf was deferred, add it now.
      - Run `terraform providers lock -platform=windows_amd64 -platform=linux_amd64 -platform=darwin_arm64`. This is a read-only registry download, so the committed `.terraform.lock.hcl` works for every teammate.
      Files: WT\infrastructure\terraform\{lambda,cloudfront,budget,github_oidc,outputs}.tf, WT\infrastructure\terraform\cloudfront\spa-rewrite.js, WT\infrastructure\terraform\.terraform.lock.hcl
      Depends on: item 3.
      Verify (cwd = WT\infrastructure\terraform): `fmt -check -recursive` exits 0, `init -backend=false -input=false` succeeds, `validate` reports "Success!". Paste the exact outputs into the verification note.

- [ ] 5. Makefile.
      Create `WT\Makefile` (LF, tabs). Header comment: Windows users run it from Git Bash or WSL, `make` is not bundled with Git Bash (`winget install ezwinports.make`), and the commands need AWS CLI v2 plus team credentials.
      - Variables: `SHELL := bash`, `.SHELLFLAGS := -eu -o pipefail -c`, `AWS_REGION ?= ap-southeast-1`, `ENV ?= prod`, `TF_DIR := infrastructure/terraform`, `TERRAFORM ?= terraform`, `INSTANCE_NAME ?= aives-$(ENV)-app`, `COMPOSE_FILE ?= docker-compose.yml`, `PG_EXEC ?= docker compose -f $(COMPOSE_FILE) exec -T postgres`, `BACKUP_BUCKET ?=`, `BACKUP_KEY ?=`.
      - `.PHONY` for all targets. `help` is the default and lists the targets.
      - `instance-id` (internal helper or inline): `aws ec2 describe-instances --region $(AWS_REGION) --filters Name=tag:Name,Values=$(INSTANCE_NAME) Name=tag:Project,Values=aives Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[].Instances[].InstanceId' --output text`. Fail if empty or more than one.
      - `aws-stop`: stop-instances, then `aws ec2 wait instance-stopped`, then echo the note: "With use_elastic_ip=true the EIP stays attached (~$3.6/month). With false, the public IP is released and `terraform apply` is needed after aws-start".
      - `aws-start`: start-instances, then `wait instance-running`, then print the PublicIpAddress, plus the same note.
      - `db-restore`:
        1. Guard `CONFIRM=yes`, else print "drops and recreates objects in the target DB; stop the backend first; re-run with CONFIRM=yes" and exit 1.
        2. Resolve `BACKUP_BUCKET`: if empty, use `$(TERRAFORM) -chdir=$(TF_DIR) output -raw backups_bucket 2>/dev/null`. If still empty, fail with "set BACKUP_BUCKET=".
        3. Resolve the key: `BACKUP_KEY` or `aws s3api list-objects-v2 --bucket B --prefix pg/ --query 'sort_by(Contents,&LastModified)[-1].Key' --output text`.
        4. `aws s3 cp s3://B/KEY "$tmp"`, then `gunzip -c "$tmp" | $(PG_EXEC) psql -v ON_ERROR_STOP=1 -U aives -d aives`, then rm the temp file.
        5. Document the EC2 usage: `make db-restore CONFIRM=yes PG_EXEC="docker exec -i aives-postgres" BACKUP_BUCKET=...`.
      - `tf-validate`: `$(TERRAFORM) -chdir=$(TF_DIR) fmt -check -recursive && init -backend=false -input=false && validate`.
      - `tf-plan`: `init -input=false && plan -out=tfplan`, with the comment "team only; needs credentials and terraform.tfvars".
      Files: WT\Makefile
      Verify: `make` is not installed, so it cannot run here. Extract each recipe body into a scratch file under `$env:TEMP` and run `D:\Git\bin\bash.exe -n` on it, or at minimum run `D:\Git\bin\bash.exe -n` on a copy with make variables substituted. Record "Makefile not executed (no make)" in the verification note, and delete the scratch files.

- [ ] 6. GitHub Actions deploy workflow.
      Create `WT\.github\workflows\deploy.yml`. Do NOT touch ci.yml.
      - Header and triggers:
        - `name: Deploy`.
        - `on: workflow_run: { workflows: [CI], types: [completed], branches: [main] }` plus `workflow_dispatch:`.
        - `permissions: { id-token: write, contents: read }`.
        - `concurrency: { group: deploy-${{ vars.AWS_DEPLOY_ENV || 'prod' }}, cancel-in-progress: false }`.
      - Job `deploy`: `runs-on: ubuntu-latest`, `timeout-minutes: 40`.
        - `if: ${{ vars.AWS_DEPLOY_ENABLED == 'true' && ((github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main') || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push' && github.event.workflow_run.head_repository.full_name == github.repository)) }}`.
        - Job `env`: `AWS_REGION: ${{ vars.AWS_REGION || 'ap-southeast-1' }}`, `DEPLOY_SHA: ${{ github.event.workflow_run.head_sha || github.sha }}`, `DOCKER_PLATFORM: ${{ vars.DOCKER_PLATFORM || 'linux/arm64' }}`, and every repo variable from the `github_actions_variables` output (`ECR_BACKEND_REPOSITORY`, `ECR_STT_REPOSITORY`, `STT_FUNCTION_NAME`, `AWS_INSTANCE_ID`, `WEB_BUCKET`, `BACKUPS_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`).
        - Use only `$ENV_VAR` inside `run:` scripts, never inline `${{ }}`, to avoid script injection.
      - Steps:
        1. `actions/checkout@v7` with `ref: ${{ env.DEPLOY_SHA }}`.
        2. `aws-actions/configure-aws-credentials@v6` with `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}`, `aws-region: ${{ env.AWS_REGION }}`, `role-session-name: aives-deploy-${{ github.run_id }}`.
        3. `aws-actions/amazon-ecr-login@v2`.
        4. `docker/setup-qemu-action@v3`, then `docker/setup-buildx-action@v3`.
        5. Backend: `docker/build-push-action@v6` with `context: backend`, `platforms: ${{ env.DOCKER_PLATFORM }}`, `push: true`, `provenance: false`, `tags: ${{ env.ECR_BACKEND_REPOSITORY }}:${{ env.DEPLOY_SHA }},${{ env.ECR_BACKEND_REPOSITORY }}:latest`, `cache-from: type=gha,scope=backend`, `cache-to: type=gha,mode=max,scope=backend`.
        6. Detect STT (`id: stt`): run `if [ -f lambda/stt/Dockerfile ] && [ -n "$STT_FUNCTION_NAME" ]; then echo enabled=true >> "$GITHUB_OUTPUT"; else echo enabled=false >> "$GITHUB_OUTPUT"; echo "::notice::STT skipped"; fi`.
        7. If `steps.stt.outputs.enabled == 'true'`: `build-push-action@v6` with `context: lambda/stt`, same platform, `provenance: false`, `sbom: false`, tag `:$DEPLOY_SHA` and `:latest`. Then `aws lambda update-function-code --function-name "$STT_FUNCTION_NAME" --image-uri "$ECR_STT_REPOSITORY:$DEPLOY_SHA"` and `aws lambda wait function-updated-v2 --function-name "$STT_FUNCTION_NAME"`.
        8. Upload deploy files: `aws s3 cp docker-compose.prod.yml "s3://$BACKUPS_BUCKET/deploy/docker-compose.prod.yml"`, plus a loop over `fetch-ssm-env.sh deploy-on-host.sh pg-backup.sh` to `s3://$BACKUPS_BUCKET/deploy/scripts/` (explicit list, so `ci-smoke.mjs` is never shipped).
        9. Roll out via SSM:
           - Build params with `jq -nc --arg img "$ECR_BACKEND_REPOSITORY:$DEPLOY_SHA" --arg b "$BACKUPS_BUCKET" '{commands:["set -euo pipefail","aws s3 cp s3://\($b)/deploy/ /opt/aives/ --recursive","sed -i \"s/\\r$//\" /opt/aives/scripts/*.sh","chmod +x /opt/aives/scripts/*.sh","/opt/aives/scripts/deploy-on-host.sh \($img)"]}'`.
           - `CMD_ID=$(aws ssm send-command --instance-ids "$AWS_INSTANCE_ID" --document-name AWS-RunShellScript --comment "aives deploy ${DEPLOY_SHA:0:7}" --parameters "$params" --query Command.CommandId --output text)`.
           - Poll `aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$AWS_INSTANCE_ID"` every 10 s for up to 15 min, until Status is not Pending/InProgress/Delayed.
           - Print StandardOutputContent and StandardErrorContent, and `exit 1` unless Status == Success.
        10. `actions/setup-node@v7` with `node-version: 20`, `cache: npm`, `cache-dependency-path: frontend/package-lock.json`.
        11. Frontend: `npm ci && npm run build` in `frontend` (`VITE_API_BASE_URL` unset, because `/api` is same-origin via CloudFront).
        12. Sync web: `aws s3 sync frontend/dist "s3://$WEB_BUCKET" --delete --exclude index.html --cache-control "public,max-age=31536000,immutable"`, then `aws s3 cp frontend/dist/index.html "s3://$WEB_BUCKET/index.html" --cache-control "no-cache"`.
        13. `aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" --paths "/*"`.
        14. Summary to `$GITHUB_STEP_SUMMARY` (image tag, STT updated or skipped).
      - Optionally confirm the majors with read-only `gh release view --repo aws-actions/configure-aws-credentials` (and the same for the docker/* actions). Bump only if a newer major is published, and record the result.
      Files: WT\.github\workflows\deploy.yml
      Verify (cwd = WT): `python -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/deploy.yml',encoding='utf-8')); print(sorted(d[True].keys()) if True in d else sorted(d['on'].keys()))"` prints `['workflow_dispatch', 'workflow_run']`. If PyYAML is missing, try `python -m pip show pyyaml`. Do NOT install it; record "YAML parse not verified". Note that actionlint is unavailable.

- [ ] 7. Full IaC/compose re-validation checkpoint.
      Re-run every validator after items 1–6 together, before spending time on docs.
      Verify:
      - Terraform (cwd = WT\infrastructure\terraform): `fmt -check -recursive`, `init -backend=false -input=false`, `validate`.
      - Compose (cwd = WT): `docker compose --env-file .env.prod.example -f docker-compose.prod.yml config --quiet`.
      - Scripts: `D:\Git\bin\bash.exe -n` on each `WT\scripts\*.sh`.
      - `git -C WT diff --stat main` must not list `backend/`, `.github/workflows/ci.yml`, `scripts/ci-smoke.mjs`, `docker-compose.yml`, or `nginx/`.
      - Commit locally: `git -C WT add` the specific paths from items 1–6, then commit `feat(step11): terraform rewrite (EC2+CloudFront+S3+DynamoDB+ECR+STT Lambda+OIDC), prod compose, backup/deploy scripts, Makefile, deploy workflow`. The message body lists the validation commands run and their results. Never push.

- [ ] 8. `.env.example` and CLAUDE.md touch-ups (minimal, merge-safe).
      - In `WT\.env.example`, edit ONLY lines 1–75. Step 6 edits from line ~103 onward.
        - Fix the stale prod comments: `DB_MOCK_MODE` "Prod: false (Postgres in docker-compose.prod.yml on EC2)" and `DATABASE_URL` "Prod: built in docker-compose.prod.yml from POSTGRES_PASSWORD (SSM)". Also `PORT` "Prod: fixed by docker-compose.prod.yml".
        - Directly after the `--- Bedrock models ---` block, add a short `--- Production (AWS) ---` comment block. It says that prod values come from SSM `/aives/<env>/*` via `scripts/fetch-ssm-env.sh` and `docker-compose.prod.yml`, and lists `POSTGRES_PASSWORD`, `GOOGLE_APPLICATION_CREDENTIALS` (prod: `/run/secrets/google-tts-key.json`), `NODE_OPTIONS`, and `COOKIE_SECURE=true` as commented examples. Commented lines only, so local behavior is unchanged.
      - In `WT\CLAUDE.md`, update only the "Top-level parts" bullets:
        - `lambda/`: "STT Lambda image `lambda/stt/` (Step 9); the old Transcribe/Polly handlers were removed in Step 11".
        - `infrastructure/terraform/`: "AWS infra: EC2 t4g.small + Docker (backend + pgvector), CloudFront, S3, DynamoDB, ECR, STT Lambda, SSM, OIDC deploy role (Step 11)".
        - Add `docker-compose.prod.yml` + `scripts/` + `Makefile`: "prod stack on EC2, SSM env fetch, pg_dump backups, aws-stop/start, db-restore".
      Files: WT\.env.example, WT\CLAUDE.md
      Verify: `docker compose -f WT\docker-compose.yml config --quiet` still exits 0 (local stack unaffected). `git -C WT diff main -- .env.example` shows changes only above line 76.

- [ ] 9. Docs: README deploy section and architecture/ERD diagrams.
      a) `WT\README.md`: replace the obsolete sections "Hybrid serverless architecture (production-oriented)" (incl. its Mermaid and "Added components"), "Environment variables" (Backend/Lambda lists), "Deployment prerequisites", "Terraform usage", "Security considerations", and "Notes and limitations". Also remove the `/home/runner/...` paths. Keep "Local development" (fix its path to `cd backend`), "Local stack", "Frontend dev server", and "Local E2E". Add, in Vietnamese:
         - "Kiến trúc trên AWS": a 3–5 line summary plus a link to `docs/architecture-aws.md`.
         - "Deploy lên AWS (Bước 11)" with numbered subsections:
           1. Điều kiện: AWS CLI v2, Terraform ≥ 1.6, an IAM admin user (NOT root) with MFA, `gh` CLI. Bedrock model access for Nova Pro and Titan V2 in ap-southeast-1.
           2. Bootstrap state (tùy chọn): local state by default. For a shared S3 backend, create a versioned bucket `aives-tfstate-<account_id>` by hand, uncomment the `backend "s3"` block in versions.tf, then run `terraform init -migrate-state`.
           3. `terraform apply` lần đầu: `cp terraform.tfvars.example terraform.tfvars`, set `budget_alert_email`, leave `stt_image_uri` empty, run `make tf-plan`, review, then `terraform -chdir=infrastructure/terraform apply tfplan`. Mention `prevent_destroy` on the data volume and that the AWS Budgets email needs confirming.
           4. Set the SSM secrets: `aws ssm put-parameter --overwrite` examples for `/aives/prod/JWT_SECRET` (`openssl rand -hex 32`), `POSTGRES_PASSWORD` (hex only, URL-safe, and it takes effect only on first DB init), `SMTP_USER` (String), `SMTP_PASS` (Gmail App Password), and `GOOGLE_TTS_KEY_JSON` (`--value file://key.json`, Standard tier ≤ 4 KB). Optional overrides `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `STT_PROVIDER`, `TTS_PROVIDER`, `BEDROCK_MODEL_ID` (String).
           5. GitHub variables: `terraform output -json github_actions_variables`, then `gh variable set NAME --body VALUE` for each. Set `AWS_DEPLOY_ENABLED=true` last.
           6. First deploy: Actions → Deploy → Run workflow (or push to main after CI passes). Then create the admin via `aws ssm start-session --target <instance_id>` → `sudo docker exec -it aives-backend npm run create-admin -- --email ... --password ...`.
           7. STT Lambda (after Step 9): build and push the image to `ecr_stt_url`, set `stt_image_uri`, `apply`, set the `STT_FUNCTION_NAME` variable, set SSM `STT_PROVIDER=lambda`.
           8. `make aws-stop` / `make aws-start`, with the EIP cost note and the Windows Git Bash/WSL note.
           9. Sao lưu & khôi phục: the nightly 02:00 (Asia/Ho_Chi_Minh) cron, 14-day retention, `make db-restore CONFIRM=yes` locally and on EC2.
           10. Bảo mật: no SSH, SG open only to the CloudFront prefix list, IMDSv2, no long-lived keys (OIDC), secrets only in SSM.
           11. Chi phí: link to the cost table in the plan doc.
      b) Create `WT\docs\architecture-aws.md` (Vietnamese):
         - A Mermaid `flowchart LR` of the deployed architecture: Browser → CloudFront → (S3 web via OAC | EC2:80 `/api/*` + `/socket.io/*`). EC2 [Docker: backend, postgres → EBS data volume] → S3 audio/materials/backups, DynamoDB, Lambda STT (ECR image), Bedrock, Google TTS, Gmail SMTP. SSM → EC2. GitHub Actions (OIDC) → ECR/S3/Lambda/SSM/CloudFront.
         - A Mermaid `erDiagram` of the Physical ERD, built from `WT\backend\db\migrations\001…015_*.sql` (27 `CREATE TABLE`s): each table with its PK, FKs, and 2–4 key columns, plus the relationships. Read the migrations, don't guess. If time is short, include at least account/subject/topic/question/rubric/rubric_criterion/material/material_chunk/exam_session/interview/scoring/background_job and note the omitted tables.
         - A "Bản vẽ drawio" note: `docs/flow-class-diagram.png` and `docs/SWD392-Physical_ERD.drawio.png` are deferred. They are PNGs with embedded drawio XML and too costly to edit in this step. The Mermaid diagrams above are the source of truth until they are updated.
      c) `WT\docs\E2E-Progress.md`:
         - Set the Step 11 row to "🟡 Code xong (chưa apply — chờ nhóm chạy terraform apply)".
         - Add a short "Bước 11" detail block: what was added, what was validated, what the team must do (first apply, SSM secrets, GitHub vars), and what is deferred (drawio update, the backend pg_dump-on-exam-close hook, and real STT until Step 9).
      Files: WT\README.md, WT\docs\architecture-aws.md, WT\docs\E2E-Progress.md
      Verify: no build applies to docs. Run `git -C WT diff --stat` to confirm only the three doc files changed in this item. Grep README for `/home/runner` and `API Gateway`; neither should remain.

- [ ] 10. Verification note and final commit.
      Create `WT\.agents\tasks\e2e-step11-deploy\verification.md` with:
      - A table of every command actually run (exact command line, cwd, exit code, and the key output line, e.g. "Success! The configuration is valid.").
      - The terraform and provider versions from `terraform version`.
      - The compose config result.
      - The `bash -n` results.
      - The YAML parse result.
      - The action-major check result (if done).
      - "NOT verified" list:
        - `terraform plan`/`apply` (forbidden, ROOT session).
        - The user_data boot path on a real AL2023 instance.
        - Makefile execution (no make).
        - deploy.yml execution and actionlint.
        - Runtime IAM sufficiency (Bedrock/ECR/SSM).
        - Docker daemon (off).
      - Design decisions 1–13 summarized in one line each.
      - Deferred items.
      Commit (specific paths only): items 8–10 plus `WT\.agents\tasks\e2e-step11-deploy\` (plan.md, setup-notes.md, verification.md) as `docs(step11): README deploy guide, AWS architecture + Mermaid ERD, progress update, verification note`. Copy the validation summary into the commit body. Never push. The finalize step handles merge/push.
      Files: WT\.agents\tasks\e2e-step11-deploy\verification.md
      Verify: `git -C WT log --oneline -3` shows both step-11 commits. `git -C WT status --short` is clean. Re-run Terraform `validate` and compose `config --quiet` once more and confirm both still pass on the committed tree.

## Assumptions and gaps (recorded, not blockers)

- Step 9's STT image and the backend's real STT/TTS adapters do not exist yet. Terraform makes the Lambda optional (`stt_image_uri`), the workflow skips STT when `lambda/stt/Dockerfile` or `STT_FUNCTION_NAME` is missing, and compose defaults `STT_PROVIDER`/`TTS_PROVIDER` to `mock`.
- The backend env var for the STT function is currently `AUDIO_LAMBDA_FUNCTION_NAME` (read in `backend/src/config/env.js`), so SSM and compose use that name. If Step 9 renames it, add the new key to `local.config_params` and the compose file.
- The CI workflow (`name: CI`) is on branch `feat/ci-actions` and not yet on main. `workflow_run` stays inert until it merges, and `AWS_DEPLOY_ENABLED` gates the deploy anyway.
- The Bedrock inference-profile ID `apac.amazon.nova-pro-v1:0` and Titan V2 availability in ap-southeast-1 are unverified. Both are overridable through SSM without a code change.
- GitHub's OIDC `sub` format for repos created after 15 July 2026 can include ID suffixes. This repo predates that, so the exact `repo:<owner>/<repo>:ref:refs/heads/main` match is used. The README should mention this.
