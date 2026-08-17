#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
AWS_PROFILE="${AWS_PROFILE:-colt-dev-deploy}"
AWS_REGION="${AWS_REGION:-us-east-1}"

export AWS_PROFILE
export AWS_REGION

echo "Building frontend..."
npm --prefix "${ROOT_DIR}" exec tsc -- --noEmit
npm --prefix "${ROOT_DIR}" exec vite -- build

BUCKET="$(terraform -chdir="${INFRA_DIR}" output -raw frontend_bucket_name)"
DISTRIBUTION_ID="$(terraform -chdir="${INFRA_DIR}" output -raw frontend_cloudfront_distribution_id)"
FRONTEND_DOMAIN="$(terraform -chdir="${INFRA_DIR}" output -raw frontend_cloudfront_domain_name)"

echo "Uploading dist/ to s3://${BUCKET}..."
aws s3 sync "${ROOT_DIR}/dist/" "s3://${BUCKET}" --delete

echo "Invalidating CloudFront distribution ${DISTRIBUTION_ID}..."
aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths "/*" >/dev/null

echo "Dev frontend deployed: https://${FRONTEND_DOMAIN}"
