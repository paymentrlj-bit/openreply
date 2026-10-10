#!/usr/bin/env bash
#
# Installs a 5-minute health check that pings Healthchecks.io.
# Run after setup-worker.sh:
#   sudo bash /opt/openreply/deploy/oracle/setup-healthcheck.sh
# Safe to re-run (it replaces the saved URL).

set -euo pipefail

ENV_FILE="/etc/openreply-healthcheck.env"
WORKER_ENV="/etc/openreply-worker.env"
BIN="/usr/local/bin/openreply-healthcheck"
CRON_FILE="/etc/cron.d/openreply-healthcheck"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this with sudo:  sudo bash $0"
[ -f "$WORKER_ENV" ] || die "Run setup-worker.sh first (it creates $WORKER_ENV)."

export DEBIAN_FRONTEND=noninteractive
apt-get install -y cron curl >/dev/null
systemctl enable --now cron >/dev/null 2>&1 || true

while true; do
  read -r -s -p "Paste your Healthchecks.io ping URL (hidden), then press Enter: " url
  echo
  url="${url#"${url%%[![:space:]]*}"}"
  url="${url%"${url##*[![:space:]]}"}"
  if [ "${#url}" -ge 2 ] && { [[ "$url" == \"*\" ]] || [[ "$url" == \'*\' ]]; }; then
    url="${url:1:${#url}-2}"
  fi
  if [[ "$url" =~ ^https://[^/[:space:]]+/.+ ]]; then break; fi
  echo "That does not look like a ping URL (it should start with https:// and include a long code)."
done

umask 077
printf 'HC_URL=%s\n' "$url" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

install -m 755 "$HERE/healthcheck.sh" "$BIN"
printf '*/5 * * * * root %s\n' "$BIN" > "$CRON_FILE"
chmod 644 "$CRON_FILE"

echo "Sending a test ping..."
if "$BIN"; then
  echo "Done. Check Healthchecks.io: the check should now show as up."
  echo "It will ping every 5 minutes. Set the check's Period to 5 minutes and Grace Time to 10 minutes."
else
  die "The test ping failed. Check the URL and that the server can reach the internet."
fi
