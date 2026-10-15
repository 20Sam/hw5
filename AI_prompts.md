# AI Prompts Log: Homework 5 (Campus Customs Multi-Agent Operations)

This file logs what I typed or said to my AI coding assistant (Claude Code) for each problem.
Each section lists the problem number and title, my first prompt (in my own words), any
follow-up prompt, and one sentence on what the first attempt was missing.
Most prompts were dictated by voice, so filler words and transcription slips are cleaned up,
but the wording and the requests are mine.

---

## Problem 1: Vibe coder prompts

**Prompt 1 (my words):**
> I'm starting Homework 5, "Campus Customs Multi-Agent Operations." Campus Customs Multi-Agent
> Operations is an agentic team that runs the shop. Open tickets land on a board: customer
> orders, rent, unpaid bills, discount requests, whatever the shop has to handle. You will build
> three pieces that talk to each other: an MCP server, a FastAPI backend with a multi-agent team,
> and a React dashboard so a human can watch the agents at work and approve requests. The agent
> team has full connectivity: any agent may delegate tasks to any other agent for help. Build
> these agents:
> 1. **Boss** reads each ticket, decides who should work on it, and makes final calls.
> 2. **Inventory** checks stock by SKU and size, spots shortfalls, and figures out which vendors
>    can restock.
> 3. **Accounting** watches cash and invoices, checks margins, and prepares payments or purchase
>    orders for human approval.
> 4. **Facilities** handles the shop-space side, such as leases and rent.
> 5. **Customer service** drafts messages for customers.
>
> The data: we'll download a data file into the Homework 5 folder at `data/campus_customs.db`.
> That file is the original shop database; its tables include desk, tickets, inventory, pricing,
> vendors, leases, cash accounts, payments, and invoices. Our tools will update the database as
> tickets get resolved. Make a copy called `data/campus_customs_new.db` and point the MCP server
> and backend at that working copy. Keep `campus_customs.db` untouched so we can reset when we
> want to restart resolving the tickets.
>
> Shop rules:
> - The field `desk.date_today` is "today" for the shop. Use this date to decide what is overdue.
> - Vendor lead times come from the vendors table.
> - A vendor will not ship a new product while they still have an open unpaid invoice.
> - Human approval is required for any payment (points are deducted if this is not done). If a
>   payment is made, update the relevant table.
> - If there is not enough cash, the pay tool must refuse. No negative balances.
> - Cash only goes out in this homework. We don't model revenue, so no money comes in.
> - Before a full run to resolve the tickets, reset the database to the original values.
> - Do not email customers or call real vendors. Drafts stay on the board.
>
> We'll use our `PORTKEY_API_KEY` for AI calls, and only GPT-6 Luna (`gpt-6-luna`) through
> Portkey for every agent. Multi-agent chats burn tokens fast, so points are deducted if any
> other model shows up in our code or runs. We'll work one problem at a time; there are 11
> problems, and I'll tell you what each one is. I've given you the file tree, so you know how to
> structure everything.
>
> Problem 1 is "Vibe coder prompts." Create an `AI_prompts.md` at the start of the assignment
> and keep it updated as we work. This file is the log of what I've typed or said to you, my
> vibe coder. I'll describe each problem in my own words. Put one section per problem; each
> section must include the problem number and title, at least one prompt I've given you, a
> follow-up prompt if needed, and one sentence from you on what was lacking after the first.
>
> (Sent with a screenshot of the Problem 11 expected file layout.)

**Follow-up prompt:** None needed yet.

**What was lacking after the first prompt:** The dictated prompt garbled a few names
("Canvas Custom" for Campus Customs, and "ChatGPT 6 Luna", which means `gpt-6-luna` but which I first mapped to the workspace default `gpt-5.6-luna` until the official Problem 5 panel corrected it), so I
matched the names against the Problem 11 file layout and the workspace `AGENTS.md`, then
confirmed the 9 table names (`desk`, `tickets`, `cash_accounts`, ...) once the database arrived.

---

## Problem 2: Study the Campus Customs database

**Prompt 1 (my words):**
> Now we're moving on to Problem 2, "Study the Campus Customs database." Open
> `data/campus_customs.db` and look through every table and its fields. Copy the original file to
> `data/campus_customs_new.db`; later problems update that working copy. Study the three open
> tickets so you see how they link to other tables. Then start the `output/harness.md` file, and
> for each table, list the fields and one short line on why that table matters for the agent.
> We'll keep growing this harness file in later problems.

**Follow-up prompt:**
> Is there anything that I'm missing for this problem, number two?

**Follow-up prompt 2:**
> Let's make sure we fix these things that I didn't ask for. If we can't resolve something, keep
> it in mind for later problems, and remind me once we hit Problem 10 if it's still an issue.

**What was lacking after the first prompt:** The prompt asked for fields and one line per table,
but the tickets only make sense together, so the harness also needed the ticket-link trace and
the cash math: paying invoice 501 and the rent leaves $160, not enough for a 12-hoodie restock,
and the same blocked vendor holds up two tickets.

---

## Problem 3: Build an MCP server

**Prompt 1 (my words):**
> Problem 3 is "Build an MCP server." Write an MCP server in `mcp_server/` using FastMCP. It
> talks to `data/campus_customs_new.db`. You do not need to connect or run it in this problem.
> Every agent in this homework uses the tools in this MCP server, and we'll add more tools later.
> For now, write three tools you know you will need for the tickets in the database. Keep the
> names clear. Never invent any data; only use information in the database. In
> `output/harness.md`, list each of the three MCP tools: which table it reads, which ticket it
> helps unlock (101, 102 or 103), and one sentence on why that tool is the right one for that
> ticket. Vague lines like "reads inventory" score low; tie the tool to the ticket. Also add a
> short `mcp_server/README.md` that explains what the MCP server is for, which data file it uses,
> and the three tools it has.

**Follow-up prompt:**
> When you're done with Problem 3, tell me if anything else needs to be improved. If it can be
> fixed now, go ahead and work on it; otherwise save it for Problem 10 and we'll tackle it there
> together. Do everything very efficiently, and don't go overboard with research or effort.

**What was lacking after the first prompt:** The prompt didn't say how an agent finds the vendor
behind ticket 101, so the invoice tool takes the ticket's own `invoice_id` (501) and looks up the
vendor, its lead time and its other open invoices itself.

---

## Problem 4: Add the MCP server to the vibe coder and test each tool

**Prompt 1 (my words):**
> Problem 4 is "Add the MCP server to the vibe coder and test each tool." The vibe coder is you,
> Claude Code. Add my MCP server to this project so the vibe coder can call the tools: save the
> connection JSON in a `.mcp.json` file at the project root (that's where Claude Code saves
> project MCP server lists). With the vibe coder connected, test each of the three MCP tools and
> save the evidence in `output/mcp_smoke.json`. For every tool, include the prompt you asked the
> vibe coder, the tool name, and the tool output, and the output must match the values in
> `data/campus_customs_new.db`.

**Follow-up prompt:**
> Okay, show me how to log in to my Claude Code CLI.

**Follow-up prompt 2:**
> Is there anything else that I'm missing for this problem? Is everything in Problems 1 through 4
> complete?

**What was lacking after the first prompt:** The prompt assumed the vibe coder could connect
right away, but Claude Code asks you to approve a project's MCP servers, and the command-line
Claude Code needs its own login, so the server was connected and its tools listed before the
first tool call could run.

---

## Problem 5: Build the agent team and grow the MCP tools

**Prompt 1 (my words):**
> Problem 5 is "Build the agent team and grow the MCP tools." Build the Campus Customs agent team
> with Pydantic AI: a boss, inventory, accounting, facilities and customer service. Include prompts,
> models and agent loops so they can delegate work to each other with full connectivity. Put the agent
> prompts in `backend/prompts/`, one file per agent; put data types in `backend/models.py`; and the
> agent files under `backend/`. The layout can vary as long as the five roles are clear. Use our
> `PORTKEY_API_KEY` and only GPT-6 Luna (`gpt-6-luna`) for every agent. Write each prompt in your own words with
> the shop rules that agent needs; detailed prompts that cover all of an agent's work and scope score
> higher than short generic ones. Add any tools the agents need to my MCP server so they can work on
> the open tickets. Shop facts come from the MCP server over `data/campus_customs_new.db`; do not
> invent a second shop-tools layer that bypasses MCP. Wire the agents so they append to
> `output/audit_trail.json` as they run: for each agent loop step, record enough to audit later, and
> append to the file; do not wipe it each turn or each run. In `output/harness.md`, list each agent and
> each MCP tool, including the ones added in this problem, with the table each tool uses. Also add a
> short safety section with the guardrails a real business would want when agents touch real customers
> and real money, plus limits that keep token use in check. Update `mcp_server/README.md` so its tool
> list matches what we have now.

**Follow-up prompt:**
> Is there anything that I'm missing for this problem?

**Follow-up prompt 2:**
> Yes, run tickets 101 and 103 live as a test, leave payments pending, then reset the working copy.

**What was lacking after the first prompt:** The prompt didn't say how a human approves a payment
before the board exists, or what stops an agent from approving its own request, so the two approval
tools are human-only (filtered out of every agent's tools), and a terminal step stands in for the
board until it is built.

---

## Problem 6: Plan three tickets

**Prompt 1 (my words):**
> Problem 6 is "Plan three tickets." Before we wire the backend, write down what you expect the team
> to do on each open ticket. Build `output/desk_tickets.html`, a page I can double-click, with one tab
> per ticket (101, 102 and 103). Also add empty Cash and Reflection tabs for later problems; leave
> them blank or with a short "coming later" note for now. On each ticket tab, fill an Expected section
> only, and leave room for an Actual section to fill after running the agents. For each ticket's
> Expected section, write in your own words: who the boss should call first and why, all the agent
> delegations you expect (not "the boss calls everyone"), and which MCP tools you expect the run to
> use, as bullets. Plans that send every specialist on every ticket score low. We'll compare this plan
> to what actually happens when the agents resolve the three tickets.

**Follow-up prompt:**
> Is there anything that I'm missing for this problem?

**What was lacking after the first prompt:** The prompt didn't say what order the tickets run in,
which matters because ticket 103 depends on the invoice 501 request that ticket 101 raises and on
the cash left after 101 and 102, so the plan fixes the run order at 101 → 102 → 103.

---

## Problem 7: Backend routes

**Prompt 1 (my words):**
> Problem 7 is "Backend routes." The React dashboard in the next problem needs a backend it can call.
> In `backend/main.py`, use FastAPI and add routes that: (1) return the three tickets and whether each
> is open or resolved; (2) take a ticket id and run the agent team on that ticket; (3) return recent
> agent events (what each agent said and which tools they used) so the board can refresh; (4) approve
> a payment or purchase after a human clicks Approve (agents only prepare the payment; this route is
> what actually changes cash); (5) return the current checking balance from `cash_accounts`; and (6)
> reset the database to the original values for a fresh run. From the `backend/` folder, start the
> server with `uvicorn main:app --reload --port 8000`, which serves http://localhost:8000 so the
> dashboard can call these routes. In `output/harness.md`, list each route in one line: the URL and
> what it does.

**Follow-up prompt:**
> Is there anything that I'm missing here?

**What was lacking after the first prompt:** The prompt didn't say what the run route should return
while a run takes about a minute, so it starts the run in the background and returns a `run_id` at
once, and the board follows progress through `/events`; it also didn't say how to show pending
requests to approve, so `GET /payments` was added.

---

## Problem 8: Agent dashboard

**Prompt 1 (my words):**
> Problem 8 is "Agent dashboard." Build the front-end dashboard in `frontend/` with React + Vite +
> TypeScript. The page should call the routes from Problem 7. At a minimum the board should: (1) list
> all three tickets; (2) let me pick one ticket and start the agent team on it; (3) show each agent and
> what they're saying or doing while the ticket runs; (4) mark a ticket resolved when the run finishes;
> (5) show a short summary of what each agent did on that ticket; (6) let a human approve a payment or
> purchase when asked; and (7) show the checking balance, which should drop after an approved payment.
> Make the dashboard look good and be creative with the layout and feel: it's a real desk people should
> want to sit at, so put thought into how it looks. The front end talks to the backend at
> http://localhost:8000; on the backend, allow the Vite page origin, typically http://localhost:5173, so
> the browser may call those routes. Start the board with `npm run dev`, which opens the React desk in
> the browser so I can pick tickets and watch the agents. Then write `output/design.md` with what you
> chose for the dashboard's look (layout, how agents read differently, how resolved tickets and cash
> show up, etc.) and why, including the creative choices that make it feel special and something people
> would actually enjoy using.

**Follow-up prompt:**
> Anything else for this one?

**What was lacking after the first prompt:** "Mark a ticket resolved when the run finishes" clashed with
the boss's rule of leaving a ticket waiting until a payment is approved, so "resolved" now means the
team has finished its part (the backend marks it at the end of a run) while payments wait on the
board's approval tray; the boss prompt and the Problem 6 plan were updated to match.

---

## Problem 9: Resolve the tickets

**Prompt 1 (my words):**
> Problem 9 is "Resolve the tickets." Before testing the agents on a full run over the three tickets,
> reset the working database `data/campus_customs_new.db` again so we start clean, and note the starting
> checking balance. Then run all three tickets on the board (101, 102, 103) until each is resolved. Open
> `output/desk_tickets.html` from Problem 6 and, on each ticket tab, fill the Actual section from this run:
> which agents worked, what they delegated, and which tools they used. Keep the Expected sections so we can
> compare the two. On the Cash tab of the same page, itemize the money: (1) the starting checking balance
> after the reset; (2) for each ticket, how cash changed when that ticket resolved and why (which payment or
> purchase, and the dollar amount); (3) the ending checking balance, which must match `cash_accounts` in the
> working database. Wrong cash math loses points even if the board shows every ticket resolved. Also save
> `output/resolved_tickets.json` (for each ticket: id, final status, short outcome, what each agent
> contributed, and any human approvals) and `output/resolved_board.html` (a page I can double-click with a
> screenshot of the React board for each resolved ticket). Append the real runs to `output/audit_trail.json`
> and finish `output/harness.md` so it covers the tables, MCP tools, the five agents, API routes, the
> dashboard and the safety rules.

**Follow-up prompt:**
> I've made my decisions on both payments on the board. Continue with Problem 9 and then the Problem 10
> reflection.

**What was lacking after the first prompt:** The prompt assumed the cash would change "when the ticket
resolved", but in this app money only moves when a person approves a request on the board, so the run had a
human step in the middle: the team prepared $840 (invoice 501) and $2,400 (rent), and I approved both before
the Cash tab could be itemized ($3,400 → $160, matching `cash_accounts`).

---

## Problem 10: Reflection

**Prompt 1 (my words):**
> Problem 10 is "Reflection." Open `output/desk_tickets.html` and fill the Reflection tab. Answer in your own
> voice and be detailed and thorough: (1) How would you evaluate the agents' performance on each ticket, and
> why? (2) For each ticket, how did the actual run compare to the expected plan you wrote earlier? (3) What
> would have been simpler as one agent with tools, and why? (4) Describe three new problems Campus Customs
> might face that this agent team could solve with the tools you built. (5) Describe three new problems it
> could not solve with those tools, and explain the tools and agents you'd need. Tie each answer to this app
> and the three tickets we ran, using the ticket tabs and the Cash tab on the same page as evidence. Generic
> AI essays without Campus Customs details score low.

**Follow-up prompt:**
> All right, let's tackle these open problems right now. What do we need to do?

**What was lacking after the first prompt:** The reflection had to wait for the Problem 9 cash evidence (my
two approvals), and it also triggered the Problem 10 review of the parked issues I'd asked to be reminded
about: items 1–7 and 10 were done or confirmed by the full run, leaving GitHub (Problem 11) and the
official-text check open.
