# Campus Customs front desk: dashboard design

The board (`frontend/`, React + Vite + TypeScript, `npm run dev` → http://localhost:5173) is
designed as **a sunlit shop counter by the water** rather than an admin console. The person at
the desk is the shop manager: they hand slips to a small team, watch the team talk, sign off on
money, and close the day. Every choice below tries to make that feel calm, legible and a little
bit charming, so the desk is somewhere you'd want to sit.

## Layout: three zones, left to right like the work itself

| Zone | What's there | Why |
|---|---|---|
| **Left: ticket rail** | Paper order slips clipped to a wire, one per ticket | Work starts here. You pick a slip; the only button appears on the slip you picked ("Hand to the team"), so there is one obvious next action. |
| **Centre: the desk** | Five agent seats around an oval wooden desk; the boss sits at the head. Below it, after a run, "What each agent did" | The team is the main event, so it gets the middle and the most space. The desk itself carries the latest hand-off as a pinned note. |
| **Right: money and talk** | The till (cash), the approval tray, then the team chatter feed | Everything that needs *you* (approve, check cash) sits together, above the running commentary. |

On narrower screens the right column drops below the desk, and on phones everything stacks in
the same order: slips, desk, money, chatter.

## How the agents read differently

- **Each agent is a small hand-drawn critter** (pure CSS, no images) with its own colour and prop:
  the boss is ocean blue with a captain's cap, Inventory palm green with a box, Accounting gold with
  a coin, Facilities driftwood brown with a key, Customer service coral with a heart. Colour + prop
  means you can tell them apart at a glance, and without relying on colour alone. Each has a
  nickname (Skipper, Stocky, Ledger, Keys, Sunny) to make them feel like colleagues.
- **Their pose shows their state**: they bob while thinking, bob faster while using a tool, tilt
  their head while waiting for a teammate, and close their eyes in a happy curve when done. A pill
  says the same in words ("Thinking", "Waiting on Facilities & Customer service", "Done").
- **The speech bubble** shows what the agent last said; a line above it says what it is doing right
  now in plain words ("checking stock and price (CC-TEE-WHITE, S, 1)", "asking Accounting").
- **Hand-offs are notes on the desk.** When one agent asks another, the request lands on the desk as
  a pinned paper note ("Customer service → Facilities: …") and the receiving seat glows gold.
- **Agents a ticket doesn't need stay dimmed** ("Not needed on this ticket"), which makes the
  targeted routing from the Problem 6 plan visible: on ticket 102, Inventory never lights up.
- **The chatter feed** reads like a group chat: hand-offs in dashed note bubbles, tool use as small
  indented "↳ checking cash" lines, replies in speech bubbles, each tagged with the agent's colour,
  critter and time.

## How tickets, resolution and cash show up

- **Rubber stamps.** Each slip carries a stamp: blue OPEN, pulsing coral ON THE DESK while the team
  works, and green RESOLVED when the run finishes (the backend marks the ticket resolved at the end of
  a run). A yellow flag on the slip says "1 payment for you to approve" when the team prepared money.
- **The till** is a dark, glowing cash-register screen with the checking balance in big monospace
  digits, so it reads as *money*, not just another number. Under it: money already promised to
  pending requests, and what's free once those are paid (turns coral when it's tight). After you
  approve a payment the balance **counts down** to the new value and a coral "−$2,400.00 paid" tag
  appears, so you feel the money leave.
- **The approval tray** shows each request as an airmail-striped envelope: what it is (vendor invoice,
  rent, restock order), the amount, who prepared it and why. Approving asks for your full name
  (remembered on this computer) and the button names the exact amount ("Pay $2,400.00"). Agents can
  only prepare these; the tray is the only place money moves. If a request is bigger than the balance,
  the envelope warns you before the till refuses.
- **After a run**, "What each agent did" opens with *the boss's call* (decision, summary with the
  numbers, and your next steps), then one card per agent: who asked it, what it did in plain words,
  what it said, and how many loop steps and tokens it used.

## Palette, type and motion

- **Maldives blue and sand**, per the workspace style: lagoon blues for the sky and the team, warm sand
  and paper for slips and the desk, coral for things that need attention, palm green for done/approved,
  gold for money.
- **A warm serif** (Iowan Old Style / Palatino) for names and headings, with a clean system sans for
  everything else; monospace only for money and slip numbers.
- **Gentle motion only where it means something**: thinking, live status, a new hand-off, the cash
  count-down. Everything respects "reduce motion", and the cash value is always correct even if
  animation is paused.

## The touches that make it feel special

1. A team you can *see* thinking: five little characters with moods instead of a log table.
2. Paper slips with clips, a wire rail, scalloped tops and rubber stamps: closing a ticket feels like
   stamping it.
3. Hand-offs as notes passed across a wooden desk.
4. A till that counts down when you pay, so approval has weight.
5. Plain-language everywhere: "asking Accounting", "Free once those are paid", "Pay $2,400.00".

## Trade-offs

- The board **polls** the backend (every 1.2 s for events during a run, every 4–8 s otherwise)
  instead of using a live socket: simpler, and fast enough for a desk.
- The backend keeps "which run is going" in memory; the audit trail is the permanent record, so after
  a restart the board still shows each ticket's last run from `output/audit_trail.json`.
- One run at a time keeps the cash picture honest; the Hand-to-the-team button is disabled while the
  team is busy.
