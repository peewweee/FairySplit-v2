@AGENTS.md

# FairySplit: working notes

The [README](README.md) is the spec: keep it in step with behaviour (its test table and
counts are written by hand). Where the project stands, its constraints and what comes next
are in [docs/ROADMAP.md](docs/ROADMAP.md); the launch checklist is
[docs/LAUNCH.md](docs/LAUNCH.md); what to expect as users arrive is
[docs/SCALING.md](docs/SCALING.md).

## Before a push

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Vercel's build only type-checks: it does not lint or run tests, and a failing build leaves
the last good deployment serving. Check `git status` and `git fetch` first, because the
tree can change under you. Push to `main` only when asked.

## Rules of this codebase

- **The repository is public.** Never commit a secret. The two `NEXT_PUBLIC_*` Supabase
  values are public by design; `.env.local` is ignored.
- **Money is integer centavos, rates are millicents.** Only `lib/billing/money.ts` divides
  money or turns kWh into money. The engine (`lib/billing/engine.ts`) is pure: no React,
  no clock, nothing from storage.
- **Every read and write goes through `Repository`** (`lib/data`). A new write method on
  `SupabaseRepository` must be added to its `WRITE_METHODS` set, or screens stay stale
  after it runs.
- **A new public route** goes in `QUIET_ROUTES` in `components/fairy/who-are-you.tsx`.
- **Sign-in paths are switched by flags** in `lib/auth/config.ts` (Facebook and email +
  password are built and off). Giving a new provider the invite handling Google has is
  part of turning it on.
- **The database has one definition**: `supabase/schema.sql`, plus `supabase/migrations/`
  for databases that already exist. Apply a migration before pushing code that calls it.
  Never run `supabase/verify-*.sql` through a connector or a script: they create accounts
  in the live `auth.users`; the owner pastes them into the Supabase SQL editor.
- **Row-level security is the access rule**: you can touch a row if you are a member of
  its room. `anon` has no grants. Re-run `verify-rls.sql` after any policy change.

## UI conventions the owner has asked for

- **Prevent bad input in the control** (a disabled option, a `maxLength`, a blocked time)
  rather than showing an error afterwards.
- **Explanations live behind an info icon**, not in running text; **units sit at the end
  of a field**.
- **Copy the owner dictates goes in verbatim.** The tagline is "Fairly split expenses,
  like magic." (the footer in `components/fairy/app-shell.tsx`). "The fairies are doing the
  math." is the splash's intro and belongs to the splash alone.
- Sample documents (a bill, an energy guide) are left aligned, on the app's theme, with a
  plain still ring round the figure to find. No corner arcs, no animated flourishes, no
  extra sparkle shapes: they were tried and removed.
- **Anything wider than a phone (a table) scrolls inside its own box** and never widens the
  page: every grid between it and the page needs `grid-cols-1`, and a flex parent needs
  `min-w-0`. At 375px, `document.documentElement.scrollWidth` must equal `innerWidth`, and
  every block on a screen must share the same left and right margins.
- Check UI without signing in by rendering the real components on a throwaway page under
  `app/`, and delete it before committing.
