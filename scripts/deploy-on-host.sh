#!/usr/bin/env bash
# Roll out the production stack on the EC2 host.
#
# Usage: deploy-on-host.sh [backend-image-uri]
#   Without an argument the last deployed image (/opt/aives/.backend-image) is
#   reused; this is what the aives.service boot unit does.
# Invoked by user_data (first boot), aives.service (every boot) and the
# GitHub deploy workflow (via SSM SendCommand).
set -euo pipefail

cd /opt/aives
# shellcheck disable=SC1091
. ./instance.env

./scripts/fetch-ssm-env.sh /opt/aives/.env.prod

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

BACKEND_IMAGE="${1:-}"
if [ -z "$BACKEND_IMAGE" ] && [ -f .backend-image ]; then
  BACKEND_IMAGE="$(cat .backend-image)"
fi
if [ -z "$BACKEND_IMAGE" ]; then
  echo "deploy-on-host: no image given and /opt/aives/.backend-image is missing" >&2
  exit 1
fi
export BACKEND_IMAGE

compose=(docker compose --env-file .env.prod -f docker-compose.prod.yml)
"${compose[@]}" pull backend
"${compose[@]}" up -d --remove-orphans

printf '%s\n' "$BACKEND_IMAGE" >.backend-image
docker image prune -f >/dev/null

for _ in $(seq 1 24); do
  status="$(docker inspect -f '{{.State.Health.Status}}' aives-backend 2>/dev/null || echo unknown)"
  if [ "$status" = "healthy" ]; then
    echo "deploy-on-host: aives-backend healthy ($BACKEND_IMAGE)"
    exit 0
  fi
  sleep 5
done

echo "deploy-on-host: aives-backend not healthy after 120s (last status: $status)" >&2
docker logs --tail 50 aives-backend >&2 || true
exit 1
