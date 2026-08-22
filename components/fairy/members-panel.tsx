"use client";

import { useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2, UserRound, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ErrorNote } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import { repo, type Member, type MemberFootprint } from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { parseField, personNameSchema } from "@/lib/forms/schemas";

/**
 * The people in a room. Any number of them - the list is mapped, never
 * enumerated, so seven people cost exactly as much code as three.
 *
 * Two presentations over one body: a full card (room settings, where managing
 * people IS the job) and a collapsed button that opens the same thing in a
 * dialog (the room screen, where bills are the job and the roster is a detail).
 */
export function MembersPanel({ roomId }: { roomId: string }) {
  const members = useRepoQuery(() => repo.listMembers(roomId), [roomId]);

  return (
    <section aria-labelledby="members-heading" className="fs-card p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="members-heading" className="text-[14.5px] text-fairy-ink">
          People
        </h2>
        <span className="text-[11.5px] font-medium text-fairy-grey">
          {members.data?.length ?? 0} in this room
        </span>
      </div>

      <ErrorNote>{members.error}</ErrorNote>
      <MembersBody roomId={roomId} members={members.data} />
    </section>
  );
}

/** A compact "7 in this room" button that opens the roster in a dialog. */
export function MembersButton({ roomId }: { roomId: string }) {
  const members = useRepoQuery(() => repo.listMembers(roomId), [roomId]);
  const [open, setOpen] = useState(false);
  const count = members.data?.length ?? 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Users className="size-4" aria-hidden />
        {count} in this room
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[21px] text-fairy-ink">People</DialogTitle>
            <DialogDescription>
              Everyone here shows up on every bill in this room, and sees
              everyone else&rsquo;s numbers.
            </DialogDescription>
          </DialogHeader>

          <ErrorNote>{members.error}</ErrorNote>
          <MembersBody roomId={roomId} members={members.data} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The shared body: the roster and the add form. */
function MembersBody({ roomId, members }: { roomId: string; members: Member[] | undefined }) {
  return (
    <>
      {members && members.length > 0 && (
        <ul className="mb-4 grid gap-1.5">
          {members.map((member) => (
            <MemberRow key={member.id} roomId={roomId} member={member} />
          ))}
        </ul>
      )}
      <AddMemberForm roomId={roomId} />
    </>
  );
}

function MemberRow({ roomId, member }: { roomId: string; member: Member }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member.name);
  const [confirming, setConfirming] = useState(false);
  const [footprint, setFootprint] = useState<MemberFootprint | null>(null);
  const action = useRepoAction();

  async function save() {
    const parsed = parseField(personNameSchema, draft);
    if (!parsed.ok) return;
    await action.run(() => repo.renameMember(roomId, member.id, parsed.value));
    setEditing(false);
  }

  async function openConfirm() {
    setFootprint(null);
    setConfirming(true);
    const fp = await action.run(() => repo.getMemberFootprint(roomId, member.id));
    if (fp) setFootprint(fp);
  }

  const attached = footprint
    ? footprint.usageCount + footprint.chargeCount + footprint.billsWithDays
    : 0;

  return (
    <li className="flex items-center gap-2 rounded-xl border border-fairy-hair bg-card px-3 py-2.5">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-fairy-tint text-fairy-rose"
      >
        <UserRound className="size-3.5" />
      </span>

      {editing ? (
        <>
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") {
                setDraft(member.name);
                setEditing(false);
              }
            }}
            className="h-8"
            aria-label={`Rename ${member.name}`}
          />
          <Button size="icon-sm" variant="ghost" onClick={() => void save()} aria-label="Save name">
            <Check className="size-4 text-fairy-moss" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setDraft(member.name);
              setEditing(false);
            }}
            aria-label="Cancel rename"
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fairy-ink">{member.name}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setDraft(member.name);
              setEditing(true);
            }}
            aria-label={`Rename ${member.name}`}
          >
            <Pencil className="size-3.5 text-fairy-grey" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void openConfirm()}
            aria-label={`Remove ${member.name}`}
          >
            <Trash2 className="size-3.5 text-fairy-grey" />
          </Button>
        </>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[21px] text-fairy-ink">
              Remove {member.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {footprint === null ? (
                "Checking what's logged against them…"
              ) : attached === 0 ? (
                "Nothing is logged against them yet, so nothing else changes."
              ) : (
                <>
                  This will also erase{" "}
                  <FootprintSummary footprint={footprint} name={member.name} /> Every
                  affected bill re-splits without them.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void action.run(() => repo.removeMember(roomId, member.id))}
              className="bg-fairy-danger-tint text-fairy-danger hover:bg-fairy-danger-tint"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function FootprintSummary({
  footprint,
  name,
}: {
  footprint: MemberFootprint;
  name: string;
}) {
  const parts: string[] = [];
  if (footprint.usageCount > 0) {
    parts.push(
      `${footprint.usageCount} logged ${footprint.usageCount === 1 ? "usage" : "usages"}`,
    );
  }
  if (footprint.chargeCount > 0) {
    parts.push(
      `${footprint.chargeCount} other ${footprint.chargeCount === 1 ? "charge" : "charges"}`,
    );
  }
  if (footprint.billsWithDays > 0) {
    parts.push(
      `days stayed on ${footprint.billsWithDays} ${
        footprint.billsWithDays === 1 ? "bill" : "bills"
      }`,
    );
  }
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return (
    <span className="text-fairy-ember">
      {list} for {name}.
    </span>
  );
}

function AddMemberForm({ roomId }: { roomId: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();
  const { burst, sparkle } = useSparkle();
  const inputRef = useRef<HTMLInputElement>(null);

  async function add() {
    const parsed = parseField(personNameSchema, name);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const added = await action.run(() => repo.addMember(roomId, parsed.value));
    if (!added) return;
    sparkle();
    setName("");
    // Adding seven people should be seven names and seven Enters.
    inputRef.current?.focus();
  }

  return (
    <div className="grid gap-1.5">
      <div className="relative flex items-center gap-2">
        <SparkleBurst burst={burst} />
        <Input
          ref={inputRef}
          value={name}
          placeholder="Add someone — e.g. Jem"
          aria-label="Name of the person to add"
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          className="h-9"
          aria-invalid={Boolean(error)}
        />
        <Button size="lg" variant="secondary" onClick={() => void add()} disabled={action.pending}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {(error ?? action.error) && (
        <p className="text-[11.5px] font-semibold text-fairy-danger">{error ?? action.error}</p>
      )}
    </div>
  );
}
