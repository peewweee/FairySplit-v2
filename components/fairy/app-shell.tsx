import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/fairy/account-menu";
import { WhoAreYou } from "@/components/fairy/who-are-you";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-fairy-hair bg-fairy-ground">
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-5 py-3.5 sm:px-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <WhoAreYou />
            <span aria-hidden className="h-4 w-px bg-fairy-hair" />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-9 sm:px-6">{children}</main>

      <footer className="mx-auto w-full max-w-[1180px] px-5 pb-10 sm:px-6">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-fairy-hair pt-5 text-[11.5px] font-medium text-fairy-grey-strong">
          <span>Fairly split expenses, like magic.</span>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-fairy-ink">
            Privacy
          </Link>
        </p>
      </footer>
    </>
  );
}

/**
 * The wordmark sits in the app's own type, the way the reference sets its name
 * in Figtree rather than a separate logo face. Deep rose, then ink.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={
        className ??
        "text-[20px] font-extrabold tracking-[-0.01em] text-fairy-rose"
      }
    >
      Fairy<span className="text-fairy-ink">Split</span>
    </span>
  );
}
