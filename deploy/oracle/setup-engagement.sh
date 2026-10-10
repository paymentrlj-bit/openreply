#!/usr/bin/env bash
#
# Turns on (or reconfigures) smart replies on the Oracle worker server.
#
#   sudo bash /opt/openreply/deploy/oracle/setup-engagement.sh          ask for everything
#   sudo bash /opt/openreply/deploy/oracle/setup-engagement.sh mode live    switch mode only
#
# Modes: dry-run (decides and logs, sends nothing), live, off.
# Run setup-worker.sh first so the server has the latest code.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/openreply-worker.env}"
SERVICE="openreply-worker"

die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || [ -n "${ALLOW_NON_ROOT:-}" ] || die "Run this with sudo:  sudo bash $0"
[ -f "$ENV_FILE" ] || die "Run setup-worker.sh first (it creates $ENV_FILE)."

# Sets KEY=VALUE in the settings file, replacing any earlier line.
setvar() {
  local key="$1" val="$2" tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  grep -v "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$val" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

restart() {
  if [ -n "${SKIP_RESTART:-}" ]; then return; fi
  systemctl restart "$SERVICE"
  sleep 10
  echo
  echo "Smart replies status from the worker log:"
  journalctl -u "$SERVICE" -n 40 --no-pager | grep "\[Engage\]" | tail -5 \
    || echo "(no [Engage] lines yet, check again in a minute)"
}

if [ "${1:-}" = "mode" ]; then
  case "${2:-}" in
    off|dry-run|live) ;;
    *) die "Usage: $0 mode off|dry-run|live" ;;
  esac
  setvar ENGAGE_MODE "$2"
  echo "Mode set to $2."
  restart
  exit 0
fi

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

ANSWER=""
# ask HELP REGEX HIDDEN(1/0) [DEFAULT]: leaves the cleaned answer in $ANSWER.
ask() {
  local help="$1" regex="$2" hidden="$3" def="${4:-}" val
  while true; do
    printf '\n%s\n' "$help"
    if [ "$hidden" = "1" ]; then
      read -r -s -p "  Paste the value (it stays hidden), then press Enter: " val
      echo
    else
      read -r -p "  Value${def:+ [$def]}: " val
    fi
    val="$(clean "${val:-$def}")"
    if [[ "$val" =~ $regex ]]; then ANSWER="$val"; return; fi
    echo "  That does not look right. Please check it and try again."
  done
}

echo "Smart replies setup. Your answers are saved in $ENV_FILE (readable only by the administrator)."

ask "Which AI service? Type gemini (Google AI Studio) or openai (OpenRouter or any OpenAI-compatible service)." '^(gemini|openai)$' 0 gemini
provider="$ANSWER"

ask "API key for that service. Use a key made just for this, ideally with a spending limit." '^[A-Za-z0-9._-]{16,}$' 1
api_key="$ANSWER"

base_url=""
fallback_model=""
if [ "$provider" = "gemini" ]; then
  ask "Model name. Press Enter for the default." '^[A-Za-z0-9._/:-]+$' 0 gemini-flash-latest
  model="$ANSWER"
else
  ask "Model name exactly as listed on openrouter.ai/models, for example anthropic/claude-haiku-4.5." '^[A-Za-z0-9._/:-]+$' 0
  model="$ANSWER"
  ask "Backup model, used only if the main one is busy or rate limited. Press Enter for none. A name ending in :free sends comment text to providers that may keep it." '^([A-Za-z0-9._/:-]+)?$' 1 ""
  fallback_model="$ANSWER"
  ask "Service address. Press Enter for OpenRouter." '^https://[^[:space:]]+$' 0 https://openrouter.ai/api/v1
  base_url="${ANSWER%/}"
fi

# Sends one tiny request, so a wrong key or model name shows up now and not
# later in the logs. The key goes to curl on standard input, never on its
# command line.
test_llm() {
  local provider="$1" key="$2" model="$3" base="$4" out code detail
  out="$(mktemp)"
  if [ "$provider" = "gemini" ]; then
    code="$(printf 'header = "x-goog-api-key: %s"\n' "$key" | curl -sS -K - -o "$out" -w '%{http_code}' -m 45 \
      "${GEMINI_BASE:-https://generativelanguage.googleapis.com/v1beta}/models/${model}:generateContent" \
      -H 'Content-Type: application/json' \
      -d '{"contents":[{"parts":[{"text":"Reply with the single word OK"}]}],"generationConfig":{"maxOutputTokens":64}}' 2>/dev/null || true)"
  else
    code="$(printf 'header = "Authorization: Bearer %s"\n' "$key" | curl -sS -K - -o "$out" -w '%{http_code}' -m 45 \
      "${base}/chat/completions" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"${model}\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word OK\"}]}" 2>/dev/null || true)"
  fi
  code="${code:-000}"
  detail="$(grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' "$out" | head -1 | cut -c1-200 || true)"
  rm -f "$out"
  case "$code" in
    200) echo "  The key and model work."; return 0 ;;
    401|403) echo "  The service rejected the key (HTTP $code)." ;;
    402) echo "  The account has no credit, or this key's spending limit is used up (HTTP 402)." ;;
    400|404) echo "  The model name was not recognised (HTTP $code)." ;;
    429) echo "  Rate limited, or no free quota on this key (HTTP 429)." ;;
    000) echo "  Could not reach the service. Check the server's internet connection." ;;
    *) echo "  The service answered HTTP $code." ;;
  esac
  if [ -n "$detail" ]; then echo "  Details: $detail"; fi
  return 1
}

echo
echo "Testing the key and model..."
if ! test_llm "$provider" "$api_key" "$model" "$base_url"; then
  read -r -p "The test failed. Save these settings anyway? [y/N] " save_anyway
  case "${save_anyway:-N}" in
    [yY]*) ;;
    *) echo "Nothing was changed."; exit 1 ;;
  esac
fi

setvar ENGAGE_LLM_PROVIDER "$provider"
setvar ENGAGE_LLM_API_KEY "$api_key"
setvar ENGAGE_LLM_MODEL "$model"
if [ -n "$base_url" ]; then setvar ENGAGE_LLM_BASE_URL "$base_url"; fi
setvar ENGAGE_LLM_FALLBACK_MODEL "$fallback_model"

ask "Email address that should receive alerts and the daily summary." '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' 0
setvar ENGAGE_ALERT_EMAIL "$ANSWER"

ask "Mail server address (the same EMAIL_SERVER value you set in Vercel, starting with smtps://). Press Enter to skip." '^(smtps?://[^[:space:]]+)?$' 1 ""
if [ -n "$ANSWER" ]; then
  setvar EMAIL_SERVER "$ANSWER"
  ask "Sender shown on those emails (the same EMAIL_FROM value as in Vercel, for example RL Jewels <you@gmail.com>)." '^.+$' 0
  setvar EMAIL_FROM "$ANSWER"
fi

ask "Mode: dry-run (decides and records, sends nothing), live, or off. Start with dry-run." '^(off|dry-run|live)$' 0 dry-run
setvar ENGAGE_MODE "$ANSWER"

echo
echo "Saved. Restarting the worker..."
restart
