import { useEffect, useState } from "react";

export const useAcceleratorHeld = ({
  enabled = true,
  metaOnly = false,
}: {
  enabled?: boolean;
  metaOnly?: boolean;
}): boolean => {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let current = false;
    const update = (next: boolean) => {
      if (current === next) return;
      current = next;
      setHeld(next);
    };
    const onKey = (event: KeyboardEvent) =>
      update(event.metaKey || (!metaOnly && event.ctrlKey));
    const clear = () => update(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clear);
    window.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", clear);
      window.removeEventListener("visibilitychange", clear);
      clear();
    };
  }, [enabled, metaOnly]);
  return enabled && held;
};
