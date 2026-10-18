# AWS production stack with CloudFront, EC2, persistent Postgres, and OIDC deploys

This change replaces the legacy RDS/API Gateway/audio-orchestrator deployment with CloudFront, a private S3 SPA, and an EC2-hosted backend/Postgres stack deployed through GitHub OIDC and SSM. The requested hard safeguards are present: no world-open ingress, SSH, or long-lived AWS credential; all managed S3 buckets are private and encrypted; and Postgres uses an independently protected EBS volume. Static validation passed, but the first-deploy runtime contract is incomplete, failed rollouts overwrite the boot recovery image before health is established, and IAM exceeds the current call graph.

Watch for: **[MEDIUM, confirmed]** `STT_PROVIDER=mock` is inert while the default deployment omits the Lambda; **[MEDIUM, confirmed]** an unhealthy image replaces `.backend-image` before passing health; **[MEDIUM, confirmed]** Bedrock access covers every model in every region; **[MEDIUM, confirmed]** the EC2 and GitHub roles contain unused actions.

**Verdict**: NEEDS_CHANGES

## High-level view

CloudFront is the only inbound path to EC2 port 80 through the origin-facing managed prefix list, with no port 22 rule. The SPA uses S3 OAC, every Terraform-managed bucket receives public-access blocking and SSE-S3, secrets use SSM SecureString placeholders with ignored values, and EC2/GitHub authenticate through roles rather than stored keys.

Compose fits the 2 GB host constraint and maps Postgres to the separate `/data` mount. Its selective `STT_PROVIDER=mock` default is not consumed by the current backend, so the documented pre-Step-9 deployment still calls a real, absent Lambda for audio processing.

The host waits for backend health after recreating the stack, but records the candidate as `.backend-image` first; a failed tag therefore becomes the tag selected on later boots. OIDC trust and deploy gating are narrow, while Bedrock resource scope and several IAM actions are broader than the application and workflow need.

Recorded evidence covers Terraform format/init/validate, Compose interpolation, YAML parsing, and shell syntax. AWS apply, AL2023 bootstrap, Docker runtime health, SSM rollout, and the Actions job remain unexecuted by design.

<details>
<summary>Issues (5)</summary>

1. **[MEDIUM, confirmed] Inactive STT mock contract** — `STT_PROVIDER=mock` is ignored while `AWS_MOCK_MODE=false` makes audio processing invoke an absent Lambda. Land the selective STT adapter, gate audio processing, or provide a real fallback before enabling deploys.
2. **[MEDIUM, confirmed] Failed image becomes boot default** — `.backend-image` is updated before the candidate passes health. Persist it only after success and preserve the previous known-good tag on failure.
3. **[MEDIUM, confirmed] Unbounded Bedrock model scope** — the EC2 role can invoke every foundation model in every region. Restrict it to the configured inference profiles and required Nova/Titan backing-model ARNs.
4. **[MEDIUM, confirmed] Unused IAM capabilities** — EC2 and GitHub policies grant actions absent from the committed application/workflow call graph. Remove them until consuming code lands.
5. **[LOW, confirmed] Runtime validation pending** — apply, boot, mount, Docker health, SSM deploy, Actions, and restore behavior remain unexecuted under the agreed constraints. Exercise them with non-root credentials before setting `AWS_DEPLOY_ENABLED=true`.

</details>

<details>
<summary>Details</summary>

## CloudFront-only ingress and replacement-safe Postgres

```text
Browser --HTTPS--> CloudFront --HTTP/80--> EC2 --Docker--> backend
             |                         `-----------> Postgres
             `--OAC--> private S3 SPA                 |
                                                     EBS /data/postgres
```

`network.tf` uses `0.0.0.0/0` only for the internet-gateway route and outbound traffic. Its sole ingress resource is TCP/80 from `com.amazonaws.global.cloudfront.origin-facing`; there is no world IPv4/IPv6 or SSH ingress. The origin's HTTP leg is the explicit plan trade-off.

All four buckets share public-access blocking, bucket-owner enforcement, AES-256 default encryption, and a TLS-only deny policy. Postgres is on encrypted `aws_ebs_volume.data`, protected by `prevent_destroy`, attached separately with stop-before-detach, and mounted before Docker through `RequiresMountsFor=/data`, so instance replacement does not replace the database volume.

## `STT_PROVIDER=mock` does not stop real Lambda invocation

**[MEDIUM, confirmed]** The added Compose contract sets `AWS_MOCK_MODE=false` at `docker-compose.prod.yml:69` and defaults `STT_PROVIDER=mock` at line 92, while `lambda.tf` creates no STT function when `stt_image_uri` is empty. The current backend does not read `STT_PROVIDER`: `backend/src/config/env.js:15` selects the whole AWS client bundle with `AWS_MOCK_MODE`, and `backend/src/services/audioWorkflowService.js:43` always invokes the audio Lambda during processing. The documented first deployment therefore sends `/api/audio/process` to the deterministic but nonexistent function instead of using a mock.

This issue is introduced by the new deployment contract and legacy-orchestrator removal, not by the unchanged backend alone. Land the selective Step 9 STT adapter before enabling deployment, explicitly gate the audio route until then, or provide a fallback that does not also mock S3 and DynamoDB.

## Failed candidates become the boot-selected image

**[MEDIUM, confirmed]** `scripts/deploy-on-host.sh:34` writes the candidate tag to `.backend-image` immediately after `docker compose up`, before its health loop. If health never succeeds, the workflow fails but `aives.service` selects the failed tag on every later boot and the previous known-good tag is no longer identified.

Write `.backend-image` only after health succeeds and retain its previous value on failure. Restoring the previous Compose image automatically would further reduce outage time, but preserving the known-good pointer is the minimum correction.

## Runtime and deploy policies exceed the current call graph

**[MEDIUM, confirmed]** `infrastructure/terraform/ec2.tf:105-111` permits Bedrock invocation on `arn:aws:bedrock:*::foundation-model/*`, covering every model family in every region. APAC inference profiles may require several regional model ARNs, but not unrelated models. Scope access to the configured inference profiles and their Nova/Titan backing models, or accept only a validated Terraform ARN allowlist.

**[MEDIUM, confirmed]** The GitHub role grants `lambda:GetFunction`, `cloudfront:GetInvalidation`, and `ssm:ListCommandInvocations`, while `deploy.yml` uses `UpdateFunctionCode`, the `GetFunctionConfiguration` waiter, `CreateInvalidation`, and `GetCommandInvocation`. It also grants backups-bucket listing although the workflow writes fixed keys. The EC2 DynamoDB policy includes `DeleteItem`, `Query`, and `DescribeTable`, while the committed `AwsSessionStore` only gets, puts, and updates. Remove these actions until the consuming code lands.

## Runtime verification remains pending

**[LOW, confirmed]** Not tested: Terraform plan/apply, AWS resource creation, AL2023 user-data execution, EBS NVMe discovery/mounting, a real Docker build and health check, SSM Run Command, the GitHub Actions job, Make recipes, actionlint, and shellcheck. These omissions are recorded in `verification.md` and are consistent with the code-only/no-Docker constraints, but they leave runtime readiness unproven. Before setting `AWS_DEPLOY_ENABLED=true`, capture a clean non-root apply and bootstrap, a successful SSM deploy, a reboot using `.backend-image`, and a backup/restore smoke test.

</details>

<details>
<summary>File map</summary>

- `.agents/tasks/e2e-step11-deploy/plan.md` — records the Step 11 design and implementation contract.
- `.agents/tasks/e2e-step11-deploy/setup-notes.md` — records worktree setup context.
- `.agents/tasks/e2e-step11-deploy/verification.md` — records coder-run static validation and exclusions.
- `.env.example` — corrects production environment guidance.
- `.env.prod.example` — supplies placeholder values for Compose validation.
- `.gitattributes` — enforces LF for deployment/IaC files.
- `.github/workflows/deploy.yml` — adds OIDC-based build and SSM deployment.
- `.gitignore` — excludes generated production env and Terraform artifacts.
- `CLAUDE.md` — updates the repository component map.
- `Makefile` — adds EC2 lifecycle, restore, and Terraform helpers.
- `README.md` — replaces obsolete deployment instructions with the Step 11 runbook.
- `docker-compose.prod.yml` — defines the constrained EC2 production stack.
- `docs/E2E-Progress.md` — marks Step 11 code complete but unapplied.
- `docs/architecture-aws.md` — documents AWS topology and the physical ERD.
- `infrastructure/terraform/.terraform.lock.hcl` — locks provider builds for supported platforms.
- `infrastructure/terraform/budget.tf` — creates cost alerts.
- `infrastructure/terraform/cloudfront.tf` — routes SPA and API traffic.
- `infrastructure/terraform/cloudfront/spa-rewrite.js` — rewrites SPA deep links.
- `infrastructure/terraform/data.tf` — creates the session-context DynamoDB table.
- `infrastructure/terraform/ec2.tf` — creates the host, role, profile, EBS volume, and EIP.
- `infrastructure/terraform/ecr.tf` — creates image repositories and retention policies.
- `infrastructure/terraform/github_oidc.tf` — creates GitHub federation and deploy permissions.
- `infrastructure/terraform/lambda.tf` — optionally creates the STT image Lambda.
- `infrastructure/terraform/main.tf` — defines shared names, ARNs, buckets, and deploy artifacts.
- `infrastructure/terraform/network.tf` — creates the VPC and CloudFront-only ingress.
- `infrastructure/terraform/outputs.tf` — exports runtime and GitHub configuration values.
- `infrastructure/terraform/providers.tf` — configures AWS and default tags.
- `infrastructure/terraform/ssm.tf` — creates config parameters and secret placeholders.
- `infrastructure/terraform/storage.tf` — creates private encrypted buckets and deploy objects.
- `infrastructure/terraform/templates/user_data.sh.tftpl` — bootstraps Docker, EBS, scripts, cron, and systemd.
- `infrastructure/terraform/terraform.tfvars.example` — documents non-default deployment inputs.
- `infrastructure/terraform/variables.tf` — defines the deployment configuration surface.
- `infrastructure/terraform/versions.tf` — pins Terraform/provider constraints and documents state bootstrap.
- `lambda/package-lock.json` — removes the legacy audio-orchestrator dependency lock.
- `lambda/package.json` — removes the legacy Lambda package.
- `lambda/src/contracts/audio-events.md` — removes the legacy event contract.
- `lambda/src/handlers.js` — removes legacy Transcribe/Polly handlers.
- `lambda/src/providers/bedrockAgentCoreProvider.js` — removes the legacy Bedrock provider.
- `scripts/deploy-on-host.sh` — pulls config/images and health-checks deployments.
- `scripts/fetch-ssm-env.sh` — materializes protected runtime configuration.
- `scripts/pg-backup.sh` — streams nightly database backups to S3.

Full diff: `git diff 05fa1f8..HEAD`

</details>
