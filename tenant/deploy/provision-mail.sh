#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

account=corpo-notify@raizenko.cloud
config=/etc/corpo-workplace.env
if [[ ! -s "$config" ]]; then
  mailboxes=$(docker exec mailu-admin-1 flask mailu config-export user.email)
  if grep -Fq "$account" <<< "$mailboxes"; then
    printf '%s\n' 'The Corpo mailbox already exists. Configure its SMTP credentials in /etc/corpo-workplace.env.' >&2
    exit 1
  fi
  password=$(openssl rand -hex 32)
  password_hash=$(printf '%s\n' "$password" | openssl passwd -6 -stdin)
  target=$(mktemp /etc/.corpo-workplace.XXXXXXXX)
  trap 'rm -f -- "$target"' EXIT
  printf '%s\n' \
    'CORPO_PUBLIC_URL=https://raizenko.cloud/corpo/app' \
    'CORPO_DB=/var/lib/corpo-workplace/workplace.sqlite3' \
    'CORPO_PORT=8770' \
    'CORPO_TRUST_PROXY=1' \
    'CORPO_SMTP_HOST=mail.raizenko.cloud' \
    'CORPO_SMTP_PORT=465' \
    "CORPO_SMTP_USER=$account" \
    "CORPO_SMTP_PASSWORD=$password" \
    "CORPO_SMTP_FROM='Corpo Workplace <$account>'" > "$target"
  docker exec mailu-admin-1 flask mailu user-import corpo-notify raizenko.cloud "$password_hash" >/dev/null
  mv -T "$target" "$config"
  trap - EXIT
fi
printf '%s\n' 'Corpo mail configuration ready.'
