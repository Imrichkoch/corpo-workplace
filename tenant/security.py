import json
import logging
import os
import re
import secrets
import smtplib
from email.message import EmailMessage
from uuid import UUID

import pyotp
from cryptography.fernet import Fernet

from . import mail
from .core import ADMIN_ROLES, DUMMY_HASH, digest, fail, first, matches, now, password, rate, text, transaction
from .i18n import t

POLICIES = ("sso", "mfa", "directory")
DEFAULTS = {"sso": 0, "mfa": 0, "directory": 0, "entra_tenant": "", "client_id": "", "secret": "", "revision": 0}
LOG = logging.getLogger("corpo.security")


def encryption():
    try:
        return Fernet(os.getenv("CORPO_SECURITY_KEY", "").encode("ascii"))
    except (UnicodeError, ValueError):
        fail("Zabezpečenie firmy zatiaľ nie je nakonfigurované na serveri.", 503)


def encrypt(value):
    return encryption().encrypt(value.encode()).decode()


def decrypt(value):
    return encryption().decrypt(value.encode()).decode()


def settings(db, tenant):
    return first(db, "SELECT * FROM security_settings WHERE tenant=?", tenant) or DEFAULTS.copy()


def public_settings(db, tenant, user):
    policy = settings(db, tenant["id"])
    linked = first(db, "SELECT 1 FROM entra_identity WHERE tenant=? AND user=? AND directory=?",
                   tenant["id"], user["id"], policy["entra_tenant"])
    result = {key: bool(policy[key]) for key in POLICIES}
    result["linked"] = bool(linked)
    if tenant["role"] in ADMIN_ROLES:
        result.update(entraTenant=policy["entra_tenant"], clientId=policy["client_id"], hasSecret=bool(policy["secret"]))
    return result


def uuid(value):
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        fail("Zadajte platné ID adresára a aplikácie Microsoft Entra.")


def update(db, tenant, user, data):
    if tenant["role"] not in ADMIN_ROLES:
        fail("Nastavenia zabezpečenia môžu meniť iba správcovia firmy.", 403)
    rate(db, f"security:update:{user['id']}", 12)
    account = first(db, "SELECT password FROM users WHERE id=?", user["id"])
    if not matches(password(data), account["password"] if account else DUMMY_HASH):
        fail("E-mail alebo heslo je nesprávne.", 422)
    if any(type(data.get(key)) is not bool for key in POLICIES):
        fail("Skontrolujte vyplnené údaje.")
    directory = text(data, "entraTenant", 36, False)
    client = text(data, "clientId", 36, False)
    secret = text(data, "clientSecret", 2048, False)
    if directory or client or data["sso"]:
        directory, client = uuid(directory), uuid(client)
    if data["directory"] and not data["sso"]:
        fail("Active Directory vyžaduje zapnuté Microsoft Entra SSO.")
    if any(data[key] for key in POLICIES) or secret:
        encryption()
    tid = tenant["id"]
    with transaction(db):
        membership = first(db, "SELECT role FROM members WHERE tenant=? AND user=?", tid, user["id"])
        if not membership or membership["role"] not in ADMIN_ROLES:
            fail("Nastavenia zabezpečenia môžu meniť iba správcovia firmy.", 403)
        prior = settings(db, tid)
        same_app = (directory, client) == (prior["entra_tenant"], prior["client_id"])
        encrypted = encrypt(secret) if secret else prior["secret"] if same_app else ""
        if data["sso"] and not encrypted:
            fail("Zadajte tajnú hodnotu aplikácie Microsoft Entra.")
        db.execute("""INSERT INTO security_settings(tenant,sso,mfa,directory,entra_tenant,client_id,secret,revision)
                      VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(tenant) DO UPDATE SET sso=excluded.sso,mfa=excluded.mfa,
                      directory=excluded.directory,entra_tenant=excluded.entra_tenant,client_id=excluded.client_id,
                      secret=excluded.secret,revision=security_settings.revision+1""",
                   (tid, *(int(data[key]) for key in POLICIES), directory, client, encrypted))
        if not data["sso"] or not same_app or bool(prior["directory"]) != data["directory"] or secret:
            db.execute("DELETE FROM sessions WHERE hash IN (SELECT session FROM session_tenant WHERE tenant=?)", (tid,))
        if directory != prior["entra_tenant"]:
            db.execute("DELETE FROM entra_identity WHERE tenant=?", (tid,))
        if bool(prior["mfa"]) != data["mfa"]:
            db.execute("DELETE FROM mfa_verified WHERE tenant=?", (tid,))
        db.execute("INSERT INTO security_audit VALUES(?,?,?,?)",
                   (tid, user["id"], now(), json.dumps({key: data[key] for key in POLICIES})))
    return public_settings(db, tenant, user)


def session_key(user):
    return user.get("parent_session", user["hash"])


def require_mfa(db, tenant, user):
    if settings(db, tenant)["mfa"] and not first(
        db, "SELECT 1 FROM mfa_verified WHERE tenant=? AND session=? AND expires>?",
        tenant, session_key(user), now(),
    ):
        fail("Pre prístup do tejto firmy je potrebné viacfaktorové overenie.", 428)


def status(db, tenant, user):
    return {"required": bool(settings(db, tenant)["mfa"]),
            "enrolled": bool(first(db, "SELECT 1 FROM mfa_credentials WHERE user=?", user["id"]))}


def send_enrollment(db, user, config):
    rate(db, f"mfa:mail:{user['id']}", 4, 900)
    code = f"{secrets.randbelow(10**8):08d}"
    db.execute("""INSERT INTO mfa_setup(session,email_proof,expires) VALUES(?,?,?)
                  ON CONFLICT(session) DO UPDATE SET email_proof=excluded.email_proof,secret=NULL,expires=excluded.expires""",
               (session_key(user), encrypt(code), now() + 600))
    message = EmailMessage()
    message["Subject"] = t("Overenie nastavenia MFA v Corpo")
    message["From"] = config["sender"]
    message["To"] = user["email"]
    message.set_content(t("Kód na nastavenie overovacej aplikácie platí 10 minút.") + f"\n\n{code}\n")
    try:
        mail.deliver(message, config)
    except (OSError, smtplib.SMTPException, ValueError) as error:
        db.execute("DELETE FROM mfa_setup WHERE session=?", (session_key(user),))
        LOG.warning("MFA enrollment email failed (%s).", type(error).__name__)
        fail("Overovací e-mail sa nepodarilo odoslať. Skúste to znova.", 503)
    return {}


def setup(db, user, data):
    rate(db, f"mfa:setup:{user['id']}", 12, 900)
    value = text(data, "code", 8)
    session = session_key(user)
    with transaction(db):
        pending = first(db, "SELECT * FROM mfa_setup WHERE session=? AND expires>?", session, now())
        if not pending or not pending["email_proof"] or not value.isascii() or not secrets.compare_digest(decrypt(pending["email_proof"]), value):
            fail("Overovací kód je neplatný alebo vypršal.", 422)
        secret = pyotp.random_base32()
        db.execute("UPDATE mfa_setup SET email_proof=NULL,secret=?,expires=? WHERE session=?",
                   (encrypt(secret), now() + 600, session))
    return {"secret": secret}


def verify_totp(secret, value, previous):
    if not re.fullmatch(r"[0-9]{6}", value):
        return None
    current = now() // 30
    otp = pyotp.TOTP(decrypt(secret))
    return next((step for step in (current, current - 1, current + 1)
                 if step > previous and secrets.compare_digest(otp.at(step * 30), value)), None)


def verify(db, tenant, user, data):
    uid = user["id"]
    rate(db, f"mfa:check:{uid}", 12, 600)
    value = text(data, "code", 24).replace(" ", "").replace("-", "").upper()
    sid = session_key(user)
    tid = tenant["id"]
    recovery = []
    with transaction(db):
        credentials = first(db, "SELECT * FROM mfa_credentials WHERE user=?", uid)
        if credentials:
            step = verify_totp(credentials["secret"], value, credentials["last_step"])
            if step is not None:
                db.execute("UPDATE mfa_credentials SET last_step=? WHERE user=?", (step, uid))
            elif db.execute("DELETE FROM mfa_recovery WHERE user=? AND code=?", (uid, digest(value))).rowcount != 1:
                fail("Neplatný alebo už použitý overovací kód.", 422)
        else:
            pending = first(db, "SELECT secret FROM mfa_setup WHERE session=? AND expires>?", sid, now())
            if not pending or not pending["secret"]:
                fail("Najprv nastavte overovaciu aplikáciu.", 409)
            step = verify_totp(pending["secret"], value, -1)
            if step is None:
                fail("Neplatný alebo už použitý overovací kód.", 422)
            db.execute("INSERT INTO mfa_credentials VALUES(?,?,?)", (uid, pending["secret"], step))
            db.execute("DELETE FROM mfa_setup WHERE session=?", (sid,))
            recovery = [secrets.token_hex(8).upper() for _ in range(8)]
            db.executemany("INSERT INTO mfa_recovery VALUES(?,?)", ((uid, digest(code)) for code in recovery))
        db.execute("""INSERT INTO mfa_verified VALUES(?,?,?)
                      ON CONFLICT(tenant,session) DO UPDATE SET expires=excluded.expires""",
                   (tid, sid, now() + 12 * 3600))
    return {"recoveryCodes": recovery}


def mfa(db, tenant, user, method, action, data, config):
    if method == "GET" and not action:
        return status(db, tenant["id"], user)
    if method == "POST" and settings(db, tenant["id"])["mfa"]:
        if action in ("email", "setup"):
            if status(db, tenant["id"], user)["enrolled"]:
                fail("Overovacia aplikácia je už nastavená.", 409)
            return send_enrollment(db, user, config) if action == "email" else setup(db, user, data)
        if action == "verify":
            return verify(db, tenant, user, data)
    fail("Stránka sa nenašla.", 404)
