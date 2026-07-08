import { Check, Close, Plus, Trash } from "pixelarticons/react";
import {
  type ReactNode,
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
  createJournalTransaction,
  createRefund,
  type CreateRefundTransactionRequest,
  createSpend,
  type CreateSpendTransactionRequest,
  type CreateTransactionRequest,
  createTransfer,
  type CreateTransferTransactionRequest,
  isNetworkFailure,
  type Member,
  type Tag,
  type Transaction,
} from "@/api";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import type {
  AdvancedTransactionEntryDraft,
  JournalRecordRowDraft,
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

import { AmountText } from "./amount-text";
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
type ShorthandTransactionEntryType = Exclude<TransactionEntryType, "advanced">;
type AdvancedRecordFieldName =
  | "accountId"
  | "amount"
  | "categoryId"
  | "currency"
  | "memberId"
  | "memo"
  | "pendingDateTime"
  | "postedDateTime"
  | "postingStatus"
  | "reconciliationStatus"
  | "tagIds";
type AdvancedFieldErrors = Record<string, string>;
type JournalRecordDraftPostingStatus = JournalRecordRowDraft["postingStatus"];

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
  "advanced",
];

const tabLabels: Record<TransactionEntryType, string> = {
  advanced: "Advanced",
  income: "Income",
  refund: "Refund",
  spend: "Spend",
  transfer: "Transfer",
};

const tabConfigs: Record<ShorthandTransactionEntryType, TabConfig> = {
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

let nextJournalRecordDraftId = 0;

const newJournalRecordDraftId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `journal-record-${Date.now()}-${nextJournalRecordDraftId++}`;

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

const blankRecordRowDraft = (): JournalRecordRowDraft => ({
  accountId: undefined,
  amount: "",
  categoryId: undefined,
  currency: "USD",
  draftId: newJournalRecordDraftId(),
  memberId: undefined,
  memo: "",
  pendingDateTime: "",
  postedDateTime: "",
  postingStatus: "posted",
  reconciliationStatus: "unreconciled",
  showDates: false,
  tagIds: [],
});

const blankAdvancedDraft = (): AdvancedTransactionEntryDraft => ({
  date: localTodayISODate(),
  records: [blankRecordRowDraft(), blankRecordRowDraft()],
});

const amountWithSign = (
  amount: string,
  sign: "negative" | "positive",
): string => {
  const trimmed = amount.trim();
  if (!trimmed) {
    return "";
  }
  const unsigned = trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
  return sign === "negative" ? `-${unsigned}` : unsigned;
};

const shorthandRecordDraft = (
  draft: TransactionEntryTabDraft,
  accountId: number | undefined,
  amountSign: "negative" | "positive",
): JournalRecordRowDraft => ({
  ...blankRecordRowDraft(),
  accountId,
  amount: amountWithSign(draft.amount, amountSign),
  categoryId: draft.categoryId,
  currency: normalizeCurrency(draft.currency) || "USD",
  memberId: draft.memberId,
  memo: draft.memo,
  postingStatus: "posted",
  reconciliationStatus: "unreconciled",
  tagIds: [...draft.tagIds],
});

const shorthandDraftToAdvanced = (
  entryType: ShorthandTransactionEntryType,
  draft: TransactionEntryTabDraft,
): AdvancedTransactionEntryDraft => {
  const records =
    entryType === "spend"
      ? [
          shorthandRecordDraft(draft, draft.fundingAccountId, "negative"),
          shorthandRecordDraft(draft, draft.merchantAccountId, "positive"),
        ]
      : entryType === "income"
        ? [
            shorthandRecordDraft(draft, draft.destinationAccountId, "positive"),
            shorthandRecordDraft(draft, draft.sourceAccountId, "negative"),
          ]
        : entryType === "refund"
          ? [
              shorthandRecordDraft(
                draft,
                draft.destinationAccountId,
                "positive",
              ),
              shorthandRecordDraft(draft, draft.merchantAccountId, "negative"),
            ]
          : [
              shorthandRecordDraft(draft, draft.sourceAccountId, "negative"),
              shorthandRecordDraft(
                draft,
                draft.destinationAccountId,
                "positive",
              ),
            ];

  return {
    date: draft.date || localTodayISODate(),
    records,
  };
};

const defaultDraft = (): TransactionEntryDraft => ({
  activeTab: "spend",
  advanced: blankAdvancedDraft(),
  tabs: {
    income: blankTabDraft(),
    refund: blankTabDraft(),
    spend: blankTabDraft(),
    transfer: blankTabDraft(),
  },
});

const migrateStoredRecordRowDraft = (
  storedRow: Partial<JournalRecordRowDraft> | undefined,
): JournalRecordRowDraft => ({
  ...blankRecordRowDraft(),
  ...storedRow,
  draftId:
    typeof storedRow?.draftId === "string" && storedRow.draftId
      ? storedRow.draftId
      : newJournalRecordDraftId(),
  postingStatus:
    storedRow?.postingStatus === "pending" ||
    storedRow?.postingStatus === "cancelled" ||
    storedRow?.postingStatus === "posted"
      ? storedRow.postingStatus
      : "posted",
  reconciliationStatus:
    storedRow?.reconciliationStatus === "reconciled"
      ? "reconciled"
      : "unreconciled",
  tagIds: Array.isArray(storedRow?.tagIds) ? storedRow.tagIds : [],
});

const migrateStoredAdvancedDraft = (
  storedAdvanced: Partial<AdvancedTransactionEntryDraft> | undefined,
): AdvancedTransactionEntryDraft => {
  const rows = Array.isArray(storedAdvanced?.records)
    ? storedAdvanced.records.map((row) =>
        migrateStoredRecordRowDraft(row as Partial<JournalRecordRowDraft>),
      )
    : [];
  return {
    ...blankAdvancedDraft(),
    ...storedAdvanced,
    records: rows.length > 0 ? rows : blankAdvancedDraft().records,
  };
};

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
      advanced: migrateStoredAdvancedDraft(
        "advanced" in storedDraft ? storedDraft.advanced : undefined,
      ),
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

const signedAmountPattern = /^-?\d+(\.\d{1,8})?$/;

const signedAmountMantissa = (amount: string): bigint | undefined => {
  const trimmed = amount.trim();
  if (!signedAmountPattern.test(trimmed)) {
    return undefined;
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const mantissa = BigInt(`${whole}${fraction.padEnd(8, "0").slice(0, 8)}`);
  if (mantissa === 0n) {
    return undefined;
  }
  return negative ? -mantissa : mantissa;
};

const normalizeSignedAmount = (amount: string): string | undefined => {
  const mantissa = signedAmountMantissa(amount);
  if (mantissa === undefined) {
    return undefined;
  }
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(8, "0").slice(0, 8)}`;
};

const formatMantissa = (mantissa: bigint): string => {
  const negative = mantissa < 0n;
  const absolute = negative ? -mantissa : mantissa;
  const whole = absolute / 100000000n;
  const fraction = (absolute % 100000000n).toString().padStart(8, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
};

const normalizeCurrency = (currency: string): string =>
  currency.trim().toUpperCase();

const validCurrencyPattern = /^([A-Z]{3}|C::.+)$/;
const categoryEconomicIntents = new Set<Category["economic_intent"]>([
  "adjustment",
  "exchange",
  "expense",
  "fee",
  "fx_gain_loss",
  "income",
  "refund",
  "transfer",
]);

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
  entryType: ShorthandTransactionEntryType,
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
  entryType: ShorthandTransactionEntryType,
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
  entryType: ShorthandTransactionEntryType,
  field: FieldName,
): string | undefined => validateDraft(draft, entryType)[field];

const hasErrors = (errors: FieldErrors): boolean =>
  Object.values(errors).some(Boolean);

const advancedErrorKey = (
  rowIndex: number,
  field: AdvancedRecordFieldName,
): string => `${rowIndex}:${field}`;

const advancedFieldError = (
  errors: AdvancedFieldErrors,
  rowIndex: number,
  field: AdvancedRecordFieldName,
): string | undefined => errors[advancedErrorKey(rowIndex, field)];

const validateAdvancedDraft = (
  draft: AdvancedTransactionEntryDraft,
): AdvancedFieldErrors => {
  const errors: AdvancedFieldErrors = {};
  if (!draft.date) {
    errors.date = "Date is required.";
  }
  draft.records.forEach((row, rowIndex) => {
    if (!row.accountId) {
      errors[advancedErrorKey(rowIndex, "accountId")] = "Account is required.";
    }
    if (!normalizeSignedAmount(row.amount)) {
      errors[advancedErrorKey(rowIndex, "amount")] =
        "Enter a signed non-zero amount with up to 8 decimals.";
    }
    const currency = normalizeCurrency(row.currency);
    if (!currency) {
      errors[advancedErrorKey(rowIndex, "currency")] = "Currency is required.";
    } else if (!validCurrencyPattern.test(currency)) {
      errors[advancedErrorKey(rowIndex, "currency")] =
        "Use a 3-letter code or C:: crypto code.";
    }
    if (!row.categoryId) {
      errors[advancedErrorKey(rowIndex, "categoryId")] =
        "Category is required.";
    }
  });
  if (draft.records.length < 2) {
    errors.records = "At least two records are required.";
  }
  return errors;
};

const hasAdvancedErrors = (errors: AdvancedFieldErrors): boolean =>
  Object.values(errors).some(Boolean);

interface CurrencyBalance {
  readonly balanced: boolean;
  readonly currency: string;
  readonly mantissa: bigint;
}

const advancedBalances = (
  draft: AdvancedTransactionEntryDraft,
): readonly CurrencyBalance[] => {
  const sums = new Map<string, bigint>();
  for (const row of draft.records) {
    const currency = normalizeCurrency(row.currency);
    const mantissa = signedAmountMantissa(row.amount);
    if (!currency || mantissa === undefined) {
      continue;
    }
    sums.set(currency, (sums.get(currency) ?? 0n) + mantissa);
  }
  return [...sums.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, mantissa]) => ({
      balanced: mantissa === 0n,
      currency,
      mantissa,
    }));
};

const allCurrenciesBalanced = (balances: readonly CurrencyBalance[]): boolean =>
  balances.length > 0 && balances.every((balance) => balance.balanced);

const dateTimeToISO = (dateTime: string): string | null => {
  if (!dateTime.trim()) {
    return null;
  }
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const semanticShapeIntentFromAPI = (
  message: string,
): Category["economic_intent"] | undefined => {
  const match = message.match(
    /transaction records violate ([a-z_]+) semantic shape/,
  );
  const intent = match?.[1] as Category["economic_intent"] | undefined;
  if (!intent || !categoryEconomicIntents.has(intent)) {
    return undefined;
  }
  return intent;
};

const advancedFieldErrorsFromAPI = (
  message: string,
  draft: AdvancedTransactionEntryDraft,
  lookups: LedgerLookupsSnapshot | undefined,
): AdvancedFieldErrors => {
  const lower = message.toLowerCase();
  const rowMatch =
    lower.match(/records?\[(\d+)\]/) ?? lower.match(/records?\s+#?(\d+)/);
  const rowIndex = rowMatch ? Number(rowMatch[1]) : undefined;
  const fieldMatches: readonly [AdvancedRecordFieldName, readonly string[]][] =
    [
      ["accountId", ["account_id", "account"]],
      ["amount", ["amount"]],
      ["categoryId", ["category_id", "category"]],
      ["currency", ["currency"]],
      ["memberId", ["member_id", "member"]],
      ["memo", ["memo"]],
      ["pendingDateTime", ["pending_date", "pending"]],
      ["postedDateTime", ["posted_date", "posted"]],
      ["postingStatus", ["posting_status", "status"]],
      ["reconciliationStatus", ["reconciliation_status", "reconciliation"]],
      ["tagIds", ["tag_ids", "tag"]],
    ];

  if (rowIndex === undefined || Number.isNaN(rowIndex)) {
    if (lower.includes("initiated_date") || lower.includes("initiated date")) {
      return { date: message };
    }
    const intent = semanticShapeIntentFromAPI(lower);
    if (!intent) {
      return {};
    }
    const categoryIntentById = new Map(
      (lookups?.categories ?? []).map((category) => [
        category.category_id,
        category.economic_intent,
      ]),
    );
    const errors: AdvancedFieldErrors = {};
    draft.records.forEach((row, index) => {
      if (row.categoryId && categoryIntentById.get(row.categoryId) === intent) {
        errors[advancedErrorKey(index, "categoryId")] = message;
      }
    });
    return errors;
  }

  for (const [field, matches] of fieldMatches) {
    if (matches.some((match) => lower.includes(match))) {
      return { [advancedErrorKey(rowIndex, field)]: message };
    }
  }
  return { [advancedErrorKey(rowIndex, "amount")]: message };
};

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? <p className="text-destructive text-xs">{message}</p> : null;

const AdvancedRecordField = (props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
}) => (
  <div
    data-field-label={props.label}
    className={`min-w-0 ${props.className ?? ""}`}
  >
    <div className="font-heading text-muted-foreground mb-1 text-[11px] font-semibold uppercase">
      {props.label}
    </div>
    {props.children}
  </div>
);

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

const BalanceMeter = ({
  balances,
}: {
  readonly balances: readonly CurrencyBalance[];
}) => (
  <div
    className="flex flex-col gap-2"
    aria-label="Advanced transaction balance"
  >
    <div className="flex flex-wrap gap-2">
      {balances.length > 0 ? (
        balances.map((balance) => (
          <div
            key={balance.currency}
            className={`min-w-28 flex-1 border-2 border-[var(--border-ink)] px-2 py-1 font-mono text-xs shadow-[var(--shadow-chip)] ${
              balance.balanced
                ? "text-[var(--color-money-in)]"
                : "text-[var(--color-class-adjustment-ink)]"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">{balance.currency}</span>
              <span aria-label={`${balance.currency} balance status`}>
                {balance.balanced ? "Balanced" : "Unbalanced"}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => (
                <span
                  key={index}
                  className={`h-2 border border-[var(--border-ink)] ${
                    balance.balanced
                      ? "bg-[var(--color-money-in)]"
                      : "bg-[var(--color-class-adjustment-bright)]"
                  }`}
                />
              ))}
            </div>
            <p className="text-foreground mt-1 text-right tabular-nums">
              <AmountText
                amount={{
                  amount: formatMantissa(balance.mantissa),
                  currency: balance.currency,
                }}
                tone="neutral"
              />
            </p>
          </div>
        ))
      ) : (
        <div className="text-muted-foreground border-2 border-[var(--border-ink)] px-2 py-2 font-mono text-xs shadow-[var(--shadow-chip)]">
          Add signed record amounts to balance currencies.
        </div>
      )}
    </div>
  </div>
);

const accountCurrency = (
  lookups: LedgerLookupsSnapshot | undefined,
  accountId: number | undefined,
): string | undefined =>
  lookups?.accounts.find((account) => account.account_id === accountId)
    ?.currency ?? undefined;

const stickyNextTabDraft = (
  entryType: ShorthandTransactionEntryType,
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

const stickyNextAdvancedDraft = (
  draft: AdvancedTransactionEntryDraft,
): AdvancedTransactionEntryDraft => ({
  date: draft.date,
  records:
    draft.records.length >= 2
      ? draft.records.map((row) => ({
          ...blankRecordRowDraft(),
          accountId: row.accountId,
          categoryId: row.categoryId,
          currency: normalizeCurrency(row.currency) || "USD",
          postingStatus: row.postingStatus,
          reconciliationStatus: "unreconciled",
        }))
      : blankAdvancedDraft().records,
});

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

const categoryIntentAccountTypes: Record<
  Category["economic_intent"],
  readonly Account["account_type"][]
> = {
  adjustment: ["balance", "flow", "system"],
  exchange: ["balance", "flow"],
  expense: ["balance", "flow"],
  fee: ["balance", "flow", "system"],
  fx_gain_loss: ["balance", "flow", "system"],
  income: ["balance", "flow"],
  refund: ["balance", "flow"],
  transfer: ["balance"],
};

const accountTypesForCategoryIntent = (
  intent: Category["economic_intent"],
): readonly Account["account_type"][] => categoryIntentAccountTypes[intent];

export const EntryPanel = ({
  initialTab,
  lookups,
  onClose,
  onSaved,
  open,
}: EntryPanelProps) => {
  const [draft, setDraft] = useState<TransactionEntryDraft>(defaultDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [advancedFieldErrors, setAdvancedFieldErrors] =
    useState<AdvancedFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [categoryRetryToken, setCategoryRetryToken] = useState(0);
  const [entryPanelMaxHeight, setEntryPanelMaxHeight] = useState<
    number | undefined
  >();
  const entryPanelRef = useRef<HTMLElement>(null);
  const addAdvancedRecordButtonRef = useRef<HTMLButtonElement>(null);
  const advancedRemoveButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
  const activeShorthandTab = activeTab === "advanced" ? undefined : activeTab;
  const activeTabDraft = activeShorthandTab
    ? draft.tabs[activeShorthandTab]
    : undefined;
  const activeConfig = activeShorthandTab
    ? tabConfigs[activeShorthandTab]
    : undefined;
  const categoryPicker = useCategoryPickerCategoriesResource(
    activeConfig?.categoryIntents ?? [],
    open && draftReady && activeTab !== "advanced",
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
    const allCategories = (lookups?.categories ?? []).filter(
      (category) => !category.is_hidden && !category.tombstoned_at,
    );
    const members = (lookups?.members ?? []).filter(visibleMember);
    const tags = (lookups?.tags ?? []).filter(visibleTag);
    return {
      balanceAccounts: accounts
        .filter((account) => account.account_type === "balance")
        .map((account) => entityOption(account, account.account_id)),
      allCategories: allCategories.map((category) =>
        entityOption(category, category.category_id),
      ),
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
  const categoryPickerReady =
    activeTab === "advanced" || Boolean(categoryPicker.snapshot);
  const lookupRevision = lookups?.loadedAt ?? "loading";
  const categoryLookupRevision =
    categoryPicker.snapshot?.loadedAt ?? "categories-loading";
  const ready = Boolean(lookups && draftReady);
  const canSubmit = Boolean(
    lookups && draftReady && categoryPickerReady && !saving,
  );
  const balances = advancedBalances(draft.advanced);
  const advancedCanSubmit =
    !hasAdvancedErrors(validateAdvancedDraft(draft.advanced)) &&
    allCurrenciesBalanced(balances);
  const submitDisabled =
    !canSubmit || (activeTab === "advanced" && !advancedCanSubmit);

  const advancedAccountOptions = (
    categoryId: number | undefined,
  ): readonly EntityOption[] => {
    const accounts = (lookups?.accounts ?? []).filter(visibleAccount);
    const category = (lookups?.categories ?? []).find(
      (lookupCategory) => lookupCategory.category_id === categoryId,
    );
    if (!category) {
      return accounts.map((account) =>
        entityOption(account, account.account_id),
      );
    }
    const validTypes = accountTypesForCategoryIntent(category.economic_intent);
    return accounts
      .filter((account) => validTypes.includes(account.account_type))
      .map((account) => entityOption(account, account.account_id));
  };
  const loadingMessage = "Loading lookups...";

  const updateActiveTabDraft = useCallback(
    (patch: Partial<TransactionEntryTabDraft>) => {
      if (!activeShorthandTab || !activeTabDraft) {
        return;
      }
      const nextTabDraft = { ...activeTabDraft, ...patch };
      setDraft((currentDraft) => ({
        ...currentDraft,
        tabs: {
          ...currentDraft.tabs,
          [activeShorthandTab]: nextTabDraft,
        },
      }));
      setFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        for (const field of Object.keys(patch) as FieldName[]) {
          const message = fieldErrorForDraft(
            nextTabDraft,
            activeShorthandTab,
            field,
          );
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
    [activeShorthandTab, activeTabDraft],
  );

  const updateAdvancedDraft = useCallback(
    (patch: Partial<AdvancedTransactionEntryDraft>) => {
      setDraft((currentDraft) => ({
        ...currentDraft,
        advanced: {
          ...currentDraft.advanced,
          ...patch,
        },
      }));
      if ("date" in patch || "records" in patch) {
        setAdvancedFieldErrors((currentErrors) => {
          const nextErrors = { ...currentErrors };
          if ("date" in patch && !patch.date) {
            nextErrors.date = "Date is required.";
          } else if ("date" in patch) {
            delete nextErrors.date;
          }
          if ("records" in patch) {
            delete nextErrors.records;
          }
          return nextErrors;
        });
      }
      setGeneralError(undefined);
    },
    [],
  );

  const updateAdvancedRow = useCallback(
    (rowIndex: number, patch: Partial<JournalRecordRowDraft>) => {
      setDraft((currentDraft) => {
        const nextRecords = currentDraft.advanced.records.map((row, index) =>
          index === rowIndex ? { ...row, ...patch } : row,
        );
        return {
          ...currentDraft,
          advanced: {
            ...currentDraft.advanced,
            records: nextRecords,
          },
        };
      });
      setAdvancedFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        for (const field of Object.keys(patch) as AdvancedRecordFieldName[]) {
          delete nextErrors[advancedErrorKey(rowIndex, field)];
        }
        delete nextErrors.records;
        return nextErrors;
      });
      setGeneralError(undefined);
    },
    [],
  );

  const focusAfterAdvancedRecordRemoval = useCallback((rowIndex: number) => {
    window.requestAnimationFrame(() => {
      const target =
        advancedRemoveButtonRefs.current[rowIndex] ??
        advancedRemoveButtonRefs.current[rowIndex - 1] ??
        addAdvancedRecordButtonRef.current;
      focusWithoutTooltip(target, { preventScroll: true });
    });
  }, []);

  const updateActiveTab = (entryType: TransactionEntryType) => {
    userSelectedActiveTabRef.current = true;
    rememberedActiveTabRef.current = entryType;
    setDraft((currentDraft) => ({ ...currentDraft, activeTab: entryType }));
    setFieldErrors({});
    setAdvancedFieldErrors({});
    setGeneralError(undefined);
  };

  const retryCategoryPicker = () => {
    setCategoryRetryToken((currentToken) => currentToken + 1);
  };

  const editActiveTabAsJournal = useCallback(() => {
    if (!activeShorthandTab || !activeTabDraft) {
      return;
    }

    userSelectedActiveTabRef.current = true;
    rememberedActiveTabRef.current = "advanced";
    setDraft((currentDraft) => ({
      ...currentDraft,
      activeTab: "advanced",
      advanced: shorthandDraftToAdvanced(activeShorthandTab, activeTabDraft),
    }));
    setFieldErrors({});
    setAdvancedFieldErrors({});
    setGeneralError(undefined);
  }, [activeShorthandTab, activeTabDraft]);

  const validateField = useCallback(
    (field: FieldName) => {
      if (!activeShorthandTab || !activeTabDraft) {
        return;
      }
      setFieldErrors((currentErrors) => {
        const message = fieldErrorForDraft(
          activeTabDraft,
          activeShorthandTab,
          field,
        );
        if (message) {
          return { ...currentErrors, [field]: message };
        }
        const nextErrors = { ...currentErrors };
        delete nextErrors[field];
        return nextErrors;
      });
    },
    [activeShorthandTab, activeTabDraft],
  );

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }

    if (activeTab === "advanced") {
      const nextAdvancedErrors = validateAdvancedDraft(draft.advanced);
      setAdvancedFieldErrors(nextAdvancedErrors);
      setFieldErrors({});
      setGeneralError(undefined);
      if (
        hasAdvancedErrors(nextAdvancedErrors) ||
        !allCurrenciesBalanced(advancedBalances(draft.advanced))
      ) {
        return;
      }

      const body = {
        initiated_date: draft.advanced.date,
        records: draft.advanced.records.map((row) => ({
          account_id: row.accountId!,
          amount: normalizeSignedAmount(row.amount)!,
          category_id: row.categoryId!,
          currency: normalizeCurrency(row.currency),
          member_id: row.memberId ?? null,
          memo: row.memo.trim() ? row.memo.trim() : null,
          pending_date: dateTimeToISO(row.pendingDateTime),
          posted_date: dateTimeToISO(row.postedDateTime),
          posting_status: row.postingStatus,
          reconciliation_status: "unreconciled" as const,
          source: "manual" as const,
          tag_ids: [...row.tagIds],
        })),
      } satisfies CreateTransactionRequest;

      setSaving(true);
      try {
        const result = await createJournalTransaction(body);

        if (result.data) {
          await onSaved(result.data);
          const nextDraft = {
            ...draft,
            advanced: stickyNextAdvancedDraft(draft.advanced),
          };
          setDraft(nextDraft);
          setAdvancedFieldErrors({});
          setGeneralError(undefined);
          setSessionCount((count) => count + 1);
          await writeTransactionEntryDraft(draftForStorage(nextDraft));
          return;
        }

        const message = apiErrorMessage(result.error);
        const apiFieldErrors = advancedFieldErrorsFromAPI(
          message,
          draft.advanced,
          lookups,
        );
        setAdvancedFieldErrors(apiFieldErrors);
        setGeneralError(
          hasAdvancedErrors(apiFieldErrors) ? undefined : message,
        );
        return;
      } finally {
        setSaving(false);
      }
    }

    if (!activeShorthandTab || !activeTabDraft) {
      return;
    }

    const nextFieldErrors = validateDraft(activeTabDraft, activeShorthandTab);
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
      activeShorthandTab === "spend"
        ? await createSpend({
            ...common,
            counterparty_account_id: activeTabDraft.merchantAccountId ?? -1,
            funding_account_id: activeTabDraft.fundingAccountId ?? -1,
          } satisfies CreateSpendTransactionRequest)
        : activeShorthandTab === "income"
          ? await createIncome({
              ...common,
              destination_account_id: activeTabDraft.destinationAccountId ?? -1,
              source_account_id: activeTabDraft.sourceAccountId ?? -1,
            } satisfies CreateIncomeTransactionRequest)
          : activeShorthandTab === "refund"
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
        activeShorthandTab,
        activeTabDraft,
        currency,
      );
      const nextDraft = {
        ...draft,
        tabs: {
          ...draft.tabs,
          [activeShorthandTab]: nextTabDraft,
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
  }, [
    activeTab,
    activeShorthandTab,
    activeTabDraft,
    canSubmit,
    draft,
    draftForStorage,
    lookups,
    onSaved,
  ]);

  const primaryAccountValue =
    activeTabDraft && activeConfig
      ? accountValue(activeTabDraft, activeConfig.primaryAccountField)
      : undefined;
  const secondaryAccountValue =
    activeTabDraft && activeConfig
      ? accountValue(activeTabDraft, activeConfig.secondaryAccountField)
      : undefined;

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
            {activeConfig?.title ?? "New journal"}
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
        className="grid grid-cols-5 border-b-2 border-[var(--border-ink)]"
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
          {activeTab === "advanced" ? (
            <>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="advanced-date"
                  className="text-sm font-semibold"
                >
                  Date
                </label>
                <input
                  id="advanced-date"
                  ref={dateInputRef}
                  type="date"
                  className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
                  value={draft.advanced.date}
                  onBlur={() => {
                    setAdvancedFieldErrors(
                      validateAdvancedDraft(draft.advanced),
                    );
                  }}
                  onChange={(event) => {
                    updateAdvancedDraft({ date: event.target.value });
                  }}
                />
                <FieldError message={advancedFieldErrors.date} />
              </div>

              <div
                className="min-w-0 overflow-visible"
                aria-label="Journal records"
              >
                <div className="flex min-w-0 flex-col gap-3">
                  {draft.advanced.records.map((row, rowIndex) => (
                    <section
                      key={row.draftId}
                      className="bg-card min-w-0 border-2 border-[var(--border-ink)] p-3 shadow-[var(--shadow-pixel)]"
                      aria-label={`Journal record ${rowIndex + 1}`}
                    >
                      <div className="mb-3 flex min-w-0 items-center justify-between gap-2 border-b-2 border-[var(--border-ink)] pb-2">
                        <h3 className="font-heading text-sm font-semibold uppercase">
                          Record {rowIndex + 1}
                        </h3>
                        <Tooltip
                          label={`Remove record ${rowIndex + 1}`}
                          asChild
                        >
                          <Button
                            ref={(element) => {
                              advancedRemoveButtonRefs.current[rowIndex] =
                                element;
                            }}
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Remove record ${rowIndex + 1}`}
                            onClick={() => {
                              updateAdvancedDraft({
                                records: draft.advanced.records.filter(
                                  (_record, index) => index !== rowIndex,
                                ),
                              });
                              setAdvancedFieldErrors({});
                              focusAfterAdvancedRecordRemoval(rowIndex);
                            }}
                          >
                            <Trash aria-hidden="true" />
                          </Button>
                        </Tooltip>
                      </div>

                      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
                        <AdvancedRecordField
                          label="Account"
                          className="col-span-full"
                        >
                          <EntityPicker
                            key={`${lookupRevision}:advanced:${row.draftId}:account:${row.categoryId ?? ""}`}
                            id={`advanced-record-${rowIndex}-account`}
                            label={`Record ${rowIndex + 1} account`}
                            labelClassName="sr-only"
                            options={advancedAccountOptions(row.categoryId)}
                            value={row.accountId}
                            onChange={(accountId) => {
                              updateAdvancedRow(rowIndex, {
                                accountId,
                                currency:
                                  accountCurrency(lookups, accountId) ??
                                  row.currency,
                              });
                            }}
                          />
                          <FieldError
                            message={advancedFieldError(
                              advancedFieldErrors,
                              rowIndex,
                              "accountId",
                            )}
                          />
                        </AdvancedRecordField>
                        <AdvancedRecordField label="Amount">
                          <label
                            htmlFor={`advanced-record-${rowIndex}-amount`}
                            className="sr-only"
                          >
                            Record {rowIndex + 1} amount
                          </label>
                          <input
                            id={`advanced-record-${rowIndex}-amount`}
                            inputMode="decimal"
                            className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                            placeholder="-12.34"
                            value={row.amount}
                            onBlur={() => {
                              setAdvancedFieldErrors(
                                validateAdvancedDraft(draft.advanced),
                              );
                            }}
                            onChange={(event) => {
                              updateAdvancedRow(rowIndex, {
                                amount: event.target.value,
                              });
                            }}
                          />
                          <FieldError
                            message={advancedFieldError(
                              advancedFieldErrors,
                              rowIndex,
                              "amount",
                            )}
                          />
                        </AdvancedRecordField>
                        <AdvancedRecordField label="Currency">
                          <label
                            htmlFor={`advanced-record-${rowIndex}-currency`}
                            className="sr-only"
                          >
                            Record {rowIndex + 1} currency
                          </label>
                          <input
                            id={`advanced-record-${rowIndex}-currency`}
                            list="entry-currency-options"
                            className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                            value={row.currency}
                            onBlur={() => {
                              setAdvancedFieldErrors(
                                validateAdvancedDraft(draft.advanced),
                              );
                            }}
                            onChange={(event) => {
                              updateAdvancedRow(rowIndex, {
                                currency: event.target.value.toUpperCase(),
                              });
                            }}
                          />
                          <FieldError
                            message={advancedFieldError(
                              advancedFieldErrors,
                              rowIndex,
                              "currency",
                            )}
                          />
                        </AdvancedRecordField>
                        <AdvancedRecordField
                          label="Category"
                          className="col-span-full"
                        >
                          <EntityPicker
                            key={`${lookupRevision}:advanced:${row.draftId}:category`}
                            id={`advanced-record-${rowIndex}-category`}
                            label={`Record ${rowIndex + 1} category`}
                            labelClassName="sr-only"
                            options={options.allCategories}
                            value={row.categoryId}
                            onChange={(categoryId) => {
                              const accountId = advancedAccountOptions(
                                categoryId,
                              ).some((option) => option.id === row.accountId)
                                ? row.accountId
                                : undefined;
                              updateAdvancedRow(rowIndex, {
                                accountId,
                                categoryId,
                              });
                            }}
                          />
                          <FieldError
                            message={advancedFieldError(
                              advancedFieldErrors,
                              rowIndex,
                              "categoryId",
                            )}
                          />
                        </AdvancedRecordField>
                        <AdvancedRecordField
                          label="Tags"
                          className="col-span-full"
                        >
                          <EntityMultiPicker
                            id={`advanced-record-${rowIndex}-tags`}
                            label={`Record ${rowIndex + 1} tags`}
                            labelClassName="sr-only"
                            options={options.tags}
                            value={row.tagIds}
                            onChange={(tagIds) => {
                              updateAdvancedRow(rowIndex, { tagIds });
                            }}
                          />
                        </AdvancedRecordField>
                        <AdvancedRecordField label="Member">
                          <EntityPicker
                            key={`${lookupRevision}:advanced:${row.draftId}:member`}
                            id={`advanced-record-${rowIndex}-member`}
                            label={`Record ${rowIndex + 1} member`}
                            labelClassName="sr-only"
                            options={options.members}
                            placeholder="Whole household"
                            value={row.memberId}
                            onChange={(memberId) => {
                              updateAdvancedRow(rowIndex, { memberId });
                            }}
                          />
                        </AdvancedRecordField>
                        <AdvancedRecordField label="Status">
                          <div className="flex flex-col gap-2">
                            <label
                              htmlFor={`advanced-record-${rowIndex}-status`}
                              className="sr-only"
                            >
                              Record {rowIndex + 1} posting status
                            </label>
                            <select
                              id={`advanced-record-${rowIndex}-status`}
                              className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
                              value={row.postingStatus}
                              onChange={(event) => {
                                updateAdvancedRow(rowIndex, {
                                  postingStatus: event.target
                                    .value as JournalRecordDraftPostingStatus,
                                });
                              }}
                            >
                              <option value="posted">Posted</option>
                              <option value="pending">Pending</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            <FieldError
                              message={advancedFieldError(
                                advancedFieldErrors,
                                rowIndex,
                                "postingStatus",
                              )}
                            />
                          </div>
                        </AdvancedRecordField>
                        <AdvancedRecordField
                          label="Dates"
                          className="col-span-full"
                        >
                          <div className="flex flex-col gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                updateAdvancedRow(rowIndex, {
                                  showDates: !row.showDates,
                                });
                              }}
                            >
                              Dates
                            </Button>
                            {row.showDates ? (
                              <>
                                <label
                                  htmlFor={`advanced-record-${rowIndex}-pending-date`}
                                  className="sr-only"
                                >
                                  Record {rowIndex + 1} pending date
                                </label>
                                <input
                                  id={`advanced-record-${rowIndex}-pending-date`}
                                  type="datetime-local"
                                  className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
                                  value={row.pendingDateTime}
                                  onChange={(event) => {
                                    updateAdvancedRow(rowIndex, {
                                      pendingDateTime: event.target.value,
                                    });
                                  }}
                                />
                                <label
                                  htmlFor={`advanced-record-${rowIndex}-posted-date`}
                                  className="sr-only"
                                >
                                  Record {rowIndex + 1} posted date
                                </label>
                                <input
                                  id={`advanced-record-${rowIndex}-posted-date`}
                                  type="datetime-local"
                                  className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 text-sm shadow-[var(--shadow-pixel)]"
                                  value={row.postedDateTime}
                                  onChange={(event) => {
                                    updateAdvancedRow(rowIndex, {
                                      postedDateTime: event.target.value,
                                    });
                                  }}
                                />
                              </>
                            ) : null}
                          </div>
                        </AdvancedRecordField>
                        <AdvancedRecordField
                          label="Memo"
                          className="col-span-full"
                        >
                          <label
                            htmlFor={`advanced-record-${rowIndex}-memo`}
                            className="sr-only"
                          >
                            Record {rowIndex + 1} memo
                          </label>
                          <textarea
                            id={`advanced-record-${rowIndex}-memo`}
                            className="bg-card min-h-16 w-full border-2 border-[var(--border-ink)] px-2 py-2 text-sm shadow-[var(--shadow-pixel)]"
                            value={row.memo}
                            onChange={(event) => {
                              updateAdvancedRow(rowIndex, {
                                memo: event.target.value,
                              });
                            }}
                          />
                        </AdvancedRecordField>
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              <Button
                ref={addAdvancedRecordButtonRef}
                type="button"
                variant="outline"
                onClick={() => {
                  updateAdvancedDraft({
                    records: [...draft.advanced.records, blankRecordRowDraft()],
                  });
                }}
              >
                <Plus aria-hidden="true" />
                Add record
              </Button>

              <datalist id="entry-currency-options">
                {options.currencies.map((currency) => (
                  <option key={currency} value={currency} />
                ))}
              </datalist>
            </>
          ) : activeTabDraft && activeConfig ? (
            <>
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
              <FieldError
                message={fieldErrors[activeConfig.primaryAccountField]}
              />

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
                placeholder={
                  categoryPickerReady ? "Search" : "Loading categories"
                }
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
                  Transfer fee rows are not exposed by the shorthand endpoint
                  yet.
                </p>
              ) : null}

              <Button
                type="button"
                variant="outline"
                onClick={editActiveTabAsJournal}
              >
                Edit as journal
              </Button>
            </>
          ) : null}
        </div>

        <div className="bg-card flex flex-col gap-3 border-t-2 border-[var(--border-ink)] p-4">
          {activeTab === "advanced" ? (
            <BalanceMeter balances={balances} />
          ) : null}
          {advancedFieldErrors.records ? (
            <FieldError message={advancedFieldErrors.records} />
          ) : null}
          {generalError ? (
            <p className="border-destructive bg-card text-destructive border-2 p-2 text-sm">
              {generalError}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground font-mono text-sm">
              Entries this session:{" "}
              <span
                key={sessionCount}
                className="text-foreground inline-block animate-[score-pop_150ms_steps(2)]"
              >
                {sessionCount}
              </span>
            </div>
            <Button type="submit" disabled={submitDisabled}>
              <Check aria-hidden="true" />
              {saving ? "Saving" : "Save and add another"}
            </Button>
          </div>
        </div>
      </form>
    </aside>
  );
};
