import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy · FairySplit" };

// Google and Facebook review this page cold: every claim must match what the code actually does.
export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[680px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-fairy-ink">
        Privacy Policy
      </h1>
      <p className="mt-1.5 text-[12.5px] font-medium text-fairy-grey-strong">
        Last updated October 2, 2026.
      </p>

      <div className="mt-8 grid gap-6 text-[14px] leading-[1.65] text-fairy-ink-2">
        <section>
          <h2 className={h2}>What FairySplit is</h2>
          <p>
            FairySplit is a tool for splitting shared household bills by the hours each
            person actually stayed, with appliance use charged to whoever ran it. It is
            built and run by an individual, not a company, for people sharing a dorm,
            apartment, or house to use together.
          </p>
        </section>

        <section>
          <h2 className={h2}>What we collect, and why</h2>
          <ul className={ul}>
            <li>
              <strong className={strong}>Your email address and display name.</strong>{" "}
              Needed to know who you are across devices and to let your housemates find
              you by name. If you sign in with Google or Facebook, we receive whatever
              name, email, and profile photo URL that provider shares — nothing more.
              We never see your password for those providers.
            </li>
            <li>
              <strong className={strong}>The rooms you create or join, and their
              members.</strong> A room&rsquo;s name, its join code, and the names of
              everyone in it.
            </li>
            <li>
              <strong className={strong}>Bills and the logs they&rsquo;re split
              from.</strong> Amounts, dates, appliance settings, and the clock-in/clock-out
              or typed entries your room logs — the data the app needs to actually
              calculate who owes what.
            </li>
          </ul>
          <p>
            We don&rsquo;t ask for anything beyond this. There are no ads, no analytics
            trackers, and nothing here is used to build a profile of you for any purpose
            outside the app itself.
          </p>
        </section>

        <section>
          <h2 className={h2}>Who can see it</h2>
          <p>
            Only the people in the same room as you — and only for that room. FairySplit
            is built so that a member of one room cannot read, edit, or delete another
            room&rsquo;s data, enforced at the database level, not just hidden in the
            interface. Your name is visible to people in your own rooms; it is never
            shown to anyone outside them.
          </p>
        </section>

        <section>
          <h2 className={h2}>Who we share it with</h2>
          <p>
            Nobody, except the infrastructure that runs the app itself:
          </p>
          <ul className={ul}>
            <li>
              <strong className={strong}>Supabase</strong> hosts the database and handles
              sign-in. This is where everything above actually lives.
            </li>
            <li>
              <strong className={strong}>Vercel</strong> hosts the application you&rsquo;re
              using right now.
            </li>
            <li>
              <strong className={strong}>Google and Facebook</strong> are involved only if
              you choose to sign in with them — we receive your name, email, and profile
              photo from whichever one you pick, and nothing is sent back to them beyond
              the standard sign-in request.
            </li>
          </ul>
          <p>We don&rsquo;t sell data. There is nothing to sell it to.</p>
        </section>

        <section>
          <h2 className={h2}>How long we keep it</h2>
          <p>
            Rooms, bills, and account information are kept for as long as your account
            exists. Day-to-day log entries (clock-ins, typed usage) are kept for 120
            days, long enough for any bill to still reach them, then they age out
            automatically.
          </p>
        </section>

        <section>
          <h2 className={h2}>Your choices</h2>
          <p>
            You can leave a room at any time, which removes your name from it. To delete
            your account entirely, or to ask what we hold about you, follow the steps on
            the{" "}
            <Link
              href="/data-deletion"
              className="font-bold text-fairy-rose underline underline-offset-2"
            >
              data deletion page
            </Link>{" "}
            or email us at the address below — we&rsquo;ll handle it directly, since
            there is no automated self-service flow for this yet.
          </p>
        </section>

        <section>
          <h2 className={h2}>Children</h2>
          <p>
            FairySplit isn&rsquo;t directed at children, and we don&rsquo;t knowingly
            collect information from anyone under 13.
          </p>
        </section>

        <section>
          <h2 className={h2}>Changes to this policy</h2>
          <p>
            If what FairySplit collects or does with it changes, this page will change
            to match, and the date at the top will update.
          </p>
        </section>

        <section>
          <h2 className={h2}>Contact</h2>
          <p>
            Questions, deletion requests, anything else — reach out at{" "}
            <a
              href="mailto:phoeberhonegangoso@gmail.com"
              className="font-bold text-fairy-rose underline underline-offset-2"
            >
              phoeberhonegangoso@gmail.com
            </a>
            .
          </p>
        </section>
      </div>

      <p className="mt-10 border-t border-fairy-hair pt-5 text-[11.5px] font-medium text-fairy-grey-strong">
        <Link href="/" className="underline underline-offset-2">
          Back to FairySplit
        </Link>
      </p>
    </div>
  );
}

const h2 = "mb-2 text-[15px] font-extrabold tracking-[-0.01em] text-fairy-ink";
const ul = "my-2 grid gap-2 pl-5 [&>li]:list-disc";
const strong = "font-bold text-fairy-ink";
