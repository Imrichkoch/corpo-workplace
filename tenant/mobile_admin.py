from .core import SECRET, digest, fail, first, now, ref, token, transaction

TICKET_AGE = 60
BROWSER_AGE = 3600


def permission(db, parent_hash, tenant_id, timestamp):
    return first(db, """SELECT s.expires FROM sessions s JOIN members m ON m.user=s.user
                        LEFT JOIN session_tenant x ON s.hash=x.session
                        WHERE s.hash=? AND s.expires>? AND m.tenant=? AND (x.tenant IS NULL OR x.tenant=m.tenant) AND m.role IN ('owner','admin')""",
                 parent_hash, timestamp, tenant_id)


def issue_ticket(db, user, data):
    tenant_id = ref(data, "tenant")
    raw = token()
    timestamp = now()
    with transaction(db):
        parent = permission(db, user["hash"], tenant_id, timestamp)
        if not parent:
            fail("Správu tejto firmy môže otvoriť iba správca.", 403)
        db.execute("DELETE FROM mobile_admin_access WHERE expires<=?", (timestamp,))
        db.execute("DELETE FROM mobile_admin_access WHERE parent=? AND kind='ticket'", (user["hash"],))
        db.execute("INSERT INTO mobile_admin_access VALUES(?,?,?,'ticket',?)",
                   (digest(raw), user["hash"], tenant_id, min(parent["expires"], timestamp + TICKET_AGE)))
    return {"ticket": raw}


def redeem(db, raw):
    if not isinstance(raw, str) or not SECRET.fullmatch(raw):
        fail("Otvorte správu znova z mobilnej aplikácie.", 401)
    fingerprint, timestamp = digest(raw), now()
    with transaction(db):
        grant = first(db, """SELECT parent,tenant FROM mobile_admin_access
                             WHERE hash=? AND kind='ticket' AND expires>?""", fingerprint, timestamp)
        if not grant:
            fail("Odkaz vypršal. Otvorte správu znova z mobilnej aplikácie.", 401)
        parent = permission(db, grant["parent"], grant["tenant"], timestamp)
        if not parent:
            fail("Prístup k správe tejto firmy už nie je dostupný.", 403)
        db.execute("DELETE FROM mobile_admin_access WHERE hash=?", (fingerprint,))
        db.execute("DELETE FROM mobile_admin_access WHERE parent=? AND kind='browser'", (grant["parent"],))
        browser_token = token()
        expiry = min(parent["expires"], timestamp + BROWSER_AGE)
        db.execute("INSERT INTO mobile_admin_access VALUES(?,?,?,'browser',?)",
                   (digest(browser_token), grant["parent"], grant["tenant"], expiry))
    return {"token": browser_token, "tenant": grant["tenant"], "age": expiry - timestamp}


def browser_user(db, fingerprint, timestamp):
    return first(db, """SELECT u.id,u.name,u.email,a.hash,a.parent AS parent_session,a.tenant AS admin_tenant FROM mobile_admin_access a
                        JOIN sessions s ON s.hash=a.parent JOIN users u ON u.id=s.user
                        JOIN members m ON m.user=s.user AND m.tenant=a.tenant
                        WHERE a.hash=? AND a.kind='browser' AND a.expires>? AND s.expires>?
                        AND m.role IN ('owner','admin')""", fingerprint, timestamp, timestamp)
