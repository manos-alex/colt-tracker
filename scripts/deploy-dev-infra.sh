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

echo "Validating Terraform..."
terraform -chdir="${INFRA_DIR}" validate

echo "Planning dev infrastructure..."
terraform -chdir="${INFRA_DIR}" plan -var-file=environments/dev.tfvars

echo "Applying dev infrastructure..."
terraform -chdir="${INFRA_DIR}" apply -var-file=environments/dev.tfvars "$@"

echo "Running database migrations..."
aws lambda invoke \
  --function-name "$(terraform -chdir="${INFRA_DIR}" output -raw migration_runner_function_name)" \
  /tmp/colt-tracker-dev-migrations.json >/dev/null

echo "Dev infrastructure deployed and migrations invoked."
