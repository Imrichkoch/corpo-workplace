import json
from contextvars import ContextVar

from .core import ROOT

ENGLISH = json.loads((ROOT / "web" / "en.json").read_text(encoding="utf-8"))
current = ContextVar("corpo_language", default="sk")


def request_language(environ):
    primary = environ.get("HTTP_ACCEPT_LANGUAGE", "").split(",", 1)[0].split(";", 1)[0].strip().lower()
    return "en" if primary.split("-", 1)[0] == "en" else "sk"


def t(text):
    return ENGLISH.get(text, text) if current.get() == "en" else text
