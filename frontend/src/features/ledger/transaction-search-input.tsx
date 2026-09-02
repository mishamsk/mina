import { useEffect, useEffectEvent, useRef, useState } from "react";

interface TransactionSearchInputProps {
  readonly id: string;
  readonly onSearchChange: (value: string) => void;
  readonly value: string;
}

export const TransactionSearchInput = ({
  id,
  onSearchChange,
  value,
}: TransactionSearchInputProps) => {
  const [draftState, setDraftState] = useState({ draft: value, value });
  const draft = draftState.value === value ? draftState.draft : value;
  const pendingSearchRef = useRef<string | null>(null);
  const routePathnameRef = useRef(window.location.pathname);
  const flushPendingSearch = useEffectEvent(() => {
    if (
      pendingSearchRef.current !== null &&
      window.location.pathname === routePathnameRef.current
    ) {
      onSearchChange(pendingSearchRef.current);
    }
  });

  useEffect(() => {
    const normalizedSearch = draft.trim();
    if (normalizedSearch === value) {
      pendingSearchRef.current = null;
      return;
    }

    pendingSearchRef.current = normalizedSearch;
    const timeoutId = window.setTimeout(() => {
      pendingSearchRef.current = null;
      onSearchChange(normalizedSearch);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draft, onSearchChange, value]);

  useEffect(() => () => flushPendingSearch(), []);

  return (
    <input
      id={id}
      type="search"
      autoComplete="off"
      className="bg-card text-foreground placeholder:text-muted-foreground h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
      placeholder="Memo or counterparty"
      value={draft}
      onChange={(event) => {
        setDraftState({ draft: event.target.value, value });
      }}
    />
  );
};
