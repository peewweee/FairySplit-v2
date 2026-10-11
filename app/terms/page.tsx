import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service · FairySplit" };

// Google's consent screen links here: like the privacy page, every claim must be true to what the app does
// (rooms are trusted circles, there is no money handling, deleting an account is done by email).
export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[680px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em] text-fairy-ink">
        Terms of Service
      </h1>
      <p className="mt-1.5 text-[12.5px] font-medium text-fairy-grey-strong">
        Last updated October 12, 2026.
      </p>

      <div className="mt-8 grid gap-6 text-[14px] leading-[1.65] text-fairy-ink-2">
        <p>
          By signing in to or using FairySplit you agree to these terms. They are short on
          purpose. If you don&rsquo;t agree with them, please don&rsquo;t use the app.
        </p>

        <section>
          <h2 className={h2}>What FairySplit is</h2>
          <p>
            FairySplit is a free tool for splitting shared household bills by the hours each
            person actually stayed, with appliance use charged to whoever ran it. It is
            built and run by an individual, not a company. It does not collect, hold or send
            money: settling up happens between you and your housemates, outside the app.
          </p>
        </section>

        <section>
          <h2 className={h2}>Your account</h2>
          <p>
            You sign in with a Google account. Keep it secure: what is done through your
            account is your responsibility. You can stop using FairySplit whenever you like,
            and ask for your account to be deleted as the{" "}
            <Link
              href="/data-deletion"
              className="font-bold text-fairy-rose underline underline-offset-2"
            >
              data deletion page
            </Link>{" "}
            describes.
          </p>
        </section>

        <section>
          <h2 className={h2}>Rooms, and what you put in them</h2>
          <ul className={ul}>
            <li>
              <strong className={strong}>A room is a trusted circle.</strong> Everyone in it
              can see everything in it, add or change its logs and bills, rename or remove
              any member, and rename or delete the room. Anyone who has a room&rsquo;s join
              code can join it, so share the code only with people you live with and trust.
            </li>
            <li>
              <strong className={strong}>You are responsible for what you enter.</strong>{" "}
              Keep it to what the app asks for (names, hours, amounts and dates), and
              don&rsquo;t enter anything unlawful or anything that isn&rsquo;t yours to
              share.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={h2}>The numbers</h2>
          <p>
            FairySplit divides each bill using the totals, dates, hours and settings that the
            people in the room enter. It is a calculator, not an accountant: check the result
            with your housemates before anyone pays anyone, and correct the logs if something
            looks wrong.
          </p>
        </section>

        <section>
          <h2 className={h2}>Using it fairly</h2>
          <p>
            Don&rsquo;t try to read or change a room you aren&rsquo;t in, break or overload
            the service, or use scripts to create accounts or rooms in bulk. We may remove a
            room or an account that does.
          </p>
        </section>

        <section>
          <h2 className={h2}>Your data</h2>
          <p>
            What FairySplit collects, who can see it and how long it is kept is in the{" "}
            <Link
              href="/privacy"
              className="font-bold text-fairy-rose underline underline-offset-2"
            >
              privacy policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className={h2}>No guarantees</h2>
          <p>
            FairySplit is provided as it is, by one person, with no promise that it will
            always be available or free of mistakes. We may change it, pause it or stop it.
            To the extent the law allows, we aren&rsquo;t liable for losses from using it or
            not being able to use it, including a mistake in an amount you relied on or a
            disagreement between housemates. Nothing here takes away rights you have by law.
          </p>
        </section>

        <section>
          <h2 className={h2}>Changes to these terms</h2>
          <p>
            If these terms change, this page will change and the date at the top will update.
            Using FairySplit after that means you accept the new version.
          </p>
        </section>

        <section>
          <h2 className={h2}>Contact</h2>
          <p>
            Questions about these terms, or anything else, reach out at{" "}
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
