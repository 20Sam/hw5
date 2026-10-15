"""The Campus Customs agent team: boss, inventory, accounting, facilities, customer service.

Every agent is a Pydantic AI agent on gpt-6-luna (backend/config.py) with:
  - the shop tools it needs, served by the campus-customs MCP server over the working copy
    (one shared MCP connection, filtered per role; the human-only approval tools are never
    given to any agent), and
  - ask_teammate(teammate, request): delegate to ANY other agent (full connectivity).

Guards keep delegation finite: no asking yourself or anyone already waiting in the thread
(no A -> B -> A loops), threads at most MAX_DEPTH hops deep, a team-wide cap on delegations,
and a team-wide token budget. Every agent loop step is appended to output/audit_trail.json.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from pydantic_ai import Agent, FunctionToolset, RunContext, UsageLimitExceeded, UsageLimits
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.messages import RetryPromptPart, TextPart, ToolCallPart, ToolReturnPart, UserPromptPart

from backend.audit import append_audit, now
from backend.config import (
    AGENT_RUN_TOKEN_LIMIT, DEFAULT_REQUEST_LIMIT, MAX_DELEGATIONS_PER_TICKET, MAX_DEPTH, MCP_SERVER_PATH,
    PROJECT_DIR, PYTHON, REQUEST_LIMITS, TEAM_TOKEN_BUDGET, TRIM, build_model, load_prompt,
)
from backend.models import (
    ROLES, AgentProfile, AgentRole, AuditEntry, AuditToolCall, AuditToolResult, Delegation, TicketOutcome,
)

# Least privilege: each role sees only the MCP tools its job needs.
PROFILES: dict[str, AgentProfile] = {
    p.role: p
    for p in [
        AgentProfile(
            role="boss", title="Boss", prompt_file="boss.md",
            owns="reads each ticket, routes the work, checks the numbers, makes the final call",
            mcp_tools=["list_open_tickets", "get_cash_balance", "list_payment_requests", "list_drafts",
                       "check_stock_and_price", "check_invoice_hold", "get_rent_due",
                       "add_ticket_note", "set_ticket_status"],
        ),
        AgentProfile(
            role="inventory", title="Inventory", prompt_file="inventory.md",
            owns="stock by SKU and size, shortfalls, which vendors can restock and how fast",
            mcp_tools=["list_open_tickets", "check_stock_and_price", "find_vendors", "check_invoice_hold",
                       "add_ticket_note"],
        ),
        AgentProfile(
            role="accounting", title="Accounting", prompt_file="accounting.md",
            owns="cash, invoices, margins; prepares payment and purchase-order requests for human approval",
            mcp_tools=["list_open_tickets", "get_cash_balance", "check_invoice_hold", "get_rent_due",
                       "check_stock_and_price", "list_payment_requests", "request_payment",
                       "request_purchase_order", "add_ticket_note"],
        ),
        AgentProfile(
            role="facilities", title="Facilities", prompt_file="facilities.md",
            owns="the shop space: lease, rent amount and due date, the landlord",
            mcp_tools=["list_open_tickets", "get_rent_due", "get_cash_balance", "list_payment_requests",
                       "list_drafts", "save_customer_draft", "add_ticket_note"],
        ),
        AgentProfile(
            role="customer_service", title="Customer service", prompt_file="customer_service.md",
            owns="drafts messages to customers (and the landlord or a vendor when asked); never sends",
            mcp_tools=["list_open_tickets", "check_stock_and_price", "list_drafts", "save_customer_draft",
                       "add_ticket_note"],
        ),
    ]
}
HUMAN_ONLY_TOOLS = {"approve_payment_request", "reject_payment_request"}
assert not any(HUMAN_ONLY_TOOLS & set(p.mcp_tools) for p in PROFILES.values()), "agents may never approve"


def _short(value: Any, limit: int = TRIM) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit] + f"... [+{len(text) - limit} chars]"


def _short_args(args: dict[str, Any]) -> dict[str, Any]:
    return {k: _short(v, 300) if isinstance(v, str) else v for k, v in args.items()}


async def _stamp_caller(ctx: RunContext["AgentDeps"], call_tool, name: str, args: dict[str, Any]):
    """Every author / requested_by the database records is the agent that really made the call."""
    for key in ("author", "requested_by"):
        if key in args:
            args[key] = ctx.deps.role
    return await call_tool(name, args)


@dataclass
class TeamState:
    """Shared by every agent working one ticket."""

    ticket_id: int
    run_id: str = field(default_factory=lambda: uuid4().hex[:12])
    delegations: list[Delegation] = field(default_factory=list)
    tokens_used: int = 0
    model_requests: int = 0


@dataclass
class AgentDeps:
    state: TeamState
    role: AgentRole
    chain: tuple[str, ...]  # from the first agent down to this one (includes self)


class Team:
    """Five agents sharing one MCP connection. Use `async with Team() as team:`."""

    def __init__(self) -> None:
        transport = StdioTransport(command=PYTHON, args=[str(MCP_SERVER_PATH)], cwd=str(PROJECT_DIR))
        self.mcp = MCPToolset(Client(transport), max_retries=2, process_tool_call=_stamp_caller)
        self.team_tools = self._build_team_tools()
        self.agents: dict[str, Agent] = {role: self._build_agent(role) for role in ROLES}

    async def __aenter__(self) -> "Team":
        await self.mcp.__aenter__()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.mcp.__aexit__(*exc)

    # ------------------------------------------------------------ building

    def _build_team_tools(self) -> FunctionToolset:
        toolset: FunctionToolset = FunctionToolset()

        @toolset.tool
        async def ask_teammate(ctx: RunContext[AgentDeps], teammate: AgentRole, request: str) -> str:
            """Hand a piece of work to another agent on the team and wait for their answer.

            Args:
                teammate: boss, inventory, accounting, facilities, or customer_service.
                request: Exactly what you need back, with the ticket id and any SKU, size, quantity,
                    invoice id or lease id they need. One clear request.
            """
            return await self._delegate(ctx.deps, teammate, request)

        return toolset

    def _build_agent(self, role: str) -> Agent:
        allowed = set(PROFILES[role].mcp_tools)
        shop_tools = self.mcp.filtered(lambda ctx, tool_def, allowed=allowed: tool_def.name in allowed)
        return Agent(
            build_model(),
            name=role,
            deps_type=AgentDeps,
            output_type=TicketOutcome if role == "boss" else str,
            toolsets=[shop_tools, self.team_tools],
            retries=2,
        )

    def _instructions(self, role: str, state: TeamState, chain: tuple[str, ...]) -> str:
        teammates = "\n".join(
            f"- `{p.role}`: {p.owns}" + ("  (you)" if p.role == role else "") for p in PROFILES.values()
        )
        thread = " -> ".join(["human", *chain])
        return (
            f"{load_prompt(PROFILES[role].prompt_file)}\n\n"
            f"## Right now\n"
            f"- You are `{role}`, working on ticket {state.ticket_id}. Thread: {thread}.\n"
            f"- Your MCP shop tools: {', '.join(PROFILES[role].mcp_tools)}; plus `ask_teammate`.\n"
            f"- Team:\n{teammates}\n"
            f"- Do not ask anyone already in the thread. Delegations left for the team: "
            f"{max(0, MAX_DELEGATIONS_PER_TICKET - len(state.delegations))}; depth left in this thread: "
            f"{max(0, MAX_DEPTH - (len(chain) - 1))}; team tokens left: about "
            f"{max(0, TEAM_TOKEN_BUDGET - state.tokens_used)}.\n"
            f"- Where a tool asks for `author` or `requested_by`, use `{role}`."
        )

    # ------------------------------------------------------------ running

    async def _delegate(self, deps: AgentDeps, teammate: str, request: str) -> str:
        state, me = deps.state, deps.role
        refusal = None
        if teammate not in PROFILES:
            refusal = f"Unknown teammate '{teammate}'."
        elif teammate == me:
            refusal = "That's you. Work it out yourself or ask someone else."
        elif teammate in deps.chain:
            refusal = f"{teammate} is already in this thread waiting on you. Answer with what you have."
        elif len(deps.chain) - 1 >= MAX_DEPTH:
            refusal = "This thread is as deep as it can go. Answer with what you have."
        elif len(state.delegations) >= MAX_DELEGATIONS_PER_TICKET:
            refusal = "The team's delegation budget for this ticket is used up. Answer with what you have."
        elif state.tokens_used >= TEAM_TOKEN_BUDGET:
            refusal = "The team's token budget for this ticket is used up. Answer with what you have."

        delegation = Delegation(from_agent=me, to_agent=teammate if teammate in PROFILES else me,
                                request=request, depth=len(deps.chain))
        if refusal:
            delegation.status, delegation.reply = "refused", refusal
        state.delegations.append(delegation)
        append_audit(AuditEntry(
            ts=now(), run_id=state.run_id, ticket_id=state.ticket_id, event="delegation", agent=me,
            chain=["human", *deps.chain], depth=len(deps.chain) - 1,
            text=_short(request), note=f"ask_teammate -> {teammate}" + (f" REFUSED: {refusal}" if refusal else ""),
        ))
        if refusal:
            return refusal

        reply = await self.run_agent(teammate, f"Request from {me}:\n{request}", state, chain=deps.chain)
        delegation.reply = _short(reply, 2000)
        delegation.status = "error" if reply.startswith("[error]") else "done"
        return f"{teammate} replies:\n{reply}"

    async def run_agent(self, role: str, prompt: str, state: TeamState, chain: tuple[str, ...] = ()) -> Any:
        """One agent's loop, traced step by step. Delegated runs return text even on failure."""
        my_chain = (*chain, role)
        deps = AgentDeps(state=state, role=role, chain=my_chain)
        token_cap = max(5_000, min(AGENT_RUN_TOKEN_LIMIT, TEAM_TOKEN_BUDGET - state.tokens_used))
        limits = UsageLimits(request_limit=REQUEST_LIMITS.get(role, DEFAULT_REQUEST_LIMIT), total_tokens_limit=token_cap)
        base = dict(run_id=state.run_id, ticket_id=state.ticket_id, agent=role,
                    chain=["human", *my_chain], depth=len(my_chain) - 1)
        append_audit(AuditEntry(ts=now(), event="run_start", text=_short(prompt),
                                note=f"limits: {limits.request_limit} model calls, {token_cap} tokens", **base))
        try:
            output, usage = await self._run_traced(role, prompt, deps, limits, base)
        except Exception as exc:  # noqa: BLE001 - every failure is audited
            append_audit(AuditEntry(ts=now(), event="run_error", note=f"{type(exc).__name__}: {_short(str(exc), 400)}", **base))
            if not chain:
                raise
            kind = "hit its limit" if isinstance(exc, UsageLimitExceeded) else "failed"
            return f"[error] {role} {kind}: {type(exc).__name__}: {_short(str(exc), 300)}"
        state.tokens_used += usage.input_tokens + usage.output_tokens
        state.model_requests += usage.requests
        append_audit(AuditEntry(
            ts=now(), event="run_end", text=_short(output.model_dump() if hasattr(output, "model_dump") else output),
            input_tokens=usage.input_tokens, output_tokens=usage.output_tokens,
            note=f"{usage.requests} model calls, {usage.tool_calls} tool calls; team tokens so far {state.tokens_used}",
            **base,
        ))
        return output

    async def _run_traced(self, role: str, prompt: str, deps: AgentDeps, limits: UsageLimits, base: dict):
        agent = self.agents[role]
        step = 0
        async with agent.iter(prompt, deps=deps, instructions=self._instructions(role, deps.state, deps.chain),
                              usage_limits=limits) as run:
            async for node in run:
                step += 1
                entry = AuditEntry(ts=now(), event="step", step=step, node=type(node).__name__, **base)
                if Agent.is_user_prompt_node(node):
                    entry.text = _short(node.user_prompt)
                elif Agent.is_model_request_node(node):
                    for part in node.request.parts:
                        if isinstance(part, ToolReturnPart):
                            entry.tool_results.append(AuditToolResult(
                                tool=part.tool_name, call_id=part.tool_call_id, content=_short(part.content)))
                        elif isinstance(part, RetryPromptPart):
                            entry.tool_results.append(AuditToolResult(
                                tool=part.tool_name or "retry", call_id=part.tool_call_id,
                                content="RETRY: " + _short(part.content)))
                        elif isinstance(part, UserPromptPart):
                            entry.text = _short(part.content)
                elif Agent.is_call_tools_node(node):
                    resp = node.model_response
                    entry.model = resp.model_name
                    said = " ".join(p.content for p in resp.parts if isinstance(p, TextPart)).strip()
                    entry.text = _short(said) if said else None
                    entry.tool_calls = [
                        AuditToolCall(tool=p.tool_name, call_id=p.tool_call_id, args=_short_args(p.args_as_dict()))
                        for p in resp.parts if isinstance(p, ToolCallPart)
                    ]
                    entry.input_tokens, entry.output_tokens = resp.usage.input_tokens, resp.usage.output_tokens
                elif Agent.is_end_node(node):
                    out = node.data.output
                    entry.text = _short(out.model_dump() if hasattr(out, "model_dump") else out)
                append_audit(entry)
            result = run.result
        usage = result.usage() if callable(result.usage) else result.usage
        return result.output, usage

    async def run_ticket(self, ticket_id: int, run_id: str | None = None) -> tuple[TicketOutcome, TeamState]:
        """The boss works one ticket end to end, delegating as needed."""
        state = TeamState(ticket_id=ticket_id, **({"run_id": run_id} if run_id else {}))
        append_audit(AuditEntry(ts=now(), run_id=state.run_id, ticket_id=ticket_id, event="ticket_start",
                                agent="runner", note="boss starts the ticket"))
        prompt = (f"Work ticket {ticket_id} from start to finish: read it with list_open_tickets, route the "
                  f"work to your team, check the key numbers, make the final call, record it on the ticket, "
                  f"and return your outcome.")
        try:
            outcome = await self.run_agent("boss", prompt, state)
        finally:
            append_audit(AuditEntry(
                ts=now(), run_id=state.run_id, ticket_id=ticket_id, event="ticket_end", agent="runner",
                note=f"{len(state.delegations)} delegations, {state.model_requests} model calls, "
                     f"{state.tokens_used} tokens",
            ))
        return outcome, state
