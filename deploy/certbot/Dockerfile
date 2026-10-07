# Certbot runner for the school ERP: fetches the list of ACTIVE custom domains from the API,
# obtains or renews a Let's Encrypt certificate for each one, writes a per-domain nginx snippet
# into the shared volume so the next nginx reload picks them up.
#
# Expected environment:
#   PUBLIC_URL     — https root of the SaaS portal, used to call /api/platform/certbot/hostnames
#   CERTBOT_TOKEN  — bearer token (shared with the API) that authorises the listing endpoint
#   CERTBOT_EMAIL  — contact e-mail passed to Let's Encrypt for expiry notifications
#   CERTBOT_STAGING — "true" to use the staging ACME endpoint (no rate limit, untrusted certs)
#
# Run manually once (first deployment, after a new domain is validated):
#   docker compose -f docker-compose.prod.yml --profile certbot run --rm certbot renew-now
# Set up a daily cron on the host: `docker compose … run --rm certbot renew-cron` (idempotent).

FROM alpine:3.20

RUN apk add --no-cache certbot curl jq openssl bash

COPY renew.sh /usr/local/bin/renew.sh
RUN chmod +x /usr/local/bin/renew.sh

# Default command runs the full cycle once. Override to pass extra flags (`--dry-run`, a list of
# hostnames to limit the run, …) through docker-compose `command:` or `run` arguments.
ENTRYPOINT ["/usr/local/bin/renew.sh"]
CMD ["renew-now"]
