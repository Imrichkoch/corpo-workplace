import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid
from html import escape
from pathlib import Path

from .i18n import current, t


def message_for(link, base, raw, sender):
    action = {
        "signup": ("Potvrďte firemný účet", "Dokončite registráciu pracoviska"),
        "invite": ("Pozvánka do Corpo Workplace", "Prijmite pozvánku do pracoviska"),
        "reset": ("Obnovenie hesla v Corpo", "Nastavte si nové heslo"),
    }
    subject, heading = action[link["kind"]]
    company = link["company"]
    opening = t(heading) + (f" {company}." if company else ".")
    msg = EmailMessage()
    msg["Subject"] = t(subject)
    msg["From"] = sender
    msg["To"] = link["email"]
    msg["Message-ID"] = make_msgid()
    query = "?lang=en" if current.get() == "en" else ""
    url = f"{base}/{query}#link={raw}"
    note = t("Odkaz je jednorazový a časovo obmedzený. Ak ste túto správu neočakávali, môžete ju ignorovať.")
    msg.set_content(f"{opening}\n\n{url}\n\n{note}")
    msg.add_alternative(f'<p>{escape(opening)}</p><p><a href="{escape(url, quote=True)}">{escape(t("Otvoriť Corpo Workplace"))}</a></p><p>{escape(note)}</p>', subtype="html")
    return msg


def deliver(message, config):
    outbox = config.get("outbox")
    if outbox:
        from .core import identifier
        Path(outbox).mkdir(parents=True, exist_ok=True)
        (Path(outbox) / (identifier() + ".eml")).write_bytes(message.as_bytes())
        return
    tls = ssl.create_default_context()
    with smtplib.SMTP_SSL(config["smtp_host"], config["smtp_port"], context=tls, timeout=9) as smtp:
        smtp.login(config["smtp_user"], config["smtp_password"])
        smtp.send_message(message)


def settings():
    database = os.getenv("CORPO_DB", "work/corpo-tenants.sqlite3")
    return {
        "db": database,
        "base": os.getenv("CORPO_PUBLIC_URL", "http://127.0.0.1:8770/corpo/app").rstrip("/"),
        "outbox": os.getenv("CORPO_MAIL_OUTBOX"),
        "sender": os.getenv("CORPO_SMTP_FROM", "Corpo Workplace <corpo-notify@raizenko.cloud>"),
        "smtp_host": os.getenv("CORPO_SMTP_HOST", "mail.raizenko.cloud"),
        "smtp_port": int(os.getenv("CORPO_SMTP_PORT", "465")),
        "smtp_user": os.getenv("CORPO_SMTP_USER", ""),
        "smtp_password": os.getenv("CORPO_SMTP_PASSWORD", ""),
        "proxy": os.getenv("CORPO_TRUST_PROXY") == "1",
    }
