# Terraform rewrite for AWS deploy: EC2 + CloudFront + S3 + DynamoDB + ECR + STT Lambda + OIDC (Step 11, code only)

Step 11 replaces the old RDS/API-Gateway/Transcribe-Polly Terraform with a single-box deployment: one t4g.small EC2 running the backend and pgvector Postgres in Docker, fronted by CloudFront (S3 for the SPA, EC2:80 for `/api/*` and `/socket.io/*`). All runtime config moves to SSM Parameter Store, secrets are placeholder-only in Terraform, and a GitHub Actions `deploy.yml` builds/pushes images and rolls out over SSM Run Command using OIDC. Nothing is applied — the change is IaC, prod compose, host scripts, a Makefile, the workflow, and docs. The coder validated with `terraform validate`, `docker compose config`, `bash -n`, and a YAML parse; no `terraform plan/apply` or AWS write was run (ROOT session, correctly avoided).

Watch for: the EC2 security group admits port 80 only from the CloudFront origin-facing managed prefix list and opens no SSH — that prefix list is shared by all CloudFront tenants, so the origin is reachable by any CloudFront distribution, not just this one (confirmed; LOW, the task sets the prefix-list approach as the accepted bar). No other security, IAM, S3, EBS, secret-handling, or gating gaps were found against the stated constraints.

**Verdict**: APPROVED

## High-level view

The network and host posture meets the hard security bar. The only ingress rule is TCP 80 from the `com.amazonaws.global.cloudfront.origin-facing` prefix list; there is no SSH and no `0.0.0.0/0` ingress anywhere. Egress is open (needed for ECR, Bedrock, Google TTS, Gmail, OS updates). Shell access is SSM Session Manager via `AmazonSSMManagedInstanceCore`, and IMDSv2 is required with a hop limit of 2 so containers reach role credentials.

Credentials are all short-lived. The EC2 host uses an instance-profile role, GitHub Actions authenticates through an OIDC role whose trust policy is pinned to `repo:<repo>:ref:refs/heads/main`, and neither the compose file nor the workflow carries an AWS access key. Both IAM policies are scoped to named resource ARNs; the only `*` resources are `ecr:GetAuthorizationToken` and SSM command-status reads, which cannot be resource-scoped.

Secrets never touch git. The five team secrets are created in SSM as `CHANGE_ME` placeholders with `ignore_changes = [value]`, so Terraform owns their existence but never their content. `.env.prod` and `terraform.tfvars` are gitignored, `.env.prod.example` holds only placeholders, and a scan for key material found nothing committed.

State durability is handled correctly: the Postgres data lives on a separate `aws_ebs_volume` (gp3, encrypted) with `prevent_destroy` and `final_snapshot`, attached to the instance, so replacing the instance (new AMI, instance-type change, user_data change) keeps the data. The attachment stops the instance before detaching.

All four S3 buckets have a public-access block with all four flags true, AES256 SSE, ownership enforced, and a TLS-only bucket policy; only the web bucket additionally allows CloudFront OAC reads scoped to this distribution's ARN.

The deploy workflow is inert until explicitly enabled. It runs only when `vars.AWS_DEPLOY_ENABLED == 'true'` and either a manual dispatch on `main` or a CI `workflow_run` that concluded `success`, was a `push`, and came from this repository (blocking fork-PR spoofing). It does not touch `ci.yml`, and `run:` blocks use only `$ENV_VAR`, never inline `${{ }}`.

The prod compose matches the plan's env table and the 2 GB box budget: `mem_limit` 640m (postgres) + 768m (backend), `shared_buffers=256MB`, `AWS_MOCK_MODE=false`, empty `*_ENDPOINT` values so the SDK hits real AWS endpoints, Postgres data on the `/data/postgres` EBS path with no published port.

<details>
<summary>Issues (1)</summary>

1. **CloudFront shared prefix-list origin exposure** (LOW) — port 80 is open to the entire `com.amazonaws.global.cloudfront.origin-facing` prefix list, which every CloudFront tenant shares, so another tenant's distribution could reach the origin. The app's own JWT auth still gates `/api`. Optional hardening: have CloudFront send a secret custom origin header and reject requests without it at the app/edge. Not required by the step's accepted design.

</details>

<details>
<summary>Details</summary>

### Network ingress and shell access

The security group (`network.tf`) carries no inline rules; a single `aws_vpc_security_group_ingress_rule` allows TCP 80 with `prefix_list_id = data.aws_ec2_managed_prefix_list.cloudfront.id` ("com.amazonaws.global.cloudfront.origin-facing"), and the egress rule is all-protocol to `0.0.0.0/0`. There is no port 22 rule and no `cidr_ipv4 = "0.0.0.0/0"` on any ingress. Operator shell access is `AmazonSSMManagedInstanceCore` + Session Manager, and `metadata_options` forces IMDSv2 (`http_tokens = "required"`) with `http_put_response_hop_limit = 2`.

The residual exposure is inherent to the prefix-list design: AWS publishes one origin-facing prefix list shared across all CloudFront customers, so the SG does not distinguish *this* distribution's edge nodes from anyone else's. The backend publishes `80:3000` on the host, so a request routed through any CloudFront distribution pointed at this instance's public IP would reach the app on port 80. The viewer→CloudFront leg is HTTPS and `/api` is behind JWT auth, so the practical blast radius is limited, and the task explicitly names the prefix-list rule as the acceptable bar. Flagged LOW as a hardening note (secret origin header), not a blocker.

```
Browser --HTTPS--> CloudFront --HTTP:80--> EC2 (SG: prefix-list only, no SSH)
                       |                      |
                    S3 web (OAC)          Docker: backend + postgres -> EBS /data
```

### Short-lived credentials end to end

The EC2 role (`ec2.tf`) trusts `ec2.amazonaws.com` and is delivered through an instance profile; the SDK picks up credentials via IMDSv2, and the compose file sets no `AWS_ACCESS_KEY_ID`/`SECRET`. The GitHub deploy role (`github_oidc.tf`) trusts the Actions OIDC provider with `StringEquals` on both `aud = sts.amazonaws.com` and `sub = repo:${var.github_repo}:ref:refs/heads/${var.github_branch}`, so only workflows on `main` of this repo can assume it, and `max_session_duration = 3600`. The provider is created or looked up based on `create_github_oidc_provider`, with `local.github_oidc_arn` selecting whichever exists. `deploy.yml` authenticates through `configure-aws-credentials@v6` with `role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}` — no stored keys.

### IAM scoping

The EC2 policy grants `ecr:GetAuthorizationToken` on `*` (the token API has no resource), ECR pull actions on the backend repo ARN only, S3 object RW on `audio/*` and `materials/*`, `ListBucket` on the three relevant buckets, `PutObject`/`DeleteObject` on `backups/pg/*` plus `GetObject` on `backups/pg/*` and `backups/deploy/*`, DynamoDB item/query/describe on the session-table ARN, `lambda:InvokeFunction` on the deterministic STT ARN, Bedrock invoke on `foundation-model/*` and the region/account-scoped inference-profile ARN, and SSM parameter reads scoped to `parameter${ssm_prefix}` and `.../*`. The Bedrock `foundation-model/*` breadth is intrinsic to Bedrock's account-less model ARNs, not loose scoping.

The GitHub deploy policy mirrors this with push-side rights: ECR push on both repo ARNs, Lambda `UpdateFunctionCode`/`GetFunction`/`GetFunctionConfiguration` on the STT ARN, S3 on `web/*` and `backups/deploy/*` with `ListBucket` on web+backups, CloudFront `CreateInvalidation`/`GetInvalidation` on the distribution ARN, and `ssm:SendCommand` scoped to the `AWS-RunShellScript` document ARN plus the instance ARN. Only `ssm:GetCommandInvocation`/`ListCommandInvocations` sit on `*`, which is standard since invocation ARNs are not known ahead of time.

### Postgres data volume durability

`aws_ebs_volume.data` is a standalone gp3 encrypted volume carrying `lifecycle { prevent_destroy = true }` and `final_snapshot = true`, attached through `aws_volume_attachment.data` at `/dev/sdf` with `stop_instance_before_detaching = true`. Because the volume is not a `root_block_device`, replacing `aws_instance.app` (the instance has `ignore_changes = [ami]`, but an instance-type or user_data change would still recreate it) leaves the data intact, and `prevent_destroy` blocks an accidental `terraform destroy` from taking the DB with it.

### S3 lock-down

`storage.tf` builds all four buckets from `local.bucket_names` and, for each, a public-access block with `block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets` all true; AES256 SSE with `bucket_key_enabled`; `BucketOwnerEnforced` ownership; and a bucket policy that denies `s3:*` when `aws:SecureTransport = false`. The web bucket's policy additionally allows `s3:GetObject` to `cloudfront.amazonaws.com` conditioned on `AWS:SourceArn = aws_cloudfront_distribution.main.arn`, so only this distribution's OAC can read it. The bucket policy `depends_on` the public-access block so the deny-insecure-transport statement is not rejected during creation ordering. The audio-bucket CORS rule is scoped to the CloudFront domain origin for presigned PUT/GET uploads — a necessary addition over the plan, correctly narrow.

### Secret handling

`ssm.tf` creates the five team secrets (`JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS`, `GOOGLE_TTS_KEY_JSON` as SecureString; `SMTP_USER` as String) with `value = "CHANGE_ME"` and `ignore_changes = [value]`, so the real values are set out-of-band with `aws ssm put-parameter --overwrite` and never enter state diffs or git. The Terraform-managed `config` params hold only non-secret resource names and URLs. `.gitignore` excludes `.env.prod`, `terraform.tfvars`, `*.tfstate*`, and `.terraform/`; `.env.prod.example` is placeholder-only; and a repository scan for `AKIA`, PEM headers, and `aws_secret_access_key` across the `.tf`/`.yml`/`.sh`/`.example`/`Makefile`/`.tftpl` files returned nothing.

`fetch-ssm-env.sh` is the one script that handles decrypted values, and it is defensive: it treats `CHANGE_ME` as unset, writes `GOOGLE_TTS_KEY_JSON` to a `0600` file under a `0700` secrets dir (never into the env file), rejects any value containing a newline or single quote (exit 2), writes atomically via `mktemp` + `chmod 600` + `mv`, and exits 3 if `JWT_SECRET` or `POSTGRES_PASSWORD` is still unset. Quoting each line as `KEY='value'` after that validation closes the obvious env-injection path.

### Deploy workflow gating and injection posture

`deploy.yml`'s job `if` requires `vars.AWS_DEPLOY_ENABLED == 'true'` AND either a `workflow_dispatch` on `refs/heads/main` or a `workflow_run` that satisfies `conclusion == 'success'`, `event == 'push'`, and `head_repository.full_name == github.repository`. The repo-identity check blocks a fork PR whose branch happens to be named `main` from triggering a deploy. There is deliberately no `environment:` key (it would alter the OIDC `sub`). The three-dot diff confirms the branch adds `deploy.yml` and does not modify `ci.yml` or `scripts/ci-smoke.mjs` (those appear only in the two-dot diff because `main` advanced past the branch point). Every `run:` block references job-level `env` vars (`$BACKUPS_BUCKET`, `$AWS_REGION`, `$DEPLOY_SHA`, `$AWS_INSTANCE_ID`, …); the coder's grep for inline `${{ }}` inside `run:` found none, so there is no expression-injection surface. The SSM rollout builds its command array with `jq -nc '{commands: $ARGS.positional}'`, keeping shell-expanded env vars out of jq's own parsing.

### Prod compose against the 2 GB budget and env table

`docker-compose.prod.yml` sets `mem_limit: 640m` (postgres, `shm_size: 128m`) and `768m` (backend) — ~1.4 GB of hard limits on a 2 GB box, with the 1 GiB swap from user_data as headroom. Postgres runs with `shared_buffers=256MB`, `effective_cache_size=512MB`, `work_mem=4MB`, `maintenance_work_mem=64MB`, `max_connections=40`, and publishes no port (compose-network only). The backend env map matches the plan line for line: `AWS_MOCK_MODE: "false"`, `DB_MOCK_MODE: "false"`, empty `DYNAMODB_ENDPOINT`/`S3_ENDPOINT`/`LAMBDA_ENDPOINT` (so the SDK targets real endpoints for `AWS_REGION`), `SESSION_TABLE_AUTO_CREATE: "false"`, `COOKIE_SECURE: "true"`, `JWT_SECRET`/bucket names/table/function all `${VAR:?}` (fail-fast), providers defaulting bedrock/bedrock/mock/mock, and the Google key mounted read-only. The data volume maps `${AIVES_PG_DATA_DIR:-/data/postgres}` — the EBS mount path. The recorded `config --quiet` passes with the example env and fails with a clear message when `POSTGRES_PASSWORD` is removed, matching the `${VAR:?}` design.

### Verification evidence

The recorded evidence is adequate for a code-only step: `terraform fmt -check`, `init -backend=false`, and `validate` all exit 0 with "Success! The configuration is valid." on provider aws v6.69.1; the lock file was generated for three platforms; `docker compose config` passes with the example env and fails as designed without it; `bash -n` passes on all three scripts and the extracted Makefile/deploy recipes; the workflow and compose parse as YAML; and action majors were confirmed with read-only `gh release view` (qemu/buildx/build-push bumped to v4/v4/v7 over the plan's v3/v3/v6, a safe runtime bump). The correctly-stated "NOT verified" set — `terraform plan/apply`, the real AL2023 boot path, Makefile/deploy execution, runtime IAM sufficiency, Docker daemon — is exactly what a ROOT-session, no-apply constraint forces, so these are acknowledged gaps rather than review findings.

</details>

<details>
<summary>File map</summary>

Terraform (new/rewritten under `infrastructure/terraform/`): `network.tf` (VPC, IGW, public subnet, SG + prefix-list ingress), `ec2.tf` (instance role/policy, EBS data volume, instance, attachment, EIP), `storage.tf` (4 buckets + PAB/SSE/ownership/policy/CORS + deploy objects), `ssm.tf` (team placeholders + config params), `github_oidc.tf` (OIDC provider + deploy role), `cloudfront.tf` (distribution, OAC, SPA-rewrite function), `lambda.tf`, `ecr.tf`, `data.tf` (DynamoDB), `budget.tf`, `providers.tf`, `variables.tf`, `versions.tf`, `main.tf` (locals; old resources removed), `outputs.tf`, `templates/user_data.sh.tftpl`, `cloudfront/spa-rewrite.js`, `.terraform.lock.hcl`, `terraform.tfvars.example`.

Runtime/deploy: `docker-compose.prod.yml` (prod stack), `.env.prod.example` (placeholder keys), `scripts/fetch-ssm-env.sh` / `deploy-on-host.sh` / `pg-backup.sh`, `Makefile`, `.github/workflows/deploy.yml`.

Hygiene/docs: `.gitattributes` (LF), `.gitignore` (+`.env.prod`, tfplan), `.env.example` / `CLAUDE.md` touch-ups, `README.md` deploy guide, `docs/architecture-aws.md`, `docs/E2E-Progress.md`. Legacy `lambda/**` (Transcribe/Polly orchestrator) deleted.

Not this branch's change: the `ci.yml` / `ci-smoke.mjs` deletions and the `docker-compose.yml` edit shown in `git diff main --stat` are `main` advancing past the branch point; the three-dot diff (`git diff main...HEAD`) confirms they are untouched here. Full diff: `git diff main...HEAD` in the worktree.

</details>
