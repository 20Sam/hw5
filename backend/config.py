"""Paths, limits and the one model every Campus Customs agent uses."""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

from dotenv import load_dotenv  # noqa: E402
from openai import AsyncOpenAI  # noqa: E402
from pydantic_ai.models.openai import OpenAIResponsesModel  # noqa: E402
from pydantic_ai.providers.openai import OpenAIProvider  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
PROMPTS_DIR = BACKEND_DIR / "prompts"
AUDIT_PATH = PROJECT_DIR / "output" / "audit_trail.json"
MCP_SERVER_PATH = PROJECT_DIR / "mcp_server" / "server.py"
PYTHON = sys.executable

# hw5/.env first; the workspace .env above it fills in anything missing (never overrides).
for env_dir in (PROJECT_DIR, PROJECT_DIR.parent, PROJECT_DIR.parent.parent):
    load_dotenv(env_dir / ".env")

# One model for every agent, on purpose: there is no override, so no other model can sneak in.
MODEL_NAME = "gpt-6-luna"  # the model Problem 5 requires for every agent
PROVIDER = "openai"
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"

# Limits that keep token use in check (see output/harness.md, "Limits").
MAX_DEPTH = 3                      # longest delegation thread: boss -> A -> B -> C
MAX_DELEGATIONS_PER_TICKET = 8     # ask_teammate calls across the whole team for one ticket
TEAM_TOKEN_BUDGET = 150_000        # all agents together, one ticket
AGENT_RUN_TOKEN_LIMIT = 45_000     # one agent's loop, one request
REQUEST_LIMITS = {"boss": 12}      # model calls in one agent loop
DEFAULT_REQUEST_LIMIT = 8
TRIM = 600                         # characters of text kept per audit field


def api_key() -> str:
    key = os.getenv("PORTKEY_API_KEY", "").strip()
    if not key or key.startswith(("your-", "replace")):
        raise RuntimeError("PORTKEY_API_KEY is not set. Put it in hw5/.env (see .env.example).")
    return key


@lru_cache(maxsize=1)
def build_model() -> OpenAIResponsesModel:
    """gpt-6-luna through Portkey (OpenAI provider, Responses API). The key is never logged.

    gpt-6-luna only accepts tool calls on the Responses API (/v1/responses), not chat completions.
    """
    key = api_key()
    client = AsyncOpenAI(
        api_key=key,
        base_url=PORTKEY_BASE_URL,
        default_headers={"x-portkey-api-key": key, "x-portkey-provider": PROVIDER},
        timeout=180.0,
        max_retries=1,
    )
    return OpenAIResponsesModel(MODEL_NAME, provider=OpenAIProvider(openai_client=client))


def load_prompt(file_name: str) -> str:
    return (PROMPTS_DIR / file_name).read_text(encoding="utf-8")
