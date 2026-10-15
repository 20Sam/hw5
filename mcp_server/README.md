# Campus Customs MCP server

The shop's toolbox. Every agent on the Campus Customs team (boss, inventory, accounting,
facilities, customer service) looks things up and records its work through these tools instead of
touching the database directly, so all agents see the same facts and every write follows the
same rules. The backend connects over stdio and gives each agent only the tools its job needs.

**Data file:** `../data/campus_customs_new.db`, the working copy. The original
`data/campus_customs.db` is never opened by the server, so it stays clean for resets.

**Rules every tool follows**
- Answers come only from the database. A missing row returns `found: false` (read tools) or
  `refused: true` (write tools) with a message; nothing is guessed or filled in.
- "Today" is `desk.date_today` (2026-08-31 in the original data), never the computer's clock.
- Read tools open the database read-only; every connection turns foreign keys on.
- Money only moves in `approve_payment_request`, after a person approves, in one transaction that
  never takes checking below $0. Agents can request payments but never approve them.
- The server adds two tables to the working copy: `payment_requests` and `drafts`. A reset removes them.

## Tools (16)

**Read**

| Tool | Reads | Main use |
|---|---|---|
| `check_stock_and_price(sku, size, qty_needed?)` | `inventory`, `pricing` | Ticket 103 (also 101): stock, every size, shortfall, cost, list price, margin |
| `check_invoice_hold(invoice_id)` | `invoices`, `vendors`, `desk` | Ticket 101: invoice, days past due, whether the vendor can ship |
| `get_rent_due(lease_id)` | `leases`, `desk` | Ticket 102: rent amount, due date, days until due |
| `list_open_tickets()` | `tickets`, `desk` | Every unresolved ticket with its linking ids |
| `list_tickets()` | `tickets`, `desk` | Every ticket, resolved or not (backend `/tickets` route; not given to agents) |
| `get_cash_balance()` | `cash_accounts`, `payment_requests`, `desk` | Balance, money promised to pending requests, what is left |
| `find_vendors(specialty_contains?)` | `vendors`, `invoices` | Who can restock, lead time, can ship or not |
| `list_payment_requests(status)` | `payment_requests` | Pending / paid / rejected requests |
| `list_drafts(ticket_id?)` | `drafts` | Message drafts saved for the board |

**Write (agents)**

| Tool | Writes | Rules |
|---|---|---|
| `request_payment(kind, ref_id, ticket_id, requested_by, reason)` | `payment_requests` | `kind` invoice or rent; amount from the database; no duplicates; refused if it would overdraw with pending requests |
| `request_purchase_order(vendor_id, sku, size, qty, ticket_id, requested_by, reason)` | `payment_requests` | Cost = qty x unit_cost (estimate); refused if the vendor has an open invoice or cash would not cover it |
| `add_ticket_note(ticket_id, author, note)` | `tickets.notes` | Appends a dated line; never overwrites |
| `set_ticket_status(ticket_id, status, author, reason)` | `tickets.status`, `tickets.notes` | open, waiting_approval or resolved |
| `save_customer_draft(ticket_id, recipient, subject, body, author)` | `drafts` | Saves a draft; nothing is ever sent; refuses drafts that mention internal money or vendor details (invoices, vendor holds, cash, ...) |

**Human only (never given to an agent)**

| Tool | Writes | Rules |
|---|---|---|
| `approve_payment_request(request_id, approved_by)` | `payments`, `cash_accounts`, `invoices` or `leases`, `payment_requests` | One transaction; re-checks the bill and cash; refuses below $0; the approver must be a person, not an agent role |
| `reject_payment_request(request_id, decided_by, reason)` | `payment_requests` | No money moves |

## Run

From the `hw5/` folder, with the project venv:

```bash
.venv/bin/python mcp_server/server.py
```

That serves over stdio (the default for MCP clients, and what the backend and `.mcp.json` use).
The FastAPI backend (`backend/main.py`) opens one stdio connection at start-up and reuses it for every route.
Add `--http` to serve at `http://127.0.0.1:8001/mcp` instead.
