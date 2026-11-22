import { useEffect, useState } from "react";

/** `true` while the media query matches (SSR-safe default: false). */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export const useIsMobile = () => useMedia("(max-width: 767px)");

/** Persisted boolean preference (localStorage, failure-tolerant). */
export function usePref(key: string, initial: boolean) {
  const [v, setV] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(key);
      return s == null ? initial : s === "1";
    } catch {
      return initial;
    }
  });
  const set = (n: boolean) => {
    setV(n);
    try {
      localStorage.setItem(key, n ? "1" : "0");
    } catch {}
  };
  return [v, set] as const;
}

/** Persisted panel width with min/max, plus pointer handlers for a drag handle. */
export function useResizableWidth(key: string, initial: number, min = 180, max = 480) {
  const [w, setW] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = w;
    let last = startW;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      last = Math.max(min, Math.min(max, startW + ev.clientX - startX));
      setW(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(key, String(last));
      } catch {}
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const reset = () => {
    setW(initial);
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  return { width: w, onPointerDown, reset };
}

/** String preference persisted in localStorage (e.g. the selected tab). */
export function usePrefValue<T extends string>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {
      /* private mode */
    }
  };
  return [v, set] as const;
}

/** Current sub-tab kept in the URL (?tab=…) so a reload / shared link / workspace switch reopens it. */
export function useUrlTab<T extends string>(def: T, allowed: readonly T[]) {
  const read = () => {
    const t = new URLSearchParams(location.search).get("tab") as T | null;
    return t && allowed.includes(t) ? t : def;
  };
  const [tab, setTab] = useState<T>(read);
  useEffect(() => {
    const onPop = () => setTab(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (t: T) => {
    setTab(t);
    const u = new URL(location.href);
    if (t === def) u.searchParams.delete("tab");
    else u.searchParams.set("tab", t);
    history.replaceState(history.state, "", u);
  };
  return [tab, set] as const;
}
