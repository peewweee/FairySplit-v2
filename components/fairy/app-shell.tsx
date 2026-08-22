import Link from "next/link";
import type { ReactNode } from "react";
import { WhoAreYou } from "@/components/fairy/who-are-you";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-fairy-hair bg-fairy-ground">
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-5 py-3.5 sm:px-6">
          <Link href="/" className="shrink-0">
            <Wordmark />
          </Link>
          <div className="ml-auto">
            <WhoAreYou />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-9 sm:px-6">{children}</main>

      <footer className="mx-auto w-full max-w-[1180px] px-5 pb-10 sm:px-6">
        <p className="border-t border-fairy-hair pt-5 text-[11.5px] font-medium text-fairy-grey-strong">
          Fairly split expenses, like magic.
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
