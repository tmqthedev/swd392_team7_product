#!/usr/bin/env bash
# Build the production env file from SSM Parameter Store.
#
# Usage: fetch-ssm-env.sh [out=/opt/aives/.env.prod]
#
# Every parameter under $SSM_PREFIX (e.g. /aives/prod/JWT_SECRET) becomes one
# line KEY='value' where KEY is the last path segment. docker-compose.prod.yml
# reads the file via `docker compose --env-file`.
#   - GOOGLE_TTS_KEY_JSON (multi-line JSON) is written to secrets/google-tts-key.json
#     (mounted read-only into the backend) and never into the env file.
#   - A value of CHANGE_ME (Terraform placeholder) is treated as "not set".
#   - JWT_SECRET and POSTGRES_PASSWORD are required (exit 3 if missing).
# Runs on the EC2 host with the instance role; needs aws CLI v2 + jq.
set -euo pipefail

OUT="${1:-/opt/aives/.env.prod}"
OUT_DIR="$(dirname "$OUT")"
SECRETS_DIR="$OUT_DIR/secrets"
INSTANCE_ENV="${AIVES_INSTANCE_ENV:-/opt/aives/instance.env}"

if [ -f "$INSTANCE_ENV" ]; then
  # shellcheck disable=SC1090
  . "$INSTANCE_ENV"
fi

: "${AIVES_ENV:=prod}"
: "${AWS_REGION:=ap-southeast-1}"
: "${SSM_PREFIX:=/aives/$AIVES_ENV}"

json="$(aws ssm get-parameters-by-path \
  --path "$SSM_PREFIX/" \
  --with-decryption \
  --recursive \
  --region "$AWS_REGION" \
  --output json)"

tmp="$(mktemp "$OUT_DIR/.env.prod.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
chmod 600 "$tmp"

mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

have_region=false
have_env=false
google_key_written=false
jwt_ok=false
pg_ok=false

# One parameter name per line; values are looked up individually so that
# multi-line values never get split by the shell.
names="$(jq -r '.Parameters[].Name' <<<"$json")"
while IFS= read -r full_name; do
  [ -n "$full_name" ] || continue
  key="${full_name##*/}"
  value="$(jq -r --arg n "$full_name" '.Parameters[] | select(.Name == $n) | .Value' <<<"$json")"

  if [ "$value" = "CHANGE_ME" ]; then
    value=""
  fi

  if [ "$key" = "GOOGLE_TTS_KEY_JSON" ]; then
    if [ -z "$value" ]; then
      value='{}'
    fi
    (umask 077; printf '%s\n' "$value" >"$SECRETS_DIR/google-tts-key.json")
    chmod 600 "$SECRETS_DIR/google-tts-key.json"
    google_key_written=true
    continue
  fi

  if ! [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "fetch-ssm-env: skipping $full_name (not a valid env var name)" >&2
    continue
  fi
  if [[ "$value" == *$'\n'* || "$value" == *"'"* ]]; then
    echo "fetch-ssm-env: $full_name contains a newline or single quote; not supported" >&2
    exit 2
  fi

  case "$key" in
    AWS_REGION) have_region=true ;;
    AIVES_ENV) have_env=true ;;
    JWT_SECRET) if [ -n "$value" ]; then jwt_ok=true; fi ;;
    POSTGRES_PASSWORD) if [ -n "$value" ]; then pg_ok=true; fi ;;
  esac

  printf "%s='%s'\n" "$key" "$value" >>"$tmp"
done <<<"$names"

$have_env || printf "AIVES_ENV='%s'\n" "$AIVES_ENV" >>"$tmp"
$have_region || printf "AWS_REGION='%s'\n" "$AWS_REGION" >>"$tmp"

# The compose bind mount needs a file, never an auto-created directory.
if ! $google_key_written; then
  (umask 077; printf '{}\n' >"$SECRETS_DIR/google-tts-key.json")
  chmod 600 "$SECRETS_DIR/google-tts-key.json"
fi

if ! $jwt_ok || ! $pg_ok; then
  echo "fetch-ssm-env: $SSM_PREFIX/JWT_SECRET and $SSM_PREFIX/POSTGRES_PASSWORD must be set (not CHANGE_ME)." >&2
  echo "  aws ssm put-parameter --overwrite --type SecureString --name $SSM_PREFIX/JWT_SECRET --value \"\$(openssl rand -hex 32)\"" >&2
  exit 3
fi

mv -f "$tmp" "$OUT"
trap - EXIT
echo "fetch-ssm-env: wrote $OUT ($(wc -l <"$OUT") keys) from $SSM_PREFIX"
