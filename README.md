# swd392_team7_product

Hệ thống thi vấn đáp thông minh có sử dụng AI.

## Kiến trúc trên AWS

CloudFront là cửa vào duy nhất: SPA React được phục vụ từ S3 (OAC), còn `/api/*` và `/socket.io/*` được chuyển về một EC2 t4g.small chạy Docker (backend Node + Postgres pgvector trên một EBS riêng).
Backend dùng S3 (audio, materials, cache TTS), DynamoDB (session context), hai Lambda container image: STT (`lambda/stt/`, PhoWhisper-small / Whisper small) và TTS (`lambda/tts/`, Kokoro-82M), Amazon Bedrock và Gmail SMTP. Google TTS chỉ là tùy chọn (`TTS_PROVIDER=google`).
Việc nền (ingest, sinh câu, chấm, email, làm nóng Lambda, tạo sẵn audio) là các dòng trong bảng Postgres `background_job`; không có API Gateway, SQS, Step Functions, Transcribe hay Polly.
Cấu hình và secret nằm ở SSM Parameter Store. GitHub Actions deploy qua OIDC, không dùng access key.
Hạ tầng nằm ở `infrastructure/terraform/`. Sơ đồ kiến trúc và Physical ERD (Mermaid): [docs/architecture-aws.md](docs/architecture-aws.md).

## Local development

### Backend

```bash
cd backend
npm install
npm test
npm start
```

Ứng dụng bắt buộc dùng AI thật. Cấu hình, quyền AWS và kiểm chứng Việt–Anh: [docs/bilingual-real-ai.md](docs/bilingual-real-ai.md). `npm test` dùng fake qua harness kiểm thử riêng.

## Local stack (docker compose)

A repo-root `docker-compose.yml` runs the whole stack for local development:
Postgres (with the `pgvector` extension), the Node backend, DynamoDB Local,
MinIO (S3), Mailpit (SMTP), and an nginx front proxy.

```bash
cp .env.example .env   # configure AWS access and application settings first
docker compose up
```

- App (via nginx): http://localhost:8080 — nginx serves the built React SPA and proxies `/api/*` and `/health` to the backend (all API routes live under `/api`)
- Mailpit UI (captured emails): http://localhost:8025
- MinIO console: http://localhost:9001 (minioadmin / minioadmin)

Database migrations run automatically when the backend starts against Postgres
(`DB_MOCK_MODE=false`). STT và TTS chạy model thật trong Docker; LLM và embedding gọi Bedrock. Xem [hướng dẫn cấu hình](docs/bilingual-real-ai.md).

Validate the compose file without starting anything:

```bash
docker compose config
```

### Frontend dev server (hot reload)

```bash
cd frontend && npm run dev   # http://localhost:5173, proxies /api -> http://localhost:3000
```

Run the backend against a real database (`DB_MOCK_MODE=false`, e.g. the compose
Postgres) with `APP_BASE_URL=http://localhost:5173` and a `JWT_SECRET`, so the
backend's Origin check accepts the dev server. Logging in does not work with the
default in-memory mock database (`DB_MOCK_MODE=true`), which only models the
legacy question/rubric/topic tables.

## Local E2E (Dockerized)

The Postgres-backed e2e suites (`backend/test/migrations.e2e.test.js` and
`backend/test/jobQueue.e2e.test.js`) self-skip unless `TEST_DATABASE_URL` is set,
so `npm test` and `npm run test:e2e` stay green without Docker. To run them
against a real pgvector Postgres:

```bash
docker compose up -d postgres
cd backend
# PowerShell
$env:TEST_DATABASE_URL='postgres://aives:aives@localhost:5432/aives'
# bash
# export TEST_DATABASE_URL=postgres://aives:aives@localhost:5432/aives
npm run test:e2e
```

The migration suite asserts every unified-model table and the `material_chunk`
HNSW index exist and that the runner is idempotent; the queue suite asserts
`FOR UPDATE SKIP LOCKED` claim exclusivity, retry-with-backoff, and re-claim
after a simulated crash. Without `TEST_DATABASE_URL` both suites skip.

## Deploy lên AWS (Bước 11)

Prod chạy cùng image backend với local; chỉ khác giá trị env (`docker-compose.prod.yml`). Các lệnh `make` chạy trong Git Bash hoặc WSL trên Windows (`winget install ezwinports.make` nếu chưa có `make`).

### 1. Điều kiện

- AWS CLI v2, Terraform ≥ 1.6, `gh` CLI, Docker (chỉ cần nếu build image thủ công).
- Một IAM user/role quản trị có MFA. KHÔNG dùng tài khoản root để chạy Terraform.
- Bật Bedrock model access cho Amazon Nova Pro và Titan Text Embeddings V2 ở `ap-southeast-1`.

### 2. Bootstrap state (tùy chọn)

Mặc định Terraform dùng local state (`infrastructure/terraform/terraform.tfstate`, đã gitignore); chỉ một người giữ file này.
Để cả nhóm dùng chung state:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3api create-bucket --bucket aives-tfstate-$ACCOUNT_ID --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1
aws s3api put-bucket-versioning --bucket aives-tfstate-$ACCOUNT_ID --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket aives-tfstate-$ACCOUNT_ID \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Sau đó bỏ comment khối `backend "s3"` trong `infrastructure/terraform/versions.tf` (thay `<account_id>`) và chạy `terraform -chdir=infrastructure/terraform init -migrate-state`.

### 3. `terraform apply` lần đầu

```bash
cp infrastructure/terraform/terraform.tfvars.example infrastructure/terraform/terraform.tfvars
# sửa budget_alert_email; để trống stt_image_uri
make tf-validate
make tf-plan                                   # xem kỹ plan
terraform -chdir=infrastructure/terraform apply tfplan
```

- EBS dữ liệu Postgres có `prevent_destroy`; `terraform destroy` sẽ dừng ở đó (cố ý). Muốn xóa hẳn phải gỡ lifecycle trước.
- AWS Budgets gửi email xác nhận tới `budget_alert_email`; cần bấm xác nhận.
- Lần boot đầu EC2 sẽ bỏ qua deploy (chưa có image và secret). Đó là bình thường.

### 4. Đặt secret trong SSM

Terraform chỉ tạo giá trị giả `CHANGE_ME` (và bỏ qua thay đổi giá trị sau đó). Đặt giá trị thật:

```bash
P=/aives/prod
aws ssm put-parameter --overwrite --type SecureString --name $P/JWT_SECRET --value "$(openssl rand -hex 32)"
# Chỉ dùng hex (an toàn trong URL). Chỉ có hiệu lực khi Postgres khởi tạo lần đầu trên volume trống.
aws ssm put-parameter --overwrite --type SecureString --name $P/POSTGRES_PASSWORD --value "$(openssl rand -hex 24)"
aws ssm put-parameter --overwrite --type String       --name $P/SMTP_USER --value "sender@gmail.com"
aws ssm put-parameter --overwrite --type SecureString --name $P/SMTP_PASS --value "<Gmail App Password>"
# Tùy chọn, chỉ khi TTS_PROVIDER=google (Standard tier tối đa 4 KB). Mặc định TTS chạy Kokoro trên Lambda, không cần khóa này.
# aws ssm put-parameter --overwrite --type SecureString --name $P/GOOGLE_TTS_KEY_JSON --value file://key.json
```

Tùy chọn (String, ghi đè mặc định trong compose): `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `STT_PROVIDER`, `TTS_PROVIDER`, `BEDROCK_MODEL_ID`, `BEDROCK_EMBED_MODEL_ID`. Mọi parameter dưới `/aives/prod/` đều thành biến môi trường qua `scripts/fetch-ssm-env.sh`.

### 5. Biến GitHub Actions

```bash
terraform -chdir=infrastructure/terraform output -json github_actions_variables
gh variable set AWS_DEPLOY_ROLE_ARN --body "<giá trị>"   # lặp lại cho từng khóa trong output
gh variable set AWS_DEPLOY_ENABLED --body true            # đặt CUỐI CÙNG
```

Role deploy chỉ tin `repo:tmqthedev/swd392_team7_product:ref:refs/heads/main`. Nếu GitHub đổi định dạng claim `sub` (repo mới có thể kèm ID), cập nhật `github_repo`/trust policy cho khớp.

### 6. Deploy đầu tiên

Actions → Deploy → Run workflow trên `main` (hoặc push lên `main` sau khi CI xanh). Workflow build image arm64, đẩy lên ECR, chạy `deploy-on-host.sh` qua SSM, build frontend, sync lên S3 và invalidate CloudFront.

Tạo admin:

```bash
aws ssm start-session --target <instance_id>
sudo docker exec -it aives-backend npm run create-admin -- --email admin@example.com --password '<mật khẩu>'
```

App chạy ở `terraform output app_url`.

### 7. STT và TTS Lambda (sau Bước 9)

Build và push image `lambda/stt/` lên `ecr_stt_url`, đặt `stt_image_uri` trong `terraform.tfvars`, `apply`, đặt biến GitHub `STT_FUNCTION_NAME` (`terraform output stt_function_name`), rồi đặt SSM `/aives/prod/STT_PROVIDER=lambda`. Từ đó workflow tự cập nhật code Lambda.

TTS làm tương tự với `lambda/tts/`: push lên `ecr_tts_url`, đặt `tts_image_uri`, `apply`, đặt biến GitHub `TTS_FUNCTION_NAME` (`terraform output tts_function_name`), rồi đặt SSM `/aives/prod/TTS_PROVIDER=kokoro`. Compose prod mặc định `TTS_LAMBDA_FUNCTION_NAME=aives-prod-tts`, `TTS_TIMEOUT_MS=25000`; `STT_TIMEOUT_MS=90000`.

Prod hiện chạy cả hai Lambda ở x86_64; STT 3008 MB (mức tối đa của tài khoản), timeout 120 giây. Lần gọi đầu sau khi đổi image mất 45–75 giây, nên Admin bấm **Khởi động** kỳ thi trên Bảng lịch thi (`/admin/exam-schedule`) trước giờ thi: backend làm nóng hai Lambda, giữ nóng mỗi 5 phút tới giờ đóng và tạo sẵn audio câu hỏi.

### 8. Tắt/bật máy chủ

```bash
make aws-stop    # dừng EC2 (EBS + Elastic IP vẫn tính phí, ~3.6 USD/tháng cho EIP)
make aws-start   # bật lại; aives.service tự lấy env từ SSM và chạy lại stack
```

Với `use_elastic_ip=false`, IP công khai đổi sau mỗi lần start: phải chạy `terraform apply` để CloudFront trỏ lại.

### 9. Sao lưu & khôi phục

- Cron 02:00 (Asia/Ho_Chi_Minh) chạy `scripts/pg-backup.sh`: `pg_dump | gzip` lên `s3://<backups>/pg/`. Lifecycle S3 xóa bản cũ hơn 14 ngày.
- Khôi phục bản mới nhất vào stack local: `make db-restore CONFIRM=yes BACKUP_BUCKET=<backups>`.
- Khôi phục trên EC2 (dừng backend trước):

```bash
aws ssm start-session --target <instance_id>
sudo docker stop aives-backend
cd /opt/aives && sudo make db-restore CONFIRM=yes PG_EXEC="docker exec -i aives-postgres" BACKUP_BUCKET=<backups>
sudo docker start aives-backend
```

Dùng `BACKUP_KEY=pg/aives-<timestamp>.sql.gz` để chọn bản cụ thể.

### 10. Bảo mật

- Không SSH: security group chỉ mở cổng 80 cho prefix list origin-facing của CloudFront; shell qua SSM Session Manager.
- IMDSv2 bắt buộc; ứng dụng dùng instance role (least privilege), không có access key dài hạn. CI dùng OIDC.
- Mọi bucket S3 chặn public, mã hóa SSE, chỉ chấp nhận TLS. Secret chỉ nằm trong SSM SecureString.

### 11. Chi phí

Ước tính theo tháng ở `ap-southeast-1` (giá tham khảo, chưa đối chiếu AWS Pricing Calculator):

| Thành phần | Chạy 24/7 | Khi `aws-stop` |
| :---- | :---- | :---- |
| EC2 t4g.small | ~15 USD | 0 |
| EBS gp3 8 + 10 GB | ~1.7 USD | ~1.7 USD |
| IPv4 công khai / Elastic IP | ~3.6 USD | ~3.6 USD |
| CloudFront, S3, DynamoDB, Lambda, ECR, SSM | vài USD với lưu lượng đồ án | gần 0 |
| Bedrock (và Google TTS nếu bật) | theo số lượt gọi | 0 |

AWS Budgets cảnh báo khi vượt 80% (thực tế) hoặc 100% (dự báo) của `budget_limit_usd` (mặc định 20 USD). Các quyết định thiết kế: `.agents/tasks/e2e-step11-deploy/plan.md`.
