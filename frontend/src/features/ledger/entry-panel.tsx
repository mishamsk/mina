import { Check, Close } from "pixelarticons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type Account,
  type Category,
  createIncome,
  type CreateIncomeTransactionRequest,
  createRefund,
  type CreateRefundTransactionRequest,
  createSpend,
  type CreateSpendTransactionRequest,
  createTransfer,
  type CreateTransferTransactionRequest,
  isNetworkFailure,
  type Member,
  type Tag,
  type Transaction,
} from "@/api";
import { Button } from "@/components/ui/button";
import type {
  TransactionEntryDraft,
  TransactionEntryTabDraft,
  TransactionEntryType,
} from "@/models/ui-state";
import {
  readTransactionEntryDraft,
  writeTransactionEntryDraft,
} from "@/services/indexeddb";
import type { LedgerLookupsSnapshot } from "@/store";
import { localTodayISODate } from "@/utils/date";

import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
} from "./entity-picker";
import { useCategoryPickerCategoriesResource } from "./use-transactions-resource";

interface EntryPanelProps {
  readonly initialTab?: TransactionEntryType;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onClose: () => void;
  readonly onSaved: (transaction: Transaction) => Promise<void>;
  readonly open: boolean;
}

type FieldName =
  | "amount"
  | "categoryId"
  | "currency"
  | "date"
  | "destinationAccountId"
  | "fundingAccountId"
  | "memberId"
  | "merchantAccountId"
  | "memo"
  | "sourceAccountId"
  | "tagIds";

type FieldErrors = Partial<Record<FieldName, string>>;

interface TabConfig {
  readonly categoryIntents: readonly Category["economic_intent"][];
  readonly counterpartyLabel: string;
  readonly primaryAccountField: FieldName;
  readonly primaryAccountLabel: string;
  readonly primaryAccountOptionSet: "balanceAccounts";
  readonly secondaryAccountField: FieldName;
  readonly secondaryAccountLabel: string;
  readonly secondaryAccountOptionSet: "balanceAccounts" | "flowAccounts";
  readonly title: string;
}

const entryTypes: readonly TransactionEntryType[] = [
  "spend",
  "income",
  "refund",
  "transfer",
];

const tabLabels: Record<TransactionEntryType, string> = {
  income: "Income",
  refund: "Refund",
  spend: "Spend",
  transfer: "Transfer",
};

const tabConfigs: Record<TransactionEntryType, TabConfig> = {
  income: {
    categoryIntents: ["income"],
    counterpartyLabel: "source",
    primaryAccountField: "destinationAccountId",
    primaryAccountLabel: "Destination account",
    primaryAccountOptionSet: "balanceAccounts",
    secondaryAccountField: "sourceAccountId",
    secondaryAccountLabel: "Source",
    secondaryAccountOptionSet: "flowAccounts",
    title: "New income",
  },
  refund: {
    categoryIntents: ["refund"],
    counterpartyLabel: "merchant",
    primaryAccountField: "destinationAccountId",
    primaryAccountLabel: "Destination account",
    primaryAccountOptionSet: "balanceAccounts",
    secondaryAccountField: "merchantAccountId",
    secondaryAccountLabel: "Merchant",
    secondaryAccountOptionSet: "flowAccounts",
    title: "New refund",
  },
  spend: {
    categoryIntents: ["expense", "fee"],
    counterpartyLabel: "merchant",
    primaryAccountField: "fundingAccountId",
    primaryAccountLabel: "Funding account",
    primaryAccountOptionSet: "balanceAccounts",
    secondaryAccountField: "merchantAccountId",
    secondaryAccountLabel: "Merchant",
    secondaryAccountOptionSet: "flowAccounts",
    title: "New spend",
  },
  transfer: {
    categoryIntents: ["transfer"],
    counterpartyLabel: "destination",
    primaryAccountField: "sourceAccountId",
    primaryAccountLabel: "From account",
    primaryAccountOptionSet: "balanceAccounts",
    secondaryAccountField: "destinationAccountId",
    secondaryAccountLabel: "To account",
    secondaryAccountOptionSet: "balanceAccounts",
    title: "New transfer",
  },
};

const blankTabDraft = (): TransactionEntryTabDraft => ({
  amount: "",
  categoryId: undefined,
  currency: "USD",
  date: localTodayISODate(),
  destinationAccountId: undefined,
  fundingAccountId: undefined,
  memberId: undefined,
  merchantAccountId: undefined,
  memo: "",
  sourceAccountId: undefined,
  tagIds: [],
});

const defaultDraft = (): TransactionEntryDraft => ({
  activeTab: "spend",
  tabs: {
    income: blankTabDraft(),
    refund: blankTabDraft(),
    spend: blankTabDraft(),
    transfer: blankTabDraft(),
  },
});

const migrateStoredDraft = (
  storedDraft: TransactionEntryDraft | TransactionEntryTabDraft | undefined,
): TransactionEntryDraft => {
  const nextDraft = defaultDraft();
  if (!storedDraft) {
    return nextDraft;
  }

  if ("tabs" in storedDraft && "activeTab" in storedDraft) {
    return {
      activeTab: entryTypes.includes(storedDraft.activeTab)
        ? storedDraft.activeTab
        : "spend",
      tabs: {
        income: { ...blankTabDraft(), ...storedDraft.tabs.income },
        refund: { ...blankTabDraft(), ...storedDraft.tabs.refund },
        spend: { ...blankTabDraft(), ...storedDraft.tabs.spend },
        transfer: { ...blankTabDraft(), ...storedDraft.tabs.transfer },
      },
    };
  }

  return {
    ...nextDraft,
    tabs: {
      ...nextDraft.tabs,
      spend: { ...blankTabDraft(), ...storedDraft },
    },
  };
};

const entityOption = (
  entity: Account | Category | Tag,
  id: number,
): EntityOption => ({
  detail: entity.fqn,
  id,
  label: entity.name,
  searchLabel: entity.fqn,
});

const memberOption = (member: Member): EntityOption => ({
  id: member.member_id,
  label: member.name,
  searchLabel: member.name,
});

const normalizeAmount = (amount: string): string | undefined => {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) {
    return undefined;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const mantissa = BigInt(`${whole}${fraction.padEnd(8, "0").slice(0, 8)}`);
  if (mantissa <= 0n) {
    return undefined;
  }
  return `${whole}.${fraction.padEnd(8, "0").slice(0, 8)}`;
};

const normalizeCurrency = (currency: string): string =>
  currency.trim().toUpperCase();

const validCurrencyPattern = /^([A-Z]{3}|C::.+)$/;

const apiErrorMessage = (error: unknown): string => {
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
  return "Transaction could not be saved.";
};

const fieldErrorsFromAPI = (message: string): FieldErrors => {
  const pairs: readonly [FieldName, readonly string[]][] = [
    ["amount", ["amount"]],
    ["categoryId", ["category_id", "category"]],
    ["currency", ["currency"]],
    ["date", ["initiated_date", "date"]],
    ["destinationAccountId", ["destination_account_id", "destination"]],
    ["fundingAccountId", ["funding_account_id", "funding"]],
    ["memberId", ["member_id", "member"]],
    ["merchantAccountId", ["counterparty_account_id", "counterparty"]],
    ["memo", ["memo"]],
    ["sourceAccountId", ["source_account_id", "source"]],
    ["tagIds", ["tag_ids", "tag"]],
  ];
  const lower = message.toLowerCase();
  for (const [field, matches] of pairs) {
    if (matches.some((match) => lower.includes(match))) {
      return { [field]: message };
    }
  }
  return {};
};

const fieldLabel = (
  field: FieldName,
  entryType: TransactionEntryType,
): string => {
  const config = tabConfigs[entryType];
  if (field === config.primaryAccountField) {
    return config.primaryAccountLabel;
  }
  if (field === config.secondaryAccountField) {
    return config.secondaryAccountLabel;
  }
  return "Field";
};

const validateDraft = (
  draft: TransactionEntryTabDraft,
  entryType: TransactionEntryType,
): FieldErrors => {
  const config = tabConfigs[entryType];
  const errors: FieldErrors = {};
  if (!draft.date) {
    errors.date = "Date is required.";
  }
  if (!normalizeAmount(draft.amount)) {
    errors.amount = "Enter a positive amount with up to 8 decimals.";
  }
  const currency = normalizeCurrency(draft.currency);
  if (!currency) {
    errors.currency = "Currency is required.";
  } else if (!validCurrencyPattern.test(currency)) {
    errors.currency = "Use a 3-letter code or C:: crypto code.";
  }
  if (!draft[config.primaryAccountField]) {
    errors[config.primaryAccountField] =
      `${fieldLabel(config.primaryAccountField, entryType)} is required.`;
  }
  if (!draft[config.secondaryAccountField]) {
    errors[config.secondaryAccountField] =
      `${fieldLabel(config.secondaryAccountField, entryType)} is required.`;
  }
  if (!draft.categoryId) {
    errors.categoryId = "Category is required.";
  }
  if (
    entryType === "transfer" &&
    draft.sourceAccountId &&
    draft.destinationAccountId &&
    draft.sourceAccountId === draft.destinationAccountId
  ) {
    errors.destinationAccountId = "Choose a different destination account.";
  }
  return errors;
};

const fieldErrorForDraft = (
  draft: TransactionEntryTabDraft,
  entryType: TransactionEntryType,
  field: FieldName,
): string | undefined => validateDraft(draft, entryType)[field];

const hasErrors = (errors: FieldErrors): boolean =>
  Object.values(errors).some(Boolean);

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? <p className="text-destructive text-xs">{message}</p> : null;

const RetryableFieldError = ({
  message,
  onRetry,
}: {
  readonly message: string | undefined;
  readonly onRetry: () => void;
}) =>
  message ? (
    <div className="flex items-center gap-2">
      <p className="text-destructive text-xs">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  ) : null;

const accountCurrency = (
  lookups: LedgerLookupsSnapshot | undefined,
  accountId: number | undefined,
): string | undefined =>
  lookups?.accounts.find((account) => account.account_id === accountId)
    ?.currency ?? undefined;

const stickyNextTabDraft = (
  entryType: TransactionEntryType,
  draft: TransactionEntryTabDraft,
  requestCurrency: string,
): TransactionEntryTabDraft => {
  const nextDraft = {
    ...blankTabDraft(),
    currency: requestCurrency,
    date: draft.date,
  };

  switch (entryType) {
    case "income":
      return {
        ...nextDraft,
        destinationAccountId: draft.destinationAccountId,
        sourceAccountId: draft.sourceAccountId,
      };
    case "refund":
      return {
        ...nextDraft,
        destinationAccountId: draft.destinationAccountId,
        merchantAccountId: draft.merchantAccountId,
      };
    case "spend":
      return {
        ...nextDraft,
        fundingAccountId: draft.fundingAccountId,
        merchantAccountId: draft.merchantAccountId,
      };
    case "transfer":
      return {
        ...nextDraft,
        destinationAccountId: draft.destinationAccountId,
        sourceAccountId: draft.sourceAccountId,
      };
  }
};

const accountValue = (
  draft: TransactionEntryTabDraft,
  field: FieldName,
): number | undefined => {
  const value = draft[field];
  return typeof value === "number" ? value : undefined;
};

const lookupCurrencies = (
  lookups: LedgerLookupsSnapshot | undefined,
): readonly string[] => {
  const currencies = new Set<string>(["USD"]);
  for (const account of lookups?.accounts ?? []) {
    if (account.currency) {
      currencies.add(account.currency.toUpperCase());
    }
  }
  return [...currencies].sort((left, right) => left.localeCompare(right));
};

const visibleAccount = (account: Account): boolean =>
  !account.is_hidden && !account.tombstoned_at;

const visibleMember = (member: Member): boolean => !member.tombstoned_at;

const visibleTag = (tag: Tag): boolean => !tag.is_hidden && !tag.tombstoned_at;

export const EntryPanel = ({
  initialTab,
  lookups,
  onClose,
  onSaved,
  open,
}: EntryPanelProps) => {
  const [draft, setDraft] = useState<TransactionEntryDraft>(defaultDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [categoryRetryToken, setCategoryRetryToken] = useState(0);
  const [entryPanelMaxHeight, setEntryPanelMaxHeight] = useState<
    number | undefined
  >();
  const entryPanelRef = useRef<HTMLElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const rememberedActiveTabRef = useRef<TransactionEntryType>("spend");
  const initialTabOverrideRef = useRef<TransactionEntryType | undefined>(
    undefined,
  );
  const userSelectedActiveTabRef = useRef(false);

  const draftForStorage = useCallback(
    (nextDraft: TransactionEntryDraft): TransactionEntryDraft => {
      if (initialTabOverrideRef.current && !userSelectedActiveTabRef.current) {
        return {
          ...nextDraft,
          activeTab: rememberedActiveTabRef.current,
        };
      }
      return nextDraft;
    },
    [],
  );

  const activeTab = draft.activeTab;
  const activeTabDraft = draft.tabs[activeTab];
  const activeConfig = tabConfigs[activeTab];
  const categoryPicker = useCategoryPickerCategoriesResource(
    activeConfig.categoryIntents,
    open && draftReady,
    categoryRetryToken,
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    void readTransactionEntryDraft().then((storedDraft) => {
      if (active) {
        const migratedDraft = migrateStoredDraft(storedDraft);
        rememberedActiveTabRef.current = migratedDraft.activeTab;
        initialTabOverrideRef.current = initialTab;
        userSelectedActiveTabRef.current = false;
        setDraft(
          initialTab
            ? {
                ...migratedDraft,
                activeTab: initialTab,
              }
            : migratedDraft,
        );
        setDraftReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, [initialTab, open]);

  useEffect(() => {
    if (!open || !draftReady) {
      return;
    }

    void writeTransactionEntryDraft(draftForStorage(draft));
  }, [draft, draftForStorage, draftReady, open]);

  useEffect(() => {
    if (!open || !draftReady) {
      return;
    }

    window.requestAnimationFrame(() => {
      dateInputRef.current?.focus({ preventScroll: true });
    });
  }, [activeTab, draftReady, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updateEntryPanelMaxHeight = () => {
      const top = entryPanelRef.current?.getBoundingClientRect().top;
      if (top === undefined) {
        return;
      }
      const bottomGutter = 32;
      setEntryPanelMaxHeight(
        Math.max(320, window.innerHeight - top - bottomGutter),
      );
    };

    updateEntryPanelMaxHeight();
    window.addEventListener("resize", updateEntryPanelMaxHeight);
    return () => {
      window.removeEventListener("resize", updateEntryPanelMaxHeight);
    };
  }, [open]);

  const options = useMemo(() => {
    const accounts = (lookups?.accounts ?? []).filter(visibleAccount);
    const categories = categoryPicker.snapshot?.categories ?? [];
    const members = (lookups?.members ?? []).filter(visibleMember);
    const tags = (lookups?.tags ?? []).filter(visibleTag);
    return {
      balanceAccounts: accounts
        .filter((account) => account.account_type === "balance")
        .map((account) => entityOption(account, account.account_id)),
      categories: categories.map((category) =>
        entityOption(category, category.category_id),
      ),
      flowAccounts: accounts
        .filter((account) => account.account_type === "flow")
        .map((account) => entityOption(account, account.account_id)),
      currencies: lookupCurrencies(lookups),
      members: members.map(memberOption),
      tags: tags.map((tag) => entityOption(tag, tag.tag_id)),
    };
  }, [categoryPicker.snapshot, lookups]);
  const categoryPickerReady = Boolean(categoryPicker.snapshot);
  const lookupRevision = lookups?.loadedAt ?? "loading";
  const categoryLookupRevision =
    categoryPicker.snapshot?.loadedAt ?? "categories-loading";
  const ready = Boolean(lookups && draftReady);
  const canSubmit = Boolean(
    lookups && draftReady && categoryPickerReady && !saving,
  );
  const loadingMessage = "Loading lookups...";

  const updateActiveTabDraft = useCallback(
    (patch: Partial<TransactionEntryTabDraft>) => {
      const nextTabDraft = { ...activeTabDraft, ...patch };
      setDraft((currentDraft) => ({
        ...currentDraft,
        tabs: {
          ...currentDraft.tabs,
          [activeTab]: nextTabDraft,
        },
      }));
      setFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        for (const field of Object.keys(patch) as FieldName[]) {
          const message = fieldErrorForDraft(nextTabDraft, activeTab, field);
          if (message) {
            nextErrors[field] = message;
          } else {
            delete nextErrors[field];
          }
        }
        return nextErrors;
      });
      setGeneralError(undefined);
    },
    [activeTab, activeTabDraft],
  );

  const updateActiveTab = (entryType: TransactionEntryType) => {
    userSelectedActiveTabRef.current = true;
    rememberedActiveTabRef.current = entryType;
    setDraft((currentDraft) => ({ ...currentDraft, activeTab: entryType }));
    setFieldErrors({});
    setGeneralError(undefined);
  };

  const retryCategoryPicker = () => {
    setCategoryRetryToken((currentToken) => currentToken + 1);
  };

  const validateField = useCallback(
    (field: FieldName) => {
      setFieldErrors((currentErrors) => {
        const message = fieldErrorForDraft(activeTabDraft, activeTab, field);
        if (message) {
          return { ...currentErrors, [field]: message };
        }
        const nextErrors = { ...currentErrors };
        delete nextErrors[field];
        return nextErrors;
      });
    },
    [activeTab, activeTabDraft],
  );

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    const nextFieldErrors = validateDraft(activeTabDraft, activeTab);
    setFieldErrors(nextFieldErrors);
    setGeneralError(undefined);
    if (hasErrors(nextFieldErrors)) {
      return;
    }

    const amount = normalizeAmount(activeTabDraft.amount);
    const currency = normalizeCurrency(activeTabDraft.currency);
    if (!amount || !currency || !activeTabDraft.categoryId) {
      return;
    }

    const common = {
      amount,
      category_id: activeTabDraft.categoryId,
      currency,
      initiated_date: activeTabDraft.date,
      member_id: activeTabDraft.memberId ?? null,
      memo: activeTabDraft.memo.trim() ? activeTabDraft.memo.trim() : null,
      posting_status: "posted" as const,
      reconciliation_status: "unreconciled" as const,
      tag_ids: [...activeTabDraft.tagIds],
    };

    setSaving(true);
    const result =
      activeTab === "spend"
        ? await createSpend({
            ...common,
            counterparty_account_id: activeTabDraft.merchantAccountId ?? -1,
            funding_account_id: activeTabDraft.fundingAccountId ?? -1,
          } satisfies CreateSpendTransactionRequest)
        : activeTab === "income"
          ? await createIncome({
              ...common,
              destination_account_id: activeTabDraft.destinationAccountId ?? -1,
              source_account_id: activeTabDraft.sourceAccountId ?? -1,
            } satisfies CreateIncomeTransactionRequest)
          : activeTab === "refund"
            ? await createRefund({
                ...common,
                counterparty_account_id: activeTabDraft.merchantAccountId ?? -1,
                destination_account_id:
                  activeTabDraft.destinationAccountId ?? -1,
              } satisfies CreateRefundTransactionRequest)
            : await createTransfer({
                ...common,
                destination_account_id:
                  activeTabDraft.destinationAccountId ?? -1,
                source_account_id: activeTabDraft.sourceAccountId ?? -1,
              } satisfies CreateTransferTransactionRequest);
    setSaving(false);

    if (result.data) {
      await onSaved(result.data);
      const nextTabDraft = stickyNextTabDraft(
        activeTab,
        activeTabDraft,
        currency,
      );
      const nextDraft = {
        ...draft,
        tabs: {
          ...draft.tabs,
          [activeTab]: nextTabDraft,
        },
      };
      setDraft(nextDraft);
      setFieldErrors({});
      setGeneralError(undefined);
      setSessionCount((count) => count + 1);
      await writeTransactionEntryDraft(draftForStorage(nextDraft));
      return;
    }

    const message = apiErrorMessage(result.error);
    const apiFieldErrors = fieldErrorsFromAPI(message);
    setFieldErrors(apiFieldErrors);
    setGeneralError(hasErrors(apiFieldErrors) ? undefined : message);
  }, [activeTab, activeTabDraft, canSubmit, draft, draftForStorage, onSaved]);

  const primaryAccountValue = accountValue(
    activeTabDraft,
    activeConfig.primaryAccountField,
  );
  const secondaryAccountValue = accountValue(
    activeTabDraft,
    activeConfig.secondaryAccountField,
  );

  if (!open) {
    return null;
  }

  return (
    <aside
      ref={entryPanelRef}
      className="bg-card flex min-w-0 flex-col self-start overflow-hidden border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)] lg:sticky lg:top-7"
      style={
        entryPanelMaxHeight === undefined
          ? undefined
          : { maxHeight: `${entryPanelMaxHeight}px` }
      }
      aria-labelledby="entry-panel-title"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] p-4">
        <div>
          <p className="text-muted-foreground font-heading text-xs font-semibold uppercase">
            {tabLabels[activeTab]} entry
          </p>
          <h2 id="entry-panel-title" className="text-pixel text-base">
            {activeConfig.title}
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Close entry panel"
          onClick={onClose}
        >
          <Close aria-hidden="true" />
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Transaction type"
        className="grid grid-cols-4 border-b-2 border-[var(--border-ink)]"
      >
        {entryTypes.map((entryType) => (
          <button
            key={entryType}
            id={`${entryType}-entry-tab`}
            type="button"
            role="tab"
            aria-controls={`${entryType}-entry-panel`}
            aria-selected={activeTab === entryType}
            className={`font-heading h-9 border-r border-[var(--border-ink)] text-xs font-semibold uppercase last:border-r-0 ${
              activeTab === entryType
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground hover:bg-[var(--color-interactive-bright)]"
            }`}
            onClick={() => {
              updateActiveTab(entryType);
            }}
          >
            {tabLabels[entryType]}
          </button>
        ))}
      </div>

      {!ready ? (
        <div className="flex flex-1 items-start p-4">
          <p className="text-muted-foreground text-sm">{loadingMessage}</p>
        </div>
      ) : null}

      <form
        id={`${activeTab}-entry-panel`}
        role="tabpanel"
        aria-labelledby={`${activeTab}-entry-tab`}
        className={`flex min-h-0 flex-1 flex-col ${ready ? "" : "hidden"}`}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          <div className="grid grid-cols-[1fr_130px] gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${activeTab}-date`}
                className="text-sm font-semibold"
              >
                Date
              </label>
              <input
                id={`${activeTab}-date`}
                ref={dateInputRef}
                type="date"
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
                value={activeTabDraft.date}
                onBlur={() => {
                  validateField("date");
                }}
                onChange={(event) => {
                  updateActiveTabDraft({ date: event.target.value });
                }}
              />
              <FieldError message={fieldErrors.date} />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${activeTab}-currency`}
                className="text-sm font-semibold"
              >
                Currency
              </label>
              <input
                id={`${activeTab}-currency`}
                list="entry-currency-options"
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                value={activeTabDraft.currency}
                onBlur={() => {
                  validateField("currency");
                }}
                onChange={(event) => {
                  updateActiveTabDraft({
                    currency: event.target.value.toUpperCase(),
                  });
                }}
              />
              <datalist id="entry-currency-options">
                {options.currencies.map((currency) => (
                  <option key={currency} value={currency} />
                ))}
              </datalist>
              <FieldError message={fieldErrors.currency} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${activeTab}-amount`}
              className="text-sm font-semibold"
            >
              Amount
            </label>
            <input
              id={`${activeTab}-amount`}
              inputMode="decimal"
              className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
              placeholder="12.34"
              value={activeTabDraft.amount}
              onBlur={() => {
                validateField("amount");
              }}
              onChange={(event) => {
                updateActiveTabDraft({ amount: event.target.value });
              }}
            />
            <FieldError message={fieldErrors.amount} />
          </div>

          <EntityPicker
            key={`${lookupRevision}:${activeTab}:${activeConfig.primaryAccountField}:${primaryAccountValue ?? ""}`}
            id={`${activeTab}-${activeConfig.primaryAccountField}`}
            label={activeConfig.primaryAccountLabel}
            options={options[activeConfig.primaryAccountOptionSet]}
            value={primaryAccountValue}
            onChange={(accountId) => {
              updateActiveTabDraft({
                [activeConfig.primaryAccountField]: accountId,
                currency:
                  accountCurrency(lookups, accountId) ??
                  activeTabDraft.currency,
              });
            }}
          />
          <FieldError message={fieldErrors[activeConfig.primaryAccountField]} />

          <EntityPicker
            key={`${lookupRevision}:${activeTab}:${activeConfig.secondaryAccountField}:${secondaryAccountValue ?? ""}`}
            id={`${activeTab}-${activeConfig.secondaryAccountField}`}
            label={activeConfig.secondaryAccountLabel}
            options={options[activeConfig.secondaryAccountOptionSet]}
            value={secondaryAccountValue}
            onChange={(accountId) => {
              updateActiveTabDraft({
                [activeConfig.secondaryAccountField]: accountId,
              });
            }}
          />
          <FieldError
            message={fieldErrors[activeConfig.secondaryAccountField]}
          />

          <EntityPicker
            key={`${categoryLookupRevision}:${activeTab}:category:${activeTabDraft.categoryId ?? ""}`}
            disabled={!categoryPickerReady}
            id={`${activeTab}-category`}
            label="Category"
            options={options.categories}
            placeholder={categoryPickerReady ? "Search" : "Loading categories"}
            value={activeTabDraft.categoryId}
            onChange={(categoryId) => {
              updateActiveTabDraft({ categoryId });
            }}
          />
          <FieldError message={fieldErrors.categoryId} />
          <RetryableFieldError
            message={categoryPicker.errorMessage}
            onRetry={retryCategoryPicker}
          />

          <EntityMultiPicker
            id={`${activeTab}-tags`}
            label="Tags"
            options={options.tags}
            value={activeTabDraft.tagIds}
            onChange={(tagIds) => {
              updateActiveTabDraft({ tagIds });
            }}
          />
          <FieldError message={fieldErrors.tagIds} />

          <EntityPicker
            key={`${lookupRevision}:${activeTab}:member:${activeTabDraft.memberId ?? ""}`}
            id={`${activeTab}-member`}
            label="Member"
            options={options.members}
            placeholder="Whole household"
            value={activeTabDraft.memberId}
            onChange={(memberId) => {
              updateActiveTabDraft({ memberId });
            }}
          />
          <FieldError message={fieldErrors.memberId} />

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${activeTab}-memo`}
              className="text-sm font-semibold"
            >
              Memo
            </label>
            <textarea
              id={`${activeTab}-memo`}
              className="bg-card min-h-20 border-2 border-[var(--border-ink)] px-2 py-2 text-sm shadow-[var(--shadow-pixel)]"
              value={activeTabDraft.memo}
              onChange={(event) => {
                updateActiveTabDraft({ memo: event.target.value });
              }}
            />
            <FieldError message={fieldErrors.memo} />
          </div>

          {activeTab === "transfer" ? (
            <p className="text-muted-foreground font-body text-xs">
              Transfer fee rows are not exposed by the shorthand endpoint yet.
            </p>
          ) : null}

          {generalError ? (
            <p className="border-destructive bg-card text-destructive border-2 p-2 text-sm">
              {generalError}
            </p>
          ) : null}
        </div>

        <div className="bg-card flex items-center justify-between gap-3 border-t-2 border-[var(--border-ink)] p-4">
          <div className="text-muted-foreground font-mono text-sm">
            Entries this session:{" "}
            <span
              key={sessionCount}
              className="text-foreground inline-block animate-[score-pop_150ms_steps(2)]"
            >
              {sessionCount}
            </span>
          </div>
          <Button type="submit" disabled={!canSubmit}>
            <Check aria-hidden="true" />
            {saving ? "Saving" : "Save and add another"}
          </Button>
        </div>
      </form>
    </aside>
  );
};
