import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/fairy/account-menu";
import { AppSidebar } from "@/components/fairy/app-sidebar";
import { WhoAreYou } from "@/components/fairy/who-are-you";
import { getUser } from "@/lib/auth/dal";

/**
 * The hamburger, for somebody signed in. A Server Component for the same reason
 * <AccountMenu> is: the server already knows who is asking, so a signed-out
 * visitor is never shown a menu that has nothing to open.
 */
async function MenuButton() {
  const user = await getUser();
  if (!user) return null;
  return <AppSidebar accountName={user.displayName || user.email} email={user.email} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-fairy-hair bg-fairy-ground">
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3 px-5 py-3.5 sm:px-6">
          <MenuButton />
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
 * The logo: `public/fairysplit-logo.svg`, exported from the design file. Its two
 * colours are the palette's deep rose and ink. The file's viewBox is cropped to the
 * artwork (the design frame has a wide margin that sits unevenly), so it lines up
 * with the menu and the buttons without any nudging here. Width and height are the
 * file's own, which keeps its space reserved while it loads; the height is what
 * sets the size, a little smaller on a phone so the header holds what it held when
 * this was text. Eager, because it is the first thing on every page.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/fairysplit-logo.svg"
      alt="FairySplit"
      width={2697}
      height={543}
      loading="eager"
      className={className ?? "h-5 w-auto sm:h-6"}
    />
  );
}
