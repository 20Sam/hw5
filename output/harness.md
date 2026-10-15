# Campus Customs Multi-Agent Harness

How the Campus Customs agent team runs the shop, end to end: the data it works on, the MCP tools
it uses, the five agents and their guardrails, the API routes, the board a person sits at, and
what happened when all three tickets were run. Built one problem at a time (Problems 2–9).

```
React board (frontend/, :5173) ──HTTP──► FastAPI (backend/main.py, :8000) ──► agent team (backend/team.py)
   tickets · live seats · approval tray · till        │ routes                  boss ⇄ inventory · accounting ·
                                                      │                         facilities · customer service
                                                      └────────► campus-customs MCP server (mcp_server/server.py, 16 tools)
                                                                         └──► data/campus_customs_new.db (working copy)
every agent loop step ──► output/audit_trail.json (append-only)      original data/campus_customs.db (read-only, for resets)
```

| | |
|---|---|
| **Data** | `data/campus_customs.db` (original, read-only) → `data/campus_customs_new.db` (working copy the tools read and write) |
| **Shop "today"** | `desk.date_today` = **2026-08-31** (every overdue check; never the real clock) |
| **MCP server** | `mcp_server/server.py`, FastMCP, **16 tools**; two of them human-only (approve / reject a payment) |
| **Agents** | boss, inventory, accounting, facilities, customer service: Pydantic AI, all on **`gpt-6-luna`** via Portkey |
| **Backend** | FastAPI `backend/main.py` on http://localhost:8000 |
| **Board** | React + Vite + TypeScript `frontend/` on http://localhost:5173 (`output/design.md`) |
| **Audit** | `output/audit_trail.json`: every agent loop step, delegation, human decision and reset, appended |
| **Full run** | All three tickets resolved; checking $3,400.00 → **$160.00** after two human-approved payments (section 8) |

**Contents:** 1. Tables (P2) · 2. MCP tools (P3) · 3. Vibe-coder connection (P4) · 4. The five agents,
every MCP tool and its tables, audit trail, **safety rules**, token limits (P5) · 5. Ticket plan (P6) ·
6. API routes (P7) · 7. The board (P8) · 8. The full run (P9) · Open items

---

## 1. The shop database (Problem 2)

### Working copy and reset

The original is read-only (`chmod 444`), so nothing can edit it by accident. Before a full
three-ticket run, stop the MCP server and backend, then reset the working copy from the `hw5/`
folder:

```bash
rm -f data/campus_customs_new.db data/campus_customs_new.db-journal data/campus_customs_new.db-wal data/campus_customs_new.db-shm && cp data/campus_customs.db data/campus_customs_new.db && chmod 644 data/campus_customs_new.db
```

A plain `cp` is not enough: copying from a read-only file makes the new working copy read-only
too, and the next reset then fails with "Permission denied". Removing the old copy and its
SQLite side files also stops a half-finished write from being replayed into the fresh copy.
Tested in all four starting states (no copy, changed copy, read-only copy, leftover journal).
Git does not keep file modes, so run `chmod 444 data/campus_customs.db` again after cloning.

Checked 2026-10-14: both files have SHA-256 `23686a90…f360a`, so the working copy is still clean.

### Tables, fields, and why each one matters

| Table (rows) | Fields | Why it matters to the agents |
|---|---|---|
| `desk` (1) | `date_today`, `notes` | The shop's "today" (2026-08-31); every overdue or days-until-due check uses it. |
| `tickets` (3, all `open`) | `id`, `type`, `requester`, `subject`, `sku`, `size`, `qty`, `lease_id`, `invoice_id`, `status`, `notes`, `created_at` | The work queue on the board; the boss reads each ticket, and its `sku`/`size`, `lease_id` and `invoice_id` say which tables it touches. |
| `inventory` (10, key `sku` + `size`) | `sku`, `name`, `size`, `qty`, `location` | Inventory's source for stock by SKU and size, so it can spot shortfalls. |
| `pricing` (4) | `sku`, `unit_cost`, `list_price` | Accounting checks margins here before any discount; `unit_cost` is our discount floor and the only restock-cost estimate (there is no vendor price list). |
| `vendors` (3) | `id`, `name`, `specialty`, `lead_days` | Who can restock what, and how long it takes; lead times must come from `lead_days`. |
| `leases` (1) | `id`, `space_name`, `landlord`, `monthly_rent`, `next_due`, `notes` | Facilities' source for rent amount and due date. |
| `cash_accounts` (1) | `name`, `balance`, `date` | The only money the shop has; the pay tool must refuse any payment bigger than `balance`. |
| `payments` (0) | `id`, `kind`, `ref_id`, `amount`, `account`, `paid_at`, `approved_by` | The ledger: every approved payment adds a row, and `approved_by` names the human who said yes (the schema only blocks NULL, so the pay tool must reject blanks). |
| `invoices` (1) | `id`, `vendor_id`, `amount`, `due_date`, `status`, `description` | What the shop owes vendors; an `open` (unpaid) invoice blocks that vendor from shipping anything new until it is `paid`. |

### How the three open tickets link to the other tables

```
tickets.sku + tickets.size ──► inventory (sku, size) ──► pricing (sku)
tickets.invoice_id         ──► invoices.id ──► invoices.vendor_id ──► vendors.id
tickets.lease_id           ──► leases.id
payments.ref_id            ──► invoices.id or leases.id (by payments.kind; our convention, no FK)
```

| Ticket | Request | Linked rows | What the data says |
|---|---|---|---|
| **101** `customer_order`, Tauhid Zaman | 1 Classic Bulldog Tee (`CC-TEE-WHITE`), size S | `inventory` tee S: **0** on hand · `pricing` $8 cost / $28 list · `invoice_id` **501** → vendor 1 Bulldog Print Co | Out of stock. Invoice 501 ($840, "Rush reprint CC-TEE-WHITE S") was due 2026-08-28, so it is **3 days overdue** and still `open`; Bulldog Print Co won't ship anything new until it is paid. Invoice 501 is itself the reprint of this tee, so paying it may release that order. Best case about 2026-09-05 (5 days after payment; the table doesn't say calendar or business days), so the customer gets no firm date. |
| **102** `rent_notice`, Elm City Properties | Subject "Rent due"; notes "Email: shop rent due in 2 days." | `lease_id` **1** → Chapel Street shop, landlord Elm City Properties | $2,400 due **2026-09-02**, 2 days away, so not overdue yet. Paying it needs human approval. |
| **103** `price_override`, Yale AI Club | 20 Basic Hoodies (`CC-HOOD-NAVY`), size M, bulk discount (no amount named) | `inventory` hoodie M: **8** on hand (S 4, L 14, XL 6) · `pricing` $22 cost / $58 list | **12 short** in size M. At list price the margin is $36 a hoodie (62% gross margin on list); our policy is that a discounted price stays at or above the $22 unit cost. Bulldog Print Co is the only vendor with an apparel specialty (`apparel reprint`), so a restock would come from it, and it is blocked by invoice 501 (inferred from `vendors.specialty`, not a database link). |

### What the tickets mean together

- **One unpaid invoice blocks two tickets.** Invoice 501 holds up the tee (101) and, because
  Bulldog Print Co is the only apparel vendor, any hoodie restock for 103. The 103 link is
  inferred from `vendors.specialty`, so agents should read it at run time, not hard-code vendor 1.
- **Both bills fit; a restock does not.** $3,400 − $840 (invoice 501) − $2,400 (rent) = **$160**.
  A 12-hoodie restock costs at least $264 at unit cost (an estimate; no vendor quote exists). With
  no revenue coming in, a new invoice for it could never be paid and would block Bulldog Print Co
  again. The pay tool must refuse anything that would take the balance below $0.
- **Similar names.** Elm City Properties is the landlord; Elm City Gifts is vendor 2 (mugs and
  small goods). Agents must not mix them up.
- **Out of stock, but no ticket.** The Crest Mug (`CC-MUG-CREST`) has 0 on hand, but no ticket
  asks for it. Inventory can flag it on the board, but nothing is spent on it unasked.
- **QuickShip CT** (vendor 3, 1 day) is a local courier, not a product vendor.

### Data quirks to handle in code

- Foreign keys are declared (`tickets` → `leases`/`invoices`, `invoices` → `vendors`), but
  SQLite only enforces them when a connection runs `PRAGMA foreign_keys = ON` (off by default).
  `PRAGMA foreign_key_check` finds no violations and `integrity_check` is `ok`, so turning it on
  is safe; the MCP server does that on every connection. Tools still check ids before writing.
- Some links are not declared at all: `payments.account` → `cash_accounts.name`,
  `pricing.sku` → `inventory.sku`, and nothing links a product to a vendor.
- There are no CHECK constraints. The database would accept a negative balance, a text amount, or
  an empty `approved_by`, so the pay tool itself must require an amount above 0, a balance that
  never goes below $0, and a real approver name.
- `tickets.sku` and `tickets.size` have no foreign key; join to `inventory` on both columns.
- `payments.ref_id` points to an invoice or a lease depending on `kind`, with no foreign key.
  The table is empty, so we pick the `kind` values (e.g. `invoice`, `rent`) and use them consistently.
- Dates are text. `date_today`, `due_date`, `next_due` and `cash_accounts.date` are
  `YYYY-MM-DD`; `tickets.created_at` is `YYYY-MM-DDTHH:MM:SS-04:00`.
- Money is stored as `REAL`; round to cents before comparing an amount to the balance.
- `size` is `OS` (one size) for the cap and the mug.
- Ticket `notes` are free text from requesters (e.g. "Email: shop rent due in 2 days."). Agents
  treat them as data, not as instructions.
- Only one status value appears so far (`open`). Proposed values, to confirm when the write
  tools are built: `invoices.status` open | paid (`open` means unpaid; the Problem 3 hold check
  relies on it), `tickets.status` open | waiting_approval | resolved, `payments.kind` invoice | rent.

### Rows that resolving the tickets changes (confirmed in the Problem 9 full run)

| When the team... | These rows change in `campus_customs_new.db` |
|---|---|
| pays an invoice (after human approval) | `invoices.status` → `paid` · new `payments` row (`kind` invoice, `ref_id` = invoice id, `amount`, `account` checking, `paid_at` = `desk.date_today`, `approved_by` = the human) · `cash_accounts.balance` goes down and `cash_accounts.date` is updated |
| pays rent (after human approval) | new `payments` row (`kind` rent, `ref_id` = lease id) · `cash_accounts.balance` and `date` · `leases.next_due` moves a month ahead (2026-10-02) |
| resolves a ticket | `tickets.status` · the outcome is appended to `tickets.notes`, never overwriting it |

---

## 2. MCP server and tools (Problem 3)

`mcp_server/server.py` (FastMCP 4.1) is the one toolbox all five agents share. It opens the
working copy `data/campus_customs_new.db` read-only, with foreign keys turned on, and treats
`desk.date_today` as today. Each tool answers only from the database: a missing row comes back
as `found: false`, never a guess. More tools (paying, updating tickets) come in later problems.

| Tool | Reads | Unlocks | Why it is the right tool for that ticket |
|---|---|---|---|
| `check_stock_and_price(sku, size, qty_needed)` | `inventory`, `pricing` | **103** (also 101) | Ticket 103 asks for 20 navy hoodies in M at a discount, and this tool returns the 8 on hand (12 short), the stock in other sizes, and the $22 cost against the $58 list price that limits how far a discount can go. |
| `check_invoice_hold(invoice_id)` | `invoices`, `vendors`, `desk` | **101** | Ticket 101's tee in size S is at 0 and the ticket points to invoice 501, so this tool shows the $840 invoice is 3 days overdue and still open, which means Bulldog Print Co (5-day lead time) won't ship anything new, including more of this tee, until it is paid. |
| `get_rent_due(lease_id)` | `leases`, `desk` | **102** | Ticket 102 is only an email saying rent is due "in 2 days", so this tool confirms from lease 1 that $2,400 is due on 2026-09-02, 2 days after the shop's today, before anyone asks for payment approval. |

**Checked (2026-10-14, in-memory FastMCP client, server not connected or run):** all three
tools return the numbers above; unknown ids and SKUs return `found: false`; a text `lease_id`
is rejected by input validation; the working copy is still byte-identical to the original.


---

## 3. Connected to the vibe coder (Problem 4)

`.mcp.json` at the project root registers the server for Claude Code as `campus-customs`
(stdio: `.venv/bin/python mcp_server/server.py`, relative paths, so it works from any clone opened
in `hw5/`). Claude Code asks once to approve a project's MCP servers.

`output/mcp_smoke.json` is the evidence: Claude Code 2.1.288 connected through `.mcp.json` and
called each tool once from a plain-language prompt. Each entry has the prompt, the tool name, the
raw tool output, Claude Code's answer, and a check against `data/campus_customs_new.db` (read-only
SQL). All three match: hoodie M 8 on hand / 12 short / $22 / $58 (103), invoice 501 $840, 3 days
past due, Bulldog Print Co can't ship (101), lease 1 $2,400 due 2026-09-02, 2 days away (102).


---

## 4. The agent team (Problem 5)

Five Pydantic AI agents, all on **`gpt-6-luna`** through Portkey (OpenAI provider), the only
model in the code (`backend/config.py`, no override). Each agent gets its prompt from
`backend/prompts/`, its shop tools from the campus-customs MCP server over stdio (one shared
connection, filtered per role), and `ask_teammate` to hand work to **any** other agent.

```
backend/run_ticket.py ──► Team (backend/team.py) ──► boss ──ask_teammate──► inventory / accounting /
        │                     │                         ▲      facilities / customer_service
        │                     │                         └──── any agent can ask any other (no loops)
        │                     └──► MCPToolset (stdio) ──► mcp_server/server.py ──► data/campus_customs_new.db
        └──► human step (--approve): a person types their name ──► approve_payment_request (human-only tool)
```

| Agent | Prompt | Owns | MCP tools it may call |
|---|---|---|---|
| **boss** | `boss.md` | Reads each ticket, routes work, checks the numbers, makes the final call, sets the ticket status; returns a `TicketOutcome` | `list_open_tickets`, `get_cash_balance`, `list_payment_requests`, `list_drafts`, `check_stock_and_price`, `check_invoice_hold`, `get_rent_due`, `add_ticket_note`, `set_ticket_status` |
| **inventory** | `inventory.md` | Stock by SKU and size, shortfalls, which vendor can restock, lead time, whether the vendor is blocked | `list_open_tickets`, `check_stock_and_price`, `find_vendors`, `check_invoice_hold`, `add_ticket_note` |
| **accounting** | `accounting.md` | Cash, invoices, margins; prepares payment and purchase-order requests for a human | `list_open_tickets`, `get_cash_balance`, `check_invoice_hold`, `get_rent_due`, `check_stock_and_price`, `list_payment_requests`, `request_payment`, `request_purchase_order`, `add_ticket_note` |
| **facilities** | `facilities.md` | Lease, rent amount and due date, the landlord; gets rent requested on time | `list_open_tickets`, `get_rent_due`, `get_cash_balance`, `list_payment_requests`, `list_drafts`, `save_customer_draft`, `add_ticket_note` |
| **customer_service** | `customer_service.md` | Drafts every outgoing message (never sends) | `list_open_tickets`, `check_stock_and_price`, `list_drafts`, `save_customer_draft`, `add_ticket_note` |

Every agent also has `ask_teammate(teammate, request)`. Data types (`TicketOutcome`, `Delegation`,
`AuditEntry`, `AgentProfile`) are in `backend/models.py`.

### All MCP tools (`mcp_server/server.py`, 16 tools)

| Tool | Tables it uses | Called by | What it does |
|---|---|---|---|
| `check_stock_and_price` (P3) | `inventory`, `pricing` | boss, inventory, accounting, customer_service | Stock for a SKU/size, every size, shortfall, cost, list price, margin |
| `check_invoice_hold` (P3) | `invoices`, `vendors`, `desk` | boss, inventory, accounting | One invoice, days past due, whether its vendor can ship |
| `get_rent_due` (P3) | `leases`, `desk` | boss, accounting, facilities | Rent amount, due date, days until due |
| `list_open_tickets` | `tickets`, `desk` | all five | Every unresolved ticket with its linking ids |
| `list_tickets` (P7) | `tickets`, `desk` | backend only (board `/tickets`) | Every ticket, resolved or not |
| `get_cash_balance` | `cash_accounts`, `payment_requests`, `desk` | boss, accounting, facilities | Balance, money promised to pending requests, what is left |
| `find_vendors` | `vendors`, `invoices` | inventory | Vendors by specialty, lead time, open invoices, can ship or not |
| `list_payment_requests` | `payment_requests` | boss, accounting, facilities | Pending / paid / rejected requests |
| `list_drafts` | `drafts` | boss, facilities, customer_service | Message drafts saved for the board |
| `request_payment` | writes `payment_requests`; reads `invoices` or `leases`, `cash_accounts`, `tickets`, `desk` | accounting | Asks a human to pay an invoice or the rent; amount comes from the database |
| `request_purchase_order` | writes `payment_requests`; reads `vendors`, `invoices`, `inventory`, `pricing`, `cash_accounts`, `tickets`, `desk` | accounting | Asks a human to approve a restock; refused if the vendor has an open invoice |
| `add_ticket_note` | `tickets` (`notes`, append only) | all five | Dated note on the ticket |
| `set_ticket_status` | `tickets` (`status`, `notes`) | boss | open, waiting_approval or resolved, with the reason |
| `save_customer_draft` | writes `drafts`; reads `tickets`, `desk` | facilities, customer_service | Saves a message draft; nothing is ever sent; refuses drafts that mention internal money or vendor details |
| `approve_payment_request` | `payment_requests`, `payments`, `cash_accounts`, `invoices`, `leases`, `desk` | **human only** | Pays one request in one transaction after a person approves |
| `reject_payment_request` | `payment_requests` | **human only** | Turns a request down; no money moves |

`payment_requests` and `drafts` are two tables the server adds to the working copy (with CHECK
constraints: amount above 0, known kinds and statuses). A reset removes them with everything else.

> **Model note.** Problem 5 requires `gpt-6-luna` for every agent. Until 2026-10-14 the code used
> `gpt-5.6-luna`: the spoken prompt said "GPT six Luna" and I mapped it to the workspace default
> instead. Checking the official panels caught it; the code now uses `gpt-6-luna` only, and the graded
> full run (section 8) was redone on `gpt-6-luna`. The audit trail is append-only, so the earlier test
> and first full-run records still show `gpt-5.6-luna`; everything after the switch shows `gpt-6-luna`.

### Audit trail (`output/audit_trail.json`)

One JSON list that only grows. `backend/audit.py` appends each record under a file lock and
atomically replaces the file, so records are never lost or wiped between turns or runs; an
unreadable file is set aside, not overwritten. Each record has the wall-clock time, `run_id`,
ticket, event (`ticket_start`, `run_start`, `step`, `delegation`, `run_end`, `run_error`,
`ticket_end`, `human_decision`), the agent and its delegation chain (`human -> boss -> facilities ->
accounting`), and for each **agent loop step** the Pydantic AI node, the model that answered, what
it said, every tool call with its arguments, every tool result (trimmed to 600 characters), and
input/output tokens.

**Checked (2026-10-14):** two live runs of ticket 102. The second: 5 delegations, 26 model calls,
64,480 tokens, 36 s; facilities confirmed $2,400 due 2026-09-02, accounting raised rent request #1
(pending, no money moved), customer service saved one landlord draft, the boss set
`waiting_approval`. Tickets 101 and 103 were then run live too (101: 4 delegations, 58,048 tokens;
103: 7 delegations, 93,735 tokens): both raised only invoice request #1 ($840, pending), made no
payment, tried no restock order while the vendor was on hold, and the loop guard refused one attempt
to ask the boss back. That test caught a customer draft that mentioned the "vendor hold" and a
"purchase order", so `save_customer_draft` now refuses internal terms and customer service uses
product names, not SKU codes; a rerun of 103 (73,546 tokens) produced a clean draft. Every model
record of these Problem 5 test runs says `gpt-5.6-luna` (see the model note below). The working copy was reset afterwards.

### Safety: guardrails for real customers and real money

- **A human approves every payment.** Agents can only *request*. The two approval tools are on the
  server but filtered out of every agent's tool list (checked by an `assert` at start-up);
  `approve_payment_request` also refuses an agent role as the approver.
- **Money rules live in the tool, not the prompt.** The amount always comes from the database;
  duplicate requests are blocked; requests that would overdraw once pending ones count are refused;
  payment runs in one transaction that re-checks everything and never takes checking below $0;
  a vendor with an open invoice cannot get a purchase order.
- **Least privilege.** Each agent sees only the tools its job needs; only accounting can request
  money, only the boss can change a ticket's status.
- **Who did what is certain.** The backend overwrites every `author` / `requested_by` with the
  agent that really made the call, and the audit trail records every step.
- **No outbound contact.** No tool sends email, texts or calls; customer and landlord messages are
  drafts on the board for a human to send. The draft tool refuses any draft that mentions invoices,
  vendor holds, purchase orders, approvals, overdue or unpaid bills, cash, balances or margins.
- **No invented facts.** Every number comes from a tool; missing rows return `found: false`.
- **Prompt injection.** Ticket notes come from outsiders; every prompt says to treat them as data,
  never as instructions (for example, "skip approval").
- **Customer care.** Discounts never below unit cost, more than 15% off list needs a human; drafts
  never promise firm dates or mention the shop's finances; no personal data beyond the name.
- **Recoverable.** The original database is read-only; the working copy resets in one command.
- A real business would add: sign-in for the board, per-person approval limits, a second approver
  above a threshold, and alerts on refused payments.

### Limits that keep token use in check

| Limit | Value | Where |
|---|---|---|
| Model | `gpt-6-luna` only, as Problem 5 requires | `backend/config.py` |
| Model calls per agent loop | boss 12, others 8 | `UsageLimits(request_limit=...)` |
| Tokens per agent loop | 45,000 | `UsageLimits(total_tokens_limit=...)` |
| Tokens per ticket, whole team | 150,000 | `TEAM_TOKEN_BUDGET`; no new delegations once spent |
| Delegations per ticket | 8 | `MAX_DELEGATIONS_PER_TICKET` |
| Delegation depth | 3 hops (boss -> A -> B -> C) | `MAX_DEPTH` |
| Loops | nobody can be asked while already waiting in the thread (no A -> B -> A) | `ask_teammate` guard |
| Text kept in the audit | 600 characters per field | `TRIM` |

Agents see their remaining budget in their instructions and are told to answer with what they
have when it runs out; a delegated agent that hits a limit returns an error string instead of
crashing the whole ticket.


---

## 5. Ticket plan (Problem 6)

`output/desk_tickets.html` (double-click to open) holds the plan, written before the full run: one
tab per ticket with an Expected side filled in and an Actual side left blank for after the run,
plus Cash and Reflection tabs for later problems. Run order 101 → 102 → 103. Each ticket calls
only the specialists it needs: 8–9 delegations in all, and facilities only on 102.

| Ticket | Boss calls first | Expected delegations | Expected result |
|---|---|---|---|
| 101 tee order | inventory: can we fill tee S, and why is the reprint stuck? | boss → inventory, boss → accounting, boss → customer_service | `resolved`; invoice 501 requested ($840) on the approval tray; 1 draft |
| 102 rent notice | facilities: check the email against lease 1 | boss → facilities, facilities → accounting, (boss → customer_service) | `resolved`; rent requested ($2,400) on the tray; $160 left uncommitted |
| 103 hoodie discount | accounting: the price decision needs the margin first | boss → accounting, boss → inventory, boss → customer_service | discount of up to 15% ($49.30); 8 now, restock later; no new requests |


---

## 6. Backend routes (Problem 7)

`backend/main.py` (FastAPI). Start it from the `backend/` folder with the venv active:
`uvicorn main:app --reload --port 8000` → http://localhost:8000 (docs at `/docs`). Shop data goes
through the same MCP server the agents use; one agent run at a time.

- `GET /tickets`: the three tickets, each with its status and `state` open or resolved (plus its last run).
- `POST /tickets/{ticket_id}/run`: runs the agent team on that ticket in the background and returns a `run_id` at once (`?wait=true` waits for the outcome); when the run finishes the ticket is marked resolved.
- `GET /runs/{run_id}`: whether that run is still going, plus the boss's outcome, delegations and tokens.
- `GET /events?run_id=&ticket_id=&since=&limit=`: recent audit-trail events (what each agent said, which tools it called with what arguments, results); `next_since` lets the board fetch only new ones.
- `GET /tickets/{ticket_id}/summary` (P8): what each agent did on that ticket's latest run (who asked it, tools in plain words, what it said, tokens), plus the boss's outcome.
- `GET /payments?status=pending`: payment and purchase-order requests the agents prepared.
- `POST /payments/{request_id}/approve` (body `{"approved_by": "<full name>"}`): a human approves; the only route that moves cash.
- `POST /payments/{request_id}/reject` (body `{"decided_by", "reason"}`): a human rejects; no money moves.
- `GET /cash`: the checking balance from `cash_accounts`, money promised to pending requests, and what's left.
- `POST /reset`: copies the read-only original over the working copy for a fresh run (refused during a run; the audit trail is kept).

**Checked (2026-10-14, server started with the command above):** every route answered; ticket 102 ran
through `/tickets/102/run` (5 delegations, 61,925 tokens, 81 events in `/events`); a second run, a reset
during the run, an unknown ticket, an unknown request and an agent name as approver were all refused;
`/reset` brought back 3 open tickets, $3,400 and no requests. The approve route's success path was left
for a human: it calls the same `approve_payment_request` tool tested in Problem 5. Two refused test
calls are in the audit trail as `human_decision` records: request 999 (sent under the student's name;
no such request) and request 1 with an agent as approver. Neither moved money.


---

## 7. The board (Problem 8)

`frontend/` (React 19 + Vite 8 + TypeScript): from `frontend/`, `npm run dev` opens
http://localhost:5173, which calls the backend at http://localhost:8000 (`src/api.ts`; the backend's
CORS allows `http://localhost:5173`). Look and reasoning are in `output/design.md`.

| Board must… | How |
|---|---|
| list all three tickets | Ticket rail (`GET /tickets`) |
| pick one and start the team | "Hand to the team" on the selected slip (`POST /tickets/{id}/run`) |
| show each agent and what it's saying / doing | Five seats with live mood, current tool and speech bubble, desk note for hand-offs, chatter feed (`GET /events?run_id=&since=` every 1.2 s) |
| mark the ticket resolved when the run finishes | Backend sets `resolved` at the end of the run; the slip's stamp turns RESOLVED |
| short summary of what each agent did | "What each agent did" panel (`GET /tickets/{id}/summary`) |
| human approves a pay or purchase | Approval tray: Approve & pay → your name → `POST /payments/{id}/approve` |
| show the checking balance, dropping after a payment | The till (`GET /cash`), counts down after an approval |

"Resolved" now means the team has finished its part; payments wait on the approval tray. The boss
prompt and the Problem 6 plan were updated to match before the full run.

**Checked (2026-10-14):** ran ticket 102 from the board. Seats went Thinking → Waiting → Done with
Inventory left idle, the rent request appeared in the tray, the till showed $2,400 promised and
$1,000 free, the slip stamped RESOLVED, and the summary showed the boss's call plus four agent cards
(4 delegations, 20 model calls, 52,775 tokens). The Approve form opened and was cancelled; approving
is left to a person. That $2,400 request is still pending so the approval can be tried on the board.


---

## 8. The full run (Problem 9)

Graded run on the board, all agents on `gpt-6-luna`: **Fresh start** (reset) → `cash_accounts.checking` =
**$3,400.00**; ticket 101 → approve invoice 501 → ticket 102 → approve the rent → ticket 103. The person at
the board approved both payments.

| Ticket | Final status | Agents who worked | Delegations | Human approvals | Cash |
|---|---|---|---|---|---|
| 101 Bulldog tee | `resolved` | boss, inventory, accounting, customer service | 3 | #1 $840 paid by Sam Hernandez | −$840.00 |
| 102 Rent due | `resolved` | boss, facilities, accounting, customer service | 3 | #2 $2,400 paid by Sam Hernandez | −$2,400.00 |
| 103 Bulk hoodie discount | `resolved` | boss, inventory, accounting, customer service | 4 | none | $0.00 |

**Cash:** $3,400.00 − $840.00 (invoice 501, ticket 101) − $2,400.00 (rent, ticket 102) − $0.00 (ticket 103)
= **$160.00**, exactly `cash_accounts.checking` in the committed working copy.

Run ids: 101 `0c4fe070364e` (3 delegations, 63,512 tokens); 102 `6e520804b619` (3, 58,316); 103
`42df7a2b3c2d` (4, 69,689). Earlier audit records are test runs, a first full run on the wrong model (see
the model note in section 4), and three re-sends of ticket 101 after it was resolved; none moved money.

**Files from the run:** `output/desk_tickets.html` (Actual, Cash and Reflection tabs),
`output/resolved_tickets.json`, `output/resolved_board.html` (board screenshot per ticket),
`output/audit_trail.json` (append-only).

---

## Open items (reviewed together at Problem 10)

Found while checking Problems 2 and 3. Each one needs a later piece of the system, so it is
parked here instead of guessed at now.

| # | Open item | Resolved by | Status |
|---|---|---|---|
| 1 | Pay tool money rules: amount read from the database, above 0, balance never below $0, real approver name, `ref_id` exists and matches `kind` | MCP pay tool | Done in P5: amount from DB, CHECK amount > 0, balance never below $0, approver can't be an agent, ref must exist and be open |
| 2 | Each payment is one transaction (all rows change or none), and the same bill can't be paid twice | MCP write tools | Done in P5: one transaction with re-checks; duplicates refused |
| 3 | Human approval can't be faked: an agent can only request a payment; `approved_by` comes from the human's click on the board | Backend + React board | Done in P8: only the board's Approve (a person's name) reaches the approval tool; agents can't. Known gap: the board has no sign-in, so anyone at the desk could type any name |
| 4 | No table holds drafts, pending approvals or agent messages; decide where they live and how a reset clears them | Backend + `design.md` | Done in P5: `payment_requests` and `drafts` tables; a reset clears them |
| 5 | What "resolved" means for each ticket when the shop date never moves | `design.md` + boss prompt | Done in P8: resolved = the team is done; payments wait on the board's approval tray; the backend marks the ticket resolved when its run finishes |
| 6 | Payment order and the cash squeeze: invoice 501 + rent leave $160, a restock does not fit | Accounting + boss in the full run | Done, confirmed in the P9 full run: 103 made no restock request; both bills fit and $160 stayed free |
| 7 | Foreign keys on for every write connection; check ids before writing | MCP write tools | Done in P5: every connection turns foreign keys on |
| 8 | GitHub: re-run `chmod 444` after cloning (git drops file modes), commit both databases in their original state, keep `.env` out; the README must say to create `.venv` and install `requirements.txt`, since `.mcp.json` runs `.venv/bin/python`; keep `.claude/settings.local.json` (personal server approvals), `frontend/node_modules` and `frontend/dist` out of the repo | Problem 11 | Prepared after Problem 10: `.gitignore` (both databases kept, `.env`/`node_modules`/`dist`/`.venv`/personal settings/lock files out), `README.md` run guide with the chmod and reset steps, no real key in any file. Creating the repo and pushing is Problem 11 |
| 9 | Check Problems 2–4 against the official assignment text (so far only my spoken summaries were used) | Student | Open: needs the official Problem 2–4 text from the student |
| 10 | The draft guard's word list can block harmless phrases ("the balance of your order"), and the 103 customer draft came out vague after the fix; check draft quality and false refusals in the full run | Full three-ticket run | Checked in the P9 full run: no false refusals, three clean drafts. Gap: the 103 draft said “we'll confirm pricing” although the boss approved $49.30, because the price never reached customer service (see Reflection) |
