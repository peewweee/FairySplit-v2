import { ClockMeIn } from "@/components/fairy/sign-in-dialog";
import { SparkleField } from "@/components/fairy/sparkle-field";
import { EMAIL_PASSWORD_ENABLED, FACEBOOK_ENABLED } from "@/lib/auth/config";
import { START_SPREAD, rollField } from "@/lib/sparkle";

/**
 * The opening, in the order things happen: the sparkles set off one after another
 * over the first moments (START_SPREAD), then the line eases in, then the button.
 * Seconds from the first paint.
 */
const SPARKLES = 10;
const LINE_AT = START_SPREAD + 0.1;
const BUTTON_AT = LINE_AT + 0.3;

/**
 * The landing page for somebody who is not signed in: one line, and the way in.
 *
 * Centred in the space between the header and the footer, with little hand-drawn
 * sparkles drawing themselves in and out behind it (see <SparkleField>). They are
 * chosen here, on the server, so they are in the page from the first paint and begin
 * at once; the line and the button wait for them. Motion is gated globally by the
 * `prefers-reduced-motion` block in globals.css, which also drops the waiting, and the
 * line only ever starts from "a little lower and faint", so nothing can be left
 * invisible.
 */
export function Splash({
  invite,
  problem,
}: {
  /** A room invite from the link they arrived by, so signing in carries it through. */
  invite: string | null;
  /** A sign-in that just failed; the popup opens on what to do about it. */
  problem?: string;
}) {
  return (
    <section
      aria-labelledby="splash-line"
      className="relative grid min-h-[calc(100dvh-14rem)] place-items-center overflow-hidden text-center"
    >
      <SparkleField initial={rollField(SPARKLES, Math.random)} />

      <div className="relative grid justify-items-center gap-8 py-10">
        <h1
          id="splash-line"
          style={{ animationDelay: `${LINE_AT}s` }}
          className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both max-w-[15ch] text-[clamp(36px,7.2vw,72px)] leading-[1.02] font-extrabold tracking-[-0.035em] text-fairy-ink duration-700"
        >
          The fairies are doing the math.
        </h1>

        <div
          style={{ animationDelay: `${BUTTON_AT}s` }}
          className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both grid justify-items-center gap-3 duration-700"
        >
          <ClockMeIn
            invite={invite}
            problem={problem}
            showFacebook={FACEBOOK_ENABLED}
            showEmailPassword={EMAIL_PASSWORD_ENABLED}
          />
          {invite && (
            <p className="max-w-[32ch] text-[12.5px] leading-[1.5] font-medium text-balance text-fairy-grey-strong">
              You’ve been invited to a room. Clock in to join it.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
