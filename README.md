# FairySplit

Split shared household bills by the hours each person actually stayed, with
appliance usage charged to whoever ran it. Replaces the spreadsheet.

A **room** is one household. Housemates sign in, join the room with a code, and
clock in and out of the unit — and of the aircon, the washer, anything worth
counting. A **bill** is then split from those logs, to the centavo: what only
some of you used is charged to those people, and whatever is left is shared by
days stayed.

Next.js 16 (App Router) · React 19 · TypeScript, strict · Tailwind CSS 4 with
shadcn/ui · Supabase (Postgres, Auth, row-level security) · Vitest. Money is
Philippine pesos (₱).

**Jump to:** [Getting started](#getting-started) ·
[How it works](#how-it-works) · [How a bill gets split](#how-a-bill-gets-split) ·
[Rooms, accounts and privacy](#rooms-accounts-and-privacy) ·
[Screens](#screens) · [Architecture](#architecture) ·
[Design system](#design-system) · [Tests](#tests) · [Deployment](#deployment) ·
[Known limits](#known-limits)

---

## Getting started

You need Node.js 20.9 or newer and a free [Supabase](https://supabase.com)
project.

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values, below
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build. Type-checks; does not run lint |
| `npm start` | Serve the production build |
| `npm test` | Vitest — the calculation engine and the sign-in logic, proven |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run lint` | ESLint |

### 1. Create the database

In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) once.
It is the only definition of the database shape — nothing is created through the
dashboard — so the file and the database cannot disagree. It assumes two project
settings chosen when the project was created: *Automatically expose new tables*
**off** and *Enable automatic RLS* **on**.

Then run [`supabase/verify-rls.sql`](supabase/verify-rls.sql). It makes two
throwaway accounts and proves the privacy rules hold (see
[Who can see what](#who-can-see-what)); run it again after any change to a
policy. The files in `supabase/migrations/` are for databases created before
those changes — a fresh `schema.sql` already contains them.

### 2. Turn on sign-in

Supabase → Authentication → Providers → **Google**, with a client ID and secret
from an OAuth client (type *Web*) in Google Cloud. Add Supabase's
`/auth/v1/callback` address as an authorized redirect URI there.

Then Authentication → URL Configuration. Set the Site URL, and add every origin
the app is served from — `http://localhost:3000` and your production address —
to the Redirect URLs. This is the one to get right: when a redirect is not on
the list Supabase quietly falls back to the Site URL, so a sign-in started on
production can end up on localhost.

### 3. Environment

`.env.local`, from [`.env.example`](.env.example):

| Variable | |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project's URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public by design. It only ever acts as the signed-in person's own identity; row-level security decides what that identity may read |
| `NEXT_PUBLIC_SITE_URL` | Optional. The address invite links point at. Defaults to the live site |

A missing Supabase value fails loudly at startup rather than as a confusing 401
three screens later.

---

## How it works

**Logs** record what happened. **Bills** divide what it cost. The logs live on
the room screen and are the same whichever bill later reads them; a bill only
counts the entries that fall inside its own dates.

### Logs

A room has any number of logs, and always at least one: **Hours in the unit**,
the built-in occupancy clock that every bill is weighted by. It cannot be
deleted — the database allows exactly one per room. Added logs are whatever else
is worth counting — the aircon, the washer.

Each log is fed one of two ways:

- **Clock in / out** — a live timer. The built-in one says *I'm in / I'm out*;
  added ones say *Clock in / Clock out*. A run is stamped with the **database's**
  clock when it starts and stops, not the browser's, so a device with the wrong
  time cannot hand itself extra hours — and a run keeps going if you close the
  app.
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
— the same rule a shared appliance event has always used. One person's share of
an entry is `quantity ÷ participants`, and the shares of any entry always add
back to the whole of it. That is what keeps a bill reconciling once entries are
shared.

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
nothing past the [retention window](#retention). `min`/`max` steer the picker and
every save checks again, because a date typed straight in ignores them.

A double-tap on *Add entry*, or a retried request, cannot log the same stretch
twice: a clock run with exactly the same start, end and people as one already on
the log is skipped. Typed amounts are exempt — "4 cycles" twice in a day can
honestly be two loads of laundry.

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

### Overlapping use

Two people who ran the aircon 2–4 pm and 3–5 pm did not use it for four hours
between them — they used it for three: one hour each alone, and one hour
together. A bill finds that **after the fact**, so nobody has to remember to tick
each other's names whenever their times happen to coincide.

[`lib/tracking/overlap.ts`](lib/tracking/overlap.ts) cuts the timeline at every
point a clock span starts or ends. Whoever's span covers a slice shares that
slice equally — the same rule an entry logged for several people already uses —
and everyone's own non-overlapping hours stay with them. A gap between runs
contributes nothing. It is pure: the bill's window is passed in, never read from
the clock.

Typed entries have no times to compare, so they stay solo. A hand-entered figure
for a person *replaces* what the log says for them, overlap included: they are
taken out of every clocked entry before the rest is decomposed, so their number is
never blended with somebody else's clock. This can lower what an appliance costs
in total — the overlap is no longer charged twice — which is why the formula
shown on a bill is worded as an explanation, not as a sum to re-add by hand.

### Retention

Logs only go back **120 days**. `HISTORY_DAYS` in
[`lib/tracking/elapsed.ts`](lib/tracking/elapsed.ts) is the one place that number
lives: it bounds what the repository returns, what the date pickers accept, and
the note on the history page. It is deliberately longer than any billing period,
so a bill can always still reach the entries it covers.

Today this is a *display* rule. The Supabase repository filters older entries out
as it reads them; nothing yet deletes the rows. (The original localStorage store
really did drop them on its next write.) See [Known limits](#known-limits).

---

## How a bill gets split

A bill is electricity, water or something else. Only electricity can carry a rate
and appliances. Electricity and water need their dates — days stayed weight the
split, so the window has to exist — and "Others" may go without. If the collected
amount should be a round number, the bill can round up to the peso first, and
that rounded figure is what gets split.

1. **Appliances charged equally** (the fridge) are carved out and shared equally
   — kWh a day × the days the bill covers × the rate. They run 24/7 whether you
   were home or not.
2. **Appliances charged from a log** are carved out and charged to the people
   who logged the usage, within the bill's dates: hours (or cycles) × kWh per
   unit × the rate, shared equally by the people each entry names. Overlapping
   clock use is [split first](#overlapping-use).
3. **Other charges** (a late fee) are carved out across whoever they apply to —
   everyone by default. "Everyone" adapts if someone joins the room later; a
   ticked list does not.
4. Whatever is left — the **residual** — is split in proportion to **days
   stayed**, which come from the occupancy clock.

The residual is *defined* as the leftover, never computed independently. That is
what guarantees the column adds up to the bill exactly, every time, even though
the appliance kWh figures are estimates.

**Equal means equal.** Steps 1–3 give every person the *same* figure: the total
divided and rounded once, like a spreadsheet's `=total/n` cell, instead of
₱101.24 / ₱101.25 / ₱101.25. That can leave a centavo unaccounted for inside
those steps, and it does not matter, because step 4 takes whatever they actually
sum to out of the bill — the grand total is unaffected. The two steps that have
nowhere to put a spare centavo — the occupancy split and the overflow scaling
below — use largest-remainder rounding instead, which makes the parts add up
exactly, with a deterministic tie-break.

**Guard rails**

- If the appliance and charge figures add up to more than the bill, they are
  scaled down to fit, and the screen says so.
- If nobody has hours inside the bill's dates, the shared portion is split
  equally, and the screen says so.
- If someone's days exceed the days the bill covers, the split still works, with
  a warning that a date or an entry is probably wrong.
- The engine asserts that the shares add up to the bill. If they ever do not, it
  throws: a wrong bill must never render.

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
which is why a new bill weights itself correctly with nothing typed. A typed `0`
means zero.

### Two modes, one field

The **electricity rate (₱/kWh)** is the switch.

- **Blank** → simple split, purely by days. No appliances.
- **Filled** → itemized, and the carve-out maths above applies.

A bill needs only a total and one member to produce a correct, fully reconciled
split. Everything else is optional and only makes it more precise.

---

## Rooms, accounts and privacy

### Signing in

Accounts are Supabase Auth. **Google** is the live sign-in. **Facebook** and
**email + password** are built but switched off, by `FACEBOOK_ENABLED` and
`EMAIL_PASSWORD_ENABLED` in [`lib/auth/config.ts`](lib/auth/config.ts):

- Facebook only lets people with a role on the app use it until the app is
  published, and Meta's publish step asks for business verification.
- Email + password needs a verified sending domain for its confirmation emails
  before it can work for anybody but the account's owner.

Flip a flag and nothing else needs rebuilding. A person's profile name comes from
the provider (or the signup form) when the account is created, and is what
housemates see when they create or join a room.

### Rooms and people

A **member** is a person *in a room*, which is not the same as an account. Each
room has its own member rows, each with its own name — you might be "Phoebe" in
one flat and "Ate Phoebe" in another — and `members.user_id` links a row to the
account that holds it.

Which member is **you** is answered by that link
(`repo.getMyMember(roomId)`), never by comparing names. Renaming yourself, in the
header or in a room, cannot lose your clock, and two people called Phoebe cannot
be mixed up.

Within a room everyone is trusted: any member can rename or remove any member,
and can rename or delete the room. That is how the spreadsheet worked, and a
household is a small circle. Removing someone asks first, and says what will be
erased along with them — their logged usage — before every bill re-splits without
them.

### Joining and invites

A room has a six-character **join code**: letters and digits, with 0, O, 1 and I
left out because they get misread out loud. The People panel's *Add* button
offers the code and a whole invite message ready to paste, carrying a link,
`…/?join=CODE`.

- Opened **signed in**, the link opens the Join dialog with the code filled in.
- Opened **signed out**, it takes you through sign-in and back to the dialog. The
  code rides in a short-lived cookie across the trip to Google, not in the
  redirect URL: Supabase only honours redirect URLs on its allow-list, and a
  changed one could quietly break sign-in for everyone.
  ([`lib/auth/join-intent.ts`](lib/auth/join-intent.ts) — only a real code ever
  reaches the cookie or a redirect.)
- Links always point at `SITE_URL` ([`lib/site.ts`](lib/site.ts)), never at
  whatever address you happen to be browsing from, so one made on localhost still
  works for a housemate.

### Who can see what

Every table has row-level security, and the rule is always the same: **you can
touch a row if you are a member of the room it belongs to**.

- The helpers that answer that are `SECURITY DEFINER` functions in a `private`
  schema. PostgREST only exposes `public`, so they are not an API endpoint, but
  the policies can call them — and they have to be definers, because a policy on
  `members` that queried `members` would recurse forever.
- `anon` has no grants at all. The browser only ever holds the publishable key.
- Creating and joining a room (`create_room`, `join_room`) and the three
  operations that touch many rows (`start_clock`, `stop_clock`, `remove_member`)
  are database functions, so they happen completely or not at all.
- [`supabase/verify-rls.sql`](supabase/verify-rls.sql) proves it: person B cannot
  read, write or delete anything in person A's room — and A can. Both halves
  matter, because a rule that blocks everybody would pass the first on its own.

### Privacy and deleting your data

[`/privacy`](app/privacy/page.tsx) and [`/data-deletion`](app/data-deletion/page.tsx)
are public pages, reachable signed out — Google's and Facebook's publishing flows
both ask for them. There is no delete-my-account button yet: deleting an account
is done by email, as `/data-deletion` spells out. Members can rename or remove
themselves from rooms first, and an account that created a room cannot be
deleted while that room exists (`rooms.created_by` is `on delete restrict`).

---

## Screens

```
/                                 rooms ("/?join=CODE" opens the join dialog)
/login, /signup                   Google sign-in; already signed in → straight on
/auth/callback                    where Google sends people back; swaps the code
                                  for a session
/auth/confirm                     landing for an email-confirmation link
/privacy, /data-deletion          public
/rooms/[roomId]                   Your tracking (the logs) + Bills
/rooms/[roomId]/logs              logs history: a tab per log
/rooms/[roomId]/settings          name, join code, people, delete
/rooms/[roomId]/bills/[billId]    the bill: your logs summary + the share table
```

Signed out, every room page sends you to `/login`.

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

---

## Architecture

```
app/                              routes. Pages gate access on the server; every
                                  screen is a client component
  login/ signup/                  sign-in
  auth/callback  auth/confirm     OAuth landing; email-link landing
  privacy/ data-deletion/         public pages
  rooms/[roomId]/…                room, logs history, settings, bills
proxy.ts                          session refresh only (Next 16's Proxy)

lib/
  billing/
    money.ts        THE ONLY place money is divided or kWh converted
    engine.ts       pure: plain objects in, plain objects out. No React, no clock.
    occupancy.ts    hours -> days, and the days a bill covers
    from-bill.ts    stored records -> engine input: the round-up, the bill's
                    date window, and the usage its logs supply
  tracking/
    elapsed.ts      pure: turning a running clock into a number. `now` is passed
                    in, never read from the system. Also holds HISTORY_DAYS.
    overlap.ts      pure: overlapping clock spans -> who shared each slice
  data/
    types.ts        the domain model
    repository.ts   the interface every screen reads and writes through
    supabase-repository.ts   the implementation the app uses (Postgres, behind RLS)
    local-repository.ts      the original localStorage implementation; kept as
                    the reference, not used by the app
    index.ts        exports the active implementation — one line to swap
    hooks.ts        useRepoQuery / useRepoAction, so components just await
    change-event.ts, join-code.ts   the refresh signal; the join-code alphabet
  auth/
    dal.ts          getUser / requireUser — the one place that answers "who is asking?"
    actions.ts      server actions: sign in/up/out, Google, Facebook
    config.ts       which sign-in paths the UI offers
    join-intent.ts  carrying an invite through sign-in
    schemas.ts  display-name.ts
  supabase/         browser client, server client, the env check
  forms/
    schemas.ts      Zod: text, dates, join codes
    numeric.ts      Zod: strict string -> number, then peso -> centavos
  site.ts           where invite links point

supabase/           schema.sql, verify-rls.sql, migrations/
components/fairy/   the app's own components
components/ui/      shadcn/ui primitives
```

### Money

Integer **centavos** everywhere. A rate is **millicents** — 1/1000 of a centavo,
so `₱14.86/kWh` is `1_486_000`. In the database these are `bigint`, never numeric
and never float. Formatting to `₱1,234.56` happens once, at render time. Nothing
outside `lib/billing/money.ts` divides money or converts kWh.

That conversion is easy to get wrong by a factor of ten and impossible to see in
review, so `money.test.ts` pins it: a ₱10/kWh fridge at 1 kWh a day for 30 days
must cost ₱300.

### Occupancy

Stored as **hours**, never days. Days are derived at `HOURS_PER_DAY = 24` — one
number behind the split rather than two that could disagree. The bill screen lets
you type either, and converts.

`resolvedMemberDays()` in `lib/billing/from-bill.ts` is the single function that
supplies member days to the engine: a hand-entered figure if there is one,
otherwise the occupancy clock counted over the bill's dates.

### The data seam

Every read and write goes through `Repository`, and **every method is `async`**.
`lib/data/index.ts` is the one line that decides which implementation the app
gets: `SupabaseRepository` now, `LocalRepository` (one JSON blob in localStorage)
before the app had accounts.

Components `await` through two hooks and nowhere else. `useRepoQuery` re-runs a
read whenever the store changes, and shows a skeleton only for a genuine load —
mounting, or switching rooms — because flipping back to one on a refresh would
unmount whatever somebody was typing into. `useRepoAction` wraps a write: it
tracks in-flight state and surfaces the error text, and a ref (not state) stops a
fast double-tap from firing it twice.

`SupabaseRepository` fires a `fairysplit:changed` event after every successful
write. There is no single choke point for a browser client's requests, so its
constructor returns a `Proxy` that wraps a fixed set of write methods — one place
to forget, instead of thirty-odd. That is why screens refresh after a change
without anybody remembering to ask.

Wall-clock time is read at the edges only. Postgres stamps a clock's start and
end; `useNow` in the tracking panel exists purely to make the seconds on screen
advance, and nothing is ever *stored* from it.

### Who is asking

`proxy.ts` does one job: hand Supabase the request cookies, let it rotate an
expiring token, and copy what it wrote onto the response. Next's own docs warn
that Proxy should not be a session-management or authorization layer, so *who may
see what* is decided next to the data: `getUser()` in `lib/auth/dal.ts` (always
`auth.getUser()`, which is checked against the auth server — never the
cookie-only session, which the browser could have edited), `requireUser()`, which
the room pages call, and underneath both, row-level security.

### The database

| Table | Holds |
|---|---|
| `profiles` | one row per account: its display name |
| `rooms` | name, join code, who created it |
| `members` | a person in a room: a per-room name, and the account that holds it (if any) |
| `trackers` | a room's logs; *Hours in the unit* is the built-in one |
| `tracker_runs` | clocks running right now, and who each will be charged to |
| `log_entries` | finished amounts — a clock run or a typed number — charged to a set of people |
| `bills` | a bill, with its appliances, usage and other charges kept as JSONB |
| `bill_member_hours`, `bill_log_amounts` | hand-entered overrides; an absent row means "count the log" |
| `bill_paid` | who has settled up |

A bill's own contents stay JSONB because they are edited as a unit, in one
dialog, by one person; splitting them into tables would buy concurrency nobody
uses. The *per-member* facts get their own tables, because two housemates ticking
"paid" at the same moment really are different rows.

### Design system

The UI follows [`fairysplit-ui-sample.html`](fairysplit-ui-sample.html) — a light
blush palette in Figtree, with three rules doing all the work:

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

### Decisions worth knowing

- **A bill carries its own dates.** There is no shared "period": two bills almost
  never share one, and making them share it cost a whole screen to navigate.
- **An appliance belongs to the bill it is on.** A room-wide default would be a
  second place to keep the same fact.
- **People are invited, not typed in.** A member is a person who joins with a
  code, not a name somebody filed.
- **There is no "charged to" on *Hours in the unit*.** Only one person can be in
  the unit as you, so there is nothing to tick.
- **An entry is edited where it is recorded**, and a bill opens by being clicked.

---

## Tests

`npm test` — **163 tests** in 11 files, all quick. No component is rendered and
nothing talks to a real database; everything below the UI is proven directly.

| File | Tests | Covers |
|---|---|---|
| `lib/billing/engine.test.ts` | 32 | the ladder, the property run, scaling, the overflow guard |
| `lib/billing/from-bill.test.ts` | 34 | the bill's date window, usage drawn from logs, overrides, shared entries, overlapping use |
| `lib/billing/money.test.ts` | 20 | centavos, millicents, largest-remainder, equal shares |
| `lib/tracking/elapsed.test.ts` | 38 | the daily reset, midnight-spanning runs, per-person shares, duplicate detection |
| `lib/tracking/overlap.test.ts` | 11 | splitting overlapping clock spans |
| `lib/data/supabase-repository.test.ts` | 5 | "which member is me" is answered by account |
| `lib/auth/*.test.ts` | 18 | an invite surviving sign-in: cleaning the code, the cookie, the callback |
| `lib/site.test.ts` | 4 | invite links never point at localhost |
| `components/fairy/share-table.test.ts` | 1 | the share table's column builder |

Highlights:

- **The ladder** (L1–L4 from the original brief) asserted to the centavo,
  including the two-member tie-break that makes two 3-day housemates differ by
  ₱0.01.
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
- **Overlaps**, hand-traced before they were trusted: the 2–4 pm and 3–5 pm
  example, a three-way overlap, and two spans that touch without overlapping.
- **Two people called Phoebe** each get their own row, and a renamed header
  still finds you.
- **The invite flow** pins the Google redirect URL exactly, and that the
  callback only ever redirects to our own paths.
- **An override of `0` means zero**, not "go back to the log".

The engine's suite was written before the engine and verified by mutation:
reverting step 5 to the naive "zero the residual, leave the carve-outs" version
fails three tests, including the property run. The identity, invite and
share-table tests were each checked the same way — put the bug back, watch them
fail.

---

## Deployment

The app is deployed on [Vercel](https://vercel.com) at
https://fairy-split-v2.vercel.app. Every push to `main` is built with
`npm run build` and, if it passes, goes live.

- The build **type-checks but does not lint**, and a failing build leaves the last
  good deployment serving. Production is never broken by one — it just stops
  updating. Run `npm run build` before pushing.
- Production needs the same environment variables as `.env.local`, set for
  Production and Preview.
- Supabase's Redirect URLs list needs the production origin. Sign-in on a Vercel
  *preview* URL needs that URL on the list too.
- Invite links use `NEXT_PUBLIC_SITE_URL`, which defaults to the Vercel address.
  Set it when the app moves to its own domain.

---

## Known limits

Written down rather than papered over.

- **Old log entries are hidden, not deleted.** After 120 days they stop counting
  and stop showing, but nothing removes the rows from the database yet.
- **Facebook and email + password sign-in are off**, for the reasons
  [above](#signing-in). Google is the only way in.
- **A join code cannot be changed.** Anyone who holds a room's code can join it.
  To shut somebody out, remove them; to end the room, delete it.
- **Members trust each other.** Any member can rename or remove anyone, and
  rename or delete the room.
- **Deleting an account is manual** — by email, as `/data-deletion` describes.
- **An added clock log shows two "Charged to" pickers** while its add-entry form
  is open: the card's own, which decides who a live run is charged to, and the
  form's, which decides who the typed entry is charged to. They are genuinely
  two different questions, but the screen does not say so.
- **Pesos only**, and no payment processing, notifications or email beyond
  sign-in confirmation.

### Unmounted files

Four components are still on disk but no longer rendered anywhere:
`my-logs-panel.tsx`, `appliances-panel.tsx`, `other-charges-panel.tsx` and
`member-days-input.tsx`. They are kept in case those sections come back; nothing
imports them.
