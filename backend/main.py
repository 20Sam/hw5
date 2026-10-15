"""Campus Customs backend: the FastAPI routes the React board calls.

Start it from the backend/ folder (project venv active):
    uvicorn main:app --reload --port 8000
It then serves http://localhost:8000 (interactive docs at /docs).

Every shop fact and every change to shop data goes through the campus-customs MCP
server (one shared stdio connection), the same toolbox the agents use. Only one agent
run happens at a time, and the database can't be reset while a run is going.
"""

from __future__ import annotations

import asyncio
import filecmp
import json
import os
import shutil
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

# Started from backend/, so put hw5/ on the path to import the `backend` package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, HTTPException, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastmcp import Client  # noqa: E402
from fastmcp.client.transports import StdioTransport  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from backend.audit import append_audit, now  # noqa: E402
from backend.config import AUDIT_PATH, MCP_SERVER_PATH, PROJECT_DIR, PYTHON  # noqa: E402
from backend.models import AuditEntry  # noqa: E402
from backend.team import Team  # noqa: E402

ORIGINAL_DB = PROJECT_DIR / "data" / "campus_customs.db"
WORKING_DB = PROJECT_DIR / "data" / "campus_customs_new.db"
BOARD_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"]

RUNS: dict[str, dict[str, Any]] = {}   # run_id -> status, ticket, outcome (in memory; the audit trail is the record)
RUN_LOCK = asyncio.Lock()              # one agent run at a time
_TASKS: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = Client(StdioTransport(command=PYTHON, args=[str(MCP_SERVER_PATH)], cwd=str(PROJECT_DIR)))
    async with client:
        app.state.mcp = client
        yield


app = FastAPI(title="Campus Customs backend", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=BOARD_ORIGINS, allow_methods=["*"], allow_headers=["*"])


async def mcp(tool: str, **args: Any) -> dict[str, Any]:
    """Call one campus-customs MCP tool; tool errors become HTTP 400."""
    result = await app.state.mcp.call_tool(tool, args, raise_on_error=False)
    if result.is_error:
        raise HTTPException(400, " ".join(getattr(c, "text", "") for c in result.content) or f"{tool} failed")
    data = result.data if isinstance(result.data, dict) else result.structured_content
    return data or {}


def _active_run() -> str | None:
    return next((rid for rid, r in RUNS.items() if r["status"] == "running"), None)


# ----------------------------------------------------------------------------- index


@app.get("/")
async def index() -> dict:
    """What this backend offers."""
    return {
        "service": "Campus Customs backend",
        "routes": {
            "GET /tickets": "the three tickets and whether each is open or resolved",
            "POST /tickets/{ticket_id}/run": "run the agent team on one ticket (returns a run_id at once)",
            "GET /runs/{run_id}": "status and boss outcome of one run",
            "GET /events": "recent agent events: what each agent said and which tools it used",
            "GET /tickets/{ticket_id}/summary": "what each agent did on the latest run of that ticket",
            "GET /payments": "payment and purchase-order requests (pending by default)",
            "POST /payments/{request_id}/approve": "a human approves; the only route that moves cash",
            "POST /payments/{request_id}/reject": "a human rejects; no money moves",
            "GET /cash": "current checking balance from cash_accounts",
            "POST /reset": "reset the working database to the original values",
        },
        "docs": "/docs",
    }


# ----------------------------------------------------------------------------- 1. tickets


@app.get("/tickets")
async def tickets() -> dict:
    """The tickets with their status, plus a simple open / resolved state and the latest run."""
    data = await mcp("list_tickets")
    pending = (await mcp("list_payment_requests", status="pending")).get("requests", [])
    rows = []
    for t in data["tickets"]:
        last = next((r for r in reversed(RUNS.values()) if r["ticket_id"] == t["id"]), None)
        rows.append({
            "id": t["id"], "type": t["type"], "requester": t["requester"], "subject": t["subject"],
            "status": t["status"],
            "state": "resolved" if t["status"] == "resolved" else "open",
            "notes": t["notes"],
            "pending_requests": sum(1 for r in pending if r.get("ticket_id") == t["id"]),
            "last_run": {k: last[k] for k in ("run_id", "status")} if last else None,
        })
    return {"shop_today": data["shop_today"], "tickets": rows}


# ----------------------------------------------------------------------------- 2. run the team


async def _run_team(run_id: str, ticket_id: int) -> None:
    run = RUNS[run_id]
    async with RUN_LOCK:
        try:
            async with Team() as team:
                outcome, state = await team.run_ticket(ticket_id, run_id=run_id)
            run.update(status="done", outcome=outcome.model_dump(), delegations=len(state.delegations),
                       model_calls=state.model_requests, tokens=state.tokens_used)
            if outcome.ticket_status != "resolved":  # the board closes the ticket once the team's run is done
                await mcp("set_ticket_status", ticket_id=ticket_id, status="resolved", author="board",
                          reason=f"Team run {run_id} finished (boss left it {outcome.ticket_status}); "
                                 "any payment still waits for a human on the board.")
        except Exception as exc:  # noqa: BLE001 - surfaced to the board, details in the audit trail
            run.update(status="error", error=f"{type(exc).__name__}: {exc}"[:500])
        finally:
            run["finished_at"] = now()


@app.post("/tickets/{ticket_id}/run", status_code=202)
async def run_ticket(ticket_id: int, wait: bool = Query(False, description="wait for the outcome instead of polling")) -> dict:
    """Start the agent team on one ticket. Poll /events?run_id=... or /runs/{run_id} for progress."""
    known = {t["id"] for t in (await mcp("list_tickets"))["tickets"]}
    if ticket_id not in known:
        raise HTTPException(404, f"No ticket with id {ticket_id}.")
    if (busy := _active_run()) is not None:
        raise HTTPException(409, f"Run {busy} is still going; one run at a time.")
    run_id = uuid4().hex[:12]
    RUNS[run_id] = {"run_id": run_id, "ticket_id": ticket_id, "status": "running", "started_at": now()}
    task = asyncio.create_task(_run_team(run_id, ticket_id))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    if wait:
        await task
    return {**RUNS[run_id], "events_url": f"/events?run_id={run_id}", "run_url": f"/runs/{run_id}"}


def _audit() -> list[dict]:
    return json.loads(AUDIT_PATH.read_text(encoding="utf-8")) if AUDIT_PATH.exists() else []


TOOL_WORDS = {
    "list_open_tickets": "read the ticket", "check_stock_and_price": "checked stock and price",
    "check_invoice_hold": "checked the invoice hold", "get_rent_due": "checked the lease",
    "get_cash_balance": "checked cash", "find_vendors": "looked up vendors",
    "list_payment_requests": "checked payment requests", "list_drafts": "checked drafts",
    "request_payment": "requested a payment", "request_purchase_order": "requested a restock order",
    "add_ticket_note": "noted the ticket", "set_ticket_status": "set the status",
    "save_customer_draft": "saved a draft",
}


@app.get("/tickets/{ticket_id}/summary")
async def ticket_summary(ticket_id: int, run_id: str | None = Query(None, description="a specific run of this ticket")) -> dict:
    """What each agent did on one run of this ticket (default: the latest completed run), from the audit trail."""
    records = _audit()
    # The latest run of this ticket that the boss finished (a run whose boss loop failed is skipped).
    failed = {r["run_id"] for r in records if r.get("event") == "run_error" and r.get("depth") == 0}
    starts = [r for r in records if r.get("event") == "ticket_start" and r.get("ticket_id") == ticket_id
              and r["run_id"] not in failed]
    if run_id and any(r["run_id"] == run_id for r in starts):
        starts = [r for r in starts if r["run_id"] == run_id]
    if not starts:
        return {"ticket_id": ticket_id, "run_id": None, "agents": [], "outcome": None}
    run_id = starts[-1]["run_id"]
    agents: dict[str, dict] = {}
    for r in records:
        if r.get("run_id") != run_id or r.get("agent") in ("runner", "human"):
            continue
        a = agents.setdefault(r["agent"], {"agent": r["agent"], "asked_by": [], "tools": {}, "asked": [],
                                           "said": None, "tokens": 0, "steps": 0})
        if r["event"] == "run_start":
            chain = r.get("chain", [])
            asker = chain[-2] if len(chain) >= 2 else "human"
            if asker not in a["asked_by"]:
                a["asked_by"].append(asker)
        elif r["event"] == "step":
            a["steps"] += 1
            for c in r.get("tool_calls", []):
                if c["tool"] == "ask_teammate":
                    a["asked"].append(c.get("args", {}).get("teammate"))
                elif c["tool"] != "final_result":
                    a["tools"][c["tool"]] = a["tools"].get(c["tool"], 0) + 1
        elif r["event"] == "run_end":
            a["said"] = r.get("text")
            a["tokens"] += (r.get("input_tokens") or 0) + (r.get("output_tokens") or 0)
    outcome = next((x.get("outcome") for x in RUNS.values() if x["run_id"] == run_id), None)
    if outcome is None:  # after a restart: the boss's final answer is logged as its final_result tool call
        for r in records:
            if r.get("run_id") == run_id and r.get("agent") == "boss":
                for c in r.get("tool_calls", []):
                    if c["tool"] == "final_result":
                        outcome = {k: (v.split("... [+")[0] + "…" if isinstance(v, str) and "... [+" in v else v)
                                   for k, v in c.get("args", {}).items()}
    for a in agents.values():
        did = [TOOL_WORDS.get(t, t) for t in a["tools"]]
        if a["asked"]:
            did.append("asked " + ", ".join(dict.fromkeys(str(x).replace("_", " ") for x in a["asked"])))
        a["did"] = "; ".join(did) or "answered from what it was told"
        if a["agent"] == "boss" and outcome:
            a["said"] = outcome.get("decision")
    return {"ticket_id": ticket_id, "run_id": run_id, "outcome": outcome, "agents": list(agents.values())}


@app.get("/runs")
async def runs() -> dict:
    return {"runs": list(reversed(RUNS.values()))}


@app.get("/runs/{run_id}")
async def run_status(run_id: str) -> dict:
    if run_id not in RUNS:
        raise HTTPException(404, f"No run {run_id} since this server started (see /events for older runs).")
    return RUNS[run_id]


# ----------------------------------------------------------------------------- 3. agent events


def _event_view(index: int, r: dict) -> dict:
    return {
        "index": index, "ts": r.get("ts"), "run_id": r.get("run_id"), "ticket_id": r.get("ticket_id"),
        "event": r.get("event"), "agent": r.get("agent"), "chain": r.get("chain", []), "step": r.get("step"),
        "node": r.get("node"),
        "said": r.get("text"),
        "tools": [{"tool": c["tool"], "args": c.get("args", {})} for c in r.get("tool_calls", [])],
        "results": [{"tool": t["tool"], "content": t["content"]} for t in r.get("tool_results", [])],
        "tokens": {"input": r.get("input_tokens"), "output": r.get("output_tokens")} if r.get("input_tokens") else None,
        "note": r.get("note"),
    }


@app.get("/events")
async def events(
    run_id: str | None = None,
    ticket_id: int | None = None,
    since: int = Query(0, ge=0, description="only events at this index or later (use next_since to refresh)"),
    limit: int = Query(100, ge=1, le=500),
) -> dict:
    """Recent audit-trail events, newest last: what each agent said and which tools it called."""
    records = json.loads(AUDIT_PATH.read_text(encoding="utf-8")) if AUDIT_PATH.exists() else []
    picked = [
        (i, r) for i, r in enumerate(records)
        if i >= since and (run_id is None or r.get("run_id") == run_id)
        and (ticket_id is None or r.get("ticket_id") == ticket_id)
    ][-limit:]
    return {"count": len(picked), "next_since": len(records), "events": [_event_view(i, r) for i, r in picked]}


# ----------------------------------------------------------------------------- 4. human approval


class Approval(BaseModel):
    approved_by: str = Field(min_length=2, max_length=80, description="The full name of the person who clicked Approve.")


class Rejection(BaseModel):
    decided_by: str = Field(min_length=2, max_length=80)
    reason: str = Field(min_length=2, max_length=500)


@app.get("/payments")
async def payments(status: Literal["pending", "paid", "rejected", "all"] = "pending") -> dict:
    return await mcp("list_payment_requests", status=status)


@app.post("/payments/{request_id}/approve")
async def approve(request_id: int, body: Approval) -> dict:
    """A human approved on the board: pay it. Agents only prepare requests; this is what moves cash."""
    result = await mcp("approve_payment_request", request_id=request_id, approved_by=body.approved_by)
    append_audit(AuditEntry(ts=now(), run_id="board", event="human_decision", agent="human", chain=["human"],
                            note=f"approve request {request_id} by {body.approved_by}: {json.dumps(result, default=str)[:400]}"))
    if not result.get("ok"):
        raise HTTPException(409, result.get("message", "Refused."))
    return result


@app.post("/payments/{request_id}/reject")
async def reject(request_id: int, body: Rejection) -> dict:
    result = await mcp("reject_payment_request", request_id=request_id, decided_by=body.decided_by, reason=body.reason)
    append_audit(AuditEntry(ts=now(), run_id="board", event="human_decision", agent="human", chain=["human"],
                            note=f"reject request {request_id} by {body.decided_by}: {json.dumps(result, default=str)[:400]}"))
    if not result.get("ok"):
        raise HTTPException(409, result.get("message", "Refused."))
    return result


# ----------------------------------------------------------------------------- 5. cash


@app.get("/cash")
async def cash() -> dict:
    """The checking balance from cash_accounts, plus what pending requests have already promised."""
    return await mcp("get_cash_balance")


# ----------------------------------------------------------------------------- 6. reset


@app.post("/reset")
async def reset() -> dict:
    """Copy the read-only original over the working copy, for a fresh run. The audit trail is kept."""
    if (busy := _active_run()) is not None:
        raise HTTPException(409, f"Run {busy} is still going; reset after it finishes.")
    async with RUN_LOCK:
        for suffix in ("", "-journal", "-wal", "-shm"):
            Path(f"{WORKING_DB}{suffix}").unlink(missing_ok=True)
        shutil.copyfile(ORIGINAL_DB, WORKING_DB)
        os.chmod(WORKING_DB, 0o644)
        identical = filecmp.cmp(ORIGINAL_DB, WORKING_DB, shallow=False)
    append_audit(AuditEntry(ts=now(), run_id="board", event="db_reset", agent="human", chain=["human"],
                            note=f"working copy reset from the original; identical={identical}"))
    tickets_now = (await mcp("list_tickets"))["tickets"]
    return {"ok": identical, "message": "Working copy reset to the original values.",
            "tickets": [{"id": t["id"], "status": t["status"]} for t in tickets_now],
            "cash": await mcp("get_cash_balance")}
