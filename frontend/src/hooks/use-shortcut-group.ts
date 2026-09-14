import { useEffect } from "react";

// Callers memoize the group and supply stable registry actions.
export const useShortcutGroup = <T extends { readonly id: string }>(
  group: T,
  register: (group: T) => void,
  unregister: (id: string) => void,
  enabled = true,
): void => {
  useEffect(() => {
    if (!enabled) return;
    register(group);
    return () => unregister(group.id);
  }, [enabled, group, register, unregister]);
};
