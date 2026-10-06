#!/usr/bin/env bash
# Read-only public preview of the web UI against real clusters, through a
# Cloudflare tunnel. Outbound-only: no port forward, TLS ends at Cloudflare.
#
#   deploy/preview/preview.sh setup     # once: tunnel + DNS + token (Cloudflare API)
#   deploy/preview/preview.sh up        # build this checkout and start (app + tunnel)
#   deploy/preview/preview.sh down      # stop and remove both containers
#   deploy/preview/preview.sh status    # containers + a request through the public URL
#   deploy/preview/preview.sh destroy   # down, then delete the DNS record and tunnel
#
# Settings live in deploy/preview/.local/preview.env (gitignored):
#   PUBLIC_HOST=ksl.example.com
#   DEFAULT_BG=hot                                   # optional, see web/src/components/BgPicker.tsx
#   CF_API_TOKEN_FILE=~/.secrets/cloudflare-token    # Account: Cloudflare Tunnel Edit; Zone: DNS Edit
#   CF_ACCOUNT_ID_FILE=~/.secrets/cloudflare-account-id
#   CLUSTERS="name1=/path/to/kubeconfig1 name2=/path/to/kubeconfig2"
#
# The server runs with --read-only (no cluster add/edit/remove; config redacted
# from the API). Anyone with the URL can see pod names, describe output and
# logs while it is up, so run `down` when you're done.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
LOCAL="$HERE/.local"
ENV_FILE="$LOCAL/preview.env"
TUNNEL_NAME=ksl-preview
mkdir -p "$LOCAL"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (see the header of this script)" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
HOST=${PUBLIC_HOST:?set PUBLIC_HOST in $ENV_FILE}
expand() { echo "${1/#\~/$HOME}"; }
# Docker Desktop on Windows wants C:/… paths; elsewhere this is a no-op.
hostpath() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }
compose() {
  TUNNEL_TOKEN=$(cat "$LOCAL/tunnel-token" 2>/dev/null || true) PUBLIC_URL="https://$HOST" DEFAULT_BG=${DEFAULT_BG:-hot} \
    docker compose -f "$HERE/docker-compose.yml" -f "$LOCAL/compose.override.yml" "$@"
}

cf() {
  local T A
  T=$(cat "$(expand "${CF_API_TOKEN_FILE:?}")"); A=$(cat "$(expand "${CF_ACCOUNT_ID_FILE:?}")")
  local path=${1//\{account\}/$A}; shift
  curl -sS "https://api.cloudflare.com/client/v4$path" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' "$@"
}
ok() { jq -e '.success' >/dev/null <<<"$1" || { jq -c '.errors' <<<"$1" >&2; exit 1; }; }
zone_id() { local r; r=$(cf "/zones?name=${HOST#*.}"); ok "$r"; jq -r '.result[0].id' <<<"$r"; }
tunnel_id() { local r; r=$(cf "/accounts/{account}/cfd_tunnel?is_deleted=false&name=$TUNNEL_NAME"); ok "$r"; jq -r '.result[0].id // empty' <<<"$r"; }

setup() {
  local TUN r Z REC body
  TUN=$(tunnel_id)
  if [ -z "$TUN" ]; then
    r=$(cf "/accounts/{account}/cfd_tunnel" -X POST -d "{\"name\":\"$TUNNEL_NAME\",\"config_src\":\"cloudflare\"}"); ok "$r"
    TUN=$(jq -r '.result.id' <<<"$r"); echo "created tunnel $TUNNEL_NAME"
  else echo "tunnel $TUNNEL_NAME exists"; fi

  # The app container is reachable by name on the compose network.
  r=$(cf "/accounts/{account}/cfd_tunnel/$TUN/configurations" -X PUT -d "$(jq -n --arg h "$HOST" '{config:{ingress:[
    {hostname:$h, service:"http://ksl-preview:8080"},
    {service:"http_status:404"}]}}')"); ok "$r"; echo "ingress: $HOST -> ksl-preview:8080"

  Z=$(zone_id)
  r=$(cf "/zones/$Z/dns_records?type=CNAME&name=$HOST"); ok "$r"; REC=$(jq -r '.result[0].id // empty' <<<"$r")
  body=$(jq -n --arg n "$HOST" --arg c "$TUN.cfargotunnel.com" '{type:"CNAME",name:$n,content:$c,proxied:true,ttl:1,comment:"kubestoplight read-only preview"}')
  if [ -z "$REC" ]; then r=$(cf "/zones/$Z/dns_records" -X POST -d "$body"); else r=$(cf "/zones/$Z/dns_records/$REC" -X PUT -d "$body"); fi
  ok "$r"; echo "dns: $HOST"

  r=$(cf "/accounts/{account}/cfd_tunnel/$TUN/token"); ok "$r"
  (umask 077; jq -r '.result' <<<"$r" > "$LOCAL/tunnel-token")
  echo "tunnel token written to $LOCAL/tunnel-token (not printed)"
}

write_mounts() {
  # config.yaml points each cluster at its kubeconfig's path inside the container.
  local cfg="$LOCAL/config.yaml" ovr="$LOCAL/compose.override.yml" pair name path
  printf 'polling_interval: 3s\nclusters:\n' > "$cfg"
  printf 'services:\n  app:\n    volumes:\n      - %s:/config/config.yaml:ro\n' "$(hostpath "$cfg")" > "$ovr"
  for pair in ${CLUSTERS:?set CLUSTERS in $ENV_FILE}; do
    name=${pair%%=*}; path=$(expand "${pair#*=}")
    [ -f "$path" ] || { echo "kubeconfig for $name not found: $path" >&2; exit 1; }
    printf '  - name: %s\n    auth: kubeconfig\n    kubeconfig:\n      path: /kube/%s\n    enabled: true\n' "$name" "$name" >> "$cfg"
    printf '      - %s:/kube/%s:ro\n' "$(hostpath "$path")" "$name" >> "$ovr"
  done
}

case "${1:-}" in
  setup) setup ;;
  up)
    [ -s "$LOCAL/tunnel-token" ] || { echo "run: $0 setup" >&2; exit 1; }
    write_mounts
    compose up -d --build
    echo "up: https://$HOST  (local: http://127.0.0.1:8088)   stop with: $0 down"
    ;;
  down) [ -f "$LOCAL/compose.override.yml" ] || write_mounts; compose down ;;
  status)
    [ -f "$LOCAL/compose.override.yml" ] || write_mounts
    compose ps
    printf 'https://%s/api/info -> ' "$HOST"; curl -sS -m 10 "https://$HOST/api/info" || true; echo
    ;;
  destroy)
    "$0" down || true
    TUN=$(tunnel_id); Z=$(zone_id)
    r=$(cf "/zones/$Z/dns_records?type=CNAME&name=$HOST"); REC=$(jq -r '.result[0].id // empty' <<<"$r")
    [ -n "$REC" ] && { ok "$(cf "/zones/$Z/dns_records/$REC" -X DELETE)"; echo "dns removed: $HOST"; }
    [ -n "$TUN" ] && { ok "$(cf "/accounts/{account}/cfd_tunnel/$TUN" -X DELETE)"; echo "tunnel removed: $TUNNEL_NAME"; }
    rm -f "$LOCAL/tunnel-token"
    ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
