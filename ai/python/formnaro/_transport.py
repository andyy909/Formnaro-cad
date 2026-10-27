"""Loopback-only transport; connection descriptors are never returned to callers."""
import json
import os
import re
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from . import FormnaroError


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class Transport:
    def __init__(self, connection=None):
        self._connection = Path(connection) if connection else Path(os.environ.get("APPDATA", str(Path.home()))) / "offlinecad" / "ai-bridge.json"
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())

    def request(self, method, args=None):
        if method not in ("context", "scene", "project", "preview", "apply", "export"):
            raise ValueError("Unknown Formnaro operation")
        try:
            descriptor = json.loads(self._connection.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise RuntimeError("Start Formnaro and enable its local AI interface") from None
        try:
            url = urllib.parse.urlsplit(descriptor.get("url", ""))
            port = url.port
        except (TypeError, ValueError):
            raise RuntimeError("Invalid Formnaro connection descriptor") from None
        token = descriptor.get("token")
        if url.scheme != "http" or url.hostname != "127.0.0.1" or not port or url.username or url.password or url.path or url.query or url.fragment or not isinstance(token, str) or not re.fullmatch(r"[0-9a-f]{64}", token):
            raise RuntimeError("Invalid Formnaro connection descriptor")
        body = None if args is None else json.dumps(args, ensure_ascii=False, allow_nan=False).encode("utf-8")
        req = urllib.request.Request(descriptor["url"] + "/v1/" + method, data=body,
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        try:
            with self._opener.open(req, timeout=180) as response:
                raw = response.read(32*1024*1024+1)
        except urllib.error.HTTPError as error:
            payload = {}
            try:
                payload = json.loads(error.read(32000))
                message = str(payload.get("error", "Formnaro request failed"))[:3000].replace(token, "[redacted]")
            except (ValueError, AttributeError):
                message = "Formnaro request failed"
            safe = json.loads(json.dumps(payload).replace(token, "[redacted]")) if isinstance(payload, dict) else {}
            raise FormnaroError(message, code=safe.get("code"), status=error.code, feedback=safe.get("feedback")) from None
        except (OSError, urllib.error.URLError):
            raise RuntimeError("Formnaro local interface is unavailable") from None
        if len(raw) > 32*1024*1024:
            raise RuntimeError("Formnaro response exceeds 32 MB")
        # A misconfigured server must not echo authentication material.
        return json.loads(raw.decode("utf-8").replace(token, "[redacted]"))
