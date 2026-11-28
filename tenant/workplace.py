from . import auth
from .core import (
    ADMIN_ROLES, KINDS, choice, clock, day, email, fail, first, identifier, image, integer,
    now, rate, ref, rows, text, today, transaction
)


def membership(db, tenant_id, user):
    tenant = first(db, """SELECT t.id,t.name,m.role FROM tenants t JOIN members m ON m.tenant=t.id
                          WHERE t.id=? AND m.user=?""", tenant_id, user)
    if not tenant:
        fail("Pracovisko sa nenašlo.", 404)
    return tenant


def require_admin(tenant):
    if tenant["role"] not in ADMIN_ROLES:
        fail("Túto akciu môže vykonať správca.", 403)


def find_office(db, tenant, office, active=True):
    result = first(db, "SELECT id,archived FROM offices WHERE tenant=? AND id=?", tenant, office)
    if not result or (active and result["archived"]):
        fail("Kancelária sa nenašla.", 404)
    return result


def find_team(db, tenant, team):
    if team and not first(db, "SELECT 1 FROM teams WHERE tenant=? AND id=?", tenant, team):
        fail("Skupina sa nenašla.", 404)
    return team


def find_plan(db, tenant, plan):
    result = first(db, "SELECT id,office,kind FROM plans WHERE tenant=? AND id=?", tenant, plan)
    if not result:
        fail("Pôdorys sa nenašiel.", 404)
    return result


def allowed_resource(db, tenant, user, resource):
    item = first(db, """SELECT r.*,o.archived office_archived FROM resources r JOIN offices o
                        ON o.tenant=r.tenant AND o.id=r.office WHERE r.tenant=? AND r.id=?""",
                 tenant["id"], resource)
    if not item or item["archived"] or item["office_archived"]:
        fail("Priestor sa nenašiel.", 404)
    if tenant["role"] not in ADMIN_ROLES and item["team"] and not first(db,
        "SELECT 1 FROM team_members WHERE tenant=? AND team=? AND user=?", tenant["id"], item["team"], user):
        fail("Priestor sa nenašiel.", 404)
    return item


def snapshot(db, tenant, user, date):
    tid = tenant["id"]
    admin = tenant["role"] in ADMIN_ROLES
    offices = rows(db, "SELECT id,name,address,archived FROM offices WHERE tenant=? AND (? OR archived=0) ORDER BY archived,name", tid, admin)
    plans = rows(db, """SELECT p.id,p.name,p.office,p.kind FROM plans p JOIN offices o
                        ON o.tenant=p.tenant AND o.id=p.office WHERE p.tenant=? AND (? OR o.archived=0) ORDER BY p.name""", tid, admin)
    resources = rows(db, """SELECT r.id,r.name,r.office,r.kind,r.description,r.capacity,r.team,r.plan,r.x,r.y,
                            max(r.archived,o.archived) disabled,r.archived FROM resources r JOIN offices o
                            ON o.tenant=r.tenant AND o.id=r.office WHERE r.tenant=? AND (? OR
                            (r.archived=0 AND o.archived=0 AND (r.team IS NULL OR r.team IN
                            (SELECT team FROM team_members WHERE tenant=? AND user=?)))) ORDER BY r.archived,r.kind,r.name""",
                     tid, admin, tid, user)
    busy = rows(db, """SELECT resource,start,end FROM reservations WHERE tenant=? AND date=? AND cancelled=0
                       AND (? OR resource IN (SELECT r.id FROM resources r WHERE r.tenant=? AND
                       (r.team IS NULL OR r.team IN (SELECT team FROM team_members WHERE tenant=? AND user=?))))
                       ORDER BY start,end""", tid, date, admin, tid, tid, user)
    reservation_fields = """SELECT b.id,b.date,b.start,b.end,b.title,b.resource,r.name resourceName,
                            r.kind,r.office,u.name member,b.user=? mine FROM reservations b
                            JOIN resources r ON r.tenant=b.tenant AND r.id=b.resource JOIN users u ON u.id=b.user"""
    mine = rows(db, reservation_fields + """ WHERE b.tenant=? AND b.user=? AND b.date>=? AND b.cancelled=0
                                           ORDER BY b.date,b.start LIMIT 500""", user, tid, user, today())
    panel = rows(db, reservation_fields + """ WHERE b.tenant=? AND b.date=? AND b.cancelled=0 ORDER BY b.start,r.name""",
                 user, tid, date) if admin else []
    visits = rows(db, """SELECT id,office,name,company,date,time,status,user=? mine FROM visits
                          WHERE tenant=? AND (user=? OR ?) AND date=? ORDER BY time""", user, tid, user, admin, date)
    result = {
        "tenant": tenant, "today": today(), "date": date, "offices": offices, "plans": plans, "resources": resources,
        "busy": busy, "mine": mine, "reservations": panel, "visits": visits,
        "teams": [], "members": [], "invitations": [],
    }
    if admin:
        result["teams"] = rows(db, "SELECT id,name FROM teams WHERE tenant=? ORDER BY name", tid)
        result["members"] = rows(db, """SELECT u.id,u.name,u.email,m.role FROM members m JOIN users u ON m.user=u.id
                                        WHERE m.tenant=? ORDER BY u.name,u.id""", tid)
        memberships = rows(db, "SELECT team,user FROM team_members WHERE tenant=?", tid)
        for item in result["members"]:
            item["teams"] = [record["team"] for record in memberships if record["user"] == item["id"]]
        result["invitations"] = rows(db, """SELECT id,email,role,team,expires,used,delivery FROM links
                                            WHERE tenant=? AND kind='invite' AND revoked IS NULL
                                            ORDER BY created DESC LIMIT 100""", tid)
    return result


def save_office(db, tid, data):
    office = ref(data, "id", False)
    name = text(data, "name")
    address = text(data, "address", 180, False)
    if office:
        find_office(db, tid, office, False)
        db.execute("UPDATE offices SET name=?,address=? WHERE tenant=? AND id=?", (name, address, tid, office))
    else:
        office = identifier()
        db.execute("INSERT INTO offices(tenant,id,name,address) VALUES(?,?,?,?)", (tid, office, name, address))
    return {"id": office}


def save_plan(db, tid, data):
    plan = ref(data, "id", False)
    office = ref(data, "office")
    name = text(data, "name")
    kind = choice(data, "kind", ("office", "parking"))
    find_office(db, tid, office)
    if plan:
        existing = find_plan(db, tid, plan)
        if existing["office"] != office or existing["kind"] != kind:
            fail("Uložený pôdorys má pevné umiestnenie a typ.")
        if data.get("image"):
            mime, payload = image(data)
            db.execute("UPDATE plans SET name=?,mime=?,image=? WHERE tenant=? AND id=?", (name, mime, payload, tid, plan))
        else:
            db.execute("UPDATE plans SET name=? WHERE tenant=? AND id=?", (name, tid, plan))
    else:
        if first(db, "SELECT count(*) AS count FROM plans WHERE tenant=?", tid)["count"] >= 50:
            fail("Pracovisko dosiahlo limit 50 pôdorysov.", 409)
        mime, payload = image(data)
        plan = identifier()
        db.execute("INSERT INTO plans VALUES(?,?,?,?,?,?,?)", (tid, plan, office, name, kind, mime, payload))
    return {"id": plan}


def save_resource(db, tid, data):
    resource = ref(data, "id", False)
    office = ref(data, "office")
    kind = choice(data, "kind", KINDS)
    name = text(data, "name")
    description = text(data, "description", 200, False)
    capacity = integer(data, "capacity", 1, 500) if kind == "room" else 1
    plan = ref(data, "plan", False)
    team = find_team(db, tid, ref(data, "team", False))
    find_office(db, tid, office)
    x, y = data.get("x"), data.get("y")
    if plan:
        shape = find_plan(db, tid, plan)
        if shape["office"] != office or (shape["kind"] == "parking") != (kind == "parking"):
            fail("Pôdorys nezodpovedá typu alebo kancelárii.")
        if any(type(v) not in (float, int) or not 0 <= v <= 100 for v in (x, y)):
            fail("Označte polohu na pôdoryse.")
    else:
        x, y = None, None
    if resource:
        prior = first(db, "SELECT id,office,kind FROM resources WHERE tenant=? AND id=?", tid, resource)
        if not prior:
            fail("Priestor sa nenašiel.", 404)
        if (prior["office"], prior["kind"]) != (office, kind):
            fail("Uložený priestor má pevné umiestnenie a typ.")
        db.execute("""UPDATE resources SET name=?,description=?,capacity=?,team=?,plan=?,x=?,y=?
                      WHERE tenant=? AND id=?""", (name, description, capacity, team, plan, x, y, tid, resource))
    else:
        resource = identifier()
        db.execute("""INSERT INTO resources(tenant,id,office,kind,name,description,capacity,team,plan,x,y)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (tid, resource, office, kind, name, description, capacity, team, plan, x, y))
    return {"id": resource}


def save_team(db, tid, data):
    team = ref(data, "id", False)
    name = text(data, "name")
    if first(db, "SELECT 1 FROM teams WHERE tenant=? AND name=? COLLATE NOCASE AND id IS NOT ?", tid, name, team):
        fail("Skupina s týmto názvom už existuje.", 409)
    if team:
        find_team(db, tid, team)
        db.execute("UPDATE teams SET name=? WHERE tenant=? AND id=?", (name, tid, team))
    else:
        team = identifier()
        db.execute("INSERT INTO teams VALUES(?,?,?)", (tid, team, name))
    return {"id": team}


def member_change(db, tenant, data, removing=False):
    tid = tenant["id"]
    user = ref(data, "id")
    member = first(db, "SELECT role FROM members WHERE tenant=? AND user=?", tid, user)
    if not member:
        fail("Používateľ sa nenašiel.", 404)
    level = member["role"]
    if level == "owner" or (level == "admin" and tenant["role"] != "owner"):
        fail("Rolu tohto člena môže spravovať iba vlastník. Vlastníka nemožno odobrať.", 403)
    if removing:
        db.execute("DELETE FROM members WHERE tenant=? AND user=?", (tid, user))
        db.execute("UPDATE reservations SET cancelled=1 WHERE tenant=? AND user=? AND date>=?", (tid, user, today()))
        return {}
    role = choice(data, "role", ("admin", "member") if tenant["role"] == "owner" else ("member",))
    groups = data.get("teams", [])
    if not isinstance(groups, list) or len(groups) > 50:
        fail("Vyberte platné skupiny.")
    teams = {find_team(db, tid, ref({"team": value}, "team")) for value in groups}
    db.execute("UPDATE members SET role=? WHERE tenant=? AND user=?", (role, tid, user))
    db.execute("DELETE FROM team_members WHERE tenant=? AND user=?", (tid, user))
    db.executemany("INSERT INTO team_members VALUES(?,?,?)", [(tid, team, user) for team in teams])
    return {}


def reserve(db, tenant, user, data):
    resource = ref(data, "resource")
    allowed_resource(db, tenant, user, resource)
    when = day(data, future=True)
    start, end = clock(data, "start"), clock(data, "end")
    if start >= end:
        fail("Čas konca musí byť po čase začiatku.")
    tid = tenant["id"]
    if first(db, """SELECT 1 FROM reservations WHERE tenant=? AND resource=? AND date=? AND cancelled=0
                   AND start<? AND end>?""", tid, resource, when, end, start):
        fail("Priestor je v tomto čase rezervovaný.", 409)
    reservation = identifier()
    title = text(data, "title", 100, False)
    db.execute("""INSERT INTO reservations(tenant,id,resource,user,date,start,end,title)
                  VALUES(?,?,?,?,?,?,?,?)""", (tid, reservation, resource, user, when, start, end, title))
    return {"id": reservation}


def cancel(db, tenant, user, data):
    changed = db.execute("""UPDATE reservations SET cancelled=1 WHERE tenant=? AND id=? AND cancelled=0
                            AND (user=? OR ?)""", (tenant["id"], ref(data, "id"), user, tenant["role"] in ADMIN_ROLES))
    if changed.rowcount != 1:
        fail("Rezervácia sa nenašla.", 404)
    return {}


def visit(db, tenant, user, action, data):
    tid = tenant["id"]
    if action == "visit.create":
        office = ref(data, "office")
        find_office(db, tid, office)
        vid = identifier()
        db.execute("""INSERT INTO visits(tenant,id,office,user,name,company,date,time)
                      VALUES(?,?,?,?,?,?,?,?)""",
                   (tid, vid, office, user, text(data, "name"), text(data, "company", 120, False),
                    day(data, future=True), clock(data, "time")))
        return {"id": vid}
    vid = ref(data, "id")
    permitted = (tid, vid, user, tenant["role"] in ADMIN_ROLES)
    if action == "visit.remove":
        changed = db.execute("DELETE FROM visits WHERE tenant=? AND id=? AND (user=? OR ?)", permitted)
    else:
        prior = choice(data, "status", ("expected", "arrived"))
        target = {"expected": "arrived", "arrived": "departed"}[prior]
        changed = db.execute("UPDATE visits SET status=? WHERE tenant=? AND id=? AND (user=? OR ?) AND status=?",
                             (target, *permitted, prior))
    if changed.rowcount != 1:
        fail("Návšteva sa nenašla alebo sa zmenil jej stav.", 404)
    return {}


def invite(db, tenant, user, data, config):
    require_admin(tenant)
    tid = tenant["id"]
    addr = email(data)
    role = choice(data, "role", ("admin", "member") if tenant["role"] == "owner" else ("member",))
    team = find_team(db, tid, ref(data, "team", False))
    rate(db, f"invite:tenant:{tid}", 40, 3600)
    rate(db, f"invite:day:{tid}", 180, 86400)
    rate(db, f"invite:email:{addr}", 5, 3600)
    link, plain = auth.create_link(db, "invite", addr, company=tenant["name"],
                                   tenant=tid, sender=user, role=role, team=team)
    return {"id": link["id"], "delivery": auth.send_link(db, link, plain, config)}


def dispatch(db, tenant_id, user, action, data, config):
    if action == "invite.send":
        return invite(db, membership(db, tenant_id, user), user, data, config)
    with transaction(db):
        tenant = membership(db, tenant_id, user)
        tid = tenant["id"]
        if action == "reservation.create":
            return reserve(db, tenant, user, data)
        if action == "reservation.cancel":
            return cancel(db, tenant, user, data)
        if action in ("visit.create", "visit.next", "visit.remove"):
            return visit(db, tenant, user, action, data)
        require_admin(tenant)
        if action == "tenant.rename":
            db.execute("UPDATE tenants SET name=? WHERE id=?", (text(data, "name"), tid))
            return {}
        if action == "office.save":
            return save_office(db, tid, data)
        if action == "plan.save":
            return save_plan(db, tid, data)
        if action == "resource.save":
            return save_resource(db, tid, data)
        if action == "team.save":
            return save_team(db, tid, data)
        if action == "member.save" or action == "member.remove":
            return member_change(db, tenant, data, action == "member.remove")
        if action in ("office.archive", "resource.archive"):
            table = "offices" if action == "office.archive" else "resources"
            state = integer(data, "archived", 0, 1)
            changed = db.execute(f"UPDATE {table} SET archived=? WHERE tenant=? AND id=?", (state, tid, ref(data, "id")))
            if changed.rowcount != 1:
                fail("Záznam sa nenašiel.", 404)
            return {}
        if action == "plan.remove":
            plan = ref(data, "id")
            find_plan(db, tid, plan)
            db.execute("UPDATE resources SET plan=NULL,x=NULL,y=NULL WHERE tenant=? AND plan=?", (tid, plan))
            db.execute("DELETE FROM plans WHERE tenant=? AND id=?", (tid, plan))
            return {}
        if action == "team.remove":
            team = find_team(db, tid, ref(data, "id"))
            if first(db, "SELECT 1 FROM resources WHERE tenant=? AND team=?", tid, team):
                fail("Najprv zmeňte skupinu pri jej priradených priestoroch.", 409)
            db.execute("UPDATE links SET team=NULL WHERE tenant=? AND team=?", (tid, team))
            db.execute("DELETE FROM teams WHERE tenant=? AND id=?", (tid, team))
            return {}
        if action == "invite.revoke":
            allowed = ("admin", "member") if tenant["role"] == "owner" else ("member",)
            invitation = first(db, "SELECT role FROM links WHERE tenant=? AND id=?", tid, ref(data, "id"))
            if not invitation or invitation["role"] not in allowed:
                fail("Pozvánka sa nenašla.", 404)
            changed = db.execute("UPDATE links SET revoked=? WHERE tenant=? AND id=? AND revoked IS NULL AND used IS NULL",
                                 (now(), tid, data["id"]))
            if changed.rowcount != 1:
                fail("Pozvánka sa nenašla.", 404)
            return {}
        fail("Neznáma akcia.", 404)
