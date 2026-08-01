import { Check, Close, Plus, Trash } from "pixelarticons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type Account,
  apiErrorMessage,
  type CreateAccountRequest,
  createLedgerAccount,
  createLedgerCreditLimitHistory,
  type CreditLimitHistory,
  deleteLedgerAccountById,
  deleteLedgerCreditLimitHistoryById,
  fetchCreditLimitHistory,
  type UpdateAccountRequest,
  updateLedgerAccount,
  type WritableAccountType,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReferenceEntityDeleteDescription } from "@/components/reference-entity-delete-description";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountText } from "@/features/ledger";

import { refreshAccountsAfterMutation } from "./use-accounts-resource";

type AccountFormField =
  | "creditLimit"
  | "currency"
  | "effectiveDate"
  | "externalId"
  | "externalSystem"
  | "fqn"
  | "general"
  | "type";

type AccountFormErrors = Partial<Record<AccountFormField, string>>;

interface AccountFormState {
  readonly accountType: WritableAccountType;
  readonly currency: string;
  readonly currencyMode: "multi" | "single";
  readonly externalId: string;
  readonly externalSystem: string;
  readonly fqn: string;
  readonly isFeatured: boolean;
  readonly isHidden: boolean;
}

interface CreditLimitDraft {
  readonly amount: string;
  readonly effectiveDate: string;
}

interface AccountsSidePanelProps {
  readonly account: Account | undefined;
  readonly currencies: readonly string[];
  readonly mode: "create" | "edit";
  readonly onClose: () => void;
  readonly onNotice: (message: string) => void;
  readonly open: boolean;
}

const validCurrencyPattern = /^([A-Z]{3}|C::.+)$/;
const nonNegativeDecimalPattern = /^\d+(\.\d{1,8})?$/;
const floatingOverlaySelector =
  "[role='alertdialog'], [role='listbox'], [data-slot='select-content'][data-state='open']";
const hasMatchingDatalistOption = (input: HTMLInputElement): boolean => {
  const query = input.value.trim().toLocaleLowerCase();
  return Array.from(input.list?.options ?? []).some((option) =>
    option.value.toLocaleLowerCase().includes(query),
  );
};
const blankForm = (): AccountFormState => ({
  accountType: "owned",
  currency: "USD",
  currencyMode: "single",
  externalId: "",
  externalSystem: "",
  fqn: "",
  isFeatured: false,
  isHidden: false,
});

const formFromAccount = (account: Account | undefined): AccountFormState =>
  account
    ? {
        accountType:
          account.account_type === "system" ? "owned" : account.account_type,
        currency: account.currency ?? "USD",
        currencyMode: account.currency == null ? "multi" : "single",
        externalId: account.external_id ?? "",
        externalSystem: account.external_system ?? "",
        fqn: account.fqn,
        isFeatured: account.is_featured,
        isHidden: account.is_hidden,
      }
    : blankForm();

const fieldErrorsFromAPI = (message: string): AccountFormErrors => {
  const lower = message.toLowerCase();
  if (lower.includes("fqn") || lower.includes("name")) {
    return { fqn: message };
  }
  if (lower.includes("account_type") || lower.includes("type")) {
    return { type: message };
  }
  if (lower.includes("currency")) {
    return { currency: message };
  }
  if (lower.includes("external_id")) {
    return { externalId: message };
  }
  if (lower.includes("external_system")) {
    return { externalSystem: message };
  }
  if (lower.includes("credit_limit")) {
    return { creditLimit: message };
  }
  if (lower.includes("effective_date")) {
    return { effectiveDate: message };
  }
  return { general: message };
};

const hasErrors = (errors: AccountFormErrors): boolean =>
  Object.values(errors).some(Boolean);

const accountFormErrorFields: readonly AccountFormField[] = [
  "currency",
  "externalId",
  "externalSystem",
  "fqn",
  "general",
  "type",
];

const creditLimitErrorFields: readonly AccountFormField[] = [
  "creditLimit",
  "effectiveDate",
];

const normalizeNullableString = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeCurrency = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
};

const normalizeAmount = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!nonNegativeDecimalPattern.test(trimmed)) {
    return undefined;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  return `${whole}.${fraction.padEnd(8, "0").slice(0, 8)}`;
};

const validateForm = (
  form: AccountFormState,
  mode: "create" | "edit",
): AccountFormErrors => {
  const errors: AccountFormErrors = {};
  if (mode === "create" && !form.fqn.trim()) {
    errors.fqn = "FQN is required.";
  }
  const currency = normalizeCurrency(form.currency);
  if (form.currencyMode === "single") {
    if (!currency) {
      errors.currency = "Currency is required for single-currency mode.";
    } else if (!validCurrencyPattern.test(currency)) {
      errors.currency = "Use a 3-letter code or C:: crypto code.";
    }
  }
  return errors;
};

const validateFormField = (
  form: AccountFormState,
  mode: "create" | "edit",
  field: AccountFormField,
): string | undefined => validateForm(form, mode)[field];

const validateCreditLimitDraft = (
  draft: CreditLimitDraft,
): AccountFormErrors => {
  const errors: AccountFormErrors = {};
  if (!normalizeAmount(draft.amount)) {
    errors.creditLimit = "Enter a non-negative amount with up to 8 decimals.";
  }
  if (!draft.effectiveDate) {
    errors.effectiveDate = "Effective date is required.";
  }
  return errors;
};

const validateCreditLimitField = (
  draft: CreditLimitDraft,
  field: AccountFormField,
): string | undefined => validateCreditLimitDraft(draft)[field];

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? <p className="text-destructive text-xs">{message}</p> : null;

const Field = ({
  children,
  label,
  htmlFor,
}: {
  readonly children: ReactNode;
  readonly htmlFor: string;
  readonly label: string;
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={htmlFor} className="text-sm font-semibold">
      {label}
    </label>
    {children}
  </div>
);

const CreditLimitRows = ({
  currency,
  deletingId,
  history,
  onDeleteClick,
}: {
  readonly currency: string | null;
  readonly deletingId: number | undefined;
  readonly history: readonly CreditLimitHistory[];
  readonly onDeleteClick: (
    entry: CreditLimitHistory,
    opener: HTMLElement,
  ) => void;
}) => {
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground font-body text-sm">
        No credit-limit history.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--hairline)] border-2 border-[var(--border-ink)]">
      {history.map((entry) => (
        <li
          key={entry.credit_limit_history_id}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-2 p-2"
        >
          <div className="min-w-0">
            <p className="font-mono text-sm">{entry.effective_date}</p>
            {currency ? (
              <AmountText
                amount={{
                  amount: entry.credit_limit,
                  currency,
                }}
                positiveSign={false}
                tone="neutral"
              />
            ) : (
              <p className="font-mono text-sm tabular-nums">
                {entry.credit_limit}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deletingId === entry.credit_limit_history_id}
            onClick={(event) => {
              onDeleteClick(entry, event.currentTarget);
            }}
          >
            <Trash aria-hidden="true" />
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
};

const AccountsSidePanelContent = ({
  account,
  currencies,
  mode,
  onClose,
  onNotice,
}: Omit<AccountsSidePanelProps, "open">) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const panelSessionActiveRef = useRef(true);
  const accountDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const creditLimitAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const creditLimitAmountInputRef = useRef<HTMLInputElement | null>(null);
  const creditLimitDeleteOpenerRef = useRef<HTMLElement | null>(null);
  const creditLimitRevealButtonRef = useRef<HTMLButtonElement | null>(null);
  const datalistEscapePendingRef = useRef(false);
  const datalistKeyboardCommitTargetRef = useRef<HTMLInputElement | null>(null);
  const datalistPointerTargetRef = useRef<HTMLInputElement | null>(null);
  const historyErrorRef = useRef<HTMLParagraphElement | null>(null);
  const [form, setForm] = useState<AccountFormState>(() =>
    mode === "create" ? blankForm() : formFromAccount(account),
  );
  const [fieldErrors, setFieldErrors] = useState<AccountFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<readonly CreditLimitHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(
    () =>
      mode === "edit" &&
      (account?.account_type === "owned" ||
        account?.has_credit_limit_history === true),
  );
  const [historyResolved, setHistoryResolved] = useState(false);
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [creditDraft, setCreditDraft] = useState<CreditLimitDraft>({
    amount: "",
    effectiveDate: "",
  });
  const [creditLimitEditorRevealed, setCreditLimitEditorRevealed] =
    useState(false);
  const [addingCreditLimit, setAddingCreditLimit] = useState(false);
  const [deletingCreditLimitId, setDeletingCreditLimitId] = useState<
    number | undefined
  >();
  const [creditLimitDeleteEntry, setCreditLimitDeleteEntry] = useState<
    CreditLimitHistory | undefined
  >();
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const historyAccountID = account?.account_id;
  const historyAccountType = account?.account_type;
  const accountHasCreditLimitHistory =
    account?.has_credit_limit_history === true;
  const accountCurrency = account?.currency ?? null;

  useEffect(() => {
    panelSessionActiveRef.current = true;
    return () => {
      panelSessionActiveRef.current = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    if (
      historyAccountID === undefined ||
      (historyAccountType !== "owned" && !accountHasCreditLimitHistory)
    ) {
      setHistory([]);
      setHistoryLoading(false);
      setHistoryResolved(true);
      setHistoryError(undefined);
      return [];
    }

    setHistoryLoading(true);
    setHistoryError(undefined);
    const result = await fetchCreditLimitHistory(historyAccountID);
    setHistoryLoading(false);
    if (result.data) {
      setHistory(result.data.credit_limit_history);
      setHistoryResolved(true);
      return result.data.credit_limit_history;
    }
    setHistoryError(
      apiErrorMessage(
        result.error,
        "Credit-limit history could not be loaded.",
      ),
    );
    return undefined;
  }, [accountHasCreditLimitHistory, historyAccountID, historyAccountType]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadHistory]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [mode, account?.account_id]);

  useEffect(() => {
    if (!creditLimitEditorRevealed) {
      return;
    }
    let focusFrame: number | undefined;
    const settleFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        creditLimitAmountInputRef.current?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(settleFrame);
      if (focusFrame !== undefined) {
        window.cancelAnimationFrame(focusFrame);
      }
    };
  }, [creditLimitEditorRevealed]);

  const closeAccountDelete = useCallback(() => {
    if (!deletingAccount) {
      setAccountDeleteOpen(false);
      window.requestAnimationFrame(() => {
        accountDeleteButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [deletingAccount]);

  const closeCreditLimitDelete = useCallback(() => {
    if (!deletingCreditLimitId) {
      setCreditLimitDeleteEntry(undefined);
      const opener = creditLimitDeleteOpenerRef.current;
      creditLimitDeleteOpenerRef.current = null;
      if (opener?.isConnected) {
        window.requestAnimationFrame(() => {
          opener.focus({ preventScroll: true });
        });
      }
    }
  }, [deletingCreditLimitId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        event.target instanceof HTMLInputElement &&
        event.target.list !== null &&
        datalistEscapePendingRef.current
      ) {
        datalistKeyboardCommitTargetRef.current = event.target;
        datalistPointerTargetRef.current = null;
        datalistEscapePendingRef.current = false;
        return;
      }
      if (event.key !== "Escape") {
        datalistKeyboardCommitTargetRef.current = null;
        datalistPointerTargetRef.current = null;
        datalistEscapePendingRef.current =
          event.key === "ArrowDown" &&
          event.target instanceof HTMLInputElement &&
          event.target.list !== null &&
          !event.target.disabled &&
          !event.target.readOnly &&
          hasMatchingDatalistOption(event.target);
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      if (document.querySelector(floatingOverlaySelector)) {
        return;
      }
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement &&
        activeElement.list !== null &&
        !activeElement.disabled &&
        !activeElement.readOnly &&
        datalistEscapePendingRef.current
      ) {
        datalistKeyboardCommitTargetRef.current = null;
        datalistPointerTargetRef.current = null;
        datalistEscapePendingRef.current = false;
        return;
      }
      datalistKeyboardCommitTargetRef.current = null;
      datalistPointerTargetRef.current = null;
      datalistEscapePendingRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      if (!saving) {
        onClose();
      }
    };
    const clearDatalistKeyboardCommit = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        event.target === datalistKeyboardCommitTargetRef.current
      ) {
        datalistKeyboardCommitTargetRef.current = null;
      }
    };
    const clearDatalistEscape = (event: Event) => {
      if (event.target === datalistPointerTargetRef.current) {
        datalistPointerTargetRef.current = null;
        return;
      }
      datalistKeyboardCommitTargetRef.current = null;
      datalistPointerTargetRef.current = null;
      datalistEscapePendingRef.current = false;
    };
    const updateDatalistEscapeFromPointer = (event: PointerEvent) => {
      const target =
        event.target instanceof HTMLInputElement &&
        event.target.list !== null &&
        !event.target.disabled &&
        !event.target.readOnly &&
        hasMatchingDatalistOption(event.target)
          ? event.target
          : null;
      datalistKeyboardCommitTargetRef.current = null;
      datalistPointerTargetRef.current = target;
      datalistEscapePendingRef.current = target !== null;
    };
    const updateDatalistEscape = (event: Event) => {
      if (event.target === datalistKeyboardCommitTargetRef.current) {
        datalistKeyboardCommitTargetRef.current = null;
        datalistEscapePendingRef.current = false;
        return;
      }
      datalistEscapePendingRef.current =
        event.target instanceof HTMLInputElement &&
        event.target.list !== null &&
        !event.target.disabled &&
        !event.target.readOnly &&
        hasMatchingDatalistOption(event.target);
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("keyup", clearDatalistKeyboardCommit, {
      capture: true,
    });
    document.addEventListener("pointerdown", updateDatalistEscapeFromPointer, {
      capture: true,
    });
    document.addEventListener("focusin", clearDatalistEscape, {
      capture: true,
    });
    document.addEventListener("input", updateDatalistEscape, { capture: true });
    document.addEventListener("change", clearDatalistEscape, {
      capture: true,
    });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keyup", clearDatalistKeyboardCommit, {
        capture: true,
      });
      document.removeEventListener(
        "pointerdown",
        updateDatalistEscapeFromPointer,
        { capture: true },
      );
      document.removeEventListener("focusin", clearDatalistEscape, {
        capture: true,
      });
      document.removeEventListener("input", updateDatalistEscape, {
        capture: true,
      });
      document.removeEventListener("change", clearDatalistEscape, {
        capture: true,
      });
    };
  }, [onClose, saving]);

  const currencyOptions = useMemo(
    () => [...new Set(currencies)].filter(Boolean).sort(),
    [currencies],
  );

  const updateForm = (patch: Partial<AccountFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const setFieldError = (
    field: AccountFormField,
    message: string | undefined,
  ) => {
    setFieldErrors((current) => {
      const next = { ...current };
      if (message) {
        next[field] = message;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const replaceFieldErrors = (
    fields: readonly AccountFormField[],
    nextErrors: AccountFormErrors,
  ) => {
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of fields) {
        delete next[field];
      }
      return { ...next, ...nextErrors };
    });
  };

  const mergeFieldErrors = (nextErrors: AccountFormErrors) => {
    setFieldErrors((current) => ({ ...current, ...nextErrors }));
  };

  const submitForm = async () => {
    if (saving || addingCreditLimit) {
      return;
    }

    const nextErrors = validateForm(form, mode);
    replaceFieldErrors(accountFormErrorFields, nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }

    const accountTypeChanged =
      mode === "edit" &&
      account !== undefined &&
      form.accountType !== account.account_type;
    const currency =
      form.currencyMode === "multi" ? null : normalizeCurrency(form.currency);
    const currencyChanged =
      mode === "edit" &&
      account !== undefined &&
      currency !== (account.currency ?? null);

    setSaving(true);
    const result =
      mode === "create"
        ? await createLedgerAccount({
            account_type: form.accountType,
            currency,
            external_id: normalizeNullableString(form.externalId),
            external_system: normalizeNullableString(form.externalSystem),
            fqn: form.fqn.trim(),
            is_featured: form.isFeatured,
            is_hidden: form.isHidden,
          } satisfies CreateAccountRequest)
        : account
          ? await updateLedgerAccount(account.account_id, {
              ...(accountTypeChanged ? { account_type: form.accountType } : {}),
              ...(currencyChanged ? { currency } : {}),
              external_id: normalizeNullableString(form.externalId),
              external_system: normalizeNullableString(form.externalSystem),
              is_featured: form.isFeatured,
              is_hidden: form.isHidden,
            } satisfies UpdateAccountRequest)
          : undefined;
    if (!result) {
      if (panelSessionActiveRef.current) {
        setSaving(false);
      }
      return;
    }

    if (result.data) {
      await refreshAccountsAfterMutation({
        account: result.data,
        bulk: accountTypeChanged || currencyChanged,
      });
      if (!panelSessionActiveRef.current) {
        return;
      }
      onNotice(mode === "create" ? "Account created." : "Account updated.");
      onClose();
      return;
    }

    if (!panelSessionActiveRef.current) {
      return;
    }
    setSaving(false);
    const message = apiErrorMessage(
      result.error,
      "Account could not be saved.",
    );
    mergeFieldErrors(fieldErrorsFromAPI(message));
  };

  const addCreditLimit = async () => {
    if (!account || addingCreditLimit || saving) {
      return;
    }

    const errors = validateCreditLimitDraft(creditDraft);
    replaceFieldErrors(creditLimitErrorFields, errors);
    if (hasErrors(errors)) {
      return;
    }

    const creditLimit = normalizeAmount(creditDraft.amount);
    if (!creditLimit) {
      return;
    }

    setAddingCreditLimit(true);
    const result = await createLedgerCreditLimitHistory(account.account_id, {
      credit_limit: creditLimit,
      effective_date: creditDraft.effectiveDate,
    });
    if (!panelSessionActiveRef.current) {
      return;
    }
    setAddingCreditLimit(false);

    if (result.data) {
      setHistory((current) => [...current, result.data]);
      setHistoryResolved(true);
      setCreditDraft({
        amount: "",
        effectiveDate: "",
      });
      setForm((current) => ({
        ...current,
        accountType: "owned",
        currency: account.currency ?? current.currency,
        currencyMode: "single",
      }));
      setFieldError("type", undefined);
      await Promise.all([loadHistory(), refreshAccountsAfterMutation()]);
      if (!panelSessionActiveRef.current) {
        return;
      }
      onNotice("Credit limit added.");
      return;
    }

    const message = apiErrorMessage(
      result.error,
      "Credit limit could not be saved.",
    );
    mergeFieldErrors(fieldErrorsFromAPI(message));
  };

  const deleteCreditLimit = async (entry: CreditLimitHistory) => {
    if (deletingCreditLimitId) {
      return;
    }
    setDeletingCreditLimitId(entry.credit_limit_history_id);
    const result = await deleteLedgerCreditLimitHistoryById(
      entry.credit_limit_history_id,
    );
    if (!panelSessionActiveRef.current) {
      return;
    }
    setDeletingCreditLimitId(undefined);
    if (result.data !== undefined || !result.error) {
      setCreditLimitDeleteEntry(undefined);
      setHistory((current) =>
        current.filter(
          (currentEntry) =>
            currentEntry.credit_limit_history_id !==
            entry.credit_limit_history_id,
        ),
      );
      setHistoryResolved(true);
      const [nextHistory] = await Promise.all([
        loadHistory(),
        refreshAccountsAfterMutation(),
      ]);
      if (!panelSessionActiveRef.current) {
        return;
      }
      if (nextHistory?.length === 0) {
        setCreditLimitEditorRevealed(false);
      }
      onNotice("Credit limit deleted.");
      window.requestAnimationFrame(() => {
        const focusTarget =
          creditLimitAddButtonRef.current ?? creditLimitRevealButtonRef.current;
        focusTarget?.focus({ preventScroll: true });
      });
      return;
    }
    setHistoryError(
      apiErrorMessage(result.error, "Credit limit could not be deleted."),
    );
    setCreditLimitDeleteEntry(undefined);
    window.requestAnimationFrame(() => {
      historyErrorRef.current?.focus({ preventScroll: true });
    });
  };

  const deleteAccount = async () => {
    if (!account || deletingAccount) {
      return;
    }
    setDeletingAccount(true);
    const result = await deleteLedgerAccountById(account.account_id);
    if (!panelSessionActiveRef.current) {
      return;
    }
    if (result.data !== undefined || !result.error) {
      await refreshAccountsAfterMutation({
        removedAccountId: account.account_id,
      });
      onNotice("Account deleted.");
      onClose();
      return;
    }
    setDeletingAccount(false);
    closeAccountDelete();
    setFieldErrors({
      general: apiErrorMessage(result.error, "Account could not be deleted."),
    });
  };

  const title = mode === "create" ? "Create account" : "Edit account";
  const showCreditLimits =
    mode === "edit" &&
    ((account?.account_type === "owned" && accountCurrency != null) ||
      accountHasCreditLimitHistory);
  const canAddCreditLimits =
    account?.account_type === "owned" && accountCurrency != null;
  const hasLoadedEmptyCreditLimitHistory =
    !historyLoading && !historyError && history.length === 0;
  const currencyControlsLocked =
    mode === "edit" &&
    account !== undefined &&
    (showCreditLimits && historyResolved
      ? history.length > 0
      : account.has_credit_limit_history === true);
  const currencyLockReasonId = "account-currency-lock-reason";
  const creditLimitHistoryList = historyLoading ? (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
    </div>
  ) : historyError ? (
    <p
      ref={historyErrorRef}
      role="alert"
      tabIndex={-1}
      className="text-destructive text-sm"
    >
      {historyError}
    </p>
  ) : (
    <CreditLimitRows
      currency={accountCurrency}
      deletingId={deletingCreditLimitId}
      history={history}
      onDeleteClick={(entry, opener) => {
        creditLimitDeleteOpenerRef.current = opener;
        setCreditLimitDeleteEntry(entry);
      }}
    />
  );

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="accounts-side-panel-title"
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(520px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="accounts-side-panel"
      tabIndex={-1}
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            Chart of accounts
          </p>
          <h2 id="accounts-side-panel-title" className="text-pixel text-base">
            {title}
          </h2>
        </div>
        <Tooltip
          label={
            saving
              ? "Saving prevents closing the account panel."
              : "Close account panel"
          }
          asChild
        >
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close account panel"
            aria-disabled={saving ? true : undefined}
            onClick={() => {
              if (!saving) {
                onClose();
              }
            }}
          >
            <Close aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm();
          }}
        >
          <Field htmlFor="account-fqn" label="FQN">
            <input
              id="account-fqn"
              className="bg-card disabled:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
              readOnly={mode === "edit"}
              value={form.fqn}
              onBlur={() => {
                setFieldError("fqn", validateFormField(form, mode, "fqn"));
              }}
              onChange={(event) => {
                updateForm({ fqn: event.target.value });
                setFieldError("fqn", undefined);
              }}
            />
            <FieldError message={fieldErrors.fqn} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="account-type" label="Type">
              <Select
                value={form.accountType}
                onValueChange={(value) => {
                  updateForm({
                    accountType: value as WritableAccountType,
                  });
                  setFieldError("type", undefined);
                }}
              >
                <SelectTrigger id="account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned</SelectItem>
                  <SelectItem value="party">Party</SelectItem>
                  <SelectItem value="flow">Flow</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.type} />
            </Field>

            <Field htmlFor="account-currency-mode" label="Currency mode">
              <Select
                disabled={currencyControlsLocked || saving}
                value={form.currencyMode}
                onValueChange={(value) => {
                  updateForm({
                    currencyMode: value as AccountFormState["currencyMode"],
                  });
                  setFieldError("currency", undefined);
                }}
              >
                <SelectTrigger
                  id="account-currency-mode"
                  aria-describedby={
                    currencyControlsLocked ? currencyLockReasonId : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single-currency</SelectItem>
                  <SelectItem value="multi">Multi-currency</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {form.currencyMode === "single" ? (
            <Field htmlFor="account-currency" label="Currency">
              <input
                id="account-currency"
                list="account-currency-options"
                disabled={currencyControlsLocked || saving}
                aria-describedby={
                  currencyControlsLocked ? currencyLockReasonId : undefined
                }
                className="bg-card disabled:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] disabled:shadow-none"
                value={form.currency}
                onBlur={() => {
                  setFieldError(
                    "currency",
                    validateFormField(form, mode, "currency"),
                  );
                }}
                onChange={(event) => {
                  updateForm({ currency: event.target.value.toUpperCase() });
                  setFieldError("currency", undefined);
                }}
                onFocus={(event) => {
                  event.currentTarget.select();
                }}
                onMouseUp={(event) => {
                  event.preventDefault();
                }}
              />
              <FieldError message={fieldErrors.currency} />
            </Field>
          ) : (
            <>
              <p className="text-muted-foreground font-body text-sm">
                Records on this account may use any currency.
              </p>
              <FieldError message={fieldErrors.currency} />
            </>
          )}
          <datalist id="account-currency-options">
            {currencyOptions.map((currency) => (
              <option key={currency} value={currency} />
            ))}
          </datalist>
          {currencyControlsLocked ? (
            <p
              id={currencyLockReasonId}
              className="text-muted-foreground font-body text-sm"
            >
              Currency cannot be changed while credit-limit history exists.
              Delete all credit-limit history to unlock it.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex h-9 items-center gap-2 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]">
              <Checkbox
                checked={form.isHidden}
                aria-label="Hidden"
                onCheckedChange={(checked) => {
                  updateForm({ isHidden: checked === true });
                }}
              />
              Hidden
            </label>
            <label className="flex h-9 items-center gap-2 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]">
              <Checkbox
                checked={form.isFeatured}
                aria-label="Featured"
                onCheckedChange={(checked) => {
                  updateForm({ isFeatured: checked === true });
                }}
              />
              Featured
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field htmlFor="account-external-system" label="External system">
              <input
                id="account-external-system"
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                value={form.externalSystem}
                onChange={(event) => {
                  updateForm({ externalSystem: event.target.value });
                  setFieldError("externalSystem", undefined);
                }}
              />
              <FieldError message={fieldErrors.externalSystem} />
            </Field>
            <Field htmlFor="account-external-id" label="External ID">
              <input
                id="account-external-id"
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                value={form.externalId}
                onChange={(event) => {
                  updateForm({ externalId: event.target.value });
                  setFieldError("externalId", undefined);
                }}
              />
              <FieldError message={fieldErrors.externalId} />
            </Field>
          </div>

          {fieldErrors.general ? (
            <p
              role="alert"
              className="border-destructive text-destructive border-2 p-2 text-sm"
            >
              {fieldErrors.general}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t-2 border-[var(--border-ink)] pt-4">
            {mode === "edit" && account ? (
              <Tooltip
                label={
                  account.deletable !== true
                    ? "Account has active dependent records."
                    : "Delete account"
                }
                asChild
              >
                <Button
                  ref={accountDeleteButtonRef}
                  type="button"
                  variant="destructive"
                  aria-disabled={
                    account.deletable !== true ? "true" : undefined
                  }
                  onClick={() => {
                    if (account.deletable !== true) {
                      return;
                    }
                    setAccountDeleteOpen(true);
                  }}
                >
                  <Trash aria-hidden="true" />
                  Delete
                </Button>
              </Tooltip>
            ) : null}
            <Button type="submit" disabled={saving || addingCreditLimit}>
              <Check aria-hidden="true" />
              {saving ? "Saving" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </form>

        {showCreditLimits ? (
          <section
            className="mt-5 border-t-2 border-[var(--border-ink)] pt-5"
            aria-labelledby="credit-limit-history-title"
          >
            <h3
              id="credit-limit-history-title"
              className="font-heading text-sm font-semibold uppercase"
            >
              Credit-limit history
            </h3>
            {canAddCreditLimits &&
            hasLoadedEmptyCreditLimitHistory &&
            !creditLimitEditorRevealed ? (
              <>
                <Button
                  ref={creditLimitRevealButtonRef}
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setCreditLimitEditorRevealed(true);
                  }}
                >
                  <Plus aria-hidden="true" />
                  Add credit limit
                </Button>
              </>
            ) : historyLoading || historyError || !canAddCreditLimits ? (
              <div className="mt-4">{creditLimitHistoryList}</div>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field htmlFor="credit-limit-amount" label="Amount">
                    <input
                      ref={creditLimitAmountInputRef}
                      id="credit-limit-amount"
                      inputMode="decimal"
                      className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                      placeholder="20000.00"
                      value={creditDraft.amount}
                      onBlur={() => {
                        setFieldError(
                          "creditLimit",
                          validateCreditLimitField(creditDraft, "creditLimit"),
                        );
                      }}
                      onChange={(event) => {
                        setCreditDraft((current) => ({
                          ...current,
                          amount: event.target.value,
                        }));
                        setFieldError("creditLimit", undefined);
                      }}
                    />
                    <FieldError message={fieldErrors.creditLimit} />
                  </Field>
                  <Field htmlFor="credit-limit-date" label="Effective">
                    <input
                      id="credit-limit-date"
                      type="date"
                      className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                      value={creditDraft.effectiveDate}
                      onBlur={() => {
                        setFieldError(
                          "effectiveDate",
                          validateCreditLimitField(
                            creditDraft,
                            "effectiveDate",
                          ),
                        );
                      }}
                      onChange={(event) => {
                        setCreditDraft((current) => ({
                          ...current,
                          effectiveDate: event.target.value,
                        }));
                        setFieldError("effectiveDate", undefined);
                      }}
                    />
                    <FieldError message={fieldErrors.effectiveDate} />
                  </Field>
                  <Button
                    ref={creditLimitAddButtonRef}
                    type="button"
                    className="self-start sm:justify-self-start"
                    disabled={addingCreditLimit || saving}
                    onClick={() => {
                      void addCreditLimit();
                    }}
                  >
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                </div>

                <div className="mt-4">{creditLimitHistoryList}</div>
              </>
            )}
          </section>
        ) : null}
      </div>

      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete credit limit"
        errorMessage={undefined}
        open={creditLimitDeleteEntry !== undefined}
        pending={
          deletingCreditLimitId ===
          creditLimitDeleteEntry?.credit_limit_history_id
        }
        pendingLabel="Deleting"
        title="Delete credit limit"
        onConfirm={() => {
          if (creditLimitDeleteEntry) {
            void deleteCreditLimit(creditLimitDeleteEntry);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeCreditLimitDelete();
          }
        }}
      >
        {creditLimitDeleteEntry ? (
          <>
            <p>
              Delete credit limit{" "}
              {accountCurrency ? (
                <AmountText
                  amount={{
                    amount: creditLimitDeleteEntry.credit_limit,
                    currency: accountCurrency,
                  }}
                  positiveSign={false}
                  tone="neutral"
                />
              ) : (
                <span className="font-mono tabular-nums">
                  {creditLimitDeleteEntry.credit_limit}
                </span>
              )}
              {" from "}
              {creditLimitDeleteEntry.effective_date}?
            </p>
            <p>This tombstones the credit-limit history entry.</p>
          </>
        ) : null}
      </ConfirmationDialog>

      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete account"
        errorMessage={undefined}
        open={accountDeleteOpen && account !== undefined}
        pending={deletingAccount}
        pendingLabel="Deleting"
        title="Delete account"
        onConfirm={() => {
          void deleteAccount();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeAccountDelete();
          }
        }}
      >
        {account ? (
          <ReferenceEntityDeleteDescription name={account.fqn} noun="account" />
        ) : null}
      </ConfirmationDialog>
    </aside>
  );
};

export const AccountsSidePanel = (props: AccountsSidePanelProps) => {
  if (!props.open) {
    return null;
  }

  return (
    <AccountsSidePanelContent
      key={`${props.mode}:${props.account?.account_id ?? "new"}`}
      account={props.account}
      currencies={props.currencies}
      mode={props.mode}
      onClose={props.onClose}
      onNotice={props.onNotice}
    />
  );
};
