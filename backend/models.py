"""Data types for the Campus Customs agent team."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

AgentRole = Literal["boss", "inventory", "accounting", "facilities", "customer_service"]
ROLES: tuple[AgentRole, ...] = ("boss", "inventory", "accounting", "facilities", "customer_service")
TicketStatus = Literal["open", "waiting_approval", "resolved"]


class AgentProfile(BaseModel):
    """One seat on the team: who it is, what it owns, which MCP tools it may call."""

    role: AgentRole
    title: str
    owns: str
    prompt_file: str
    mcp_tools: list[str]


class TicketOutcome(BaseModel):
    """The boss's final call on one ticket, shown on the board."""

    ticket_id: int
    summary: str = Field(description="What the team found, in two to four plain sentences with the key numbers.")
    decision: str = Field(description="The boss's final call and why, including any discount or payment choice.")
    ticket_status: TicketStatus = Field(description="The status the boss set on the ticket.")
    payment_request_ids: list[int] = Field(default_factory=list, description="Pending requests a human must approve.")
    draft_ids: list[int] = Field(default_factory=list, description="Message drafts saved for the board.")
    human_next_steps: list[str] = Field(default_factory=list, description="What a person has to do next.")


class Delegation(BaseModel):
    """One ask_teammate call: who asked whom for what, and the reply."""

    from_agent: AgentRole
    to_agent: AgentRole
    request: str
    reply: str | None = None
    status: Literal["running", "done", "refused", "error"] = "running"
    depth: int


class AuditToolCall(BaseModel):
    tool: str
    call_id: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)


class AuditToolResult(BaseModel):
    tool: str
    call_id: str | None = None
    content: str


class AuditEntry(BaseModel):
    """One line of output/audit_trail.json. Appended, never rewritten or wiped."""

    ts: str = Field(description="Real wall-clock time (UTC) the record was written.")
    run_id: str = Field(description="One id per ticket run; every agent in that run shares it.")
    ticket_id: int | None = None
    event: Literal["ticket_start", "run_start", "step", "delegation", "run_end", "run_error",
                   "ticket_end", "human_decision", "db_reset"]
    agent: AgentRole | Literal["human", "runner"]
    chain: list[str] = Field(default_factory=list, description="human -> boss -> ... -> this agent")
    depth: int = 0
    step: int | None = None
    node: str | None = Field(None, description="Pydantic AI loop node: UserPromptNode, ModelRequestNode, CallToolsNode, End")
    model: str | None = None
    text: str | None = Field(None, description="What the model said in this step (trimmed).")
    tool_calls: list[AuditToolCall] = Field(default_factory=list)
    tool_results: list[AuditToolResult] = Field(default_factory=list)
    input_tokens: int | None = None
    output_tokens: int | None = None
    note: str | None = None
