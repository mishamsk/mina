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
  type AccountType,
  type CreateAccountRequest,
  createLedgerAccount,
  createLedgerCreditLimitHistory,
  type CreditLimitHistory,
  deleteLedgerAccountById,
  deleteLedgerCreditLimitHistoryById,
  fetchCreditLimitHistory,
  isNetworkFailure,
  type UpdateAccountRequest,
  updateLedgerAccount,
} from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { AmountText } from "@/features/ledger";

import { AccountTypeBadge } from "./account-type-badge";
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
  readonly accountType: AccountType;
  readonly currency: string;
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
const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const blankForm = (): AccountFormState => ({
  accountType: "balance",
  currency: "USD",
  externalId: "",
  externalSystem: "",
  fqn: "",
  isFeatured: false,
  isHidden: false,
});

const formFromAccount = (account: Account | undefined): AccountFormState =>
  account
    ? {
        accountType: account.account_type,
        currency: account.currency ?? "",
        externalId: account.external_id ?? "",
        externalSystem: account.external_system ?? "",
        fqn: account.fqn,
        isFeatured: account.is_featured,
        isHidden: account.is_hidden,
      }
    : blankForm();

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (isNetworkFailure(error)) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "message" in error.error &&
    typeof error.error.message === "string"
  ) {
    return error.error.message;
  }
  return fallback;
};

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
  if (currency && !validCurrencyPattern.test(currency)) {
    errors.currency = "Use a 3-letter code or C:: crypto code.";
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
  readonly currency: string;
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
            <AmountText
              amount={{
                amount: entry.credit_limit,
                currency,
              }}
              positiveSign={false}
              tone="neutral"
            />
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
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const creditLimitAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const creditLimitDeleteOpenerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const historyErrorRef = useRef<HTMLParagraphElement | null>(null);
  const [form, setForm] = useState<AccountFormState>(() =>
    mode === "create" ? blankForm() : formFromAccount(account),
  );
  const [fieldErrors, setFieldErrors] = useState<AccountFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<readonly CreditLimitHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(
    () => mode === "edit" && account?.account_type === "balance",
  );
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [creditDraft, setCreditDraft] = useState<CreditLimitDraft>({
    amount: "",
    effectiveDate: "",
  });
  const [addingCreditLimit, setAddingCreditLimit] = useState(false);
  const [deletingCreditLimitId, setDeletingCreditLimitId] = useState<
    number | undefined
  >();
  const [creditLimitDeleteEntry, setCreditLimitDeleteEntry] = useState<
    CreditLimitHistory | undefined
  >();
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    panelSessionActiveRef.current = true;
    return () => {
      panelSessionActiveRef.current = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!account || account.account_type !== "balance") {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(undefined);
    const result = await fetchCreditLimitHistory(account.account_id);
    setHistoryLoading(false);
    if (result.data) {
      setHistory(result.data.credit_limit_history);
      return;
    }
    setHistoryError(
      apiErrorMessage(
        result.error,
        "Credit-limit history could not be loaded.",
      ),
    );
  }, [account]);

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
      if (event.key === "Escape") {
        if (event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (creditLimitDeleteEntry) {
          closeCreditLimitDelete();
        } else if (accountDeleteOpen) {
          closeAccountDelete();
        } else {
          onClose();
        }
        return;
      }

      if (
        event.key !== "Tab" ||
        (!accountDeleteOpen && !creditLimitDeleteEntry)
      ) {
        return;
      }

      const trapRoot = dialogRef.current;
      if (!trapRoot) {
        return;
      }
      const focusable = Array.from(
        trapRoot.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        trapRoot.focus();
        return;
      }
      if (!trapRoot.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [
    accountDeleteOpen,
    closeAccountDelete,
    closeCreditLimitDelete,
    creditLimitDeleteEntry,
    onClose,
  ]);

  useEffect(() => {
    if (!accountDeleteOpen && !creditLimitDeleteEntry) {
      return;
    }
    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
  }, [accountDeleteOpen, creditLimitDeleteEntry]);

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
    if (saving) {
      return;
    }

    const nextErrors = validateForm(form, mode);
    replaceFieldErrors(accountFormErrorFields, nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }

    setSaving(true);
    const result =
      mode === "create"
        ? await createLedgerAccount({
            account_type: form.accountType,
            currency: normalizeCurrency(form.currency),
            external_id: normalizeNullableString(form.externalId),
            external_system: normalizeNullableString(form.externalSystem),
            fqn: form.fqn.trim(),
            is_featured: form.isFeatured,
            is_hidden: form.isHidden,
          } satisfies CreateAccountRequest)
        : account
          ? await updateLedgerAccount(account.account_id, {
              external_id: normalizeNullableString(form.externalId),
              external_system: normalizeNullableString(form.externalSystem),
              is_featured: form.isFeatured,
              is_hidden: form.isHidden,
            } satisfies UpdateAccountRequest)
          : undefined;
    if (!panelSessionActiveRef.current) {
      return;
    }
    if (!result) {
      setSaving(false);
      return;
    }

    if (result.data) {
      await refreshAccountsAfterMutation({ account: result.data });
      if (!panelSessionActiveRef.current) {
        return;
      }
      onNotice(mode === "create" ? "Account created." : "Account updated.");
      onClose();
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
    if (!account || addingCreditLimit) {
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
      setCreditDraft({ amount: "", effectiveDate: "" });
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
      await Promise.all([loadHistory(), refreshAccountsAfterMutation()]);
      if (!panelSessionActiveRef.current) {
        return;
      }
      onNotice("Credit limit deleted.");
      window.requestAnimationFrame(() => {
        creditLimitAddButtonRef.current?.focus({ preventScroll: true });
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
    mode === "edit" && account?.account_type === "balance";
  const creditLimitCurrency = account?.currency ?? form.currency;

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
        <Tooltip label="Close account panel" asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close account panel"
            onClick={onClose}
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
              {mode === "edit" ? (
                <div className="flex h-9 items-center">
                  <AccountTypeBadge accountType={form.accountType} />
                </div>
              ) : (
                <select
                  id="account-type"
                  className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                  value={form.accountType}
                  onChange={(event) => {
                    updateForm({
                      accountType: event.target.value as AccountType,
                    });
                    setFieldError("type", undefined);
                  }}
                >
                  <option value="balance">Balance</option>
                  <option value="flow">Flow</option>
                  <option value="system">System</option>
                </select>
              )}
              <FieldError message={fieldErrors.type} />
            </Field>

            <Field htmlFor="account-currency" label="Currency">
              <input
                id="account-currency"
                list="account-currency-options"
                className="bg-card disabled:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                readOnly={mode === "edit"}
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
              />
              <datalist id="account-currency-options">
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency} />
                ))}
              </datalist>
              <FieldError message={fieldErrors.currency} />
            </Field>
          </div>

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
              <Button
                ref={accountDeleteButtonRef}
                type="button"
                variant="destructive"
                onClick={() => {
                  setAccountDeleteOpen(true);
                }}
              >
                <Trash aria-hidden="true" />
                Delete
              </Button>
            ) : null}
            <Button type="submit" disabled={saving}>
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
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
              <Field htmlFor="credit-limit-amount" label="Amount">
                <input
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
                      validateCreditLimitField(creditDraft, "effectiveDate"),
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
                className="self-start sm:mt-6"
                disabled={addingCreditLimit}
                onClick={() => {
                  void addCreditLimit();
                }}
              >
                <Plus aria-hidden="true" />
                Add
              </Button>
            </div>

            <div className="mt-4">
              {historyLoading ? (
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
                  currency={creditLimitCurrency}
                  deletingId={deletingCreditLimitId}
                  history={history}
                  onDeleteClick={(entry, opener) => {
                    creditLimitDeleteOpenerRef.current = opener;
                    setCreditLimitDeleteEntry(entry);
                  }}
                />
              )}
            </div>
          </section>
        ) : null}
      </div>

      {creditLimitDeleteEntry ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-credit-limit-title"
            aria-describedby="delete-credit-limit-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-credit-limit-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete credit limit
            </h3>
            <div
              id="delete-credit-limit-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p>
                Delete credit limit{" "}
                <AmountText
                  amount={{
                    amount: creditLimitDeleteEntry.credit_limit,
                    currency: creditLimitCurrency,
                  }}
                  positiveSign={false}
                  tone="neutral"
                />
                {" from "}
                {creditLimitDeleteEntry.effective_date}?
              </p>
              <p>This tombstones the credit-limit history entry.</p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                ref={cancelDeleteButtonRef}
                type="button"
                variant="outline"
                disabled={
                  deletingCreditLimitId ===
                  creditLimitDeleteEntry.credit_limit_history_id
                }
                onClick={closeCreditLimitDelete}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  deletingCreditLimitId ===
                  creditLimitDeleteEntry.credit_limit_history_id
                }
                onClick={() => {
                  void deleteCreditLimit(creditLimitDeleteEntry);
                }}
              >
                <Trash aria-hidden="true" />
                {deletingCreditLimitId ===
                creditLimitDeleteEntry.credit_limit_history_id
                  ? "Deleting"
                  : "Delete credit limit"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {accountDeleteOpen && account ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-account-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete account
            </h3>
            <div
              id="delete-account-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-1">
                <span>Delete</span>
                <span className="text-foreground font-mono break-all">
                  {account.fqn}
                </span>
                <span>?</span>
              </p>
              <p>
                This tombstones the account and removes it from default account
                lists and pickers.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                ref={cancelDeleteButtonRef}
                type="button"
                variant="outline"
                disabled={deletingAccount}
                onClick={closeAccountDelete}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingAccount}
                onClick={() => {
                  void deleteAccount();
                }}
              >
                <Trash aria-hidden="true" />
                {deletingAccount ? "Deleting" : "Delete account"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
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
