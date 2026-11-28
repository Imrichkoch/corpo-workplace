import base64
import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from email import policy
from email.parser import BytesParser
from pathlib import Path
from re import search

from tenant.server import create_app

PASSWORD = "test-corpo-password"
PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU7sAAAAASUVORK5CYII="


class TenantTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.mail = Path(self.temp.name) / "mail"
        self.app = create_app({"db": str(Path(self.temp.name) / "test.sqlite"),
                               "base": "https://example.com/corpo/app", "outbox": self.mail,
                               "sender": "Corpo <office@example.com>", "proxy": False})
        self.day = (date.today() + timedelta(days=2)).isoformat()

    def call(self, endpoint, data=None, bearer="", expected=200, *, origin="", cookie=""):
        body = json.dumps(data).encode() if data is not None else b""
        split, _, query = endpoint.partition("?")
        environ = {
            "PATH_INFO": "/corpo/app/api/" + split, "QUERY_STRING": query,
            "REQUEST_METHOD": "POST" if data is not None else "GET", "REMOTE_ADDR": "127.0.0.1",
            "CONTENT_TYPE": "application/json", "CONTENT_LENGTH": str(len(body)), "wsgi.input": io.BytesIO(body),
        }
        if bearer:
            environ["HTTP_AUTHORIZATION"] = "Bearer " + bearer
        if origin:
            environ["HTTP_ORIGIN"] = origin
        if cookie:
            environ["HTTP_COOKIE"] = cookie
        result = {}
        def respond(status, headers):
            result.update(status=int(status.split()[0]), headers=dict(headers))
        raw = b"".join(self.app(environ, respond))
        self.assertEqual(result["status"], expected, raw)
        return json.loads(raw) if result["headers"]["Content-Type"].startswith("application/json") else raw

    def outbox_link(self, address):
        candidates = sorted(self.mail.glob("*.eml"), key=lambda p: p.stat().st_mtime_ns, reverse=True)
        for path in candidates:
            message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
            if str(message["To"]) == address:
                return search(r"#link=([A-Za-z0-9_-]{43})", message.get_body(preferencelist=("plain",)).get_content())[1]
        self.fail("No email addressed to " + address)

    def signup(self, address, company):
        self.call("auth/signup", {"email":address,"name":"Admin "+company,"company":company})
        raw = self.outbox_link(address)
        self.assertEqual(self.call("auth/link", {"token":raw})["company"], company)
        account = self.call("auth/accept", {"token":raw,"password":PASSWORD,"client":"native"})
        self.call("auth/accept", {"token":raw,"password":PASSWORD}, expected=404)
        return account["token"], account["tenants"][0]["id"]

    def permissions(self, owner, tenant, action, record, status=200):
        return self.call("tenant/"+tenant, {"action":action,"record":record}, owner, status)

    def enroll(self, owner, tenant, address, team=None):
        details = {"email":address,"role":"member"}
        if team:
            details["team"] = team
        self.assertEqual(self.permissions(owner, tenant,"invite.send",details)["delivery"],"sent")
        link = self.outbox_link(address)
        self.call("auth/accept", {"token":link,"password":PASSWORD,"name":"Zamestnanec","client":"native"})
        return self.call("auth/login", {"email":address,"password":PASSWORD,"client":"native"})["token"]

    def test_tenant_membership_invites_maps_groups_and_concurrent_booking(self):
        owner, tenant = self.signup("owner@example.com","Prvá firma")
        other, outsider_tenant = self.signup("other@example.com","Druhá firma")
        office = self.permissions(owner,tenant,"office.save",{"name":"Pracovisko","address":"Bratislava"})["id"]
        remote_office = self.permissions(other,outsider_tenant,"office.save",{"name":"Iné pracovisko"})["id"]
        team = self.permissions(owner,tenant,"team.save",{"name":"Facility"})["id"]
        plan = self.permissions(owner,tenant,"plan.save",{"office":office,"name":"Garáž B","kind":"parking","image":PIXEL})["id"]
        self.permissions(owner,tenant,"plan.save",{"office":remote_office,"name":"Cudzí plán","kind":"parking","image":PIXEL},404)
        details = {"office":office,"name":"P-03","kind":"parking","team":team,"plan":plan,"x":50,"y":25}
        space = self.permissions(owner,tenant,"resource.save",details)["id"]
        assigned = self.enroll(owner,tenant,"assigned@example.com",team)
        member = self.enroll(owner,tenant,"member@example.com")
        self.call("tenant/"+tenant, bearer=other, expected=404)
        self.call("tenant/"+tenant+"/plan/"+plan, bearer=other, expected=404)
        self.assertEqual(self.call("tenant/"+tenant+"/plan/"+plan,bearer=assigned),base64.b64decode(PIXEL))
        self.assertEqual(self.call("tenant/"+tenant,bearer=member)["resources"],[])
        self.assertEqual(self.call("tenant/"+tenant,bearer=assigned)["resources"][0]["id"],space)
        self.permissions(assigned,tenant,"office.save",{"name":"Zakázaná kancelária"},403)
        self.permissions(assigned,tenant,"invite.send",{"email":"x@example.com","role":"member"},403)
        interval = {"resource":space,"date":self.day,"start":"09:00","end":"11:00","title":"Súkromný názov"}
        self.permissions(member,tenant,"reservation.create",interval,404)

        def concurrent(author):
            output = {}
            body = json.dumps({"action":"reservation.create","record":interval}).encode()
            environ = {"PATH_INFO":"/corpo/app/api/tenant/"+tenant, "REQUEST_METHOD":"POST",
                       "CONTENT_TYPE":"application/json","CONTENT_LENGTH":str(len(body)),"wsgi.input":io.BytesIO(body),
                       "HTTP_AUTHORIZATION":"Bearer "+author}
            def start(status, _):
                output["status"] = int(status.split()[0])
            b"".join(self.app(environ,start))
            return output["status"]

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(concurrent,(owner,assigned))),[200,409])
        booking = self.call("tenant/"+tenant+"?date="+self.day,bearer=owner)["reservations"][0]
        self.permissions(member,tenant,"reservation.cancel",{"id":booking["id"]},404)
        self.permissions(owner,tenant,"reservation.cancel",{"id":booking["id"]})
        self.assertFalse(self.call("tenant/"+tenant+"?date="+self.day,bearer=owner)["reservations"])
        self.permissions(owner,tenant,"plan.remove",{"id":plan})
        self.assertIsNone(self.call("tenant/"+tenant,bearer=owner)["resources"][0]["plan"])

    def test_password_reset_revokes_active_sessions(self):
        owner, _ = self.signup("reset@example.com","Pracovisko")
        self.call("auth/reset",{"email":"reset@example.com"})
        reset_link = self.outbox_link("reset@example.com")
        self.assertEqual(self.call("auth/link",{"token":reset_link})["kind"],"reset")
        self.call("auth/accept",{"token":reset_link,"password":PASSWORD+"new"})
        self.call("account",bearer=owner,expected=401)
        self.call("auth/login",{"email":"reset@example.com","password":PASSWORD},expected=401)
        self.call("auth/login",{"email":"reset@example.com","password":PASSWORD+"new"})
        self.call("auth/reset",{"email":"reset@example.com"},expected=403,origin="https://other.example.com")

    def test_revoked_invitation_cannot_be_accepted(self):
        owner, tenant = self.signup("owner@example.com","Firma")
        result = self.permissions(owner,tenant,"invite.send",{"email":"member@example.com","role":"member"})
        secret = self.outbox_link("member@example.com")
        self.permissions(owner,tenant,"invite.revoke",{"id":result["id"]})
        self.call("auth/accept",{"token":secret,"password":PASSWORD,"name":"Kolega"},expected=404)

    def exchange_admin(self, ticket, expected=303, cross_site=False):
        body = ("ticket=" + ticket).encode()
        environ = {
            "PATH_INFO": "/corpo/app/mobile-admin/session", "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": "application/x-www-form-urlencoded",
            "CONTENT_LENGTH": str(len(body)), "wsgi.input": io.BytesIO(body),
            "HTTP_SEC_FETCH_SITE": "cross-site" if cross_site else "none",
        }
        result = {}
        def respond(status, headers):
            result.update(status=int(status.split()[0]), headers=dict(headers))
        raw = b"".join(self.app(environ, respond))
        self.assertEqual(result["status"], expected, raw)
        if expected == 303:
            self.assertEqual(result["headers"]["Location"], "/corpo/app/?mobileAdmin=1#admin")
            cookie = result["headers"]["Set-Cookie"]
            self.assertIn("HttpOnly", cookie)
            self.assertIn("Secure", cookie)
            self.assertNotIn(ticket, cookie)
            return cookie.split(";")[0]
        return None

    def test_mobile_admin_ticket_is_scoped_single_use_and_linked_to_native_session(self):
        owner, tenant = self.signup("native-owner@example.com", "Prvá firma")
        other = self.call("account/tenants", {"company":"Druhá firma"}, owner, 201)["id"]
        member = self.enroll(owner,tenant,"native-member@example.com")
        self.call("auth/mobile-admin",{"tenant":tenant},member,403)
        self.call("auth/mobile-admin",{"tenant":tenant},expected=401)

        def new_ticket():
            return self.call("auth/mobile-admin",{"tenant":tenant},owner)["ticket"]

        ticket = new_ticket()
        self.exchange_admin(ticket,403,cross_site=True)
        cookie = self.exchange_admin(ticket)
        self.exchange_admin(ticket,401)
        self.call("account",bearer=cookie.split("=")[1],expected=401)
        self.assertEqual([item["id"] for item in self.call("account",cookie=cookie)["tenants"]],[tenant])
        self.call("tenant/"+other,expected=404,cookie=cookie)
        self.call("account/tenants",{"company":"Mimo firmy"},expected=403,cookie=cookie)
        self.call("auth/mobile-admin",{"tenant":tenant},expected=401,cookie=cookie)
        self.call("tenant/"+tenant,{"action":"office.save","record":{"name":"Kancelária z mobilu"}},cookie=cookie)

        self.call("auth/logout",{},cookie=cookie)
        self.call("account",expected=401,cookie=cookie)
        self.call("account",bearer=owner)
        cookie = self.exchange_admin(new_ticket())
        self.call("auth/logout",{},owner)
        self.call("account",expected=401,cookie=cookie)
