# Before launching to dormitory Facebook pages

The goal: post to dorm pages and groups, and have strangers sign in and use it. This is the
checklist for that. Tick things off here as they are done. The order inside each part is
the order of risk, worst first.

Two things matter more than everything else, and the app handles neither today:

1. **Most people who tap a link inside Facebook will not be able to sign in.** Facebook,
   Messenger and Instagram open links in their own embedded browser. Google refuses to
   sign anyone in from an embedded browser (the error is `403: disallowed_useragent`,
   a policy in force since 2021:
   [Google's announcement](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)).
   Google is the app's only sign-in. A visitor who taps the post, taps *Clock me in*, and
   sees a Google error does not come back.
2. **Google's sign-in screen shows `…supabase.co`, not "FairySplit".** Until the brand is
   verified (or the auth address is on your own domain), a stranger sees a technical
   address on a Google screen and has to trust it.

---

## A. Blockers: do these before any post

- [ ] **Handle Facebook's in-app browser.** On the landing page, detect it and, instead of
  the *Clock me in* button leading to a Google error, show one calm message: open this
  page in your phone's own browser (the ⋯ or share menu, then *Open in browser* / *Open in
  Chrome* / *Open in Safari*), with a *Copy link* button. The invite code stays in the
  URL, so it survives the switch. The browsers announce themselves in the user-agent
  string (Facebook's contains `FBAN`, `FBAV` or `FB_IAB`, Instagram's `Instagram`;
  confirm on a real phone, they change). Other ways round it, each with a cost:
  Facebook sign-in (works inside Facebook's own browser, but needs Business Verification)
  or an emailed sign-in link (needs the domain and an email sender). Do the message first:
  it is the cheapest and works for everyone.
- [ ] **Google consent screen: publish it, and verify the brand.** Both are needed, and
  Google's own Branding and Audience pages say which step it wants next. The brand check
  failed once because the site was not registered to you: the Search Console tag is now on
  the site, so click *Verify* there, wait 24 hours, then choose "I have fixed the issues"
  in Google. *Publish app* was blocked and the cause was never found: if it still is,
  screenshot the Audience page and the exact message. The homepage may need to say what
  the app does (see *About page* below). If none of this lands, a Supabase custom auth
  domain (Pro plan plus a paid add-on, and a domain you own) is the other fix. Before this
  is done, decide whether you are willing to launch with the Supabase address showing.
- [ ] **Link previews.** When the link is pasted into Facebook it shows a card made from
  the page's Open Graph tags. The site has a title and a description and nothing else:
  no image, no `og:` tags. Add `openGraph` and `twitter` metadata (with `metadataBase`)
  and a 1200 × 630 share image in `app/layout.tsx`, then run the link through Facebook's
  Sharing Debugger (it caches, so use *Scrape again*).
- [ ] **Make the privacy page true.** `/privacy` says old logs "age out automatically" and
  the logs page says "Older logs are automatically cleared". They are hidden after 120
  days and never deleted. Either build the cleanup (a scheduled delete; destructive, so
  your explicit go) or reword both to say they are hidden and stay stored until the room
  is deleted or you are asked to delete them. Know this before choosing: a bill's split is
  recomputed from the logs every time it is opened, and logs older than 120 days are not
  loaded, so **a bill older than about four months already shows a different split from
  the one people paid**. Freezing a bill's split when it is settled fixes that, and is a
  precondition for a real delete (see [SCALING.md](SCALING.md), risk 3).
- [ ] **Decide about backups and pausing.** On the free plan a project is **paused after a
  week without activity** (a semester break will do it, and a paused app is down until
  somebody restores it by hand), and daily backups are listed only from Pro. Any member
  can delete a room, with no undo. Either move to Pro ($25 a month: no pausing, backups
  kept 7 days) or run a nightly `pg_dump` from a scheduled GitHub Action and a weekly
  keep-alive request, and **test a restore once**. See [SCALING.md](SCALING.md).
- [ ] **Move the server next to the database.** Measured from Manila on 12 October: the
  Supabase API answers in about 0.07 s past the connection, but a page of the site takes
  about 0.32 s, because Vercel runs the page in **Washington DC** (`iad1`) and the session
  check in `proxy.ts` then crosses back to Asia. Set the project's Function Region to
  Singapore (`sin1`) in Vercel's settings (free) and confirm the Supabase project's own
  region in its settings. The database is tiny now; if it turns out to be far from
  Manila, moving it is cheap today and painful later.
- [ ] **See errors and downtime.** Add error reporting (Sentry's free plan) and an uptime
  monitor on the home page (UptimeRobot or Better Stack). Today a crash is invisible
  until somebody tells you, and Vercel's Hobby logs are short-lived.
- [ ] **A way to reach you.** A visible feedback link or address in the app (the footer
  has Privacy and Terms), and a plan for where Facebook comments and messages go. People
  will report bugs in the comments under the post.
- [ ] **Decide the contact address.** The privacy page shows the owner's personal Gmail.
  Fine for friends; for strangers, make a dedicated address first. Past commits keep the
  old one, so decide before more history piles up.
- [ ] **Test on real phones, in Facebook's browser.** An iPhone on Safari and an Android on
  Chrome, plus the in-app browser from a real post: sign in, create a room, send the
  invite link to a second phone, join, clock in and out, make a bill, share the image and
  the PDF. Time fields were built as lists because iPhones ignore a time input's limits;
  confirm that on a real one.
- [ ] **Clear the throwaway test accounts and rooms** (only yours; leave friends' real
  data alone), and run `supabase/verify-checkpoint-clock.sql` in the SQL editor.

## B. Should do before a wide launch

- [ ] **An About page** (`/about`, linked from the landing footer; leave the splash
  untouched): what FairySplit is, three steps, a screenshot or two. It answers a
  stranger's "what is this?", and Google's branding check wants a homepage that says
  what the app does.
- [ ] **Bound what the app reads** and throttle what strangers can do. These are the
  backend items in [SCALING.md](SCALING.md) (ranks 3, 6 and 7).
- [ ] **A development database**, separate from the live one (the free plan allows two
  projects), so testing never touches real households.
- [ ] **Run the full gate on every push** (`npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`) in GitHub Actions. Vercel's build only type-checks.
- [ ] **A first-run welcome.** What is a room, what is "hours stayed", what do I do first.
  An empty app is the most common reason a new user leaves.
- [ ] Delete the unused template images in `public/` (`file.svg`, `globe.svg`,
  `next.svg`, `vercel.svg`, `window.svg`).

## C. Launching in stages

1. **Close friends first** (5 to 10 people, two or three real households). Watch for the
   things only real use finds. This is also the trigger for the branding pass.
2. **One dorm page, one post.** Ask the page's admin first: many groups ban promoting
   apps. Say it is a free personal project and what it stores.
3. **Watch for 48 hours** before posting anywhere else (below).
4. **Then the other pages.** A post that takes off brings its signups in one burst, from
   one campus network. See the sign-in rate-limit note in SCALING.md.

**What to watch.** Supabase dashboard (API requests, egress, database size, auth);
Vercel usage; Sentry; your messages. Sign-in failures are the thing to look for first.

**If a deploy breaks something:** in Vercel, promote the previous deployment (instant
rollback). A database change cannot be rolled back that way: apply additive migrations
first and push the code that uses them after.

## D. Facebook-specific

- Read each group's rules about promoting apps, and ask before posting.
- Keep Facebook *sign-in* a separate question from posting *on* Facebook: they are
  unrelated, and the in-app-browser problem applies to the post either way.
- Answer deletion requests with the runbook in [SCALING.md](SCALING.md#runbooks).
