"""Cloudflare Python Worker for the HUMAN builder. D1 stores public blueprints and verified HUMAN sessions."""
import hashlib
import json
import re
import secrets
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
from workers import asgi

try:
    from js import fetch as js_fetch
except Exception:  # Local tests do not provide the Workers JS runtime.
    js_fetch = None

from app import brain
from app.catalog import ACCENTS, BY_ID, GROUPS, THEMES, TOTAL_OPTIONS

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
PUBLIC_BASE_URL = "https://buildawallet.xyz"
LIST_FIELDS = ("assets", "networks", "security", "features", "platforms", "privacy")
SINGLE_FIELDS = ("custody", "style", "theme", "accent")
CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"
RELEASE_BUILD_ID = "mainnet-release"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
VERIFY_TTL_SECONDS = 10 * 60
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
SESSION_COOKIE = "baw_human_session"


def clean_spec(raw):
    spec = brain.blank_spec()
    if not isinstance(raw, dict):
        return spec
    spec["name"] = str(raw.get("name") or "")[:32].strip()
    spec["purpose"] = str(raw.get("purpose") or "")[:140].strip()
    for field in LIST_FIELDS:
        values = raw.get(field)
        if isinstance(values, list):
            spec[field] = list(dict.fromkeys(
                item for item in values if isinstance(item, str) and brain.GROUP_OF.get(item) == field
            ))[:200]
    for field in SINGLE_FIELDS:
        value = raw.get(field)
        if isinstance(value, str) and brain.GROUP_OF.get(value) == field:
            spec[field] = value
    return spec


def clean_state(raw):
    state = brain.fresh_state()
    if not isinstance(raw, dict):
        return state
    for key in ("asked", "answered", "skipped", "said", "pending"):
        if isinstance(raw.get(key), list):
            state[key] = [str(value)[:40] for value in raw[key][:400]]
    for key in ("current", "last_q"):
        if isinstance(raw.get(key), str):
            state[key] = raw[key][:200]
    if isinstance(raw.get("turns"), int):
        state["turns"] = max(0, min(raw["turns"], 100000))
    state["finished"] = bool(raw.get("finished"))
    return state


def normalize_email(value: str):
    email = value.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address")
    return email


def sha256_text(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def now_ts():
    return int(time.time())


class ChatIn(BaseModel):
    message: str = Field(default="", max_length=600)
    spec: dict | None = None
    state: dict | None = None


class SaveIn(BaseModel):
    spec: dict | None = None
    is_public: bool = False


class BuildIn(BaseModel):
    target: str = Field(default="mainnet", max_length=32)
    draft: dict | None = None


class EmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class VerifyEmailIn(EmailIn):
    code: str = Field(min_length=6, max_length=6)


def database(request: Request):
    env = request.scope.get("env")
    if env is None or getattr(env, "DB", None) is None:
        raise HTTPException(503, "Blueprint storage is unavailable")
    return env.DB


def worker_env(request: Request):
    return request.scope.get("env")


def release_artifact(request: Request):
    env = worker_env(request)
    url = str(getattr(env, "HUMAN_APK_URL", "") or "").strip() if env is not None else ""
    if not url:
        raise HTTPException(503, "Signed Android release URL is not configured")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise HTTPException(503, "Signed Android release URL is invalid")
    sha256 = str(getattr(env, "HUMAN_APK_SHA256", "") or "").strip().lower() if env is not None else ""
    if sha256 and (len(sha256) != 64 or any(ch not in "0123456789abcdef" for ch in sha256)):
        raise HTTPException(503, "Signed Android release checksum is invalid")
    return url, sha256 or None


def row_py(row):
    return row.to_py() if hasattr(row, "to_py") else row


def session_token(request: Request):
    return request.cookies.get(SESSION_COOKIE, "").strip()


async def current_account(request: Request):
    token = session_token(request)
    if not token:
        return None
    current = now_ts()
    db = database(request)
    row = await db.prepare(
        "SELECT email_hash,expires_at FROM human_sessions WHERE token_hash=?"
    ).bind(sha256_text(token)).first()
    if row is None:
        return None
    record = row_py(row)
    if int(record["expires_at"]) <= current:
        await db.prepare("DELETE FROM human_sessions WHERE token_hash=?").bind(sha256_text(token)).run()
        return None
    await db.prepare("UPDATE human_sessions SET last_seen_at=? WHERE token_hash=?").bind(current, sha256_text(token)).run()
    return {"emailHash": record["email_hash"], "verified": True}


async def require_account(request: Request):
    account = await current_account(request)
    if account is None:
        raise HTTPException(401, "Confirm your email before continuing")
    return account


async def send_verification_email(request: Request, email: str, code: str):
    env = worker_env(request)
    api_key = str(getattr(env, "RESEND_API_KEY", "") or "").strip() if env is not None else ""
    email_from = str(getattr(env, "HUMAN_EMAIL_FROM", "") or "").strip() if env is not None else ""
    if not api_key or not email_from or js_fetch is None:
        raise HTTPException(503, "Email confirmation delivery is not configured")
    payload = {
        "from": email_from,
        "to": [email],
        "subject": "Confirm your BuildAWallet account",
        "html": (
            "<div style='font-family:Arial,sans-serif;max-width:520px'>"
            "<h2>Confirm your BuildAWallet account</h2>"
            f"<p>Your one-time confirmation code is <strong style='font-size:24px'>{code}</strong>.</p>"
            "<p>This code expires in 10 minutes. BuildAWallet will never ask for a seed phrase or private key.</p>"
            "</div>"
        ),
    }
    response = await js_fetch(
        "https://api.resend.com/emails",
        {
            "method": "POST",
            "headers": {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            "body": json.dumps(payload),
        },
    )
    if int(response.status) >= 300:
        raise HTTPException(503, "Could not send confirmation email")


@app.get("/healthz")
async def healthz(request: Request):
    try:
        db = database(request)
        await db.prepare("SELECT 1 FROM wallets LIMIT 1").run()
        return {"ok": True, "builder": "available"}
    except Exception:
        raise HTTPException(503, "Builder storage is unavailable")


@app.get("/api/start")
async def start():
    return brain.opening()


@app.post("/api/chat")
async def chat(body: ChatIn):
    return brain.respond(body.message, clean_spec(body.spec), clean_state(body.state))


@app.get("/api/catalog")
async def catalog():
    return {
        "groups": [{"key": group["key"], "title": group["title"], "multi": group["multi"],
                    "items": [{key: item.get(key, "") for key in ("id", "label", "blurb", "sym", "color", "tab")}
                              for item in group["items"]]} for group in GROUPS],
        "themes": [{key: theme[key] for key in ("id", "label", "mode")} for theme in THEMES],
        "accents": [{key: accent[key] for key in ("id", "label", "hex")} for accent in ACCENTS],
        "total": TOTAL_OPTIONS,
        "meta": {item_id: {key: item.get(key, "") for key in ("label", "sym", "color")}
                 for item_id, item in BY_ID.items()},
    }


@app.get("/api/human/account")
async def human_account(request: Request):
    account = await current_account(request)
    return {"authenticated": account is not None, "verified": account is not None}


@app.post("/api/human/account/email")
async def human_account_email(body: EmailIn, request: Request):
    email = normalize_email(body.email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    current = now_ts()
    db = database(request)
    await db.prepare(
        "INSERT OR REPLACE INTO human_email_challenges(email_hash,code_hash,expires_at,attempts,created_at) VALUES(?,?,?,?,?)"
    ).bind(sha256_text(email), sha256_text(code), current + VERIFY_TTL_SECONDS, 0, current).run()
    await send_verification_email(request, email, code)
    return {"ok": True, "sent": True, "expiresIn": VERIFY_TTL_SECONDS}


@app.post("/api/human/account/verify")
async def human_account_verify(body: VerifyEmailIn, request: Request, response: Response):
    email = normalize_email(body.email)
    code = body.code.strip()
    if not code.isdigit() or len(code) != 6:
        raise HTTPException(400, "Enter the six-digit confirmation code")
    email_hash = sha256_text(email)
    db = database(request)
    row = await db.prepare(
        "SELECT code_hash,expires_at,attempts FROM human_email_challenges WHERE email_hash=?"
    ).bind(email_hash).first()
    if row is None:
        raise HTTPException(400, "Request a new confirmation code")
    record = row_py(row)
    if int(record["expires_at"]) <= now_ts():
        await db.prepare("DELETE FROM human_email_challenges WHERE email_hash=?").bind(email_hash).run()
        raise HTTPException(400, "Confirmation code expired")
    attempts = int(record["attempts"])
    if attempts >= 5:
        raise HTTPException(429, "Too many confirmation attempts. Request a new code")
    if not secrets.compare_digest(str(record["code_hash"]), sha256_text(code)):
        await db.prepare("UPDATE human_email_challenges SET attempts=attempts+1 WHERE email_hash=?").bind(email_hash).run()
        raise HTTPException(400, "Incorrect confirmation code")
    current = now_ts()
    await db.prepare(
        "INSERT INTO human_email_accounts(email_hash,created_at,verified_at,last_seen_at) VALUES(?,?,?,?) "
        "ON CONFLICT(email_hash) DO UPDATE SET verified_at=excluded.verified_at,last_seen_at=excluded.last_seen_at"
    ).bind(email_hash, current, current, current).run()
    await db.prepare("DELETE FROM human_email_challenges WHERE email_hash=?").bind(email_hash).run()
    token = secrets.token_urlsafe(32)
    await db.prepare(
        "INSERT INTO human_sessions(token_hash,email_hash,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)"
    ).bind(sha256_text(token), email_hash, current, current + SESSION_TTL_SECONDS, current).run()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return {"ok": True, "authenticated": True, "verified": True}


@app.post("/api/human/account/logout")
async def human_account_logout(request: Request, response: Response):
    token = session_token(request)
    if token:
        await database(request).prepare("DELETE FROM human_sessions WHERE token_hash=?").bind(sha256_text(token)).run()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.post("/api/save")
async def save(body: SaveIn, request: Request):
    spec = clean_spec(body.spec)
    if brain.filled_count(spec) < 1:
        raise HTTPException(400, "nothing to save yet")
    db = database(request)
    for _ in range(5):
        code = "".join(secrets.choice(CODE_CHARS) for _ in range(26))
        try:
            await db.prepare("INSERT INTO wallets(code,name,spec,is_public) VALUES(?,?,?,?)").bind(
                code, spec["name"] or "Untitled wallet", json.dumps(spec), int(body.is_public)
            ).run()
            return {"code": code, "url": f"{PUBLIC_BASE_URL}/w/{code}"}
        except Exception as exc:
            if "UNIQUE" not in str(exc):
                raise HTTPException(503, "Blueprint storage failed") from exc
    raise HTTPException(503, "could not allocate a code")


@app.get("/api/gallery")
async def gallery(request: Request):
    result = await database(request).prepare(
        "SELECT name,code,spec FROM wallets WHERE is_public=1 ORDER BY created_at DESC LIMIT 24"
    ).run()
    return {"items": [{"name": row["name"], "code": row["code"],
                       "count": brain.filled_count(json.loads(row["spec"]))}
                      for row in row_py(result.results)]}


@app.get("/api/wallet/{code}")
async def saved(code: str, request: Request):
    row = await database(request).prepare(
        "SELECT code,name,spec,created_at FROM wallets WHERE code=?"
    ).bind(code[:32].lower()).first()
    if row is None:
        raise HTTPException(404, "no wallet with that code")
    record = row_py(row)
    return {"code": record["code"], "name": record["name"],
            "created_at": record["created_at"], "spec": clean_spec(json.loads(record["spec"]))}


@app.get("/api/stats")
async def stats(request: Request):
    db = database(request)
    count = row_py(await db.prepare("SELECT COUNT(*) AS n FROM wallets").first())
    return {"built": count["n"], "options": TOTAL_OPTIONS}


@app.post("/api/human/build")
async def human_build(body: BuildIn, request: Request):
    await require_account(request)
    if body.target != "mainnet":
        raise HTTPException(400, "Only the mainnet Android release is available")
    url, sha256 = release_artifact(request)
    draft = body.draft if isinstance(body.draft, dict) else {}
    digest = hashlib.sha256(json.dumps(draft, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]
    return {
        "buildId": RELEASE_BUILD_ID,
        "status": "complete",
        "target": "mainnet",
        "apkUrl": url,
        "sha256": sha256,
        "draftDigest": digest,
        "message": "Signed Android release is ready. HUMAN release is free.",
    }


@app.get("/api/human/build/{build_id}")
async def human_build_status(build_id: str, request: Request):
    await require_account(request)
    if build_id != RELEASE_BUILD_ID:
        raise HTTPException(404, "Unknown HUMAN build")
    url, sha256 = release_artifact(request)
    return {
        "buildId": RELEASE_BUILD_ID,
        "status": "complete",
        "target": "mainnet",
        "apkUrl": url,
        "sha256": sha256,
        "message": "Signed Android release is ready. HUMAN release is free.",
    }


Default = asgi.entrypoint(app)
