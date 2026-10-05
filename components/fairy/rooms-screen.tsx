"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Home, KeyRound, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/fairy/field";
import { EmptyState, ErrorNote, LoadingRows, PageHeader } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { JoinCode } from "@/components/fairy/join-code";
import { repo } from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { joinCodeSchema, parseField, roomNameSchema } from "@/lib/forms/schemas";

export function RoomsScreen() {
  const rooms = useRepoQuery(() => repo.listRooms(), []);
  const identity = useRepoQuery(() => repo.getIdentity(), []);

  return (
    <div>
      <PageHeader
        title="Your rooms"
        action={
          <>
            <JoinRoomDialog />
            <NewRoomDialog creatorName={identity.data?.name ?? ""} />
          </>
        }
      />

      <ErrorNote>{rooms.error}</ErrorNote>

      {rooms.loading ? (
        <LoadingRows />
      ) : rooms.data && rooms.data.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rooms.data.map((room) => (
            <li key={room.id}>
              <Link
                href={`/rooms/${room.id}`}
                className="fs-card block px-4 py-4 transition-colors hover:bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] text-fairy-ink">
                      {room.name}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-fairy-grey">
                      <Users className="size-3.5" aria-hidden />
                      {room.memberIds.length}{" "}
                      {room.memberIds.length === 1 ? "person" : "people"}
                    </div>
                  </div>
                  <JoinCode code={room.joinCode} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Home className="size-6" aria-hidden />}
          title="No rooms yet"
          description="Make a room for your household, then add the people you split bills with."
          action={<NewRoomDialog creatorName={identity.data?.name ?? ""} />}
        />
      )}
    </div>
  );
}

function NewRoomDialog({ creatorName }: { creatorName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();
  const { burst, sparkle } = useSparkle();

  async function create() {
    const parsed = parseField(roomNameSchema, name);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const room = await action.run(() => repo.createRoom(parsed.value, creatorName));
    if (!room) return;
    sparkle();
    setOpen(false);
    setName("");
    router.push(`/rooms/${room.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" className="relative">
          <SparkleBurst burst={burst} />
          <Plus className="size-4" aria-hidden />
          New room
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[21px] text-fairy-ink">New room</DialogTitle>
          <DialogDescription>
            Name it after the place, not the month — one room holds every bill you
            split there.
          </DialogDescription>
        </DialogHeader>

        <Field
          id="room-name"
          label="Room name"
          value={name}
          onChange={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder="e.g. Unit 12B"
          requirement="required"
          autoFocus
          error={error ?? action.error}
          onEnter={() => void create()}
          helper={
            creatorName
              ? `You'll be added as ${creatorName}. Add your housemates next.`
              : "Set your name in the header and you'll be added as the first member."
          }
        />

        <DialogFooter>
          <Button size="lg" onClick={() => void create()} disabled={action.pending}>
            {action.pending ? "Creating…" : "Create room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinRoomDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  // An invite link is "/?join=CODE". Read straight off the URL rather than
  // through useSearchParams, which would drag a Suspense boundary in for a
  // string this component already has.
  useEffect(() => {
    const invited = new URLSearchParams(window.location.search).get("join");
    if (!invited) return;
    // The URL is a store React does not own, and it can only be read after
    // hydration — the case `set-state-in-effect` documents as allowed. It runs
    // once, on mount, and clears the param so it cannot run again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(invited.toUpperCase());
    setOpen(true);
    // Take the code out of the address bar so a refresh does not reopen it.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function join() {
    const parsed = parseField(joinCodeSchema, code);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const room = await action.run(() => repo.joinRoom(parsed.value));
    if (!room) return;
    setOpen(false);
    setCode("");
    router.push(`/rooms/${room.id}`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Clear on CLOSE, not on open: opening is also how an invite link
        // arrives, and it brings a code with it.
        if (!next) {
          setCode("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" variant="outline">
          <KeyRound className="size-4" aria-hidden />
          Join with a code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[21px] text-fairy-ink">Join a room</DialogTitle>
          <DialogDescription>
            Six characters, no zeros or ones. Ask a housemate — the code is in
            their room&rsquo;s settings.
          </DialogDescription>
        </DialogHeader>

        <Field
          id="join-code"
          label="Join code"
          value={code}
          onChange={(v) => {
            setCode(v.toUpperCase());
            setError(null);
          }}
          placeholder="e.g. K7QM2P"
          requirement="required"
          autoFocus
          error={error ?? action.error}
          onEnter={() => void join()}
          className="[&_input]:font-mono [&_input]:tracking-[0.25em] [&_input]:uppercase"
        />

        <DialogFooter>
          <Button size="lg" onClick={() => void join()} disabled={action.pending}>
            {action.pending ? "Looking…" : "Join room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
