#!/usr/bin/env bash
# Nightly Postgres backup: pg_dump | gzip -> s3://$BACKUPS_BUCKET/pg/.
#
# Installed by user_data as /etc/cron.d/aives-pg-backup (02:00, CRON_TZ
# Asia/Ho_Chi_Minh). Retention is the S3 lifecycle rule on the pg/ prefix
# (14 days by default), not this script. Restore with `make db-restore`.
# The "dump when an exam session closes" hook is backend logic and is deferred.
set -euo pipefail

# shellcheck disable=SC1091
. /opt/aives/instance.env

KEY="pg/aives-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

if ! docker exec aives-postgres pg_dump -U aives -d aives --clean --if-exists --no-owner \
  | gzip -9 \
  | aws s3 cp - "s3://$BACKUPS_BUCKET/$KEY" --region "$AWS_REGION"; then
  echo "pg-backup: FAILED; removing partial object s3://$BACKUPS_BUCKET/$KEY" >&2
  aws s3 rm "s3://$BACKUPS_BUCKET/$KEY" --region "$AWS_REGION" >/dev/null 2>&1 || true
  exit 1
fi

echo "pg-backup: uploaded s3://$BACKUPS_BUCKET/$KEY"
