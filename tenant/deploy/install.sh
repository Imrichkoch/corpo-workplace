#!/usr/bin/env bash
set -euo pipefail

bundle=${1:?Provide the release archive}
version=${2:?Provide the release name}
[[ "$version" =~ ^[A-Za-z0-9_-]+$ ]] || exit 2
base=/opt/corpo-workplace
release="$base/releases/$version"
install -d -m 0755 "$base/releases"
stage=$(mktemp -d "$base/.stage.XXXXXXXX")
cfg=/etc/corpo-workplace.env
site=/etc/nginx/sites-available/raizenko.cloud
snippet=/etc/nginx/snippets/corpo-workplace.conf
service=/etc/systemd/system/corpo-workplace.service
landing=/var/www/html/corpo/index.html
previous=$(readlink "$base/current" || true)
linked=0
site_changed=0
systemd_changed=0

cleanup() {
  rc=$?
  if (( rc != 0 )); then
    if (( site_changed )); then
      install -m 0644 "$stage/site.before" "$site"
      nginx -t && systemctl reload nginx || true
    fi
    if (( linked )); then
      if [[ -n "$previous" ]]; then
        ln -sfn "$previous" "$base/current"
        systemctl restart corpo-workplace.service || true
      else
        if (( systemd_changed )); then systemctl disable --now corpo-workplace.service || true; fi
        unlink "$base/current"
      fi
    fi
  fi
  rm -rf -- "$stage"
  exit "$rc"
}
trap cleanup EXIT

[[ ! -e "$release" ]]
[[ -s "$cfg" ]]
tar -xzf "$bundle" -C "$stage" --no-same-owner --no-same-permissions
test -f "$stage/tenant/server.py"
test -s "$stage/tenant/web/icon-192.png"
test -s "$stage/landing/index.html"
mkdir -p "$stage/deps"
for wheel in "$stage"/wheels/*.whl; do /usr/bin/python3 -m zipfile -e "$wheel" "$stage/deps"; done
chmod -R a+rX "$stage/tenant" "$stage/deps"
mkdir -p "$release"
mv "$stage/tenant" "$stage/deps" "$release/"
ln -s "$release" "$base/.next"
mv -Tf "$base/.next" "$base/current"
linked=1

install -m 0644 "$release/tenant/deploy/corpo-workplace.service" "$service"
systemd_changed=1
systemd-analyze verify "$service"
systemctl daemon-reload
systemctl enable corpo-workplace.service >/dev/null
systemctl restart corpo-workplace.service
for _ in {1..15}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:8770/corpo/app/ >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent --show-error --max-time 4 http://127.0.0.1:8770/corpo/app/ >/dev/null

install -m 0644 "$release/tenant/deploy/nginx.conf" "$snippet"
if ! grep -Fq "include $snippet;" "$site"; then
  cp -p "$site" "$stage/site.before"
  site_changed=1
  python3 - "$site" "$snippet" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
content = path.read_text(encoding="utf-8")
needle = "    listen 443 ssl; # managed by Certbot"
assert content.count(needle) == 1
path.write_text(content.replace(needle, f"    include {sys.argv[2]};\n" + needle), encoding="utf-8")
PY
fi
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --max-time 6 https://raizenko.cloud/corpo/app/ >/dev/null
install -m 0644 "$stage/landing/index.html" "$landing.next"
mv -Tf "$landing.next" "$landing"
printf 'Corpo Workplace active (%s).\n' "$version"
