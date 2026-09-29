import os
import aiohttp


class TursoDatabase:
    """Small async Turso client using Turso/libSQL HTTP v2.

    The bot keeps working if Turso is unavailable; database errors never stop
    the Discord gateway.
    """

    def __init__(self):
        self.url = (
            os.environ.get("TURSO_DATABASE_URL")
            or os.environ.get("TURSO_URL")
            or os.environ.get("LIBSQL_URL")
            or ""
        ).strip()
        self.token = (
            os.environ.get("TURSO_AUTH_TOKEN")
            or os.environ.get("TURSO_TOKEN")
            or os.environ.get("LIBSQL_AUTH_TOKEN")
            or os.environ.get("LIBSQL_TOKEN")
            or ""
        ).strip()
        self.session: aiohttp.ClientSession | None = None
        self.enabled = bool(self.url and self.token)

    @property
    def endpoint(self) -> str:
        url = self.url.rstrip("/")
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        elif url.startswith("wss://"):
            url = "https://" + url[len("wss://"):]
        elif not url.startswith(("http://", "https://")):
            url = "https://" + url
        return url + "/v2/pipeline"

    async def connect(self):
        if not self.enabled:
            print("[TURSO] ℹ️ Credentials not detected; bot database features stay local.")
            return False
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                }
            )
        try:
            await self.execute("SELECT 1")
            print("[TURSO] ✅ Connected to Turso.")
            return True
        except Exception as exc:
            print(f"[TURSO] ⚠️ Connection failed: {exc}")
            return False

    async def execute(self, sql: str, args: list | None = None):
        if not self.enabled:
            return None
        if self.session is None or self.session.closed:
            await self.connect()

        stmt = {"sql": sql}
        if args:
            stmt["args"] = [self._value(value) for value in args]

        payload = {
            "baton": None,
            "requests": [{"type": "execute", "stmt": stmt}],
        }

        async with self.session.post(self.endpoint, json=payload, timeout=20) as response:
            body = await response.json(content_type=None)
            if response.status >= 400:
                raise RuntimeError(f"HTTP {response.status}: {body}")

        result = (body.get("results") or [{}])[0]
        if result.get("type") == "error":
            error = result.get("error") or {}
            raise RuntimeError(error.get("message") or str(error))

        return ((result.get("response") or {}).get("result") or {})

    async def fetch_all(self, sql: str, args: list | None = None) -> list[dict]:
        result = await self.execute(sql, args)
        if not result:
            return []

        columns = [
            column.get("name", "")
            for column in (result.get("cols") or result.get("columns") or [])
        ]
        rows = result.get("rows") or []
        output = []
        for row in rows:
            values = [
                cell.get("value") if isinstance(cell, dict) else cell
                for cell in row
            ]
            output.append(dict(zip(columns, values)))
        return output

    @staticmethod
    def _value(value):
        if value is None:
            return {"type": "null"}
        if isinstance(value, bool):
            return {"type": "integer", "value": "1" if value else "0"}
        if isinstance(value, int):
            return {"type": "integer", "value": str(value)}
        if isinstance(value, float):
            return {"type": "float", "value": str(value)}
        return {"type": "text", "value": str(value)}

    async def init(self):
        if not await self.connect():
            return False

        await self.execute(
            """
            CREATE TABLE IF NOT EXISTS zeno_bot_blocked_hashes (
                sha256 TEXT PRIMARY KEY,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
            """
        )
        return True

    async def load_blocked_hashes(self) -> set[str]:
        if not self.enabled:
            return set()
        rows = await self.fetch_all(
            "SELECT sha256 FROM zeno_bot_blocked_hashes"
        )
        return {
            str(row.get("sha256", "")).strip().lower()
            for row in rows
            if row.get("sha256")
        }

    async def add_blocked_hash(self, sha256: str):
        if not self.enabled:
            return
        await self.execute(
            """
            INSERT OR IGNORE INTO zeno_bot_blocked_hashes (sha256)
            VALUES (?)
            """,
            [sha256.lower().strip()],
        )

    async def close(self):
        if self.session is not None and not self.session.closed:
            await self.session.close()
