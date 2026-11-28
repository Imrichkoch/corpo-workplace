import json
import logging
import mimetypes
import os
import re
from contextlib import closing
from html import escape
from http import HTTPStatus
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from . import auth, i18n, mail, mobile_admin, security, sso, workplace
from .core import IDENTIFIER, ROOT, Problem, connect, day, fail, first, initialise, object_body, rate, ref, text, today, transaction

STATIC = ROOT / "web"
STATIC_FILES = {
    "": "index.html", "app.js": "app.js", "ui.js": "ui.js", "admin.js": "admin.js",
    "security.js": "security.js", "i18n.js": "i18n.js", "en.json": "en.json", "styles.css": "styles.css", "manifest.webmanifest": "manifest.webmanifest", "sw.js": "sw.js",
    "icon-192.png": "icon-192.png", "icon-512.png": "icon-512.png", "favicon.svg": "favicon.svg",
}
LOG = logging.getLogger("corpo")
PREFIX = "/corpo/app/"


def headers(content_type, cache="private, no-store"):
    return [("Content-Type", content_type), ("Cache-Control", cache), ("X-Content-Type-Options", "nosniff"),
            ("Referrer-Policy", "no-referrer"), ("X-Frame-Options", "DENY"),
            ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
            ("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; "
             "script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")]


def reply(status, payload, extra=()):
    if isinstance(payload.get("message"), str):
        payload = {**payload, "message": i18n.t(payload["message"])}
    return status, json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(), [*headers("application/json; charset=utf-8"), *extra]


def identify(db, environ):
    user = auth.session(db, environ)
    if not user:
        fail("Prihláste sa do Corpo Workplace.", 401)
    return user


def api(db, endpoint, method, environ, config):
    ip = environ.get("HTTP_X_REAL_IP", environ.get("REMOTE_ADDR", "")) if config["proxy"] else environ.get("REMOTE_ADDR", "")
    data = {}
    if method == "POST":
        origin = environ.get("HTTP_ORIGIN")
        base = urlsplit(config["base"])
        if origin and origin != f"{base.scheme}://{base.netloc}":
            fail("Požiadavka pochádza z nepovolenej adresy.", 403)
        data = object_body(environ)
    auth_api = {
        "auth/signup": lambda: (auth.request_signup(db, data, config, ip), []),
        "auth/reset": lambda: (auth.request_reset(db, data, config, ip), []),
        "auth/link": lambda: (auth.link_info(db, data, ip), []),
        "auth/accept": lambda: auth.accept_link(db, data, config, ip),
        "auth/login": lambda: auth.login(db, data, config, ip),
        "auth/entra/start": lambda: sso.start(db, data, config, ip),
        "auth/entra/complete": lambda: sso.native_complete(db, data, config),
    }
    if method == "POST" and endpoint in auth_api:
        result, additional = auth_api[endpoint]()
        return reply(200, result, additional)
    user = identify(db, environ)
    uid = user["id"]
    admin_tenant = user.get("admin_tenant")
    scope = admin_tenant or user.get("sso_tenant")
    if method == "POST" and endpoint == "auth/mobile-admin":
        if admin_tenant or not environ.get("HTTP_AUTHORIZATION", "").startswith("Bearer "):
            fail("Otvorte správu z mobilnej aplikácie.", 401)
        tid = ref(data, "tenant")
        if scope and tid != scope:
            fail("Pracovisko sa nenašlo.", 404)
        workplace.membership(db, tid, uid)
        security.require_mfa(db, tid, user)
        return reply(200, mobile_admin.issue_ticket(db, user, data))
    if method == "POST" and endpoint == "auth/logout":
        table = "mobile_admin_access" if admin_tenant else "sessions"
        db.execute(f"DELETE FROM {table} WHERE hash=?", (user["hash"],))
        return reply(200, {}, [("Set-Cookie", auth.cookie("", config["base"], 0))])
    if method == "GET" and endpoint == "account":
        return reply(200, auth.account(db, user))
    if method == "POST" and endpoint == "account/tenants":
        if scope:
            fail("Toto prihlásenie je určené pre vybranú firmu.", 403)
        rate(db, f"tenant:create:{uid}", 8, 3600)
        with transaction(db):
            new = auth.new_tenant(db, uid, text(data, "company"))
            return reply(201, {"id": new, **auth.account(db, user)})
    parts = endpoint.split("/")
    if len(parts) >= 2 and parts[0] == "tenant" and IDENTIFIER.fullmatch(parts[1]):
        tid = parts[1]
        if scope and tid != scope:
            fail("Pracovisko sa nenašlo.", 404)
        tenant = workplace.membership(db, tid, uid)
        if len(parts) in (3, 4) and parts[2] == "mfa":
            return reply(200, security.mfa(db, tenant, user, method, parts[3] if len(parts) == 4 else "", data, config))
        security.require_mfa(db, tid, user)
        if endpoint.endswith("/security") and len(parts) == 3 and method == "POST":
            return reply(200, security.update(db, tenant, user, data))
        if endpoint.endswith("/entra") and len(parts) == 3 and method == "POST":
            if admin_tenant:
                fail("Prepojenie účtu otvorte v bežnom prehliadači.", 403)
            result, additional = sso.start(db, data, config, ip, user, tenant)
            return reply(200, result, additional)
        if len(parts) == 2 and method == "GET":
            query = parse_qs(environ.get("QUERY_STRING", ""), max_num_fields=12)
            value = query.get("date", [today()])[0]
            payload = workplace.snapshot(db, tenant, uid, day({"date": value}))
            payload["security"] = security.public_settings(db, tenant, user)
            return reply(200, payload)
        if len(parts) == 2 and method == "POST":
            action = text(data, "action", 40)
            payload = data.get("record")
            if not isinstance(payload, dict):
                fail("Chýbajú údaje požiadavky.")
            return reply(200, workplace.dispatch(db, tid, uid, action, payload, config))
        if len(parts) == 4 and parts[2] == "plan" and IDENTIFIER.fullmatch(parts[3]) and method == "GET":
            plan = first(db, """SELECT p.image,p.mime FROM plans p JOIN offices o ON o.tenant=p.tenant AND o.id=p.office
                                WHERE p.tenant=? AND p.id=? AND (? OR o.archived=0)""",
                         tid, parts[3], tenant["role"] != "member")
            if not plan:
                fail("Pôdorys sa nenašiel.", 404)
            return 200, plan["image"], headers(plan["mime"])
    fail("Stránka sa nenašla.", 404)


def mobile_exchange(db, environ, config):
    origin = environ.get("HTTP_ORIGIN")
    base = urlsplit(config["base"])
    expected = f"{base.scheme}://{base.netloc}"
    if (origin and origin not in (expected, "null")) or environ.get("HTTP_SEC_FETCH_SITE") == "cross-site":
        fail("Požiadavka pochádza z nepovolenej adresy.", 403)
    try:
        size = int(environ.get("CONTENT_LENGTH") or 0)
        if not 0 < size <= 128:
            fail("Odkaz je neplatný.", 400)
        values = parse_qs(environ["wsgi.input"].read(size).decode("ascii"), strict_parsing=True, max_num_fields=2)
    except (ValueError, UnicodeError):
        fail("Odkaz je neplatný.", 400)
    browser = mobile_admin.redeem(db, values.get("ticket",[None])[0])
    locale = values.get("lang", [""])[0]
    language = "&lang=" + locale if locale in ("sk", "en") else ""
    location = PREFIX + "?mobileAdmin=1" + language + "#admin"
    return 303, b"", [
        *headers("text/plain; charset=utf-8"),
        ("Location", location),
        ("Set-Cookie", auth.cookie(browser["token"], config["base"], browser["age"])),
    ]


def entra_callback(db, environ, config):
    expired = sso.flow_cookie("", config["base"], 0)
    try:
        args = parse_qs(environ.get("QUERY_STRING", ""), max_num_fields=16)
        status, tenant, additional = sso.callback(db, {k: v[0] for k, v in args.items()}, config, environ)
    except (Problem, ValueError) as error:
        message = error.message if isinstance(error, Problem) else sso.ERROR
        return entra_message(message, expired)
    if status == "native":
        return entra_message("Prihlásenie bolo úspešné. Vráťte sa do aplikácie Corpo.", expired, native=True)
    location = PREFIX + "?" + urlencode({"lang": i18n.current.get(), "tenant": tenant})
    location += "#security" if status == "linked" else "#book"
    return 303, b"", [*headers("text/plain; charset=utf-8"), ("Location", location), expired, *additional]


def entra_message(message, expired, native=False):
    title = escape(i18n.t(message))
    text = escape(i18n.t("Otvoriť aplikáciu Corpo" if native else "Otvoriť Corpo Workplace"))
    href = "corpo-workplace://signin" if native else PREFIX
    body = f'<!doctype html><html lang="{i18n.current.get()}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Corpo Workplace</title><link rel="stylesheet" href="{PREFIX}styles.css"><main class="auth-content"><h1>{title}</h1><a class="btn primary" href="{href}">{text}</a></main></html>'
    return 200, body.encode(), [*headers("text/html; charset=utf-8"), expired]


def create_app(config=None):
    config = config or mail.settings()
    initialise(config["db"])

    def app(environ, start_response):
        language = i18n.current.set(i18n.request_language(environ))
        try:
            path = environ.get("PATH_INFO", "")
            method = environ.get("REQUEST_METHOD", "")
            if path == PREFIX[:-1] and method in ("GET", "HEAD"):
                status, body, response_headers = 308, b"", [("Location", PREFIX)]
            elif not path.startswith(PREFIX):
                fail("Stránka sa nenašla.", 404)
            else:
                target = path[len(PREFIX):]
                if target.startswith("api/") and method in ("GET", "POST"):
                    with closing(connect(config["db"])) as db:
                        status, body, response_headers = api(db, target[4:], method, environ, config)
                elif target == sso.REDIRECT.lstrip("/") and method == "GET":
                    with closing(connect(config["db"])) as db:
                        status, body, response_headers = entra_callback(db, environ, config)
                elif target == "mobile-admin/session" and method == "POST":
                    with closing(connect(config["db"])) as db:
                        status, body, response_headers = mobile_exchange(db, environ, config)
                elif target in STATIC_FILES and method in ("GET", "HEAD"):
                    file = STATIC / STATIC_FILES[target]
                    content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                    if file.suffix == ".js":
                        content_type = "text/javascript"
                    if file.suffix == ".webmanifest":
                        content_type = "application/manifest+json"
                    status, body, response_headers = 200, file.read_bytes(), headers(content_type, "no-cache")
                else:
                    fail("Stránka sa nenašla.", 404)
        except Problem as error:
            status, body, response_headers = reply(error.status, {"message": error.message})
        except (ConnectionError, BrokenPipeError):
            status, body, response_headers = reply(400, {"message": "Požiadavka bola prerušená."})
        except Exception:
            LOG.exception("Unhandled Corpo request")
            status, body, response_headers = reply(500, {"message": "Nastala chyba na serveri."})
        finally:
            i18n.current.reset(language)
        start_response(f"{status} {HTTPStatus(status).phrase}", [*response_headers, ("Content-Length", str(len(body)))])
        return [b"" if environ.get("REQUEST_METHOD") == "HEAD" else body]

    return app


def main():
    from waitress import serve
    from .core import REQUEST_LIMIT

    logging.basicConfig(level=logging.INFO)
    config = mail.settings()
    port = int(os.getenv("CORPO_PORT", "8770"))
    serve(create_app(config), host="127.0.0.1", port=port, threads=8,
          max_request_body_size=REQUEST_LIMIT, channel_timeout=40, clear_untrusted_proxy_headers=True)


if __name__ == "__main__":
    main()
