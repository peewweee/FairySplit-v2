# FairySplit

Split shared household bills by the hours each person actually stayed, with
appliance usage charged to whoever ran it. Replaces the spreadsheet.

```bash
npm install
```

```bash
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm test` | Vitest — the calculation engine's proof |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

---

## The two halves

**Logs** record what happened. **Bills** divide what it cost. The logs live on
the room screen and are the same whichever bill later reads them; a bill only
counts the entries that fall inside its own dates.

### Logs

A room has any number of logs, and always at least one: **Hours in the unit**,
the built-in occupancy clock that every bill is weighted by. It cannot be
deleted. Added logs are whatever else is worth counting — the aircon, the washer.

Each log is fed one of two ways:

- **Clock in / out** — a live timer. The built-in one says *I'm in / I'm out*;
  added ones say *Clock in / Clock out*.
- **Manual** — a typed amount, per day, per hour or per cycle.

The counter on a card is a **today** counter: it starts each local day at zero,
and a run still going at midnight is split between the two days by overlap. The
entries behind it are never touched — only the window that is added up.

Logs are drag-sortable (pointer events, so it works on touch; arrow keys do the
same job from the grip). The order is stored on the room, so it is the same for
everyone.

### Charged to

An entry names a **set of people**, not an owner. When two housemates run the
aircon together, the session is charged to both and divides equally between them
— the same rule §7.2 already used for a shared appliance event. One person's
share of an entry is `quantity ÷ participants`, and the shares of any entry
always add back to the whole of it. That is what keeps a bill reconciling once
entries are shared.

The built-in occupancy clock is the exception: it has no "charged to" at all.
You cannot be in the unit on somebody else's behalf.

A running clock remembers who it is for, so a reload mid-run cannot quietly turn
a shared run into a solo one.

### Entries

Every entry is editable and deletable, and any log can take one typed in after
the fact — a clock only records what somebody remembered to press. Deleting one
asks first, in place; the hours simply stop counting and do not come back.

- A **clock run** is edited as a span: a date and two times, with the hours
  derived from them. An end at or before the start rolls to the next day, because
  "in at ten, out at eight" is the ordinary shape of a night at home.
- A **manual entry** is edited as a date and an amount. The date decides which
  bill it lands on.

A date can only name a day the log will actually keep: nothing in the future,
nothing past the retention window. `min`/`max` steer the picker and every save
checks again, because a date typed straight in ignores them.

### Catching up on several days

Clock logs add entries through a calendar you can pick **several dates** from at
once — clocking in is a per-day habit, so catching up is usually "I was here all
of these days". Times default to the whole day (00:00–23:59).

Each picked date is **frozen with the times and people current when it was
picked**. Changing the fields afterwards aims at the *next* date, not the ones
already listed — otherwise there would be no way to record two days that ran
differently. Little boxes under the calendar show what is about to be saved:
date, time range, and (on a shared log) who it is charged to. The whole batch is
one write, and every span is validated before any of it is stored.

The one exception is before the calendar is touched: the auto-selected today
still follows the fields, because at that point the form is plainly just "one
entry, today".

Manual logs keep the single-date form — they have no times to give a day a
shape.

### What a card shows, and where the rest is

A card's toggle reads *"3 entries today"*, and opens **today's entries only**, to
match the counter above it. It filters by what *contributes* to today rather than
what is stamped today, so a run from 10pm to 2am appears on both days.

Everything else lives on the **logs history** page: a tab per log, entries
grouped by the day they happened, and the same editable row as on the card — so
an entry is edited, deleted or added the same way wherever you find it. Two ways
in: a *Logs history* button in the panel's header, and, under an opened card's
entries, a *See all logs* link that lands on that log's own tab.

### Retention

Only the last **120 days** are kept; anything older is dropped and cannot be
brought back. The pruning happens on READ, in memory, so nothing older is ever
shown — and because every write reads first, the trimmed shape is what gets
persisted on the next write. A read that wrote for itself would notify every
open screen and be read again, which is a loop.

`HISTORY_DAYS` in `lib/tracking/elapsed.ts` is the one place that number lives:
it bounds the pruning, the date pickers and the note on the history page.

---

## How a bill gets split

1. **Appliances charged equally** (the fridge) are carved out and shared equally
   — they run 24/7 whether you were home or not.
2. **Appliances charged from a log** are carved out and charged to the people
   who logged the usage, within the bill's dates.
3. **Other charges** (a late fee) are carved out across whoever they apply to.
4. Whatever is left — the **residual** — is split in proportion to **days
   stayed**, which come from the occupancy clock.

The residual is *defined* as the leftover, never computed independently. That is
what guarantees the column adds up to the bill exactly, every time, even though
the appliance kWh figures are estimates.

### How is it charged?

Each appliance answers this with a two-option tick box:

- **Equally** — the only built-in answer, and the only one that needs no log.
- **Track based on logs** — then a dropdown names which log supplies the
  quantities. The appliance takes its unit from that log: a clock or per-hour log
  prices per hour, a per-cycle log per cycle.

Picking "track" does not choose a log for you — a silently chosen one would put
a number on somebody's bill nobody asked for. Saving without one is refused.

### Auto by default, editable when wrong

A bill reads its figures from the logs over its own dates. A hand-entered figure
overrides that for **that bill only**; the log itself is never rewritten, and
"Use the log" hands the row back. A blank means "count the log", not zero —
which is why a new bill weights itself correctly with nothing typed.

### Two modes, one field

The **electricity rate (₱/kWh)** is the switch.

- **Blank** → simple split, purely by days. No appliances.
- **Filled** → itemized, and the carve-out maths above applies.

A bill needs only a total and one member to produce a correct, fully reconciled
split. Everything else is optional and only makes it more precise.

---

## Screens

```
/                                 rooms  ("/?join=CODE" opens the join dialog)
/rooms/[roomId]                   Your tracking (the logs) + Bills
/rooms/[roomId]/logs              logs history: a tab per log
/rooms/[roomId]/settings          name, join code, people, delete
/rooms/[roomId]/bills/[billId]    the bill: your logs summary + the share table
```

**The room screen** leads with *Your tracking* — your clocks and logs, the
built-in one filled blush so it is distinguishable from the rest — then the
list of bills. A bill in that list shows your hours and your share, and opens by
being clicked (a › says so). The hours come from the same figure the bill's own
summary uses, so the two can never quote different numbers for the same stay.

**The bill screen** is: the hero (name, amount, dates, and a ⚙ menu holding Edit
and Delete), *Your logs covered in this bill*, then the share table. Appliances
and other charges are managed inside the bill's own editor.

*Your logs covered in this bill* is one row per log the bill draws on, showing
the amount, what it cost, and an **ⓘ** carrying the formula — hover on a mouse,
tap on a phone, and a click pins it open so it survives the pointer moving away.
Hours in the unit shows both days and hours, because days is what the split is
weighted by and hours is what the clock recorded.

The share table is all money: one column per log, plus "Shared equally" and
"Unlinked usage" when those exist, so the columns always add up to what somebody
owes. *Edit log entries* on a summary row opens that log's history tab.

### Sharing a split

A **Share** button above the table offers two ways out, and neither needs a
dependency:

- **Download image** — a PNG drawn on a canvas from the same columns the table
  renders. Not a screenshot: no UI chrome, sharp at 2×, and the same whatever the
  page is scrolled to.
- **Save as PDF** — the browser's own print-to-PDF. The table sits in a
  `[data-print-sheet]` wrapper and the print stylesheet hides everything else, so
  what prints is the heading and the table.

A hand-rolled PDF was the obvious alternative and is the wrong one: the standard
PDF fonts have **no glyph for ₱**, so a peso table would come out mangled. The
browser's engine uses the real font. On a phone, where `navigator.canShare`
takes files, a third option sends the image straight to another app.

### Getting somebody into a room

The People panel invites rather than filing a name: a join code, and a whole
invite message ready to paste, carrying a `/?join=CODE` link that opens the app
with the code filled in. Both say plainly that neither reaches another device
yet — see the seam below.

---

## Layout

```
app/                              routes only; every screen is a client component

lib/
  billing/
    money.ts        THE ONLY place money is divided or kWh converted
    engine.ts       pure: plain objects in, plain objects out. No React, no clock.
    occupancy.ts    hours -> days, and the days a bill covers
    from-bill.ts    stored records -> engine input: the round-up, the bill's
                    date window, and the usage its logs supply
  tracking/
    elapsed.ts      pure: turning a running clock into a number. `now` is passed
                    in, never read from the system. Also holds HISTORY_DAYS,
                    the one place the retention window is written down.
  data/
    types.ts        the domain model
    repository.ts   the interface every screen reads and writes through
    local-repository.ts   localStorage implementation (this phase); also
                    normalises and prunes on read
    index.ts        exports the active implementation — one line to swap
    hooks.ts        useRepoQuery / useRepoAction, so components just await
  forms/
    schemas.ts      Zod: text, dates, join codes
    numeric.ts      Zod: strict string -> number, then peso -> centavos

components/fairy/   the app's own components
components/ui/      shadcn/ui primitives
```

### Money

Integer **centavos** everywhere. A rate is **millicents** — 1/1000 of a centavo,
so `₱14.86/kWh` is `1_486_000`. Formatting to `₱1,234.56` happens once, at render
time. Nothing outside `lib/billing/money.ts` divides money or converts kWh.

### Occupancy

Stored as **hours**, never days. Days are derived at `HOURS_PER_DAY = 24` — one
number behind the split rather than two that could disagree. The bill screen lets
you type either, and converts.

`resolvedMemberDays()` in `lib/billing/from-bill.ts` is the single function that
supplies member days to the engine: a hand-entered figure if there is one,
otherwise the occupancy clock counted over the bill's dates.

### The data seam

Every read and write goes through `Repository`, and **every method is `async`**
even though localStorage is synchronous. Components already `await` and already
render loading states, so a Supabase implementation is a one-line change in
`lib/data/index.ts` with no component touched.

Wall-clock time is read in two places only: the repository, when it stamps a
start or an end, and `useNow` in the tracking panel, which exists purely to make
the seconds on screen advance. Nothing is ever *stored* from `useNow`.

**Join codes are local to this device.** With no backend, "join room ABC123" can
only find rooms that exist in *this browser* — it cannot reach a housemate's
phone. The join dialog and the room settings both say so.

### Stored shape and its migrations

`fairysplit:v2` in localStorage. Records written by earlier versions are
normalised on read, never in a destructive rewrite — and a read never *writes*.
It did once, and the write notified every open screen, which read again: a loop
that ended in "Maximum call stack size exceeded". Reads fix their copy in memory;
the next write persists the fixed shape, because every write reads first.

| Was | Is now |
|---|---|
| a separate `Period` record | folded into the bill; a bill carries its own dates |
| `memberDays` (whole days) | `memberHours`, ×24 on read |
| appliances with no `trackerId` | `null` — "equally" for an always-on one, and a metered one keeps pricing from its own entries |
| trackers with no `sortOrder` | derived from the order they already had on screen |
| entries with `memberId` | `participantIds: [memberId]`, which costs exactly what it did |
| trackers with no `runningWith` | `{}` — a run already going is charged to whoever started it |
| bills with no `logAmounts` | `{}` — nothing overridden, so every log is in charge |
| entries older than `HISTORY_DAYS` | dropped |

### Design system

The UI follows `fairysplit-ui-sample.html` — a light blush palette in Figtree,
with three rules doing all the work:

1. **Zero radius** on the flat surfaces. Every `rounded-*` utility derives from
   `--radius`, so squaring it is one line in `globals.css`.
2. **Line, not elevation.** Surfaces separate with a 1px hairline and almost no
   shadow. Outline buttons carry a heavy near-black stroke instead.
3. **One type family.** Figtree throughout. Headings and money track at −0.035em
   against relaxed 500-weight captions, with tabular numerals anywhere a peso
   sign appears.

Every colour lives in `app/globals.css`; no component contains a hex code. Three
deliberate departures from the sample, all documented in that file:

- **`--bw-outline` is 2px, not 1.8px.** Chrome floors `border-width` to whole
  device pixels, so at DPR 1 a 1.8px stroke renders identically to the 1px
  hairline — losing exactly the contrast the outline button exists for.
- **A second grey.** `--grey` (#7E6A70) is 5.0:1 on white but only 4.4:1 on the
  page ground. `--grey-strong` (#6E6065) is 5.3:1 on the ground and is used
  wherever a caption is not on white. Contrast is swept with a scripted
  `getComputedStyle` pass; the tracking panel, the logs summary and the share
  table were last audited clean at WCAG AA. A full sweep of every route has not
  been re-run since the screens were restructured.
- **Success / warning / danger tokens.** The sample has none, so these are an
  extension built to its rules.

The app is light-only. The sample's dark tokens cover its own study page, not the
product screens, so there is no dark palette to port.

---

## Tests

`npm test` — **108 tests**, all pure. No component is rendered; everything below
the UI is proven directly.

| File | Tests | Covers |
|---|---|---|
| `lib/billing/engine.test.ts` | 32 | the ladder, the property run, scaling, the overflow guard |
| `lib/billing/from-bill.test.ts` | 29 | the bill's date window, usage drawn from logs, overrides, shared entries |
| `lib/tracking/elapsed.test.ts` | 32 | the daily reset, midnight-spanning runs, per-person shares |
| `lib/billing/money.test.ts` | 15 | centavos, millicents, largest-remainder |

Highlights:

- **The ladder** (L1–L4 from the brief) asserted to the centavo, including the
  two-member tie-break that makes two 3-day housemates differ by ₱0.01.
- **Property test, 10 000 random inputs**: shares always sum to exactly the
  billed total and no share is ever negative. From a fixed seed, so any failure
  is reproducible. The test asserts its own coverage — it fails if the generator
  stops producing overflow cases, single-member rooms, twelve-member rooms and
  shared uses.
- **The shares of an entry add back up to the whole of it** — the property that
  keeps a bill reconciling once entries are shared between people.
- **A run crossing midnight** gives two hours to each day rather than four to
  whichever end you looked at. Built from local-date constructors, so the suite
  passes in any timezone.
- **An override of `0` means zero**, not "go back to the log".

The suite was written before the engine and verified by mutation: reverting step
5 to the naive "zero the residual, leave the carve-outs" version fails three
tests, including the property run.

---

## Two corrections to the spec

1. **`Millicents` example was off by 10×.** §5 says `₱14.86/kWh => 14_860_000`,
   but ₱14.86 is 1486 centavos, which is `1_486_000` millicents. The larger value
   contradicts `kwhToCentavos` and the L3 ladder row (a ₱10/kWh fridge at
   1 kWh/day × 30 days must cost ₱300). `money.test.ts` pins it.

2. **`Bill` needed a `paidMemberIds` field.** §10.1 asks for a mark-as-paid
   checkbox per member, which the §5 model had nowhere to store.

## What changed since Phase A

**Added**

- The whole tracking system: logs, clock in/out, manual logs, the daily reset,
  drag ordering, editable entries, participants per entry.
- Appliances answer "how is it charged?" with *Equally* or a named log, and draw
  their quantities from it.
- Per-bill overrides, with the log as the default.
- Bill kinds (electricity / water / other), which decide what fields exist.
- The logs summary on the bill screen, with the ⓘ formulas, and a link
  straight to the log a figure came from.
- **A logs history page**, a tab per log, with the same editable row as the
  card — and a 120-day retention window with a note saying so.
- **Multi-date picking** for clock logs, on a calendar built rather than
  installed. Each date keeps the times and people it was picked with.
- **Deleting an entry asks first**, in place.
- **Sharing a split**: a PNG drawn on a canvas, the browser's print-to-PDF, and
  the OS share sheet where a phone offers one.
- Invites: a join code and a whole invite message, carrying a `/?join=CODE` link.

**Removed**

- **Periods.** Two bills almost never share one, and making them share it cost a
  whole screen to navigate. A bill carries its own dates.
- The bill screen's Appliances, Other charges, "Your logs" and
  "Hours in the unit" panels — appliances and charges moved into the bill's own
  editor, and log figures moved to the logs summary.
- The reconciliation line and "How this was split", whose content is now in the
  ⓘ icons.
- The Days column on the share table, replaced by a money column per log.
- **Appliance defaults** in room settings. An appliance belongs to the bill it
  is on; a room-wide default was a second place to keep the same fact.
- **The add-a-name field** in People, replaced by inviting — which, with no
  backend, cannot yet reach another device. See *Known limits*.
- The pencil on a logs-summary row and the *Edit* button on a bill in the list.
  An entry is edited where it is recorded, and a bill opens by being clicked.
- The "charged to" tick boxes on *Hours in the unit*. Only one person can be in
  the unit as you, so there was nothing to tick.

**Not in this phase**

Supabase, any database, auth, payment processing, notifications, email. Nothing
here blocks them — see the seam above.

### Known limits

Written down rather than papered over — each is a consequence of having no
backend yet, or a rough edge worth naming.

- **A room cannot gain a member on this device.** Removing the add-a-name field
  left inviting as the only way in, and an invite has nowhere to travel: the
  code and the link both resolve against *this* browser's storage. Until there
  is a backend, a room's people are whoever it was created with. Putting a name
  field back is a small change if that turns out to matter sooner.
- **Retention is browser-side.** Nothing is running while the app is closed, so
  entries past 120 days disappear the next time the app is opened — not on the
  day they expire. They are never *shown* past the window, so the effect is only
  that the stored copy lingers.
- **An added clock log shows two "Charged to" pickers** while its add-entry form
  is open: the card's own, which decides who a live run is charged to, and the
  form's, which decides who the typed entry is charged to. They are genuinely
  two different questions, but the screen does not say so.

### Unmounted files

Four components are still on disk but no longer rendered anywhere:
`my-logs-panel.tsx`, `appliances-panel.tsx`, `other-charges-panel.tsx` and
`member-days-input.tsx`. They are kept in case those sections come back; nothing
imports them.
