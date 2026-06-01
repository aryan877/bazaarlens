#!/bin/sh
set -eu

export BAZAARLENS_API_URL="${BAZAARLENS_API_URL:-${VITE_API_URL:-http://localhost:8787}}"
export BAZAARLENS_GOOGLE_CLIENT_ID="${BAZAARLENS_GOOGLE_CLIENT_ID:-${VITE_GOOGLE_CLIENT_ID:-}}"

envsubst '${BAZAARLENS_API_URL} ${BAZAARLENS_GOOGLE_CLIENT_ID}' \
  < /usr/share/nginx/html/bazaarlens-config.template.js \
  > /usr/share/nginx/html/bazaarlens-config.js
