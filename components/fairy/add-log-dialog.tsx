"use client";

import { useState } from "react";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/fairy/field";
import { ErrorNote } from "@/components/fairy/shell-bits";
import { TRACKER_MODES, TRACKER_MODE_META, repo, type Tracker, type TrackerMode } from "@/lib/data";
import { useRepoAction } from "@/lib/data/hooks";
import { labelSchema, parseField } from "@/lib/forms/schemas";

/**
 * "Add a log", on its own so more than one screen can open it.
 *
 * It lives here rather than beside the tracking panel because the appliance
 * form offers it too, and importing it from there would close a cycle:
 * tracking-panel -> bills-panel -> bill-dialog -> appliance-form.
 *
 * Render it only while it should be open — mounting it fresh each time is what
 * stops it reappearing with the last entry still in it.
 */
export function AddLogForm({
  roomId,
  onDone,
}: {
  roomId: string;
  /** Called with the new log on success, or with nothing when cancelled. */
  onDone: (created?: Tracker) => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<TrackerMode>("clock");
  const [error, setError] = useState<string | null>(null);
  const action = useRepoAction();

  async function submit() {
    const parsed = parseField(labelSchema, name);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const created = await action.run(() => repo.addTracker(roomId, { name: parsed.value, mode }));
    if (created) onDone(created);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onDone()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[21px] text-fairy-ink">Add a log</DialogTitle>
          <DialogDescription>
            Anything you want counted — the aircon, the washer, a guest staying
            over.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field
            id="tracker-name"
            label="Log name"
            value={name}
            onChange={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder="e.g. Air conditioner"
            requirement="required"
            error={error}
            autoFocus
            onEnter={() => void submit()}
          />

          <div className="grid gap-1.5">
            <Label
              htmlFor="tracker-mode"
              className="text-[12.5px] font-bold tracking-[-0.01em] text-fairy-ink"
            >
              How do you log it?
            </Label>
            <Select value={mode} onValueChange={(v) => setMode(v as TrackerMode)}>
              <SelectTrigger id="tracker-mode" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKER_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {TRACKER_MODE_META[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ErrorNote>{action.error}</ErrorNote>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onDone()}>
            Cancel
          </Button>
          <Button disabled={action.pending} onClick={() => void submit()}>
            <Timer className="size-4" aria-hidden />
            Add log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
