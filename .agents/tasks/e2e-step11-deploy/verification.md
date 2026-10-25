# Step 11 verification (iteration 1)

Worktree `d:\Workspace\swd392_team7_product\.worktrees\e2e-step11-deploy`, branch `feat/e2e-step11-deploy` (base `05fa1f8`).
Shell: PowerShell with `$env:TF_PLUGIN_CACHE_DIR='D:\tools\terraform\plugin-cache'`. No `terraform plan`/`apply` and no AWS CLI write was run.

## Versions

- `D:\tools\terraform\terraform.exe version` → `Terraform v1.16.6 on windows_amd64`, `provider registry.terraform.io/hashicorp/aws v6.69.1`
- `docker compose version` → `Docker Compose version v5.6.0` (daemon off; `config` does not need it)

## Commands run (final pass on the committed tree)

| # | Command | cwd | Exit | Key output |
| :-- | :---- | :---- | :-- | :---- |
| 1 | `terraform.exe fmt -check -recursive` | `infrastructure/terraform` | 0 | (no files listed) |
| 2 | `terraform.exe init -backend=false -input=false` | `infrastructure/terraform` | 0 | `Terraform has been successfully initialized!` (aws v6.69.1 from lock file) |
| 3 | `terraform.exe validate` | `infrastructure/terraform` | 0 | `Success! The configuration is valid.` |
| 4 | `terraform.exe providers lock -platform=windows_amd64 -platform=linux_amd64 -platform=darwin_arm64` | `infrastructure/terraform` | 0 | `Success! Terraform has updated the lock file.` (registry download only) |
| 5 | `docker compose --env-file .env.prod.example -f docker-compose.prod.yml config --quiet` | WT | 0 | (quiet) |
| 6 | `docker compose -f docker-compose.prod.yml config --quiet` (no env file) | WT | 1 | `required variable APP_BASE_URL is missing a value` … for every `${VAR:?}`. By design: prod compose fails fast without the SSM-generated env file. |
| 7 | same as 5 with `POSTGRES_PASSWORD` removed from a temp copy | WT | 1 | `required variable POSTGRES_PASSWORD is missing a value: POSTGRES_PASSWORD missing` (temp file deleted) |
| 8 | `docker compose -f docker-compose.yml config --quiet` (local stack unaffected) | WT | 0 | (quiet) |
| 9 | `D:\Git\bin\bash.exe -n scripts/{fetch-ssm-env,deploy-on-host,pg-backup}.sh` | WT | 0 ×3 | — |
| 10 | Makefile recipes extracted to a temp bash file (make vars substituted, `$$`→`$`, `RESOLVE_INSTANCE` inlined) + `bash -n` | WT | 0 | temp file deleted |
| 11 | deploy.yml + docker-compose.prod.yml parsed with js-yaml (`backend/node_modules` of the main checkout) | WT | 0 | `on` keys `["workflow_dispatch","workflow_run"]`, 16 steps; compose services `postgres,backend` |
| 12 | deploy.yml `run:` blocks extracted + `bash -n`; check for inline `${{ }}` in `run:` | WT | 0 | none found |
| 13 | `git diff --stat 05fa1f8 -- backend .github/workflows/ci.yml scripts/ci-smoke.mjs docker-compose.yml nginx` | WT | 0 | empty (none of the protected paths touched) |
| 14 | `Select-String README.md '/home/runner\|API Gateway'` | WT | — | 0 matches |
| 15 | `git ls-files --eol` on scripts, Makefile, compose, tftpl, .tf | WT | — | all `i/lf w/lf attr/text eol=lf` |

Rendered compose spot check (`config` without `--quiet`): `DATABASE_URL: postgres://aives:CHANGE_ME@postgres:5432/aives`, `SMTP_FROM: no-reply@aives.local` (nested default works), postgres `mem_limit 640m`, backend `768m`, backend port `80→3000`, postgres has no published port.

- PyYAML is not installed (`python -c "import yaml"` → `ModuleNotFoundError`), so js-yaml was used instead. Nothing was installed.

## Action major versions (read-only `gh release view --repo <repo>`)

| Action | Latest release | Pinned |
| :---- | :---- | :---- |
| actions/checkout | v7.0.1 | `@v7` |
| actions/setup-node | v7.1.0 | `@v7` |
| aws-actions/configure-aws-credentials | v6.3.0 | `@v6` |
| aws-actions/amazon-ecr-login | v2.1.7 | `@v2` |
| docker/setup-qemu-action | v4.4.0 | `@v4` (plan said v3; bumped) |
| docker/setup-buildx-action | v4.4.1 | `@v4` (plan said v3; bumped) |
| docker/build-push-action | v7.4.0 | `@v7` (plan said v6; bumped) |

The v7/v4 docker majors only change the Node 24 runtime and drop deprecated inputs that are not used here.

## NOT verified

- `terraform plan` / `apply`: forbidden (ROOT session, not approved). Runtime errors that only the AWS API reports (name collisions, quotas, Bedrock model access) are untested.
- The user_data boot path on a real AL2023 instance (NVMe device path, compose plugin download, mount, systemd units).
- Makefile execution (`make` not installed). Only the bash syntax of the recipes was checked.
- deploy.yml execution. `actionlint` and `shellcheck` are not installed.
- Runtime IAM sufficiency (Bedrock inference profile, ECR pull, SSM SendCommand, S3 presigned uploads).
- Docker daemon (off): no image was built or run.
- Mermaid rendering of `docs/architecture-aws.md` (syntax written by hand).

## Design decisions (one line each)

1. No nginx in prod. CloudFront → S3 for the SPA; `/api/*` and `/socket.io/*` → EC2:80 (backend publishes 80:3000).
2. SPA deep links use a CloudFront Function on the S3 behavior, not `custom_error_response`, so API 403/404 JSON stays intact.
3. The origin is the EC2 public DNS. `use_elastic_ip=true` by default, so stop/start keeps the hostname (~3.6 USD/month).
4. All runtime config lives in SSM `/aives/<env>/*`. Team secrets are `CHANGE_ME` + `ignore_changes`. fetch-ssm-env.sh writes `.env.prod` plus the Google key file. Compose maps every variable explicitly.
5. The compose file, scripts and Makefile ship via `s3://<backups>/deploy/` (Terraform uploads them for first boot; deploy.yml re-uploads). The lifecycle expires only `pg/`.
6. The STT Lambda is optional (`stt_image_uri` empty → count 0) with `ignore_changes=[image_uri]`. The IAM grant uses the deterministic ARN.
7. DynamoDB `aives-<env>-session-context`, hash key `sessionId` (S), TTL `expiresAt`. Matches `AwsSessionStore` (checked in `backend/src/services/awsClients.js`).
8. Prod defaults: LLM/embedding `bedrock`, STT/TTS `mock` until Step 9. All are overridable via SSM.
9. Instance: IMDSv2 required (hop limit 2), `standard` CPU credits, `ignore_changes=[ami]`. Data volume has `prevent_destroy` + `final_snapshot`. The attachment stops the instance before detaching.
10. The old `lambda/` (Transcribe/Polly orchestrator) and the old RDS/API Gateway Terraform are deleted.
11. The workflow deploys only on a `push` event from this repo or a dispatch on main. There is no `environment:` key (it would change the OIDC sub). Lambda images use `provenance: false`.
12. Action majors pinned per the table above.
13. AWS provider `~> 6.0`, Terraform `>= 1.6`, v6 resources (`aws_vpc_security_group_*_rule`, `aws_eip{domain}`).

## Additions beyond the plan (small, behavior-preserving)

- `aws_s3_bucket_cors_configuration` on the audio bucket (GET/PUT/HEAD from the CloudFront origin). The backend hands presigned S3 URLs to the browser (`getUploadUrl`), which would fail cross-origin without it.
- A systemd drop-in `docker.service` → `RequiresMountsFor=/data`. Docker cannot auto-start Postgres onto the root disk if the data volume is not mounted.
- An `aives.service` oneshot unit. Every boot regenerates `.env.prod` from SSM and re-ups the last image (`.backend-image`), satisfying "env generated on boot".
- `Makefile` is also shipped to `/opt/aives` so `make db-restore` works on the host. The host has no DB port exposed, so restore must run there.
- fetch-ssm-env.sh treats a value of `CHANGE_ME` as unset. Optional values such as `SMTP_PASS` stay empty instead of being used literally.
- pg-backup.sh deletes the partial S3 object if the dump pipeline fails.
- `aws_ssm_parameter.config` is NOT in the instance `depends_on` (APP_BASE_URL → CloudFront → instance DNS would form a cycle). The first boot deploy is skipped until the secrets exist anyway.

## Deferred

- Updating the drawio PNGs (`docs/flow-class-diagram.png`, `docs/SWD392-Physical_ERD.drawio.png`). Mermaid in `docs/architecture-aws.md` is the source of truth for now.
- The backend hook "pg_dump when an exam session closes" (backend logic, out of scope).
- Real STT/TTS (Step 9).

## Merge note for finalize

`main` moved to `f256a1f` after this branch was cut. It adds `ci.yml` (`name: CI`, matches `workflow_run`), `scripts/ci-smoke.mjs`, a MinIO image pin in `docker-compose.yml`, and edits `docs/E2E-Progress.md`. This branch touches none of the first three. `docs/E2E-Progress.md` may conflict on the Step 11 row and section and needs a manual merge.
