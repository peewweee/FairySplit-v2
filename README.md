# FairySplit — Phase A

Split shared household bills by the days each person actually stayed, with
appliance usage charged to whoever used it. Replaces the spreadsheet.

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

## How a bill gets split

1. **Always-on appliances** (the fridge) are carved out and shared **equally** —
   they run 24/7 whether you were home or not.
2. **Metered usage** (aircon hours, laundry cycles) is carved out and charged to
   the people who logged it, split equally between them.
3. **Other charges** (a late fee) are carved out across whoever they apply to.
4. Whatever is left — the **residual** — is split in proportion to **days stayed**.

The residual is *defined* as the leftover, never computed independently. That is
what guarantees the column adds up to the bill exactly, every time, even though
the appliance kWh figures are estimates.

## Two modes, one field

The **electricity rate (₱/kWh)** is the switch.

- **Blank** → simple split, purely by days. The appliance section is *not
  rendered at all*. This is what a water or internet bill always uses.
- **Filled** → itemized. The appliance section appears, and the carve-out maths
  above applies.

A bill needs only a total and one member to produce a correct, fully reconciled
split. Everything else is optional and only makes it more precise.

---

## Layout

```
app/                              routes only; every screen is a client component
  rooms/[roomId]/                 members, periods, quick summary of the open period
    settings/                     name, join code, appliance defaults, delete
    periods/[periodId]/           dates, day count, days-in-unit per member, bills
    bills/[billId]/               the main screen: share table, appliances, charges

lib/
  billing/
    money.ts        THE ONLY place money is divided or kWh converted
    engine.ts       pure: plain objects in, plain objects out. No React, no clock.
    occupancy.ts    THE ONLY source of "days stayed"
    from-bill.ts    stored records -> engine input, including the round-up step
    *.test.ts       the ladder, the property test, the money conversions
  data/
    types.ts        the domain model
    repository.ts   the interface every screen reads and writes through
    local-repository.ts   localStorage implementation (this phase)
    index.ts        exports the active implementation — one line to swap
    hooks.ts        useRepoQuery / useRepoAction, so components just await
  forms/
    schemas.ts      Zod: text, dates, join codes
    numeric.ts      Zod: strict string -> number, then peso -> centavos

components/fairy/   the app's own components
components/ui/      shadcn/ui primitives
```

### Design system

The UI follows `fairysplit-ui-sample.html` — a light blush palette in Figtree,
with three rules doing all the work:

1. **Zero radius.** Cards, rows, buttons, inputs, sheets — hard corners
   everywhere. Only true circles keep a radius. Every `rounded-*` utility in the
   app derives from `--radius`, so squaring it is one line in `globals.css`.
2. **Line, not elevation.** Surfaces separate with a 1px hairline and almost no
   shadow. Outline buttons carry a heavy near-black stroke instead.
3. **One type family.** Figtree throughout, including the wordmark. Headings and
   money track at −0.035em against relaxed 500-weight captions, with tabular
   numerals anywhere a peso sign appears.

Signature details: the **arc bleed** (thin clipped circles at a card corner) on
the bill hero and empty states, and the **pink tick** that opens every row of
"How this was split".

Every colour lives in `app/globals.css`; no component contains a hex code. Three
deliberate departures from the sample, all documented in that file:

- **`--bw-outline` is 2px, not 1.8px.** Chrome floors `border-width` to whole
  device pixels, so at DPR 1 a 1.8px stroke renders identically to the 1px
  hairline — losing exactly the contrast the outline button exists for. Same
  reasoning for the 2px underline on `.fs-link`.
- **A second grey.** `--grey` (#7E6A70) is 5.0:1 on white, but only 4.4:1 on the
  page ground and 4.3:1 on the tint blocks. The sample keeps a darker
  `--page-sub` for exactly this; it is here as `--grey-strong` (#6E6065), used
  wherever a caption is not on white. All nine routes audit clean at WCAG AA.
- **Success / warning / danger tokens.** The sample has none, so these are an
  extension built to its rules — readable ink-weight colour on white, each with
  its own tint block, all clearing AA.

The app is light-only. The sample's dark tokens cover its own study page, not
the product screens, so there is no dark palette to port.

### Money

Integer **centavos** everywhere. A rate is **millicents** — 1/1000 of a centavo,
so `₱14.86/kWh` is `1_486_000`. Formatting to `₱1,234.56` happens once, at render
time. Nothing outside `lib/billing/money.ts` divides money or converts kWh.

### The data seam

Every read and write goes through `Repository`, and **every method is `async`**
even though localStorage is synchronous. Components already `await` and already
render loading states, so Phase B's Supabase implementation is a one-line change
in `lib/data/index.ts` with no component touched.

**Join codes are local to this device.** With no backend, "join room ABC123" can
only find rooms that exist in *this browser* — it cannot reach a housemate's
phone. The join dialog and the room settings both say so.

### Occupancy

`memberDaysFor()` in `lib/billing/occupancy.ts` is the single function that
supplies member days. Today it reads what the user typed. In Phase C it will
compute the same shape from a session log, and the engine — which takes `days`
as a plain number and never asks where it came from — will not change.

---

## Tests

`npm test` — 56 tests.

- **The ladder** (L1–L4 from the brief) asserted to the centavo, including the
  two-member tie-break that makes two 3-day housemates differ by ₱0.01.
- **Property test, 10 000 random inputs**: shares always sum to exactly the
  billed total and no share is ever negative. Member count, days, quantities,
  participant sets and which optional fields are null are all randomised, from a
  fixed seed so any failure is reproducible. The test asserts its own coverage —
  it fails if the generator stops producing overflow cases, single-member rooms,
  twelve-member rooms, shared uses, and so on.
- **Scaling**: 1, 2, 3, 4, 7 and 12 members, as a loop over counts.
- **The overflow guard**: carve-outs exceeding the bill scale down proportionally
  so the column still totals exactly the bill, with no negative shares.

The suite was written before the engine and verified by mutation: reverting step
5 to the naive "zero the residual, leave the carve-outs" version fails three
tests, including the property run.

---

## Two corrections to the spec

1. **`Millicents` example was off by 10×.** §5 says `₱14.86/kWh => 14_860_000`,
   but ₱14.86 is 1486 centavos, which is `1_486_000` millicents. The larger value
   contradicts `kwhToCentavos` and the L3 ladder row (a ₱10/kWh fridge at
   1 kWh/day × 30 days must cost ₱300, which only works at `1_000_000`). The code
   follows the formula and the ladder; `money.test.ts` pins it.

2. **`Bill` needed a `paidMemberIds` field.** §10.1 asks for a mark-as-paid
   checkbox per member, which the §5 model had nowhere to store.

## Not in this phase

Supabase, any database, auth, the dorm timer, payment processing, notifications,
email. Nothing here blocks them — see the seam above.
