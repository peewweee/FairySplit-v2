"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Info, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApplianceForm, type ApplianceDraft } from "@/components/fairy/appliance-form";
import { JoinCode } from "@/components/fairy/join-code";
import { MembersPanel } from "@/components/fairy/members-panel";
import { Crumbs, EmptyState, ErrorNote, LoadingRows, PageHeader } from "@/components/fairy/shell-bits";
import { SparkleBurst, useSparkle } from "@/components/fairy/sparkle-burst";
import {
  APPLIANCE_MODE_META,
  repo,
  type ApplianceTemplate,
  type Room,
} from "@/lib/data";
import { useRepoAction, useRepoQuery } from "@/lib/data/hooks";
import { parseField, roomNameSchema } from "@/lib/forms/schemas";

export function RoomSettingsScreen({ roomId }: { roomId: string }) {
  const room = useRepoQuery(() => repo.getRoom(roomId), [roomId]);

  if (room.loading) return <LoadingRows rows={3} />;
  if (room.error || !room.data) {
    return (
      <>
        <Crumbs items={[{ label: "Rooms", href: "/" }, { label: "Not found" }]} />
        <ErrorNote>{room.error ?? "That room isn't on this device."}</ErrorNote>
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
          <ApplianceTemplatesPanel room={room.data} />
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

      <div className="mt-4 flex gap-2.5 rounded-xl border border-fairy-ember/30 bg-fairy-ember-tint px-3 py-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-fairy-ember" aria-hidden />
        <p className="text-[11.5px] leading-[1.5] font-medium text-fairy-ink-2">
          This code only works in this browser for now — FairySplit has no server
          yet, so it can&rsquo;t reach your housemate&rsquo;s device.
        </p>
      </div>
    </section>
  );
}

function ApplianceTemplatesPanel({ room }: { room: Room }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApplianceTemplate | null>(null);
  const action = useRepoAction();

  async function add(draft: ApplianceDraft) {
    const created = await action.run(() => repo.addApplianceTemplate(room.id, draft));
    if (created) setAdding(false);
  }

  async function update(draft: ApplianceDraft) {
    if (!editing) return;
    const saved = await action.run(() =>
      repo.updateApplianceTemplate(room.id, editing.id, draft),
    );
    if (saved) setEditing(null);
  }

  return (
    <section aria-labelledby="templates-heading" className="fs-card p-4 sm:p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2
          id="templates-heading"
          className="text-[14.5px] text-fairy-ink"
        >
          Appliance defaults
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add
        </Button>
      </div>
      <p className="mb-4 max-w-prose text-[11.5px] leading-[1.5] font-medium text-fairy-grey">
        Reused each month. A new bill copies the active ones — but only if that
        bill has an electricity rate. Without a rate there is nothing to price
        them against, so the whole appliance section stays hidden.
      </p>

      <ErrorNote>{action.error}</ErrorNote>

      {room.applianceDefaults.length === 0 ? (
        <EmptyState
          icon={<Plug className="size-5" aria-hidden />}
          title="No defaults yet"
          description="Add the fridge, the aircon, whatever you want charged separately. You can also add appliances directly to a bill."
          className="py-10"
        />
      ) : (
        <ul className="grid gap-1.5">
          {room.applianceDefaults.map((template) => (
            <li
              key={template.id}
              className="flex items-center gap-2 rounded-xl border border-fairy-hair bg-card px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-fairy-ink">{template.label}</div>
                <div className="text-[11.5px] font-medium text-fairy-grey">
                  {APPLIANCE_MODE_META[template.mode].label} ·{" "}
                  {template.kwhPerUnit === null ? (
                    <span className="text-fairy-ember">kWh not set yet</span>
                  ) : (
                    <span data-numeric>
                      {template.kwhPerUnit} kWh / {APPLIANCE_MODE_META[template.mode].unit}
                    </span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-[11.5px] font-medium text-fairy-grey">
                <Switch
                  checked={template.active}
                  onCheckedChange={(checked) =>
                    void action.run(() =>
                      repo.updateApplianceTemplate(room.id, template.id, { active: checked }),
                    )
                  }
                  aria-label={`Copy ${template.label} into new bills`}
                />
                <span className="hidden sm:inline">Auto-add</span>
              </label>

              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditing(template)}
                aria-label={`Edit ${template.label}`}
              >
                <Pencil className="size-3.5 text-fairy-grey" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  void action.run(() => repo.removeApplianceTemplate(room.id, template.id))
                }
                aria-label={`Remove ${template.label}`}
              >
                <Trash2 className="size-3.5 text-fairy-grey" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[21px] text-fairy-ink">New appliance default</DialogTitle>
            <DialogDescription>
              Name it whatever you call it at home.
            </DialogDescription>
          </DialogHeader>
          {adding && (
            <ApplianceForm
              kwhRequired={false}
              submitLabel="Add appliance"
              onSubmit={add}
              onCancel={() => setAdding(false)}
              pending={action.pending}
              error={action.error}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[21px] text-fairy-ink">Edit {editing?.label}</DialogTitle>
            <DialogDescription>
              Bills already created keep their own frozen copy — editing here only
              affects future bills.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ApplianceForm
              key={editing.id}
              initial={{
                label: editing.label,
                mode: editing.mode,
                kwhPerUnit: editing.kwhPerUnit,
              }}
              kwhRequired={false}
              submitLabel="Save changes"
              onSubmit={update}
              onCancel={() => setEditing(null)}
              pending={action.pending}
              error={action.error}
            />
          )}
        </DialogContent>
      </Dialog>
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
        Removes every bill and usage log in {room.name}. There is no undo
        and no backup — this device is the only copy.
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
