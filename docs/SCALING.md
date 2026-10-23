# What happens as users arrive, and what to do about it

Written 12 October 2026 for the question "what if 100 people use this every day?".

**The short answer: load will not crash it.** One hundred daily users is about 30,000
small requests a day, well under one a second on average. Postgres, the API and Vercel
will not notice. What can hurt at this size is **the limits of the free plans, a few
single points of failure, and the public surface being open to one badly behaved
account.** They are ranked below, with a fix for each, the cheapest first.

Numbers marked *measured* come from the live project on 12 October 2026; the rest are
assumptions, stated so they can be corrected. Vendor limits change: re-check before relying
on them.

---

## What 100 daily users means

| | Estimate | Basis |
|---|---|---|
| Rooms | 25 to 30, of 3 or 4 people | assumed |
| Requests a day | about 30,000 (0.35 a second on average, a few a second at an evening peak) | assumed: 25 room opens or writes per person per day, about a dozen requests each |
| New log entries a day | about 12 per room (a few hundred overall) | assumed: three entries per person per day across the clock and a couple of logs |
| Size of one log entry | **305 bytes** as JSON | *measured* |
| Disk per entry, indexes included | about 1 KB | *measured*: 95 rows came to 112 kB |
| Database growth | about 110 MB a year | derived; the 500 MB free limit is years away |
| Vercel invocations | 100,000 to 200,000 a month, against about a million included | assumed: 30 page loads per person per day |

The hundred users and the 25 rooms are the whole of the load on the database, and it is
small. The next section is about the one number in that table that is not.

## Risks, ranked

### 1. A free project is paused after a week without use
Free Supabase projects pause after seven days of inactivity, and a paused app is simply
**down** until somebody presses *Restore* in the dashboard. A dorm empties at a semester
break. *Fix:* the Pro plan ($25 a month) does not pause. Cheaper and fragile: a scheduled
GitHub Action that makes one request to the API every few days. Do not rely on that for
a launch.

### 2. No backups, and a room can be deleted by anyone in it
Daily backups are listed from the Pro plan up (kept 7 days). Today a housemate who taps
*Delete room* removes every log and bill in it for good, and nothing can bring it back.
*Fix:* Pro, or a nightly `pg_dump` from a GitHub Action to storage you control (and **test
a restore once**); and a soft delete or a "type the room's name" confirmation in the app.

### 3. Every room view downloads every log entry the room has ever had
This is the one that grows. `listTrackers` fetches all of a room's log entries with no
date filter and no limit; the 120-day rule is applied *afterwards*, in the browser
(`pruneEntries`), and rows are never deleted. On top of that, any write makes every
query on the page re-run, so one tap re-downloads the whole history.

| Room's age | Entries (12 a day) | One fetch, uncompressed |
|---|---|---|
| 30 days | 360 | 110 KB |
| 90 days | 1,080 | 330 KB |
| 1 year | 4,380 | 1.3 MB |

At 25 fetches a person a day and 100 people, that is about 8 GB a month uncompressed at
30 days and about 25 GB a month at 90, against a free allowance of **5 GB of egress**.
JSON compresses several-fold in transit (not measured), so the ceiling lands somewhere
in months two to four; the shape of the problem does not depend on the exact figure:
**the cost rises with the age of the data, not with the number of users.**
*Fix, in order:* (a) read only what is needed, by date, and page the history screen;
(b) have a write refresh only the queries it affects, not all of them; (c) decide
retention (below), then delete for real with `pg_cron`; (d) refetch when the tab comes
back into focus instead of on every change.

**Before deleting anything, know this:** a bill's split is **not frozen**. It is recomputed
from the logs each time it is opened, and entries older than 120 days are not loaded. So
after about four months an old bill shows a *different* split from the one people paid.
Freeze (store) a bill's computed split when it is settled, or keep entries as long as the
bills that use them, before turning the retention rule into a real delete.

### 4. Every dynamic page pays for a trip to Washington
*Measured from Manila:* the Supabase API answers in about 0.07 s once connected; a page
of the site takes about 0.32 s, because the response header reads `sin1::iad1`: served
from Singapore's edge but **executed in Washington DC**. Then `proxy.ts` calls the Auth
server on every page request, a second long hop. *Fix:* set the Function Region to
Singapore (`sin1`) in Vercel (free, one setting), and confirm the Supabase project's own
region. Then consider `auth.getClaims()` in the proxy instead of `getUser()`: this
project signs tokens with ES256 (a public key set is published), so the signature can be
checked locally with no network call. The trade: it does not notice a session revoked
before its token expires, so keep `getUser()` for actions that must be sure.

### 5. If Supabase Auth is slow, every page is slow
`proxy.ts` waits for the Auth server with no timeout. It has already happened once: one
request took 53 seconds and one returned a 502 (24 September 2026; it did not recur in
the requests that followed, and Supabase's own health check answered at once). *Fix:*
a timeout that lets the request through (the pages and the database still enforce who
may see what, so failing open is safe here), or the local check in (4).

### 6. Joining a room can be guessed at, without limit
A join code is six characters from a 32-symbol alphabet: about **a billion** codes.
`join_room` has no throttle, so any signed-in account can try codes in a loop. With 100
live rooms and 100 guesses a second, the first hit is expected in about a day; with 1,000
rooms, in about three hours. A hit gives read and write access to a household's names,
hours and bills. *Fix:* count failed attempts per account inside `join_room` and lock out
after a handful an hour; lengthen the code (eight characters is a thousand times more);
let a room's code be changed. (A server-side rate limiter such as Upstash does not help
here: the browser calls the database function directly.)

### 7. One account can create unlimited data
There is no cap on rooms per account or people per room, and **no length limit in the
database**: the 40-character name limit lives only in the app, and a bill's appliances
and charges are free-form JSON. A single scripted account can fill the 500 MB; on the free
plan a full database turns the project read-only. *Fix:* `CHECK` constraints on text
length and JSON size, a per-account cap on rooms in `create_room`, a cap on members.

### 8. A campus shares one IP address
Supabase Auth limits, per IP address and five minutes by default, 150 token refreshes and
30 sign-ups or sign-ins. Students on one campus network (or one mobile carrier) share an
address, so a post that takes off can send dozens of sign-ins from one IP at once. Whether
Google sign-ins count toward the 30 is not clear from the documentation: test with a few
friends on the same Wi-Fi, and check *Authentication, Rate Limits* in the dashboard.

### 9. Small findings from the database's own advisor
All low severity today, all quick:
- The `profiles` policy calls `auth.uid()` per row; write `(select auth.uid())`.
- Six foreign keys have no index (`bill_log_amounts` twice, `bill_member_hours`,
  `bill_paid`, `tracker_runs`, `rooms.created_by`): this slows deletes as tables grow.
- `members_user_idx` has never been used.
- Leaked-password protection is off: moot while email + password is hidden.
- Six `SECURITY DEFINER` functions are callable by signed-in users: intended, and each
  checks membership itself.

### 10. Screens go stale
There is no realtime and no polling. Two housemates on the same bill do not see each
other's changes until one of them acts or reloads. At launch scale a refetch on window
focus is enough; Supabase Realtime is the full answer and has its own connection limits
(check them).

### 11. Development uses the live database, and nothing checks a push
While developing, the app talks to the live Supabase project, so test rooms are real
rooms, and verification scripts must never run through a connector (they create
accounts). There is no CI: a push to `main` is type-checked by Vercel and goes live.
*Fix:* a second free Supabase project for development; a GitHub Action running
`typecheck`, `lint`, `test` and `build`.

### 12. You cannot see it
No error reporting, no uptime monitor, no usage numbers, and Vercel's Hobby logs are
short. Add Sentry and an uptime monitor before launch. Add usage analytics too, because
the number that matters most is how many visitors **reach the sign-in** and how many
**finish it** (see the Facebook in-app browser problem in [LAUNCH.md](LAUNCH.md)).

### 13. Vercel Hobby is for non-commercial use
Fine for a free project (donations are allowed). Ads, payments or a paid tier make it
commercial, and then the plan is Pro. Its allowances (100 GB bandwidth, about a million
invocations) are far from reached; going over means waiting, not a bill.

### 14. Time zones
A bill's window follows the viewing device's time zone and the one-off midnight split
hard-codes Asia/Manila. Irrelevant while everyone is in the Philippines; a housemate
abroad can see a different split near a bill's first or last midnight. Fix by storing a
zone on the room.

## What will *not* be a problem at this size

Postgres CPU and memory, connection counts (the app talks to the database over HTTPS
through the API, never with direct connections, so there is no pool to exhaust), database
size (about 12 MB today), the 50,000-user Auth allowance, Vercel's request or bandwidth
allowances.

## When to spend money

| Trigger | Do |
|---|---|
| Before a public launch, if a pause or a lost room is unacceptable | Supabase Pro ($25 a month) |
| Egress above about 3.5 GB in a month, or the database above about 350 MB | Fix risk 3 first; Pro if it is still needed |
| Any ads, payments or a paid tier | Vercel Pro |
| About 500 daily users, or single rooms in the thousands of entries | Move the bill's inputs into SQL functions or summary tables instead of downloading rows |

## Tools worth considering

| Tool | For | When |
|---|---|---|
| Supabase Pro | no pausing, daily backups, higher limits | before launch, or at the triggers above |
| Sentry (free plan) | errors in the browser and on the server | before launch |
| UptimeRobot or Better Stack (free) | uptime alerts; can double as a keep-alive | before launch |
| Vercel Analytics, Plausible, Umami or PostHog | visits, and the sign-in funnel | at launch |
| GitHub Actions (free on a public repo) | the test gate, nightly backups, keep-alive | now |
| A second Supabase project and the Supabase CLI | a development database, migrations | within the first month |
| `pg_cron` (a Supabase extension) | real retention deletes, server-side midnight cuts | when retention is decided |
| Cloudflare (free) | DNS, caching, rate limiting, bot checks | once there is a domain |
| Resend or Postmark | the email sender for sign-in emails | the branding pass |
| Playwright | end-to-end tests of the real flows | after launch |
| k6 or Artillery | a load test against the development project | before a big post |
| Supabase Realtime | live updates between housemates | later |
| Dependabot and `npm audit` | dependency updates and advisories | now |

## Runbooks

**Pages hang or the site is down.** Check [Supabase status](https://status.supabase.com)
and [Vercel status](https://www.vercel-status.com). In Vercel, promote the previous
deployment. If Supabase Auth is the slow part, risk 5 is why.

**The app says it cannot reach the database.** The project may be paused: Supabase
dashboard, then *Restore project*. It can take a few minutes.

**Sign-in fails for everyone.** Supabase, *Authentication, URL Configuration*: the Site URL
and the Redirect URLs allow-list must contain the production address. Google Cloud: the
OAuth client's redirect URI must be the Supabase `/auth/v1/callback` address, and the
consent screen must still be published. A sign-in started on an address not on the list
quietly ends on the Site URL.

**Sign-in fails for people who opened the link in Facebook.** That is Google blocking the
in-app browser. Tell them to open the link in their own browser.

**A data-deletion request.** Irreversible, so only for a specific request and after
matching the sender to the account. In the Supabase SQL editor of the live project:
1. Find the account: `select id, email from auth.users where email = '…';`
2. Rooms they created block deletion. List them with
   `select id, name from public.rooms where created_by = '<uid>';`, then, as the person
   asked, hand each to a housemate who has an account
   (`update public.rooms set created_by = '<their uid>' where id = '<room>'`) or delete
   the room (it disappears for everyone in it, so only with their agreement).
3. Rooms they were only a member of: `update public.members set name = 'Former member'
   where user_id = '<uid>';`. If they asked to be removed entirely, ask them or a
   housemate to press *Remove* in the room's People list, which also erases their logged
   usage; the database function checks the caller's membership, so it does not work
   from the SQL editor.
4. Delete the account in the dashboard, *Authentication, Users*.
5. Reply to confirm. The deletion page promises no deadline; you may want to add one.

**Restoring a backup.** Pro: *Database, Backups* in the dashboard. A homemade dump: restore
into the development project first and check it before touching the live one.
