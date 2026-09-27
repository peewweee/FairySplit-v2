"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { subscribeToChanges } from "@/lib/data";

export interface Query<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Run a repository read, and re-run it whenever the store changes.
 *
 * `loading` is true only for a genuine load — mounting, or switching to a
 * different room. A refresh triggered by a write refetches silently, because
 * flipping back to a skeleton would unmount whatever the user was typing into.
 *
 * Components `await` through this hook and nowhere else, so the day the
 * repository starts making network calls the loading and error states are
 * already wired up.
 */
export function useRepoQuery<T>(load: () => Promise<T>, deps: readonly unknown[]): Query<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // `load` is a fresh closure every render, so it lives in a ref rather than in
  // the dependency array — otherwise every render would refetch. The ref is
  // updated in an effect (never during render) so it is always the newest one
  // by the time the effects below run.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // Only the newest run may write state; a slow earlier one is discarded.
  const runId = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback((showLoading: boolean) => {
    const id = ++runId.current;
    if (showLoading) setLoading(true);
    loadRef
      .current()
      .then((value) => {
        if (!alive.current || id !== runId.current) return;
        setData(value);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive.current || id !== runId.current) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      })
      .finally(() => {
        if (!alive.current || id !== runId.current) return;
        setLoading(false);
      });
  }, []);

  // Reading an external store is exactly what an effect is for. `set-state-in-effect`
  // guards against derived state being pushed through an effect; here the
  // setState is the "I am fetching" flag for a genuine async read of a store
  // React does not own, which is the case the rule's own docs allow.
  // `exhaustive-deps` cannot see through the spread of a caller-supplied array.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  // A write elsewhere in the app: refresh in place, no skeleton.
  useEffect(() => subscribeToChanges(() => run(false)), [run]);

  const reload = useCallback(() => run(false), [run]);

  return { data, error, loading, reload };
}

/**
 * Wrap a repository write: tracks in-flight state and surfaces the error text
 * instead of letting an exception escape into a render.
 */
export function useRepoAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: `disabled={pending}` only takes effect once a render
  // commits, and React batches the `setPending(true)` that would trigger it —
  // so a double-tap or a bouncing key can fire `run` twice before the button
  // has actually disabled itself. A ref is read and written immediately, with
  // no render in between, so the second call sees the first one's flag.
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return undefined;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending, error, clearError: useCallback(() => setError(null), []) };
}

const subscribeToNothing = () => () => {};

/**
 * True once the component has mounted in the browser. Used to hold back
 * localStorage-dependent output until hydration is done, so the server HTML and
 * the first client render agree.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * Reset derived form state when the record behind it changes.
 *
 * React's "adjust state when a prop changes" pattern: compare a stamp during
 * render and reset in the same pass, instead of an effect that renders once
 * with stale values and then again with fresh ones.
 *
 * Returns true on the render where the stamp changed, so the caller can push
 * the new values into its own state.
 */
export function useResetOnChange(stamp: string): boolean {
  const [seen, setSeen] = useState(stamp);
  if (seen !== stamp) {
    setSeen(stamp);
    return true;
  }
  return false;
}
