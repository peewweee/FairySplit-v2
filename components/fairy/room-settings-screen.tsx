"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JoinCode } from "@/components/fairy/join-code";
import { MembersPanel } from "@/components/fairy/members-panel";
import { Crumbs, ErrorNote, LoadingRows, PageHeader } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { repo, type Room } from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { parseField, roomNameSchema } from "@/lib/forms/schemas";

export function RoomSettingsScreen({ roomId }: { roomId: string }) {
  const room = useRepoQuery(() => repo.getRoom(roomId), [roomId]);

  if (room.loading) return <LoadingRows rows={3} />;
  if (room.error || !room.data) {
    return (
      <>
        <Crumbs items={[{ label: "Rooms", href: "/" }, { label: "Not found" }]} />
        <ErrorNote>{room.error ?? "That room doesn't exist, or you're not in it."}</ErrorNote>
      </>
    );
  }

  return (
    <>
      <Crumbs
        items={[
          { label: "Rooms", href: "/" },
          { label: room.data.name, href: `/rooms/${roomId}` },
          { label: "Settings" },
        ]}
      />
      <PageHeader title="Room settings" eyebrow={room.data.name} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <RoomNamePanel room={room.data} />
          <DangerZone room={room.data} />
        </div>
        <MembersPanel roomId={roomId} />
      </div>
    </>
  );
}

function RoomNamePanel({ room }: { room: Room }) {
  const [name, setName] = useState(room.name);
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();
  const { burst, sparkle } = useSparkle();
  const dirty = name.trim() !== room.name;

  async function save() {
    const parsed = parseField(roomNameSchema, name);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const saved = await action.run(() => repo.renameRoom(room.id, parsed.value));
    if (saved) sparkle();
  }

  return (
    <section aria-labelledby="room-name-heading" className="fs-card p-4 sm:p-5">
      <h2
        id="room-name-heading"
        className="mb-4 text-[14.5px] text-fairy-ink"
      >
        Name &amp; code
      </h2>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="room-name-input">Room name</Label>
          <div className="relative flex gap-2">
            <SparkleBurst burst={burst} />
            <Input
              id="room-name-input"
              value={name}
              className="h-10"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              aria-invalid={Boolean(error)}
            />
            <Button size="lg" variant="secondary" onClick={() => void save()} disabled={!dirty}>
              Save
            </Button>
          </div>
          {(error ?? action.error) && (
            <p className="text-[11.5px] font-semibold text-fairy-danger">{error ?? action.error}</p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Join code</Label>
          <JoinCode code={room.joinCode} copyable className="h-10" />
        </div>
      </div>
    </section>
  );
}

function DangerZone({ room }: { room: Room }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = useRepoAction();

  return (
    <section
      aria-labelledby="danger-heading"
      className="rounded-2xl border border-fairy-danger/25 bg-fairy-danger-tint p-4 sm:p-5"
    >
      <h2
        id="danger-heading"
        className="text-[14.5px] text-fairy-ink"
      >
        Delete this room
      </h2>
      <p className="mt-1 mb-4 max-w-prose text-[11.5px] leading-[1.5] font-medium text-fairy-ink-2">
        Removes every bill, every log and everyone in {room.name}.
      </p>
      <Button variant="destructive" size="lg" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" aria-hidden />
        Delete room
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[21px] text-fairy-ink">
              Delete {room.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every bill, appliance and usage entry in this room goes with it.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-fairy-danger-tint text-fairy-danger hover:bg-fairy-danger-tint"
              onClick={async () => {
                const done = await action.run(async () => {
                  await repo.deleteRoom(room.id);
                  return true;
                });
                if (done) router.push("/");
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
