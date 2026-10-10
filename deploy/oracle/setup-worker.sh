#!/usr/bin/env bash
#
# OpenReply worker installer for Ubuntu 22.04 on an Oracle Cloud Always Free VM
# (works on any small Ubuntu server).
#
# It installs Node.js, downloads this repo, asks for your settings, and runs the
# worker as a service that starts on boot and restarts if it crashes.
# Safe to re-run: running it again updates the code and restarts the worker.
#
# Usage (do NOT pipe from curl; the script asks you questions):
#   sudo bash setup-worker.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/paymentrlj-bit/openreply.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="/opt/openreply"
ENV_FILE="/etc/openreply-worker.env"
SERVICE="openreply-worker"
RUN_USER="openreply"
NODE_MAJOR=22

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this with sudo:  sudo bash setup-worker.sh"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || die "This script is written for Ubuntu."

# --- 1. Swap: the free server has about 1 GB of RAM ---------------------------
if ! swapon --show | grep -q .; then
  say "Adding 2 GB of swap space (this server has little RAM)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- 2. System packages and Node.js -------------------------------------------
say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates gnupg

need_node=1
if command -v node >/dev/null 2>&1; then
  current_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$current_major" -ge "$NODE_MAJOR" ]; then need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  say "Installing Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

# --- 3. Service user and code -------------------------------------------------
if ! id "$RUN_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/var/lib/$RUN_USER" \
    --shell /usr/sbin/nologin "$RUN_USER"
fi
mkdir -p "$APP_DIR"
chown "$RUN_USER":"$RUN_USER" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  say "Updating the code"
  sudo -u "$RUN_USER" -H git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  sudo -u "$RUN_USER" -H git -C "$APP_DIR" reset --hard FETCH_HEAD
else
  say "Downloading the code"
  sudo -u "$RUN_USER" -H git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# --- 4. Settings --------------------------------------------------------------
# Trim spaces and one pair of surrounding quotes, a common copy-and-paste slip.
clean() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  if [ "${#v}" -ge 2 ] && { [[ "$v" == \"*\" ]] || [[ "$v" == \'*\' ]]; }; then
    v="${v:1:${#v}-2}"
  fi
  printf '%s' "$v"
}

declare -A VALUES
# ask NAME HELP REGEX HIDDEN(1/0) [DEFAULT]
ask() {
  local name="$1" help="$2" regex="$3" hidden="$4" def="${5:-}" val
  while true; do
    printf '\n%s\n  %s\n' "$name" "$help"
    if [ "$hidden" = "1" ]; then
      read -r -s -p "  Paste the value (it stays hidden), then press Enter: " val
      echo
    else
      read -r -p "  Value${def:+ [$def]}: " val
    fi
    val="$(clean "${val:-$def}")"
    if [[ "$val" =~ $regex ]]; then
      VALUES[$name]="$val"
      return
    fi
    echo "  That does not look right. Please check it and try again."
  done
}

if [ -f "$ENV_FILE" ]; then
  read -r -p "A settings file already exists. Keep it? [Y/n] " keep
  case "${keep:-Y}" in [nN]*) rm -f "$ENV_FILE" ;; esac
fi

if [ ! -f "$ENV_FILE" ]; then
  say "Enter your settings. Secret values are hidden as you paste them."
  ask DATABASE_URL "Neon connection string (starts with postgresql://)" '^postgres(ql)?://.+' 1
  ask REDIS_URL "Redis Cloud address (starts with redis://)" '^rediss?://.+' 1
  ask ENCRYPTION_KEY "64 characters (0-9, a-f). MUST be identical to the value in Vercel." '^[a-fA-F0-9]{64}$' 1
  ask NEXTAUTH_URL "Your site address, e.g. https://rljewels-openreply.vercel.app" '^https://[^/[:space:]]+$' 0
  ask NEXTAUTH_SECRET "Same value as in Vercel" '^.{16,}$' 1
  ask INSTAGRAM_APP_ID "From the Meta app dashboard (numbers only)" '^[0-9]+$' 0
  ask INSTAGRAM_APP_SECRET "From the Meta app dashboard" '^[A-Za-z0-9]{16,}$' 1
  ask FACEBOOK_APP_SECRET "From the Meta app: Settings > Basic" '^[A-Za-z0-9]{16,}$' 1
  ask META_GRAPH_API_VERSION "Press Enter to accept the default" '^v[0-9]+\.[0-9]+$' 0 v25.0

  umask 077
  {
    for key in DATABASE_URL REDIS_URL ENCRYPTION_KEY NEXTAUTH_URL NEXTAUTH_SECRET \
               INSTAGRAM_APP_ID INSTAGRAM_APP_SECRET FACEBOOK_APP_SECRET \
               META_GRAPH_API_VERSION; do
      printf '%s=%s\n' "$key" "${VALUES[$key]}"
    done
    echo "NODE_ENV=production"
    echo "DB_POOL_MAX=5"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Settings saved to $ENV_FILE (readable only by the administrator)."
fi

# --- 5. Install the app -------------------------------------------------------
say "Installing the app (a few minutes on a small server)"
sudo -u "$RUN_USER" -H bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund"

db_url="$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)"
DATABASE_URL="$db_url" sudo --preserve-env=DATABASE_URL -u "$RUN_USER" -H \
  bash -c "cd '$APP_DIR' && npm run db:generate"

# --- 6. Run it as a service ---------------------------------------------------
say "Starting the worker"
cat > "/etc/systemd/system/${SERVICE}.service" <<UNIT
[Unit]
Description=OpenReply DM worker
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_OPTIONS=--max-old-space-size=384
ExecStart=${APP_DIR}/node_modules/.bin/tsx worker/dm-worker.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 20

if systemctl is-active --quiet "$SERVICE"; then
  say "The worker is running. Last log lines:"
  journalctl -u "$SERVICE" -n 15 --no-pager || true
  echo
  echo "Next: open  <your site>/api/health  and check that worker.healthy is true."
else
  journalctl -u "$SERVICE" -n 40 --no-pager || true
  die "The worker did not start. Send the log lines above to your helper (first check that no password appears in them)."
fi
