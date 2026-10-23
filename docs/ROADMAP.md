# Status, constraints and next steps

Written 12 October 2026. It records what is built, what the plan still owes, what the
project is boxed in by, and the order to do things in. The checklist for the public
launch is [LAUNCH.md](LAUNCH.md); what happens as users arrive is
[SCALING.md](SCALING.md). Figures about other companies' plans (Supabase, Vercel,
Google) were checked in October 2026 and change; each is marked so you re-check it
before relying on it.

---

## Where it stands

FairySplit is **live** at https://fairy-split-v2.vercel.app and used by its owner's own
household. It has **not been announced** anywhere.

| Piece | State |
|---|---|
| The app: logs and clocks, bills split to the centavo, per-bill overrides, share as image and PDF | Built and live |
| Accounts on Supabase (Postgres, Auth, row-level security), rooms, invite links | Built and live since 27 September 2026 |
| Google sign-in | Live. The only way in |
| Facebook sign-in, email + password | Built, **switched off** (`lib/auth/config.ts`) |
| Privacy, Terms, data deletion pages | Live |
| Help on the appliance fields: sample energy guide and label, the converter | Live |
| Tests | 285 in 24 files, all unit tests; the build type-checks, lint is run by hand |
| End-to-end tests, CI, error monitoring, uptime monitoring, analytics | **None** |

## In the plan, not done yet

These are things already decided on, or written down as owed, and not finished.

| Item | Why it waits, and what is needed |
|---|---|
| **Google consent screen: publish, and verify the brand** | The screen still shows the Supabase address instead of the app's name. The Search Console tag is live; next is *Verify* in Search Console, a 24-hour wait, then "I have fixed the issues" in Google. The *Publish app* button was blocked and the cause was never found. An About page may be needed for the homepage field |
| **Facebook sign-in** | Parked until the app is polished end to end. Needs Meta's Business Verification (a government ID, the owner's own task). Flip `FACEBOOK_ENABLED`, and give `signInWithFacebook` the same invite handling Google has |
| **The branding pass** | A domain, a branded contact address, Resend as the email sender, then email + password back on, and the contact address swapped everywhere it appears. Trigger: the app works end to end *and* close friends have tested it |
| **Log retention** | Entries older than 120 days are hidden, **never deleted**. `/privacy` and the logs page say they are cleared automatically. One of the two has to change, and because a bill's split is recomputed from the logs, a bill older than about four months already shows a different split than the one that was paid (see LAUNCH.md and SCALING.md) |
| **A running clock is cut at midnight by the app, not the server** | One left on with the app closed stays open until somebody opens the app. A scheduled job would fix it but needs a time zone per room |
| **Self-serve account deletion** | Deleting an account is done by hand from an emailed request; the steps are in [SCALING.md](SCALING.md#runbooks) |
| **Changing or rotating a join code** | Not possible. Anyone who holds a code can join |
| **Throwaway test accounts and rooms** | To be cleared before real users arrive |
| **`supabase/verify-checkpoint-clock.sql`** | Run once in the Supabase SQL editor by the owner. Never through a connector: it creates accounts |
| **A full contrast sweep of every route** | Last done before the screens were restructured |
| **Time zones** | A bill's window follows the viewing device's zone; the one-off midnight split hard-codes Asia/Manila. Fine in one country, wrong for a housemate abroad |

## Constraints

What the project is boxed in by. Most are choices of plan, not bugs.

**Platform (free plans).** Re-check on the vendors' pages before relying on any of these.
- *Supabase Free:* 500 MB database, 5 GB egress a month, 50,000 monthly active users,
  shared CPU; **a project is paused after a week without activity**; daily backups are
  listed only from the Pro plan ($25 a month, backups kept 7 days). https://supabase.com/pricing
- *Vercel Hobby:* **personal, non-commercial use only** (ads or taking payment make a site
  commercial; donations do not), 100 GB of bandwidth a month and about a million function
  invocations; going over means waiting for the next cycle, not paying. https://vercel.com/docs/limits/fair-use-policy
- *Supabase Auth* rate limits, per IP address and per five minutes by default: 150 token
  refreshes, 30 sign-ups or sign-ins. https://supabase.com/docs/guides/auth/rate-limits

**Sign-in.**
- Google is the only way in, and **Google refuses to sign anyone in from inside an
  embedded browser**, which is what Facebook, Messenger and Instagram open links in. The
  app does nothing about that yet. See [LAUNCH.md](LAUNCH.md).
- Supabase links sign-ins that share an email address. It cannot be turned off.
- Email + password needs a domain and a real email sender before it works for anyone
  but the owner.

**The product, on purpose.**
- Pesos only. No payments, notifications or email beyond sign-in.
- Housemates trust each other: any member can rename or remove anyone, and delete the room.
- The data is not live between people: a housemate's change shows up on your screen after
  *your* next action or a reload. There is no realtime and no polling.
- A name is cut at 40 characters by the app, not by the database.

**The repository and the team.**
- The GitHub repository is **public**. Nothing secret may ever be committed, and what is
  committed stays in the history, including the contact address on the privacy page.
- One maintainer. Pushes go straight to `main`, there is no CI and no staging
  environment, and while developing, the app talks to the same Supabase project as the
  live site, so a room made in development is a real room.
- Vercel builds each push and type-checks it; it does **not** lint or run tests.

**Law and trust.** The app holds names, display names and when people are home, which is
personal information under the Philippines' Data Privacy Act of 2012. The privacy page and
the deletion route are the start of a response to that, not all of it. This is not legal
advice; read the Act's requirements for a small personal-information controller.

## Next steps, in order

1. **Before posting anywhere:** the blockers in [LAUNCH.md](LAUNCH.md): sign-in inside
   Facebook's browser, the Google consent screen, link previews, the retention claim,
   backups and pausing, the server region, monitoring, real-phone testing.
2. **Within the first month:** the backend hardening in [SCALING.md](SCALING.md): bound
   the reads, throttle joining, cap what one account can create, add database length
   limits, fix the three small advisor findings, a separate development database.
3. **Then:** the branding pass (domain, email, email sign-in), Facebook sign-in if the
   audience wants it, an About page, server-side midnight cuts with a per-room time
   zone, self-serve account deletion, a way to rotate a room's code.
4. **Later, if the app grows:** realtime updates, end-to-end tests, and paid plans when a
   limit or the non-commercial rule is reached. The triggers are in SCALING.md.
