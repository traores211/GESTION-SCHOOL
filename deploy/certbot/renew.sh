#!/bin/bash
# Fetch the active custom domains from the API, obtain or renew a Let's Encrypt certificate for
# each one, write a per-domain nginx snippet into /etc/nginx/sites so the next nginx reload picks
# them up. Idempotent: safe to run from a cron.
set -euo pipefail

: "${PUBLIC_URL:?PUBLIC_URL required (https://mon-saas-ecole.ci)}"
: "${CERTBOT_TOKEN:?CERTBOT_TOKEN required (shared secret with the API)}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL required (Let's Encrypt contact)}"

WEBROOT="/var/www/certbot"
LIVE_DIR="/etc/letsencrypt/live"
NGINX_SITES_DIR="/etc/nginx/sites"
TEMPLATE="/etc/nginx/sites-template.conf"

mkdir -p "$WEBROOT" "$NGINX_SITES_DIR"

MODE="${1:-renew-now}"

STAGING_FLAG=""
if [ "${CERTBOT_STAGING:-false}" = "true" ]; then
  STAGING_FLAG="--staging"
  echo "[certbot] running against the Let's Encrypt staging endpoint"
fi

# ---------- 1. List the hostnames the API currently knows about ----------
echo "[certbot] fetching active hostnames from $PUBLIC_URL"
HOSTS_JSON=$(curl -fsS -H "Authorization: Bearer $CERTBOT_TOKEN" "$PUBLIC_URL/api/platform/certbot/hostnames" || true)
if [ -z "$HOSTS_JSON" ]; then
  echo "[certbot] could not reach the API or empty response; aborting"
  exit 1
fi
HOSTS=$(echo "$HOSTS_JSON" | jq -r '.hostnames[]?')
if [ -z "$HOSTS" ]; then
  echo "[certbot] no active custom domain, nothing to do"
  exit 0
fi

# ---------- 2. For each hostname: certonly then write the nginx snippet ----------
for HOST in $HOSTS; do
  echo ""
  echo "[certbot] processing $HOST"
  if certbot certificates --cert-name "$HOST" 2>/dev/null | grep -q "VALID"; then
    echo "[certbot] $HOST already has a certificate, renewing if needed"
    certbot renew --cert-name "$HOST" --webroot --webroot-path "$WEBROOT" --non-interactive $STAGING_FLAG || {
      echo "[certbot] renewal failed for $HOST — keeping the existing snippet"
      continue
    }
  else
    echo "[certbot] $HOST has no certificate yet, requesting one"
    certbot certonly --webroot --webroot-path "$WEBROOT" --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email --non-interactive $STAGING_FLAG -d "$HOST" || {
      echo "[certbot] issuance failed for $HOST — skipping (DNS not pointing yet?)"
      continue
    }
  fi

  CERT_PATH="$LIVE_DIR/$HOST/fullchain.pem"
  KEY_PATH="$LIVE_DIR/$HOST/privkey.pem"
  if [ ! -f "$CERT_PATH" ] || [ ! -f "$KEY_PATH" ]; then
    echo "[certbot] expected cert files not found for $HOST, snippet NOT written"
    continue
  fi

  SNIPPET="$NGINX_SITES_DIR/$HOST.conf"
  if [ -f "$TEMPLATE" ]; then
    sed -e "s|{HOST}|$HOST|g" -e "s|{CERT_PATH}|$CERT_PATH|g" -e "s|{KEY_PATH}|$KEY_PATH|g" "$TEMPLATE" > "$SNIPPET"
  else
    # Fallback inline template (same as deploy/nginx/sites/template.conf.example).
    cat > "$SNIPPET" <<EOF
server {
  listen 443 ssl;
  http2 on;
  server_name $HOST;
  ssl_certificate     $CERT_PATH;
  ssl_certificate_key $KEY_PATH;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_session_cache   shared:SSL:10m;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location /api/auth/ { limit_req zone=auth burst=10 nodelay; proxy_pass http://api; include /etc/nginx/proxy_params.conf; }
  location /api/ { limit_req zone=api burst=60 nodelay; proxy_pass http://api; include /etc/nginx/proxy_params.conf; proxy_buffering off; proxy_read_timeout 120s; }
  location / { proxy_pass http://web; include /etc/nginx/proxy_params.conf; }
}
EOF
  fi
  echo "[certbot] snippet written at $SNIPPET"
done

# ---------- 3. Remove snippets for hostnames that are no longer active ----------
echo ""
echo "[certbot] cleaning up snippets of removed domains"
for SNIPPET in "$NGINX_SITES_DIR"/*.conf; do
  [ -e "$SNIPPET" ] || continue
  BASENAME=$(basename "$SNIPPET" .conf)
  if ! echo "$HOSTS" | grep -qx "$BASENAME"; then
    echo "[certbot] removing snippet $SNIPPET (hostname no longer active)"
    rm -f "$SNIPPET"
  fi
done

# ---------- 4. Ask nginx to reload (optional, non-fatal) ----------
if [ -S /var/run/docker.sock ] && command -v docker >/dev/null 2>&1; then
  echo "[certbot] asking nginx to reload"
  docker exec school-nginx nginx -s reload 2>/dev/null || echo "[certbot] nginx reload skipped (not reachable from this container)"
else
  echo "[certbot] nginx reload must be triggered on the host (e.g. docker exec school-nginx nginx -s reload)"
fi

echo ""
echo "[certbot] done"

if [ "$MODE" = "renew-cron" ]; then
  # Sleep until tomorrow 02:00 and loop, so a single docker run keeps renewing without a host cron.
  while true; do
    NEXT=$(( $(date -d 'tomorrow 02:00' +%s) - $(date +%s) ))
    echo "[certbot] sleeping $NEXT seconds until the next cycle"
    sleep "$NEXT"
    exec "$0" renew-now
  done
fi
