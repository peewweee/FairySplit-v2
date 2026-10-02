"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Crumbs, ErrorNote, LoadingRows, PageHeader } from "@/components/fairy/shell-bits";
import { JoinCode } from "@/components/fairy/join-code";
import { MembersButton } from "@/components/fairy/members-panel";
import { BillsPanel } from "@/components/fairy/bills-panel";
import { TrackingPanel } from "@/components/fairy/tracking-panel";
import { repo } from "@/lib/data";
import { useRepoQuery } from "@/lib/data/hooks";

export function RoomScreen({ roomId }: { roomId: string }) {
  const room = useRepoQuery(() => repo.getRoom(roomId), [roomId]);
  const members = useRepoQuery(() => repo.listMembers(roomId), [roomId]);

  if (room.loading) return <LoadingRows rows={2} />;

  if (room.error || !room.data) {
    return (
      <>
        <Crumbs items={[{ label: "Rooms", href: "/" }, { label: "Not found" }]} />
        <ErrorNote>
          {room.error ?? "That room doesn't exist, or you're not in it."}
        </ErrorNote>
      </>
    );
  }

  return (
    <>
      <Crumbs items={[{ label: "Rooms", href: "/" }, { label: room.data.name }]} />
      <PageHeader
        title={room.data.name}
        meta={<MembersButton roomId={roomId} />}
        action={
          <>
            <JoinCode code={room.data.joinCode} copyable />
            {/* Quiet on purpose: settings is somewhere you go once, not a
                thing you do, so it should not compete with the join code. */}
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="text-fairy-grey-strong hover:text-fairy-ink"
            >
              <Link href={`/rooms/${roomId}/settings`} aria-label="Room settings">
                <Settings2 className="size-4" aria-hidden />
              </Link>
            </Button>
          </>
        }
      />

      <TrackingPanel roomId={roomId} members={members.data ?? []} />

      <BillsPanel roomId={roomId} members={members.data ?? []} />
    </>
  );
}
