"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export interface AsyncState<T> {
  /** Latest resolved value, or null before the first success. */
  data: T | null;
  /** Stringified error message from the most recent attempt, or null. */
  error: string | null;
  /** True while a fetch is in flight (including reloads). */
  loading: boolean;
  /** Re-run the async function. Safe to pass to onClick / after mutations. */
  reload: () => void;
}

interface InternalState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

type Action<T> =
  | { type: "start" }
  | { type: "success"; data: T }
  | { type: "failure"; error: string };

function asyncReducer<T>(
  state: InternalState<T>,
  action: Action<T>,
): InternalState<T> {
  switch (action.type) {
    case "start":
      return { ...state, loading: true, error: null };
    case "success":
      return { data: action.data, error: null, loading: false };
    case "failure":
      return { ...state, error: action.error, loading: false };
    default:
      return state;
  }
}

/**
 * Small data-fetching hook that standardizes the loading/error/reload pattern
 * every screen needs. Intentionally dependency-free — the app talks to the
 * backend exclusively through the typed `api` client in `@/lib/api`.
 *
 * The `fn` may be an inline arrow; its identity is not tracked (we always call
 * the latest one, kept fresh in a ref). Pass `deps` to re-fetch when inputs
 * change. State transitions go through a reducer so the fetch effect only
 * dispatches — never calls a setter synchronously in its body.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [state, dispatch] = useReducer(asyncReducer<T>, {
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);

  // Keep the latest fn without making it a fetch dependency (updated post-render).
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "start" });
    fnRef
      .current()
      .then((res) => {
        if (!cancelled) dispatch({ type: "success", data: res });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          dispatch({
            type: "failure",
            error: String((e as Error)?.message ?? e ?? "Request failed"),
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
  };
}
