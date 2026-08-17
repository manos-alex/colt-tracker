#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/deploy-dev-backend.sh" "$@"
"${ROOT_DIR}/scripts/deploy-dev-frontend.sh"

echo "Dev app deployed."
