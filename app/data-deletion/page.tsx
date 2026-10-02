import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Delete your data · FairySplit" };

// Meta's deletion-instructions URL: keep it true to the schema's on-delete rules (profiles cascade, members.user_id set null, rooms.created_by restrict).
export default function DataDeletionPage() {
  return (
    <div className="mx-auto w-full max-w-[680px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-fairy-ink">
        Delete your data
      </h1>
      <p className="mt-1.5 text-[12.5px] font-medium text-fairy-grey-strong">
        Last updated October 2, 2026.
      </p>

      <div className="mt-8 grid gap-6 text-[14px] leading-[1.65] text-fairy-ink-2">
        <p>
          FairySplit doesn&rsquo;t have a &ldquo;delete my account&rdquo; button yet, so
          deleting your account is done by email. This page says exactly how, and exactly
          what happens to your data.
        </p>

        <section>
          <h2 className={h2}>Step 1: Your rooms (optional)</h2>
          <p>
            A room is a shared record: your housemates&rsquo; bills are split using the
            hours you logged. So what happens to your entries in a room is your call. In a
            room&rsquo;s Settings, the People list lets you either:
          </p>
          <ul className={ul}>
            <li>
              <strong className={strong}>Keep your hours, lose your name.</strong> Rename
              yourself (the pencil) to something like &ldquo;Former member&rdquo;. Past
              bills still add up for everyone else.
            </li>
            <li>
              <strong className={strong}>Remove yourself.</strong> Tap the bin next to
              your name. FairySplit shows what will be erased first, which is your logged
              usage in that room, and re-splits the room&rsquo;s bills without you.
            </li>
          </ul>
          <p>
            Skip this step and we&rsquo;ll rename you &ldquo;Former member&rdquo; in every
            room you were in.
          </p>
        </section>

        <section>
          <h2 className={h2}>Step 2: Email us</h2>
          <p>
            Write to{" "}
            <a
              href="mailto:phoeberhonegangoso@gmail.com?subject=Delete%20my%20FairySplit%20data"
              className="font-bold text-fairy-rose underline underline-offset-2"
            >
              phoeberhonegangoso@gmail.com
            </a>{" "}
            with the subject &ldquo;Delete my FairySplit data&rdquo;. Send it from the
            email address you signed in with, and say whether you used Google or
            Facebook, so we can find your account and know it&rsquo;s yours. We&rsquo;ll
            reply when it&rsquo;s done.
          </p>
        </section>

        <section>
          <h2 className={h2}>What gets deleted</h2>
          <ul className={ul}>
            <li>
              Your account: your sign-in record, your email address, and the name and
              profile-photo link Google or Facebook shared with us.
            </li>
            <li>Your profile, including your display name.</li>
          </ul>
        </section>

        <section>
          <h2 className={h2}>If you created a room other people still use</h2>
          <p>
            An account can&rsquo;t be deleted while a room it created still exists, and
            deleting a room removes it for everyone in it. Mention it in your email and
            we&rsquo;ll sort it out with you before anything is deleted.
          </p>
        </section>

        <section>
          <h2 className={h2}>Optional: stop sharing from Google or Facebook</h2>
          <p>
            Removing FairySplit from your connected apps stops it receiving anything
            further from that account: in Facebook, under Settings and Apps and Websites;
            in Google, on your Google Account&rsquo;s Security page under third-party
            access. That doesn&rsquo;t delete what we already hold. Step 2 does.
          </p>
        </section>
      </div>

      <p className="mt-10 flex flex-wrap gap-x-3 gap-y-1 border-t border-fairy-hair pt-5 text-[11.5px] font-medium text-fairy-grey-strong">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy policy
        </Link>
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
