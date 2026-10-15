# Campus Customs Multi-Agent Operations (HW5)

A five-agent team (boss, inventory, accounting, facilities, customer service) runs the Campus Customs
shop desk. The agents work open tickets through an MCP server over a SQLite working copy, a FastAPI
backend runs them, and a React board lets a person watch the agents and approve every payment.
All agents use `gpt-6-luna` through Portkey.

```
frontend/ (React board, :5173) → backend/main.py (FastAPI, :8000) → backend/team.py (5 agents)
                                                                   → mcp_server/server.py (16 MCP tools)
                                                                   → data/campus_customs_new.db
```

## 1. Set up once

You need Python 3.12+ and Node 20+. From this folder (`hw5/`):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env          # then put your PORTKEY_API_KEY in .env
cd frontend && npm install && cd ..
chmod 444 data/campus_customs.db   # keep the original read-only (git does not keep file modes)
```

## 2. The two databases

- `data/campus_customs.db` is the **original** shop database. Nothing writes to it.
- `data/campus_customs_new.db` is the **working copy** that the MCP server and backend read and update.
  As committed, it holds the end state of the graded full run (all three tickets resolved, checking $160.00),
  which matches `output/desk_tickets.html` (Cash tab) and `output/resolved_tickets.json`.

**Copy the original over the working copy whenever you want a clean run**, with the backend stopped:

```bash
rm -f data/campus_customs_new.db data/campus_customs_new.db-journal data/campus_customs_new.db-wal data/campus_customs_new.db-shm && cp data/campus_customs.db data/campus_customs_new.db && chmod 644 data/campus_customs_new.db
```

(A plain `cp` is not enough: copying a read-only file makes a read-only working copy.)

## 3. Start the MCP server (optional on its own)

The backend starts the MCP server for you over stdio. To run it by itself, or to use it from Claude
Code (`.mcp.json` registers it as `campus-customs`; open Claude Code in `hw5/` and approve it once):

```bash
.venv/bin/python mcp_server/server.py
```

Details and the full tool list: `mcp_server/README.md`.

## 4. Start the FastAPI backend

```bash
cd backend
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000
```

It serves http://localhost:8000 (interactive docs at http://localhost:8000/docs).

## 5. Start the React board

In a second terminal:

```bash
cd frontend
npm run dev
```

It opens http://localhost:5173. Pick a ticket slip, press **Hand to the team**, watch the agents, then
approve or reject payments in the **Approval tray**. The till shows the checking balance.

## 6. Reset before a full three-ticket run

Before running tickets 101, 102 and 103 from scratch, reset the working copy to the original values:
press **Fresh start** on the board, or call `POST http://localhost:8000/reset`, or use the copy command in
section 2 with the backend stopped. The audit trail (`output/audit_trail.json`) is never reset; new runs
are appended.

## What's where

| Path | What it is |
|---|---|
| `AI_prompts.md` | The prompt log, one section per problem |
| `mcp_server/` | The campus-customs MCP server and its README |
| `backend/` | FastAPI routes (`main.py`), the agent team (`team.py`), data types (`models.py`), prompts (`prompts/*.md`), audit writer, terminal runner (`run_ticket.py`) |
| `frontend/` | The React + Vite + TypeScript board |
| `output/harness.md` | Tables, MCP tools, agents, routes, board, safety rules, limits, full-run results |
| `output/mcp_smoke.json` | Claude Code calling each MCP tool (Problem 4) |
| `output/desk_tickets.html` | Plan vs actual per ticket, the Cash tab, and the Reflection |
| `output/design.md` | Why the board looks the way it does |
| `output/resolved_tickets.json`, `output/resolved_board.html` | Full-run results and board screenshots |
| `output/audit_trail.json` | Every agent loop step, delegation, human decision and reset (append-only) |
