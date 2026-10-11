"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LogOut, Menu, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { IdentityDialog } from "@/components/fairy/who-are-you";
import { signOut } from "@/lib/auth/actions";
import { repo } from "@/lib/data";
import { useRepoQuery } from "@/lib/data/hooks";
import { roomIdFromPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** One tappable line in the menu: Home, your name, Sign out, a room. */
const row =
  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] font-semibold text-fairy-ink-2 transition-colors hover:bg-fairy-screen hover:text-fairy-ink";
/** The page you are on — the tint the rest of the app uses for "this one". */
const rowActive =
  "bg-fairy-tint font-bold text-fairy-tint-ink hover:bg-fairy-tint hover:text-fairy-tint-ink [&_svg]:text-fairy-tint-ink";
const rowIcon = "size-4 shrink-0 text-fairy-grey-strong";

/**
 * The menu: a hamburger at the left of the header that opens a drawer with Home,
 * who you are, Sign out, and every room you are in.
 *
 * `accountName` and `email` come from the server, which already knows who is
 * signed in; everything else is read when the drawer opens, so a closed menu
 * costs no requests.
 */
export function AppSidebar({ accountName, email }: { accountName: string; email: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open menu"
          className="-ml-2 shrink-0 text-fairy-grey-strong hover:text-fairy-ink"
        >
          <Menu className="size-4" aria-hidden />
        </Button>
      </SheetTrigger>
      {/* No description to point at: the title says what this is. */}
      <SheetContent aria-describedby={undefined}>
        <div className="flex h-14 shrink-0 items-center px-5">
          <SheetTitle className="text-[11.5px] leading-none font-bold text-fairy-grey-strong">
            Menu
          </SheetTitle>
        </div>
        <SidebarBody accountName={accountName} email={email} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * The drawer's data. Radix only mounts the content while the drawer is open, so
 * these reads start when it opens and stop when it closes.
 */
function SidebarBody({ accountName, email }: { accountName: string; email: string }) {
  const pathname = usePathname();
  const identity = useRepoQuery(() => repo.getIdentity(), []);
  const rooms = useRepoQuery(() => repo.listRooms(), []);
  // The name dialog opens on top of the drawer rather than closing it, so after
  // saving you are back in the menu with the new name showing.
  const [renaming, setRenaming] = useState(false);

  return (
    <>
      <SidebarPanel
        pathname={pathname}
        accountName={accountName}
        email={email}
        name={identity.loading ? undefined : (identity.data?.name ?? "Set your name")}
        rooms={rooms.loading ? undefined : (rooms.data ?? [])}
        roomsError={rooms.error}
        onEditName={() => setRenaming(true)}
      />
      <IdentityDialog
        open={renaming}
        onOpenChange={setRenaming}
        current={identity.data?.name ?? ""}
        firstTime={false}
      />
    </>
  );
}

export interface SidebarPanelProps {
  pathname: string;
  /** What the sign-in provider calls this account. Not editable. */
  accountName: string;
  email: string;
  /** The name housemates see; undefined while it is loading. */
  name: string | undefined;
  /** Undefined while loading. */
  rooms: { id: string; name: string }[] | undefined;
  roomsError: string | null;
  onEditName: () => void;
}

/**
 * What the drawer shows. Plain props in, markup out — no reads of its own — so
 * every state of it (loading, empty, failed, a very long room name) can be put
 * on screen without signing in.
 *
 * Must sit inside a <Sheet>: choosing a link closes the drawer.
 */
export function SidebarPanel({
  pathname,
  accountName,
  email,
  name,
  rooms,
  roomsError,
  onEditName,
}: SidebarPanelProps) {
  const atHome = pathname === "/";
  const activeRoomId = roomIdFromPath(pathname);

  return (
    <>
      <div className="px-2">
        <SheetClose asChild>
          <Link
            href="/"
            aria-current={atHome ? "page" : undefined}
            className={cn(row, atHome && rowActive)}
          >
            <House className={rowIcon} aria-hidden />
            Home
          </Link>
        </SheetClose>

        <button type="button" onClick={onEditName} className={row}>
          <UserRound className={rowIcon} aria-hidden />
          {name === undefined ? (
            <>
              <span className="h-4 w-28 animate-pulse bg-fairy-screen" aria-hidden />
              <span className="sr-only">Loading your name</span>
            </>
          ) : (
            <span className="truncate">{name}</span>
          )}
        </button>
        {/* Lined up under the name above, not under its icon. */}
        <p
          className="-mt-1 mb-1 truncate pr-3 pl-10 text-[11.5px] font-medium text-fairy-grey-strong"
          title={email}
        >
          {accountName}
        </p>

        <form action={signOut}>
          <button type="submit" className={row}>
            <LogOut className={rowIcon} aria-hidden />
            Sign out
          </button>
        </form>
      </div>

      <Separator className="my-3" />

      <nav
        aria-labelledby="menu-rooms"
        aria-busy={rooms === undefined}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-5"
      >
        <p id="menu-rooms" className="px-3 pb-1.5 text-[11.5px] font-bold text-fairy-grey-strong">
          Rooms
        </p>

        {roomsError ? (
          <ErrorNote>{roomsError}</ErrorNote>
        ) : rooms === undefined ? (
          <div className="grid gap-2 px-3 pt-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 animate-pulse bg-fairy-screen" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <p className="px-3 py-1 text-[12.5px] leading-[1.5] font-medium text-fairy-grey-strong">
            No rooms yet. Make or join one from Home.
          </p>
        ) : (
          <ul>
            {rooms.map((room) => {
              const active = room.id === activeRoomId;
              return (
                <li key={room.id}>
                  <SheetClose asChild>
                    <Link
                      href={`/rooms/${room.id}`}
                      aria-current={active ? "true" : undefined}
                      className={cn(row, active && rowActive)}
                    >
                      <span className="truncate">{room.name}</span>
                    </Link>
                  </SheetClose>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </>
  );
}
