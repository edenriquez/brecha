"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const CHANGE = "brecha:urlparams";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

/**
 * Query string como estado, sin useSearchParams: ese hook haría que la página prerenderizada
 * se pinte solo en el navegador. En el servidor (y al hidratar) los parámetros están vacíos.
 */
export function useUrlParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const setParams = useCallback((changes: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    window.dispatchEvent(new Event(CHANGE));
  }, []);

  return [params, setParams] as const;
}
