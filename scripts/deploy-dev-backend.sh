#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
AWS_PROFILE="${AWS_PROFILE:-colt-dev-deploy}"
AWS_REGION="${AWS_REGION:-us-east-1}"

export AWS_PROFILE
export AWS_REGION

if [[ ! -f "${INFRA_DIR}/backend/dev.hcl" ]]; then
  echo "Missing ${INFRA_DIR}/backend/dev.hcl." >&2
  echo "Create it with infra/scripts/write-backend-configs.sh after running infra/bootstrap." >&2
  exit 1
fi

echo "Building backend Lambda artifact..."
npm --prefix "${ROOT_DIR}" run build:backend

echo "Initializing Terraform dev backend..."
terraform -chdir="${INFRA_DIR}" init -backend-config=backend/dev.hcl

echo "Applying backend Lambda changes through Terraform..."
terraform -chdir="${INFRA_DIR}" apply -var-file=environments/dev.tfvars "$@"

API_ENDPOINT="$(terraform -chdir="${INFRA_DIR}" output -raw api_endpoint)"

echo "Smoke testing deployed API..."
curl --fail --silent --show-error "${API_ENDPOINT}/api/health"
echo
curl --fail --silent --show-error --max-time 60 "${API_ENDPOINT}/api/session" >/dev/null

echo "Dev backend deployed."
