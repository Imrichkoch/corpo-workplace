import logging
import smtplib
from http.cookies import CookieError, SimpleCookie

from . import mail, mobile_admin
from .core import (
    DUMMY_HASH, SECRET, SESSION_AGE, Problem, digest, email, fail, first, identifier,
    matches, now, password, password_hash, rate, rows, text, token, transaction,
)

LOG = logging.getLogger("corpo.mail")
COOKIE = "corpo_session"
LINK_AGE = {"signup": 86400, "invite": 7 * 86400, "reset": 3600}


def list_tenants(db, user):
    return rows(db, """SELECT t.id,t.name,m.role FROM members m
                       JOIN tenants t ON t.id=m.tenant WHERE m.user=? ORDER BY t.name,t.id""", user)


def session(db, environ):
    authorization = environ.get("HTTP_AUTHORIZATION", "")
    bearer = authorization.startswith("Bearer ")
    if bearer:
        raw = authorization[7:]
    else:
        try:
            value = SimpleCookie(environ.get("HTTP_COOKIE", "")).get(COOKIE)
        except CookieError:
            value = None
        raw = value.value if value else ""
    if not SECRET.fullmatch(raw):
        return None
    fingerprint, timestamp = digest(raw), now()
    user = first(db, """SELECT u.id,u.name,u.email,s.hash,x.tenant AS sso_tenant FROM users u JOIN sessions s ON s.user=u.id
                        LEFT JOIN session_tenant x ON s.hash=x.session
                        WHERE s.hash=? AND s.expires>?""", fingerprint, timestamp)
    return user or (None if bearer else mobile_admin.browser_user(db, fingerprint, timestamp))


def profile(user):
    return {field: user[field] for field in ("id", "name", "email")}


def account(db, user):
    tenants = list_tenants(db, user["id"])
    scope = user.get("admin_tenant") or user.get("sso_tenant")
    if scope:
        tenants = [tenant for tenant in tenants if tenant["id"] == scope]
    return {"user": profile(user), "tenants": tenants}


def cookie(raw, base, age=SESSION_AGE):
    flags = "; Secure" if base.startswith("https:") else ""
    return f"{COOKIE}={raw}; Path=/corpo/app/; HttpOnly; SameSite=Lax; Max-Age={age}{flags}"


def issue(db, user, data, config, tenant=None):
    raw = token()
    db.execute("INSERT INTO sessions VALUES(?,?,?)", (digest(raw), user["id"], now() + SESSION_AGE))
    if tenant:
        db.execute("INSERT INTO session_tenant VALUES(?,?)", (digest(raw), tenant))
    payload = account(db, {**user, "sso_tenant": tenant})
    if data.get("client") == "native":
        payload["token"] = raw
        return payload, []
    return payload, [("Set-Cookie", cookie(raw, config["base"]))]


def login(db, data, config, ip):
    rate(db, f"login:ip:{ip}", 35)
    addr = email(data)
    rate(db, f"login:email:{addr}", 12)
    value = password(data)
    user = first(db, "SELECT * FROM users WHERE email=?", addr)
    if not matches(value, user["password"] if user else DUMMY_HASH) or not user:
        fail("E-mail alebo heslo je nesprávne.", 401)
    return issue(db, user, data, config)


def create_link(db, kind, addr, name="", company="", tenant=None, sender=None, role=None, team=None):
    raw = token()
    link_id = identifier()
    timestamp = now()
    with transaction(db):
        if kind == "invite" and first(db, """SELECT 1 FROM members m JOIN users u ON u.id=m.user
                                             WHERE m.tenant=? AND u.email=?""", tenant, addr):
            fail("Používateľ už je členom pracoviska.", 409)
        db.execute("""UPDATE links SET revoked=? WHERE kind=? AND email=? AND tenant IS ?
                      AND used IS NULL AND revoked IS NULL""", (timestamp, kind, addr, tenant))
        db.execute("""INSERT INTO links(id,hash,kind,email,name,company,tenant,sender,role,team,created,expires)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                   (link_id, digest(raw), kind, addr, name, company, tenant, sender, role, team, timestamp, timestamp + LINK_AGE[kind]))
    return {"id": link_id, "kind": kind, "email": addr, "company": company}, raw


def send_link(db, link, raw, config):
    try:
        mail.deliver(mail.message_for(link, config["base"], raw, config["sender"]), config)
    except (OSError, smtplib.SMTPException, ValueError) as error:
        LOG.warning("Mail transport failed (%s).", type(error).__name__)
        delivery = "failed"
    else:
        delivery = "sent"
    db.execute("UPDATE links SET delivery=? WHERE id=?", (delivery, link["id"]))
    return delivery


def request_signup(db, data, config, ip):
    rate(db, f"signup:ip:{ip}", 8, 3600)
    addr = email(data)
    rate(db, f"signup:email:{addr}", 3, 3600)
    name = text(data, "name")
    company = text(data, "company")
    link, raw = create_link(db, "signup", addr, name, company)
    if send_link(db, link, raw, config) != "sent":
        fail("Overovací e-mail sa nepodarilo odoslať. Skúste to znova.", 503)
    return {"message": "Skontrolujte e-mail a dokončite vytvorenie firmy."}


def request_reset(db, data, config, ip):
    rate(db, f"reset:ip:{ip}", 12, 3600)
    addr = email(data)
    rate(db, f"reset:email:{addr}", 3, 3600)
    if first(db, "SELECT id FROM users WHERE email=?", addr):
        link, raw = create_link(db, "reset", addr)
        send_link(db, link, raw, config)
    return {"message": "Ak účet existuje, e-mail s odkazom je na ceste."}


def valid_link(db, raw):
    if not isinstance(raw, str) or not SECRET.fullmatch(raw):
        fail("Odkaz je neplatný.", 404)
    link = first(db, """SELECT * FROM links WHERE hash=? AND expires>? AND used IS NULL
                        AND revoked IS NULL""", digest(raw), now())
    if not link:
        fail("Odkaz vypršal alebo už bol použitý.", 404)
    return link


def link_info(db, data, ip):
    rate(db, f"link:ip:{ip}", 60)
    link = valid_link(db, data.get("token"))
    return {
        **{field: link[field] for field in ("kind", "email", "name", "company")},
        "existing": bool(first(db, "SELECT id FROM users WHERE email=?", link["email"])),
    }


def new_tenant(db, user_id, name):
    tenant = identifier()
    db.execute("INSERT INTO tenants VALUES(?,?,?)", (tenant, name, now()))
    db.execute("INSERT INTO members VALUES(?,?,'owner')", (tenant, user_id))
    return tenant


def accept_link(db, data, config, ip):
    rate(db, f"accept:ip:{ip}", 25)
    link = valid_link(db, data.get("token"))
    rate(db, f"accept:{link['id']}", 12)
    user = first(db, "SELECT * FROM users WHERE email=?", link["email"])
    reset = link["kind"] == "reset"
    value = password(data, creating=reset or not user)
    new_hash = None
    if reset or not user:
        new_hash = password_hash(value)
    elif not matches(value, user["password"]):
        fail("Heslo je nesprávne.", 401)

    with transaction(db):
        link = valid_link(db, data.get("token"))
        current = first(db, "SELECT * FROM users WHERE email=?", link["email"])
        if (current or {}).get("password") != (user or {}).get("password"):
            fail("Účet sa medzitým zmenil. Otvorte odkaz znova.", 409)
        if reset:
            if not current:
                fail("Účet sa nenašiel.", 404)
            db.execute("UPDATE users SET password=? WHERE id=?", (new_hash, user["id"]))
            db.execute("DELETE FROM sessions WHERE user=?", (user["id"],))
        elif not current:
            name = link["name"] or text(data, "name")
            user = {"id": identifier(), "email": link["email"], "name": name}
            db.execute("INSERT INTO users VALUES(?,?,?,?)", (user["id"], user["email"], name, new_hash))
        if link["kind"] == "signup":
            new_tenant(db, user["id"], link["company"])
        if link["kind"] == "invite":
            db.execute("INSERT INTO members VALUES(?,?,?) ON CONFLICT DO NOTHING",
                       (link["tenant"], user["id"], link["role"]))
            if link["team"]:
                db.execute("INSERT INTO team_members VALUES(?,?,?) ON CONFLICT DO NOTHING",
                           (link["tenant"], link["team"], user["id"]))
        db.execute("UPDATE links SET used=? WHERE id=?", (now(), link["id"]))
        return issue(db, user, data, config)
