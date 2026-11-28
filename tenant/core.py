import base64
import binascii
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
from contextlib import closing, contextmanager
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
ZONE = ZoneInfo("Europe/Bratislava")
IMAGE_LIMIT = 3 * 1024 * 1024
REQUEST_LIMIT = 4 * 1024 * 1024 + 4096
SESSION_AGE = 30 * 86400
EMAIL = re.compile(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+", re.ASCII)
TIME = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]")
IDENTIFIER = re.compile(r"[A-Za-z0-9_-]{22}")
SECRET = re.compile(r"[A-Za-z0-9_-]{43}")
ADMIN_ROLES = {"owner", "admin"}
KINDS = ("desk", "room", "parking")


class Problem(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now():
    return int(time.time())


def today():
    return datetime.now(ZONE).date().isoformat()


def identifier():
    return secrets.token_urlsafe(16)


def token():
    return secrets.token_urlsafe(32)


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def fail(message, status=400):
    raise Problem(status, message)


def text(data, name, limit=120, required=True):
    value = data.get(name, "")
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 for c in value):
        fail("Skontrolujte vyplnené údaje.")
    value = value.strip()
    if required and not value:
        fail("Vyplňte všetky povinné polia.")
    return value


def email(data):
    value = text(data, "email", 254).lower()
    local = value.split("@", 1)[0]
    if not EMAIL.fullmatch(value) or len(local) > 64 or local.startswith(".") or local.endswith(".") or ".." in local:
        fail("Zadajte platnú e-mailovú adresu.")
    return value


def choice(data, name, values):
    value = data.get(name)
    if value not in values:
        fail("Vyberte platnú možnosť.")
    return value


def integer(data, name, low, high):
    value = data.get(name)
    if type(value) is not int or not low <= value <= high:
        fail("Zadajte platné číslo.")
    return value


def ref(data, name, required=True):
    value = text(data, name, 22, required)
    if value and not IDENTIFIER.fullmatch(value):
        fail("Vyberte platný záznam.")
    return value or None


def day(data, name="date", future=False):
    value = text(data, name, 10)
    try:
        parsed = date.fromisoformat(value).isoformat()
    except ValueError:
        fail("Zadajte platný dátum.")
    if parsed != value or (future and value < today()):
        fail("Vyberte dnešný alebo neskorší dátum.")
    return value


def clock(data, name):
    value = text(data, name, 5)
    if not TIME.fullmatch(value):
        fail("Zadajte platný čas.")
    return value


def password(data, creating=False):
    value = data.get("password", "")
    if not isinstance(value, str) or not 1 <= len(value) <= 128:
        fail("Zadajte platné heslo.")
    if creating and len(value) < 10:
        fail("Heslo musí obsahovať aspoň 10 znakov.")
    return value


def password_hash(value, salt=None):
    salt = salt or secrets.token_hex(16)
    key = hashlib.scrypt(value.encode("utf-8"), salt=bytes.fromhex(salt), n=16384, r=8, p=2)
    return salt + ":" + key.hex()


DUMMY_HASH = "00000000000000000000000000000000:" + "0" * 128


def matches(value, stored):
    return hmac.compare_digest(password_hash(value, stored.split(":", 1)[0]), stored)


def image(data):
    value = data.get("image")
    if not isinstance(value, str) or len(value) > 4 * IMAGE_LIMIT // 3 + 4:
        fail("Nahrajte obrázok s veľkosťou do 3 MB.")
    try:
        payload = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        fail("Obrázok sa nepodarilo prečítať.")
    media = (
        "image/png" if payload.startswith(b"\x89PNG\r\n\x1a\n") else
        "image/jpeg" if payload.startswith(b"\xff\xd8\xff") else
        "image/webp" if payload[:4] == b"RIFF" and payload[8:12] == b"WEBP" else None
    )
    if not media or len(payload) > IMAGE_LIMIT:
        fail("Použite obrázok PNG, JPEG alebo WebP do 3 MB.")
    return media, payload


def connect(path):
    db = sqlite3.connect(path, timeout=8, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def initialise(path):
    with closing(connect(path)) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript((ROOT / "schema.sql").read_text(encoding="utf-8"))


@contextmanager
def transaction(db):
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.execute("COMMIT")
    except BaseException:
        db.execute("ROLLBACK")
        raise


def rows(db, sql, *params):
    return [dict(row) for row in db.execute(sql, params)]


def first(db, sql, *params):
    row = db.execute(sql, params).fetchone()
    return dict(row) if row else None


def rate(db, key, maximum, window=900):
    timestamp = now()
    bucket = timestamp - timestamp % window
    scope = f"{window}:{digest(key)}"
    row = db.execute(
        "INSERT INTO limits VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1 RETURNING count",
        (scope, bucket),
    ).fetchone()
    if row[0] > maximum:
        fail("Príliš veľa pokusov. Skúste to neskôr.", 429)
    if secrets.randbelow(128) == 0:
        db.execute("DELETE FROM limits WHERE bucket<?", (timestamp - 172800,))
        db.execute("DELETE FROM sessions WHERE expires<?", (timestamp,))
        db.execute("DELETE FROM links WHERE expires<? AND kind IN ('signup','reset')", (timestamp - 604800,))


def object_body(environ):
    if environ.get("CONTENT_TYPE", "").split(";", 1)[0] != "application/json":
        fail("Očakáva sa požiadavka JSON.", 415)
    try:
        size = int(environ.get("CONTENT_LENGTH") or 0)
        if not 0 < size <= REQUEST_LIMIT:
            fail("Veľkosť požiadavky je mimo limitu.", 413)
        data = json.loads(environ["wsgi.input"].read(size))
    except (ValueError, UnicodeError, RecursionError):
        fail("Požiadavka nie je platná.")
    if not isinstance(data, dict):
        fail("Požiadavka nie je platná.")
    return data
