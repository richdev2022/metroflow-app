import { useCallback, useEffect, useState } from "react";

/**
 * Global balance show/hide (privacy) state.
 *
 * One switch hides EVERY wallet balance in the app — home cards, wallet
 * cards, savings vaults, virtual cards, the stablecoin hub. The choice is
 * persisted in localStorage so it survives reloads, and a window event keeps
 * every mounted toggle / amount in sync instantly (same tab) — the `storage`
 * event covers other tabs.
 *
 * Key intentionally matches the Business app convention; the two apps run on
 * different origins so there is no collision.
 */
const STORAGE_KEY = "metricorex:balance-hidden";
const CHANGE_EVENT = "metricorex:balance-visibility";

export function readBalanceHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeBalanceHidden(hidden: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    /* storage unavailable (private mode) — toggle still works in-memory */
  }
  window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: hidden }));
}

/**
 * `[hidden, toggle]` — reactive global balance visibility.
 */
export function useBalanceHidden(): [boolean, () => void] {
  const [hidden, setHidden] = useState<boolean>(readBalanceHidden);

  useEffect(() => {
    const onChange = (e: Event) => setHidden(Boolean((e as CustomEvent<boolean>).detail));
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setHidden(e.newValue === "1");
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const toggle = useCallback(() => {
    writeBalanceHidden(!readBalanceHidden());
  }, []);

  return [hidden, toggle];
}

/**
 * Replace every digit with a bullet but keep separators, currency symbols
 * and spacing, so the masked value occupies (almost) the same width and no
 * layout shift occurs: "₦12,345.67" -> "₦••,•••.•·". Non-balance strings
 * (e.g. "—") pass through untouched.
 */
export function maskAmount(formatted: string): string {
  return String(formatted).replace(/[0-9]/g, "•");
}
