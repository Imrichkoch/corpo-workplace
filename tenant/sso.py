import json
import sqlite3
from http.cookies import CookieError, SimpleCookie
from urllib.parse import urlencode

import msal
import requests

from . import auth, security
from .core import DUMMY_HASH, SECRET, digest, fail, first, matches, now, password, rate, ref, token, transaction
from .i18n import current

AGE = 300
SCOPES = ["https://graph.microsoft.com/User.Read"]
ERROR = "Prihlásenie Microsoft Entra sa nepodarilo dokončiť."
UNLINKED = "Najprv prepojte svoj účet Microsoft Entra v zabezpečení firemného pracoviska."
REDIRECT = "/auth/entra/callback"
COOKIE = "corpo_entra"


def flow_cookie(state, base, age=AGE):
    flags = "; Secure" if base.startswith("https:") else ""
    return ("Set-Cookie", f"{COOKIE}={state}; Path=/corpo/app/auth/entra/callback; HttpOnly; SameSite=Lax; Max-Age={age}{flags}")


def browser_flow(environ, state):
    try:
        cookie = SimpleCookie(environ.get("HTTP_COOKIE", "")).get(COOKIE)
        return cookie and cookie.value == state
    except CookieError:
        return False


def msal_client(policy):
    return msal.ConfidentialClientApplication(
        policy["client_id"], client_credential=security.decrypt(policy["secret"]),
        authority="https://login.microsoftonline.com/" + policy["entra_tenant"],
        instance_discovery=False, timeout=6,
    )


def start(db, data, config, ip, user=None, tenant=None):
    rate(db, f"sso:start:{ip}", 20)
    tid = tenant["id"] if tenant else ref(data, "tenant")
    policy = security.settings(db, tid)
    if not policy["sso"]:
        fail("Microsoft Entra SSO nie je pre túto firmu zapnuté.", 404)
    if user:
        rate(db, f"sso:link:{user['id']}", 8)
        record = first(db, "SELECT password FROM users WHERE id=?", user["id"])
        if not matches(password(data), record["password"] if record else DUMMY_HASH):
            fail("E-mail alebo heslo je nesprávne.", 422)
    try:
        flow = msal_client(policy).initiate_auth_code_flow(
            SCOPES, redirect_uri=config["base"] + REDIRECT, state=token(),
            prompt="select_account",
        )
    except (ValueError, requests.RequestException):
        fail(ERROR, 502)
    if not flow.get("auth_uri") or not flow.get("state"):
        fail(ERROR, 502)
    poll = token() if not user and data.get("client") == "native" else None
    with transaction(db):
        db.execute("DELETE FROM entra_flow WHERE expires<=?", (now(),))
        db.execute("""INSERT INTO entra_flow(hash,tenant,session,payload,revision,expires,native_poll)
                      VALUES(?,?,?,?,?,?,?)""",
                   (digest(flow["state"]), tid, security.session_key(user) if user else None,
                    security.encrypt(json.dumps({"flow": flow, "language": current.get()})), policy["revision"],
                    now() + AGE, digest(poll) if poll else None))
    result = {"url": flow["auth_uri"] + "&" + urlencode({"ui_locales": current.get()}), **({"poll": poll} if poll else {})}
    return result, ([] if poll else [flow_cookie(flow["state"], config["base"])])


def graph_identity(access_token):
    response = requests.get("https://graph.microsoft.com/v1.0/me",
                            params={"$select": "id,onPremisesSyncEnabled"},
                            headers={"Authorization": "Bearer " + access_token}, timeout=6, allow_redirects=False)
    if response.status_code != 200:
        fail(ERROR, 502)
    return response.json()


def microsoft_identity(policy, flow, query):
    try:
        result = msal_client(policy).acquire_token_by_auth_code_flow(flow, query, scopes=SCOPES)
        claims = result.get("id_token_claims", {})
        directory = policy["entra_tenant"]
        expected = f"https://login.microsoftonline.com/{directory}/v2.0"
        if not result.get("access_token") or claims.get("iss") != expected or claims.get("tid") != directory or claims.get("aud") != policy["client_id"]:
            fail(ERROR, 401)
        object_id = security.uuid(claims.get("oid"))
        profile = graph_identity(result["access_token"])
        if profile.get("id") != object_id:
            fail(ERROR, 401)
    except (ValueError, requests.RequestException):
        fail(ERROR, 502)
    if profile.get("onPremisesSyncEnabled") is True and not policy["directory"]:
        fail("Firma musí povoliť prihlásenie účtov synchronizovaných z Active Directory.", 403)
    return object_id


def callback(db, query, config, environ):
    state = query.get("state", "")
    if not isinstance(state, str) or not SECRET.fullmatch(state):
        fail(ERROR, 401)
    fingerprint = digest(state)
    with transaction(db):
        row = first(db, "SELECT * FROM entra_flow WHERE hash=? AND expires>? AND payload!=''", fingerprint, now())
        if not row or (not row["native_poll"] and not browser_flow(environ, state)):
            fail(ERROR, 401)
        db.execute("UPDATE entra_flow SET payload='' WHERE hash=?", (fingerprint,))
    try:
        return finish_callback(db, row, fingerprint, query, config, environ)
    except Exception:
        if row["native_poll"]:
            db.execute("DELETE FROM entra_flow WHERE hash=?", (fingerprint,))
        raise


def finish_callback(db, row, fingerprint, query, config, environ):
    saved = json.loads(security.decrypt(row["payload"]))
    current.set(saved["language"])
    tid = row["tenant"]
    policy = security.settings(db, tid)
    if not policy["sso"] or policy["revision"] != row["revision"] or "code" not in query:
        fail(ERROR, 401)
    if row["session"]:
        local = auth.session(db, environ)
        if not local or security.session_key(local) != row["session"]:
            fail(ERROR, 401)
        security.require_mfa(db, tid, local)
    object_id = microsoft_identity(policy, saved["flow"], query)
    directory = policy["entra_tenant"]
    with transaction(db):
        policy = security.settings(db, tid)
        if not policy["sso"] or policy["revision"] != row["revision"]:
            fail(ERROR, 401)
        if row["session"]:
            local = auth.session(db, environ)
            if not local or security.session_key(local) != row["session"] or not first(
                db, "SELECT 1 FROM members WHERE tenant=? AND user=?", tid, local["id"]
            ):
                fail(ERROR, 401)
            security.require_mfa(db, tid, local)
            try:
                db.execute("""INSERT INTO entra_identity VALUES(?,?,?,?)
                              ON CONFLICT(tenant,user) DO NOTHING""", (tid, local["id"], directory, object_id))
            except sqlite3.IntegrityError:
                fail("Tento Microsoft účet je už prepojený s iným členom.", 409)
            link = first(db, "SELECT object_id FROM entra_identity WHERE tenant=? AND user=? AND directory=?",
                         tid, local["id"], directory)
            if not link or link["object_id"] != object_id:
                fail("Tento účet Corpo už má pripojený Microsoft účet.", 409)
            return "linked", tid, []
        user = first(db, """SELECT u.id,u.name,u.email FROM entra_identity i JOIN users u ON u.id=i.user
                            JOIN members m ON m.tenant=i.tenant AND m.user=i.user
                            WHERE i.tenant=? AND i.directory=? AND i.object_id=?""", tid, directory, object_id)
        if not user:
            fail(UNLINKED, 403)
        if row["native_poll"]:
            updated = db.execute("UPDATE entra_flow SET verified_user=? WHERE hash=? AND expires>?",
                                 (user["id"], fingerprint, now()))
            if not updated.rowcount:
                fail(ERROR, 401)
            return "native", tid, []
        _, additional = auth.issue(db, user, {}, config, tenant=tid)
    return "login", tid, additional


def native_complete(db, data, config):
    raw = data.get("poll")
    if not isinstance(raw, str) or not SECRET.fullmatch(raw):
        fail(ERROR, 401)
    fingerprint = digest(raw)
    with transaction(db):
        flow = first(db, "SELECT * FROM entra_flow WHERE native_poll=? AND expires>?", fingerprint, now())
        if not flow:
            fail(ERROR, 401)
        tid = flow["tenant"]
        policy = security.settings(db, tid)
        if not policy["sso"] or policy["revision"] != flow["revision"]:
            fail(ERROR, 401)
        if not flow["verified_user"]:
            return {"pending": True}, []
        user = first(db, """SELECT u.id,u.name,u.email FROM users u JOIN members m ON m.user=u.id
                            WHERE m.tenant=? AND u.id=?""", tid, flow["verified_user"])
        if not user:
            fail(ERROR, 401)
        db.execute("DELETE FROM entra_flow WHERE hash=?", (flow["hash"],))
        result, extra = auth.issue(db, user, {"client": "native"}, config, tenant=tid)
        return {**result, "selectedTenant": tid}, extra
