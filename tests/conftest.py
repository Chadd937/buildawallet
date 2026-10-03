"""Shared pytest setup for Cloudflare Worker tests."""
import sys
import types


async def _unavailable_fetch(*args, **kwargs):
    raise RuntimeError("workers.fetch is unavailable in the local pytest runtime")


# The production Worker runtime provides both `asgi` and `fetch`. Unit tests only
# need an import-compatible stub; email delivery itself is monkeypatched in the
# HUMAN flow test.
sys.modules.setdefault(
    "workers",
    types.SimpleNamespace(
        asgi=types.SimpleNamespace(entrypoint=lambda app: None),
        fetch=_unavailable_fetch,
    ),
)
