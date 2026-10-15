"""Run the Campus Customs team on tickets from the terminal.

From the hw5/ folder:
    .venv/bin/python -m backend.run_ticket 102            # one ticket
    .venv/bin/python -m backend.run_ticket 101 102 103    # several, in order
    .venv/bin/python -m backend.run_ticket --all          # every open ticket
Add --approve to be asked, in this terminal, to approve or reject each pending
payment request (a person types their own name). Without it, requests stay
pending for the board. Agents can never approve; only this human step can.
Reset the working copy before a full run (see README.md).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from fastmcp import Client
from fastmcp.client.transports import StdioTransport

from backend.audit import append_audit, now
from backend.config import MCP_SERVER_PATH, PROJECT_DIR, PYTHON
from backend.models import AuditEntry
from backend.team import Team


def _mcp_client() -> Client:
    return Client(StdioTransport(command=PYTHON, args=[str(MCP_SERVER_PATH)], cwd=str(PROJECT_DIR)))


async def _call(client: Client, tool: str, **args) -> dict:
    result = await client.call_tool(tool, args, raise_on_error=False)
    return result.data if isinstance(result.data, dict) else (result.structured_content or {})


async def human_approvals(run_id: str) -> None:
    """Ask the person at the keyboard about each pending request. Calls the human-only MCP tools."""
    async with _mcp_client() as client:
        pending = (await _call(client, "list_payment_requests", status="pending")).get("requests", [])
        if not pending:
            print("\nNo payment requests are waiting for approval.")
            return
        cash = await _call(client, "get_cash_balance")
        print(f"\nChecking balance: ${cash['balance']:,.2f}. Pending requests: {len(pending)}.")
        for req in pending:
            what = (f"{req['kind']} #{req['ref_id']}" if req["kind"] != "purchase_order"
                    else f"order {req['qty']} x {req['sku']} {req['size']} from vendor {req['vendor_id']}")
            print(f"\nRequest {req['id']} (ticket {req['ticket_id']}): {what}, ${req['amount']:,.2f}")
            print(f"  asked by {req['requested_by']}: {req['reason']}")
            answer = input("  Type your full name to APPROVE, 'r' to reject, or Enter to leave pending: ").strip()
            if not answer:
                continue
            if answer.lower() == "r":
                why = input("  Reason for rejecting: ").strip() or "rejected by a human"
                name = input("  Your name: ").strip() or "unknown"
                outcome = await _call(client, "reject_payment_request", request_id=req["id"], decided_by=name, reason=why)
            else:
                name = answer
                outcome = await _call(client, "approve_payment_request", request_id=req["id"], approved_by=name)
            print(f"  -> {outcome.get('message') or outcome}")
            append_audit(AuditEntry(
                ts=now(), run_id=run_id, ticket_id=req["ticket_id"], event="human_decision", agent="human",
                chain=["human"], note=f"request {req['id']}: {json.dumps(outcome, default=str)[:400]}",
            ))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Campus Customs agent team on tickets.")
    parser.add_argument("tickets", nargs="*", type=int, help="ticket ids, e.g. 101 102 103")
    parser.add_argument("--all", action="store_true", help="work every open ticket")
    parser.add_argument("--approve", action="store_true", help="ask a human to approve pending payments afterwards")
    args = parser.parse_args()

    async with Team() as team:
        ids = args.tickets
        if args.all:
            async with _mcp_client() as client:
                ids = [t["id"] for t in (await _call(client, "list_open_tickets"))["tickets"]]
        if not ids:
            parser.error("give ticket ids or --all")
        last_run = ""
        for ticket_id in ids:
            print(f"\n=== Ticket {ticket_id} ===")
            outcome, state = await team.run_ticket(ticket_id)
            last_run = state.run_id
            print(json.dumps(outcome.model_dump(), indent=2))
            print(f"(run {state.run_id}: {len(state.delegations)} delegations, {state.model_requests} model calls, "
                  f"{state.tokens_used:,} tokens)")

    if args.approve:
        if sys.stdin.isatty():
            await human_approvals(last_run)
        else:
            print("\n--approve needs a person at the keyboard; requests stay pending.")


if __name__ == "__main__":
    asyncio.run(main())
