#!/usr/bin/env bash
#
# Reports OpenReply's health to Healthchecks.io. Run every 5 minutes by cron
# (installed by setup-healthcheck.sh).
#
# It asks the website's /api/health whether the worker is running. If yes, it
# pings Healthchecks.io. If not, it sends an explicit failure ping. If this
# server is down, no ping arrives at all, and Healthchecks.io alerts after its
# grace time, so every failure mode ends in an alert.

set -u

HC_ENV="${HC_ENV:-/etc/openreply-healthcheck.env}"
WORKER_ENV="${WORKER_ENV:-/etc/openreply-worker.env}"

HC_URL="$(grep '^HC_URL=' "$HC_ENV" 2>/dev/null | cut -d= -f2-)"
SITE="$(grep '^NEXTAUTH_URL=' "$WORKER_ENV" 2>/dev/null | cut -d= -f2-)"
HC_URL="${HC_URL%/}"
SITE="${SITE%/}"

# Misconfigured: send nothing, so Healthchecks.io alerts that pings stopped.
if [ -z "$HC_URL" ] || [ -z "$SITE" ]; then
  echo "openreply-healthcheck: missing HC_URL or NEXTAUTH_URL" >&2
  exit 1
fi

# No -f: we want the body even when the site answers 503 while degraded.
body="$(curl -sS -m 20 --retry 2 "$SITE/api/health" 2>/dev/null || true)"

if printf '%s' "$body" | grep -q '"worker":{"healthy":true'; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$HC_URL"
else
  curl -fsS -m 10 --retry 3 -o /dev/null "$HC_URL/fail"
fi
