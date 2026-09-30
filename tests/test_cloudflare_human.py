"""Smoke-test the Worker endpoints without a Cloudflare account."""
import sqlite3
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("workers", types.SimpleNamespace(asgi=types.SimpleNamespace(entrypoint=lambda app: None)))

from fastapi.testclient import TestClient
import human_worker


class Result:
    def __init__(self, rows):
        self.results = [dict(row) for row in rows]


class Statement:
    def __init__(self, conn, sql, args=()):
        self.conn, self.sql, self.args = conn, sql, args

    def bind(self, *args):
        return Statement(self.conn, self.sql, args)

    async def run(self):
        rows = self.conn.execute(self.sql, self.args).fetchall()
        self.conn.commit()
        return Result(rows)

    async def first(self):
        row = self.conn.execute(self.sql, self.args).fetchone()
        return dict(row) if row else None


class DB:
    def __init__(self):
        self.conn = sqlite3.connect(":memory:", check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        migrations = Path(__file__).resolve().parents[1] / "cloudflare-human/migrations"
        self.conn.executescript((migrations / "0001_human.sql").read_text())
        self.conn.executescript((migrations / "0006_human_email_auth.sql").read_text())

    def prepare(self, sql):
        return Statement(self.conn, sql)


def test_cloudflare_builder_conversation_saved_blueprint_and_verified_account(monkeypatch):
    db = DB()

    async def fake_send_verification_email(request, email, code):
        assert email == "test@example.com"
        assert code == "123456"

    monkeypatch.setattr(human_worker, "send_verification_email", fake_send_verification_email)
    monkeypatch.setattr(human_worker.secrets, "randbelow", lambda upper: 123456)

    @human_worker.app.middleware("http")
    async def bind_database(request, call_next):
        request.scope["env"] = types.SimpleNamespace(
            DB=db,
            HUMAN_APK_URL="https://downloads.example/buildawallet-signed.apk",
            HUMAN_APK_SHA256="a" * 64,
        )
        return await call_next(request)

    client = TestClient(human_worker.app, base_url="https://buildawallet.xyz")
    assert (health := client.get("/healthz")).json().get("ok") is True, (health.status_code, health.text)
    opening = client.get("/api/start").json()
    assert client.get("/api/catalog").json()["total"] >= 150
    response = client.post("/api/chat", json={"message": "Call it Northvault. I want Bitcoin and Litecoin",
                                              "spec": opening["spec"], "state": opening["state"]})
    assert response.status_code == 200
    spec = response.json()["spec"]
    assert {"btc", "ltc"}.issubset(spec["assets"])
    saved = client.post("/api/save", json={"spec": spec, "is_public": True})
    assert saved.status_code == 200
    code = saved.json()["code"]
    assert len(code) == 26
    assert client.get(f"/api/wallet/{code}").json()["spec"]["assets"] == spec["assets"]
    assert client.get("/api/gallery").json()["items"][0]["code"] == code
    assert client.get("/api/stats").json() == {"built": 1, "options": human_worker.TOTAL_OPTIONS}
    private = client.post("/api/save", json={"spec": spec, "email": "test@example.com"}).json()["code"]
    assert len(private) == 26
    assert private not in str(client.get("/api/stats").json())
    assert private not in str(client.get("/api/gallery").json())
    assert db.conn.execute("SELECT email FROM wallets WHERE code=?", (private,)).fetchone()[0] is None
    db.conn.execute("UPDATE wallets SET email='legacy@example.com' WHERE code=?", (private,))
    db.conn.executescript((Path(__file__).resolve().parents[1] / "cloudflare-human/migrations/0002_clear_email.sql").read_text())
    assert db.conn.execute("SELECT email FROM wallets WHERE code=?", (private,)).fetchone()[0] is None

    assert client.get("/api/human/account").json() == {"authenticated": False, "verified": False}
    request_code = client.post("/api/human/account/email", json={"email": "Test@Example.com"})
    assert request_code.status_code == 200
    assert request_code.json()["sent"] is True
    wrong = client.post("/api/human/account/verify", json={"email": "test@example.com", "code": "000000"})
    assert wrong.status_code == 400
    verified = client.post("/api/human/account/verify", json={"email": "test@example.com", "code": "123456"})
    assert verified.status_code == 200
    assert verified.json()["verified"] is True
    assert client.get("/api/human/account").json() == {"authenticated": True, "verified": True}
    stored = db.conn.execute("SELECT email_hash FROM human_email_accounts").fetchone()[0]
    assert stored == human_worker.sha256_text("test@example.com")
    assert "test@example.com" not in str(list(db.conn.execute("SELECT * FROM human_email_accounts")))

    release = client.post("/api/human/build", json={"target": "mainnet", "draft": {"name": "Northvault"}})
    assert release.status_code == 200
    assert release.json()["buildId"] == "mainnet-release"
    assert release.json()["status"] == "complete"
    assert release.json()["apkUrl"].endswith(".apk")
    assert release.json()["sha256"] == "a" * 64
    status = client.get("/api/human/build/mainnet-release")
    assert status.status_code == 200
    assert status.json()["apkUrl"] == release.json()["apkUrl"]
    assert client.get("/api/human/build/not-a-build").status_code == 404

    logout = client.post("/api/human/account/logout")
    assert logout.status_code == 200
    assert client.get("/api/human/account").json()["authenticated"] is False
    assert client.post("/api/human/build", json={"target": "mainnet", "draft": {"name": "Northvault"}}).status_code == 401
