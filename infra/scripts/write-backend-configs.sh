#!/usr/bin/env bash
set -euo pipefail

bucket_name="${1:-}"
region="${2:-us-east-1}"
lock_table="${3:-colt-tracker-terraform-locks}"

if [[ -z "${bucket_name}" ]]; then
  echo "usage: $0 <state-bucket-name> [region] [lock-table-name]" >&2
  exit 1
fi

mkdir -p backend

for environment in dev prod; do
  cat > "backend/${environment}.hcl" <<EOF
bucket         = "${bucket_name}"
key            = "${environment}/terraform.tfstate"
region         = "${region}"
dynamodb_table = "${lock_table}"
encrypt        = true
EOF
done
