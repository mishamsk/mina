import { Check, Clock, Close, Plus, Reload, Trash } from "pixelarticons/react";
import {
  type MutableRefObject,
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
  apiErrorMessage,
  type Category,
  type CategoryEconomicIntent,
  classifyJournalTransaction,
  createExchange,
  type CreateExchangeTransactionRequest,
  createIncome,
  type CreateIncomeTransactionRequest,
  type CreateJournalRecordRequest,
  createJournalTransaction,
  createLedgerAccount,
  createLedgerCategory,
  createLedgerTag,
  createRefund,
  type CreateRefundTransactionRequest,
  createSpend,
  type CreateSpendTransactionRequest,
  type CreateTransactionRequest,
  createTransfer,
  type CreateTransferTransactionRequest,
  fetchTransactionById,
  type JournalRecord,
  type Member,
  replaceLedgerTransaction,
  restoreTransactionById,
  type Tag,
  type Transaction,
  type TransactionClassification,
  type TransactionTemplate,
  type UpdateTransactionRequest,
} from "@/api";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { focusWithoutTooltip, Tooltip } from "@/components/tooltip";
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
import {
  refreshTransactionTemplates,
  useTransactionTemplatesResource,
} from "@/features/templates/use-transaction-templates-resource";
import type {
  AdvancedTransactionEntryDraft,
  JournalRecordRowDraft,
  SpendMerchantDraft,
  TransactionEntryDraft,
  TransactionEntryTabDraft,
  TransactionEntryType,
} from "@/models/ui-state";
import {
  deleteTransactionEntryDraft,
  readTransactionEntryDraft,
  writeTransactionEntryDraft,
} from "@/services/indexeddb";
import { getTransactionsSnapshot, type LedgerLookupsSnapshot } from "@/store";
import {
  addCategoryPickerCategory,
  getUiPreferencesSnapshot,
  invalidateAccountsPage,
  invalidateCategoriesPage,
  invalidateTagsPage,
  openTransactionEntryLaunch,
  openTransactionEntryPanel,
  setTransactionEntryActiveTab,
} from "@/store";
import { localTodayISODate } from "@/utils/date";

import { AmountText } from "./amount-text";
import { ClassBadge } from "./class-badge";
import {
  EntityMultiPicker,
  type EntityOption,
  EntityPicker,
} from "./entity-picker";
import { captureTransactionEntryLaunchContext } from "./entry-launch-context";
import {
  buildLookupMaps,
  displayAmountKey,
  formatInitiatedDate,
  lineDisplayAmounts,
  type LookupMaps,
  recordRoleLabel,
  transactionAccountFqnContext,
  transactionHasMoreParts,
} from "./format";
import { ClassIcon } from "./line-icons";
import {
  MorePartsIndicator,
  moreTransactionPartsLabel,
} from "./mixed-sentinel";
import {
  localSettlementDateTimeValue,
  settlementDateTimeToISO,
} from "./settlement-date";
import { useCategoryPickerCategoriesResource } from "./use-transactions-resource";
import { refreshLedgerLookups } from "./use-transactions-resource";

export interface EntryPanelProps {
  readonly closeRequestRef?: MutableRefObject<(() => void) | null>;
  readonly initialTab?: TransactionEntryType;
  readonly initialTemplateId?: number;
  readonly launch?: EntryPanelLaunch;
  readonly lookups: LedgerLookupsSnapshot | undefined;
  readonly onClose: () => void;
  readonly onSaved: (
    transaction: Transaction,
    context: EntryPanelSaveContext,
  ) => Promise<void>;
  readonly open: boolean;
  readonly recentTransactions?: readonly Transaction[];
}

export type EntryPanelLaunch = {
  readonly amountConflict?: {
    readonly amount: string;
    readonly recordIds: readonly [number, number];
  };
  readonly transaction: Transaction;
  readonly type: "duplicate" | "edit" | "split";
};

export interface EntryPanelSaveContext {
  readonly operation: "created" | "refreshed" | "updated";
  readonly previousTransactions?: readonly Transaction[];
}

type FieldName =
  | "amount"
  | "boughtAccountId"
  | "boughtAmount"
  | "boughtCurrency"
  | "categoryId"
  | "chargeAccountId"
  | "chargeAmount"
  | "chargeCategoryId"
  | "currency"
  | "date"
  | "destinationAccountId"
  | "fundingAccountId"
  | "memberId"
  | "merchantAccountId"
  | "memo"
  | "recordAsPending"
  | "sourceAccountId"
  | "soldAccountId"
  | "tagIds";

type FieldErrors = Partial<Record<FieldName, string>>;
type SpendMerchantFieldName = "accountId" | "amount" | "categoryId";
type SpendMerchantFieldErrors = Readonly<
  Record<string, Partial<Record<SpendMerchantFieldName, string>>>
>;
type ShorthandTransactionEntryType = Exclude<TransactionEntryType, "advanced">;
type AdvancedRecordFieldName =
  | "accountId"
  | "amount"
  | "categoryId"
  | "currency"
  | "externalId"
  | "externalSystem"
  | "memberId"
  | "memo"
  | "pendingDateTime"
  | "postedDateTime"
  | "settlement"
  | "reconciliationStatus"
  | "tagIds";
type AdvancedFieldErrors = Record<string, string>;

interface ShorthandFit {
  readonly additionalRecords: readonly JournalRecord[];
  readonly entryType: ShorthandTransactionEntryType;
  readonly negativeRecord: JournalRecord;
  readonly positiveRecord: JournalRecord;
  readonly systemExchangeRecords?: readonly [JournalRecord, JournalRecord];
}

interface ReplacementContext {
  readonly fit?: ShorthandFit;
  readonly restoreCancelledOnSave?: boolean;
  readonly transaction: Transaction;
}

interface LaunchDraft {
  readonly baseline?: TransactionEntryDraft;
  readonly draft: TransactionEntryDraft;
  readonly persistence: DraftPersistenceMode;
  readonly replacement?: ReplacementContext;
}

interface PendingLaunchDraft extends LaunchDraft {
  readonly discardOrdinaryDraft: boolean;
}

type DraftPersistenceMode = "launch" | "ordinary";

interface TabConfig {
  readonly categoryIntents: readonly Category["economic_intent"][];
  readonly counterpartyLabel: string;
  readonly primaryAccountField: FieldName;
  readonly primaryAccountLabel: string;
  readonly primaryAccountOptionSet: "movementAccounts";
  readonly secondaryAccountField: FieldName;
  readonly secondaryAccountLabel: string;
  readonly secondaryAccountOptionSet: "flowAccounts" | "movementAccounts";
  readonly title: string;
}

const entryTypes: readonly TransactionEntryType[] = [
  "spend",
  "income",
  "refund",
  "transfer",
  "exchange",
  "advanced",
];

const tabLabels: Record<TransactionEntryType, string> = {
  advanced: "Advanced",
  exchange: "Exchange",
  income: "Income",
  refund: "Refund",
  spend: "Spend",
  transfer: "Transfer",
};

const draftDiscardLaunchWaitMs = 1_000;

const discardStoredTransactionEntryDraft = async (
  ordinaryBaseline: TransactionEntryDraft | undefined,
): Promise<void> => {
  try {
    await deleteTransactionEntryDraft();
  } catch {
    if (!ordinaryBaseline) {
      return;
    }
    try {
      await writeTransactionEntryDraft(
        ordinaryBaseline,
        ordinaryBaseline,
        false,
      );
    } catch {
      // Draft storage is disposable; storage failure must not block the launch.
    }
  }
};

const waitForStoredTransactionEntryDraftDiscard = async (
  ordinaryBaseline: TransactionEntryDraft | undefined,
): Promise<void> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutId = window.setTimeout(resolve, draftDiscardLaunchWaitMs);
  });
  try {
    await Promise.race([
      discardStoredTransactionEntryDraft(ordinaryBaseline),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
};

const tabConfigs: Record<ShorthandTransactionEntryType, TabConfig> = {
  income: {
    categoryIntents: ["income"],
    counterpartyLabel: "source",
    primaryAccountField: "destinationAccountId",
    primaryAccountLabel: "Destination account",
    primaryAccountOptionSet: "movementAccounts",
    secondaryAccountField: "sourceAccountId",
    secondaryAccountLabel: "Source",
    secondaryAccountOptionSet: "flowAccounts",
    title: "New income",
  },
  refund: {
    categoryIntents: ["expense"],
    counterpartyLabel: "merchant",
    primaryAccountField: "destinationAccountId",
    primaryAccountLabel: "Destination account",
    primaryAccountOptionSet: "movementAccounts",
    secondaryAccountField: "merchantAccountId",
    secondaryAccountLabel: "Merchant",
    secondaryAccountOptionSet: "flowAccounts",
    title: "New refund",
  },
  spend: {
    categoryIntents: ["expense"],
    counterpartyLabel: "merchant",
    primaryAccountField: "fundingAccountId",
    primaryAccountLabel: "Funding account",
    primaryAccountOptionSet: "movementAccounts",
    secondaryAccountField: "merchantAccountId",
    secondaryAccountLabel: "Merchant",
    secondaryAccountOptionSet: "flowAccounts",
    title: "New spend",
  },
  transfer: {
    categoryIntents: ["expense"],
    counterpartyLabel: "destination",
    primaryAccountField: "sourceAccountId",
    primaryAccountLabel: "From account",
    primaryAccountOptionSet: "movementAccounts",
    secondaryAccountField: "destinationAccountId",
    secondaryAccountLabel: "To account",
    secondaryAccountOptionSet: "movementAccounts",
    title: "New transfer",
  },
  exchange: {
    categoryIntents: [],
    counterpartyLabel: "destination",
    primaryAccountField: "soldAccountId",
    primaryAccountLabel: "From account",
    primaryAccountOptionSet: "movementAccounts",
    secondaryAccountField: "boughtAccountId",
    secondaryAccountLabel: "To account",
    secondaryAccountOptionSet: "movementAccounts",
    title: "New exchange",
  },
};

let nextJournalRecordDraftId = 0;

const newJournalRecordDraftId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `journal-record-${Date.now()}-${nextJournalRecordDraftId++}`;

const blankSpendMerchantDraft = (): SpendMerchantDraft => ({
  accountId: undefined,
  amount: "",
  categoryId: undefined,
  draftId: newJournalRecordDraftId(),
});

const blankTabDraft = (): TransactionEntryTabDraft => ({
  amount: "",
  boughtAccountId: undefined,
  boughtAmount: "",
  boughtCurrency: "EUR",
  categoryId: undefined,
  chargeAccountId: undefined,
  chargeAmount: "",
  chargeCategoryId: undefined,
  chargeEnabled: false,
  currency: "USD",
  date: localTodayISODate(),
  destinationAccountId: undefined,
  fundingAccountId: undefined,
  memberId: undefined,
  merchantAccountId: undefined,
  memo: "",
  recordAsPending: false,
  sourceAccountId: undefined,
  soldAccountId: undefined,
  spendMerchants: [],
  tagIds: [],
});

const blankSpendTabDraft = (): TransactionEntryTabDraft => ({
  ...blankTabDraft(),
  spendMerchants: [blankSpendMerchantDraft()],
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
  settlement: "posted",
  reconciliationStatus: "unreconciled",
  source: "manual",
  sourceRecordId: undefined,
  sourceAmount: undefined,
  sourceAmountUsd: undefined,
  sourceCurrency: undefined,
  sourceExternalId: undefined,
  sourceExternalSystem: undefined,
  sourcePendingDate: undefined,
  sourcePostedDate: undefined,
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
  categoryId: number | undefined,
  amount = draft.amount,
  currency = draft.currency,
): JournalRecordRowDraft => ({
  ...blankRecordRowDraft(),
  accountId,
  amount: amountWithSign(amount, amountSign),
  categoryId,
  currency: normalizeCurrency(currency),
  memberId: draft.memberId,
  memo: draft.memo,
  settlement: draft.recordAsPending ? "pending" : "posted",
  reconciliationStatus: "unreconciled",
  tagIds: [...draft.tagIds],
});

const shorthandDraftToAdvanced = (
  entryType: ShorthandTransactionEntryType,
  draft: TransactionEntryTabDraft,
  lookups: LedgerLookupsSnapshot | undefined,
): AdvancedTransactionEntryDraft => {
  const primaryAmount = normalizeAmount(draft.amount);
  const spendTotal = draft.spendMerchants.reduce(
    (total, merchant) =>
      total +
      (signedAmountMantissa(normalizeAmount(merchant.amount) ?? "") ?? 0n),
    0n,
  );
  const chargeAmount = normalizeAmount(draft.chargeAmount);
  const transferSourceAmount =
    primaryAmount && chargeAmount
      ? formatMantissa(
          (signedAmountMantissa(primaryAmount) ?? 0n) +
            (signedAmountMantissa(chargeAmount) ?? 0n),
        )
      : draft.amount;
  const systemExchangeAccountId = lookups?.accounts.find(
    (account) => account.fqn === "system:exchange",
  )?.account_id;
  const soldCurrency =
    accountCurrency(lookups, draft.soldAccountId) ?? draft.currency;
  const boughtCurrency =
    accountCurrency(lookups, draft.boughtAccountId) ?? draft.boughtCurrency;
  const records =
    entryType === "spend"
      ? [
          shorthandRecordDraft(
            draft,
            draft.fundingAccountId,
            "negative",
            undefined,
            formatMantissa(spendTotal),
          ),
          ...draft.spendMerchants.map((merchant) =>
            shorthandRecordDraft(
              draft,
              merchant.accountId,
              "positive",
              merchant.categoryId,
              merchant.amount,
            ),
          ),
        ]
      : entryType === "income"
        ? [
            shorthandRecordDraft(
              draft,
              draft.destinationAccountId,
              "positive",
              undefined,
            ),
            shorthandRecordDraft(
              draft,
              draft.sourceAccountId,
              "negative",
              draft.categoryId,
            ),
          ]
        : entryType === "refund"
          ? [
              shorthandRecordDraft(
                draft,
                draft.destinationAccountId,
                "positive",
                undefined,
              ),
              shorthandRecordDraft(
                draft,
                draft.merchantAccountId,
                "negative",
                draft.categoryId,
              ),
            ]
          : entryType === "transfer"
            ? [
                shorthandRecordDraft(
                  draft,
                  draft.sourceAccountId,
                  "negative",
                  undefined,
                  transferSourceAmount,
                ),
                shorthandRecordDraft(
                  draft,
                  draft.destinationAccountId,
                  "positive",
                  undefined,
                ),
                ...(draft.chargeEnabled ||
                draft.chargeAccountId ||
                draft.chargeAmount.trim() ||
                draft.chargeCategoryId
                  ? [
                      shorthandRecordDraft(
                        draft,
                        draft.chargeAccountId,
                        "positive",
                        draft.chargeCategoryId,
                        draft.chargeAmount,
                      ),
                    ]
                  : []),
              ]
            : [
                shorthandRecordDraft(
                  draft,
                  draft.soldAccountId,
                  "negative",
                  undefined,
                  draft.amount,
                  soldCurrency,
                ),
                shorthandRecordDraft(
                  draft,
                  systemExchangeAccountId,
                  "positive",
                  undefined,
                  draft.amount,
                  soldCurrency,
                ),
                shorthandRecordDraft(
                  draft,
                  systemExchangeAccountId,
                  "negative",
                  undefined,
                  draft.boughtAmount,
                  boughtCurrency,
                ),
                shorthandRecordDraft(
                  draft,
                  draft.boughtAccountId,
                  "positive",
                  undefined,
                  draft.boughtAmount,
                  boughtCurrency,
                ),
              ];

  return {
    date: draft.date || localTodayISODate(),
    records,
  };
};

const shorthandFitRecordsInAdvancedOrder = (
  fit: ShorthandFit,
): readonly JournalRecord[] => {
  if (fit.entryType === "income" || fit.entryType === "refund") {
    return [fit.positiveRecord, fit.negativeRecord];
  }
  if (fit.entryType === "exchange" && fit.systemExchangeRecords) {
    return [
      fit.negativeRecord,
      ...fit.systemExchangeRecords,
      fit.positiveRecord,
    ];
  }
  return [fit.negativeRecord, fit.positiveRecord, ...fit.additionalRecords];
};

const advancedDraftFromShorthandReplacement = (
  entryType: ShorthandTransactionEntryType,
  draft: TransactionEntryTabDraft,
  fit: ShorthandFit,
  lookups: LedgerLookupsSnapshot | undefined,
): AdvancedTransactionEntryDraft => {
  const advancedDraft = shorthandDraftToAdvanced(entryType, draft, lookups);
  const originalRecords = shorthandFitRecordsInAdvancedOrder(fit);
  return {
    ...advancedDraft,
    records: advancedDraft.records.map((row, index) => {
      const original =
        entryType === "spend" && index > 0
          ? originalRecords.find(
              (record) =>
                record.record_id ===
                draft.spendMerchants[index - 1]?.sourceRecordId,
            )
          : originalRecords[index];
      return original
        ? {
            ...recordRowDraftFromJournalRecord(original),
            accountId: row.accountId,
            amount: row.amount,
            categoryId: row.categoryId,
            currency: row.currency,
            memberId: row.memberId,
            memo: row.memo,
            tagIds: row.tagIds,
          }
        : row;
    }),
  };
};

const defaultDraft = (): TransactionEntryDraft => ({
  activeTab: "spend",
  advanced: blankAdvancedDraft(),
  tabs: {
    income: blankTabDraft(),
    refund: blankTabDraft(),
    spend: blankSpendTabDraft(),
    transfer: blankTabDraft(),
    exchange: blankTabDraft(),
  },
});

const templateEntryType = (
  template: TransactionTemplate,
): TransactionEntryType =>
  template.compatible_shorthands.length === 1
    ? template.compatible_shorthands[0]!
    : "advanced";

const advancedDraftFromTemplate = (
  template: TransactionTemplate,
): AdvancedTransactionEntryDraft => {
  const records = template.records
    .filter((record) => !record.tombstoned_at)
    .map((record) => ({
      ...blankRecordRowDraft(),
      accountId: record.account_id ?? undefined,
      amount: record.amount ?? "",
      categoryId: record.category_id ?? undefined,
      currency: record.currency ?? "USD",
      memberId: record.member_id ?? undefined,
      memo: record.memo ?? "",
      tagIds: [...record.tag_ids],
    }));
  return {
    date: localTodayISODate(),
    records: records.length > 0 ? records : blankAdvancedDraft().records,
  };
};

const draftFromTemplate = (
  template: TransactionTemplate,
  targetTab: TransactionEntryType,
  lookups: LedgerLookupsSnapshot | undefined,
): TransactionEntryDraft => {
  const nextDraft = defaultDraft();
  if (targetTab === "advanced" || targetTab === "exchange") {
    return {
      ...nextDraft,
      activeTab: "advanced",
      advanced: advancedDraftFromTemplate(template),
    };
  }

  const records = template.records.filter((record) => !record.tombstoned_at);
  const balanceRecords = records.filter((record) =>
    isMovementAccountType(
      accountTypeForId(lookups, record.account_id ?? undefined),
    ),
  );
  const flowRecords = records.filter(
    (record) =>
      accountTypeForId(lookups, record.account_id ?? undefined) === "flow",
  );
  const amountFromRecord = (record: (typeof records)[number] | undefined) =>
    record?.amount ? inputAmountFromTemplateRecord(record.amount) : "";
  const amountMagnitudeFromRecord = (
    record: (typeof records)[number] | undefined,
  ) => {
    if (!record?.amount) {
      return "";
    }
    const mantissa = signedAmountMantissa(record.amount);
    return mantissa === undefined
      ? record.amount
      : formatMantissa(mantissa < 0n ? -mantissa : mantissa);
  };
  const firstMemberID = records.find(
    (record) => record.member_id !== null,
  )?.member_id;
  const firstMemo = records.find((record) => record.memo !== null)?.memo;
  const common = {
    memberId: firstMemberID ?? undefined,
    memo: firstMemo ?? "",
    tagIds: [...(records[0]?.tag_ids ?? [])],
  };
  const currency =
    records.find((record) => record.currency !== null)?.currency ?? "";
  let tabDraft: TransactionEntryTabDraft;
  switch (targetTab) {
    case "spend":
      tabDraft = {
        ...blankSpendTabDraft(),
        ...common,
        currency,
        fundingAccountId: balanceRecords[0]?.account_id ?? undefined,
        spendMerchants: flowRecords.map((record) => ({
          accountId: record.account_id ?? undefined,
          amount: amountFromRecord(record),
          categoryId: record.category_id ?? undefined,
          draftId: newJournalRecordDraftId(),
        })),
      };
      break;
    case "income":
      tabDraft = {
        ...blankTabDraft(),
        ...common,
        amount:
          amountMagnitudeFromRecord(balanceRecords[0]) ||
          amountMagnitudeFromRecord(flowRecords[0]),
        categoryId: flowRecords[0]?.category_id ?? undefined,
        currency,
        destinationAccountId: balanceRecords[0]?.account_id ?? undefined,
        sourceAccountId: flowRecords[0]?.account_id ?? undefined,
      };
      break;
    case "refund":
      tabDraft = {
        ...blankTabDraft(),
        ...common,
        amount:
          amountMagnitudeFromRecord(balanceRecords[0]) ||
          amountMagnitudeFromRecord(flowRecords[0]),
        categoryId: flowRecords[0]?.category_id ?? undefined,
        currency,
        destinationAccountId: balanceRecords[0]?.account_id ?? undefined,
        merchantAccountId: flowRecords[0]?.account_id ?? undefined,
      };
      break;
    case "transfer": {
      const source = balanceRecords.find(
        (record) => (signedAmountMantissa(record.amount ?? "") ?? 0n) < 0n,
      );
      const destination = balanceRecords.find(
        (record) => (signedAmountMantissa(record.amount ?? "") ?? 0n) > 0n,
      );
      const charge = flowRecords[0];
      tabDraft = {
        ...blankTabDraft(),
        ...common,
        amount: amountFromRecord(destination),
        chargeAccountId: charge?.account_id ?? undefined,
        chargeAmount: amountFromRecord(charge),
        chargeCategoryId: charge?.category_id ?? undefined,
        chargeEnabled: charge !== undefined,
        currency,
        destinationAccountId: destination?.account_id ?? undefined,
        sourceAccountId: source?.account_id ?? undefined,
      };
      break;
    }
  }

  return {
    ...nextDraft,
    activeTab: targetTab,
    tabs: { ...nextDraft.tabs, [targetTab]: tabDraft },
  };
};

const migrateStoredRecordRowDraft = (
  storedRow: Partial<JournalRecordRowDraft> | undefined,
): JournalRecordRowDraft => ({
  ...blankRecordRowDraft(),
  ...storedRow,
  draftId:
    typeof storedRow?.draftId === "string" && storedRow.draftId
      ? storedRow.draftId
      : newJournalRecordDraftId(),
  settlement:
    storedRow?.settlement === "pending" || storedRow?.settlement === "posted"
      ? storedRow.settlement
      : "posted",
  reconciliationStatus:
    storedRow?.reconciliationStatus === "reconciled"
      ? "reconciled"
      : "unreconciled",
  source: storedRow?.source === "imported" ? "imported" : "manual",
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

type StoredTabDraft = Partial<TransactionEntryTabDraft> & {
  readonly additionalMerchants?: readonly Partial<SpendMerchantDraft>[];
};

const migrateStoredSpendMerchant = (
  merchant: Partial<SpendMerchantDraft> | undefined,
): SpendMerchantDraft => ({
  ...blankSpendMerchantDraft(),
  ...merchant,
  draftId:
    typeof merchant?.draftId === "string" && merchant.draftId
      ? merchant.draftId
      : newJournalRecordDraftId(),
});

const migrateStoredTabDraft = (
  storedTab: StoredTabDraft | undefined,
  entryType: ShorthandTransactionEntryType,
): TransactionEntryTabDraft => {
  const base = entryType === "spend" ? blankSpendTabDraft() : blankTabDraft();
  if (!storedTab) {
    return base;
  }
  if (entryType !== "spend") {
    return {
      ...base,
      ...storedTab,
      recordAsPending: storedTab.recordAsPending === true,
      spendMerchants: [],
    };
  }

  const storedSpendMerchants = Array.isArray(storedTab.spendMerchants)
    ? storedTab.spendMerchants.map(migrateStoredSpendMerchant)
    : [
        migrateStoredSpendMerchant({
          accountId: storedTab.merchantAccountId,
          amount: storedTab.amount,
          categoryId: storedTab.categoryId,
          draftId: "primary",
        }),
        ...(storedTab.additionalMerchants ?? []).map(
          migrateStoredSpendMerchant,
        ),
      ];
  return {
    ...base,
    ...storedTab,
    amount: "",
    categoryId: undefined,
    merchantAccountId: undefined,
    recordAsPending: storedTab.recordAsPending === true,
    spendMerchants:
      storedSpendMerchants.length > 0
        ? storedSpendMerchants
        : [blankSpendMerchantDraft()],
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
        income: migrateStoredTabDraft(storedDraft.tabs.income, "income"),
        refund: migrateStoredTabDraft(storedDraft.tabs.refund, "refund"),
        spend: migrateStoredTabDraft(storedDraft.tabs.spend, "spend"),
        transfer: {
          ...migrateStoredTabDraft(storedDraft.tabs.transfer, "transfer"),
          chargeEnabled:
            storedDraft.tabs.transfer.chargeEnabled ||
            storedDraft.tabs.transfer.chargeAccountId !== undefined ||
            Boolean(storedDraft.tabs.transfer.chargeAmount?.trim()) ||
            storedDraft.tabs.transfer.chargeCategoryId !== undefined,
        },
        exchange: migrateStoredTabDraft(storedDraft.tabs.exchange, "exchange"),
      },
    };
  }

  return {
    ...nextDraft,
    tabs: {
      ...nextDraft.tabs,
      spend: migrateStoredTabDraft(storedDraft, "spend"),
    },
  };
};

const entityOption = (
  entity: Account | Category | Tag,
  id: number,
): EntityOption => ({
  detail: entity.fqn,
  hidden: entity.is_hidden,
  id,
  label: entity.name,
  metadata:
    "account_id" in entity
      ? entity.currency
        ? `${entity.currency} · Single-currency`
        : "Multi-currency"
      : undefined,
  searchLabel: entity.fqn,
});

const memberOption = (member: Member): EntityOption => ({
  hidden: member.is_hidden,
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

const accountingWordLabel = (value: string): string =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const normalizeMemberId = (memberId: number | null | undefined) =>
  memberId ?? undefined;

const normalizeMemo = (memo: string | null | undefined): string =>
  memo?.trim() ?? "";

const sortedIds = (ids: readonly number[]): readonly number[] =>
  [...ids].sort((left, right) => left - right);

const sameIds = (
  left: readonly number[],
  right: readonly number[],
): boolean => {
  const sortedLeft = sortedIds(left);
  const sortedRight = sortedIds(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
};

const activeTransactionRecords = (
  transaction: Transaction,
): readonly JournalRecord[] =>
  transaction.records.filter((record) => !record.tombstoned_at);

const absoluteMantissa = (amount: string): bigint | undefined => {
  const mantissa = signedAmountMantissa(amount);
  if (mantissa === undefined) {
    return undefined;
  }
  return mantissa < 0n ? -mantissa : mantissa;
};

const inputAmountFromRecord = (record: JournalRecord): string => {
  const mantissa = absoluteMantissa(record.amount);
  return mantissa === undefined ? "" : formatMantissa(mantissa);
};

const inputAmountFromTemplateRecord = (amount: string): string => {
  const mantissa = signedAmountMantissa(amount);
  return mantissa === undefined ? amount : formatMantissa(mantissa);
};

const writableRecordSource = (
  record: JournalRecord,
): JournalRecordRowDraft["source"] =>
  record.source === "imported" ? "imported" : "manual";

const retainedRecordOriginLabel = (
  row: JournalRecordRowDraft,
  transaction: Transaction | undefined,
): string => {
  const source = transaction?.records.find(
    (record) => record.record_id === row.sourceRecordId,
  )?.source;
  if (source === "recurring_template") {
    return "Recurring template · identity retained";
  }
  return row.source === "imported"
    ? "Imported · identity retained"
    : "Manual · identity retained";
};

const recordRowDraftFromJournalRecord = (
  record: JournalRecord,
): JournalRecordRowDraft => ({
  accountId: record.account_id,
  amount: formatMantissa(signedAmountMantissa(record.amount) ?? 0n),
  categoryId: record.category_id ?? undefined,
  currency: record.currency,
  draftId: newJournalRecordDraftId(),
  memberId: normalizeMemberId(record.member_id),
  memo: record.memo ?? "",
  pendingDateTime: localSettlementDateTimeValue(record.pending_date),
  postedDateTime: localSettlementDateTimeValue(record.posted_date),
  settlement: record.settlement ?? "posted",
  reconciliationStatus: record.reconciliation_status,
  source: writableRecordSource(record),
  sourceRecordId: record.record_id,
  sourceAmount: record.amount,
  sourceAmountUsd: record.amount_usd,
  sourceCurrency: record.currency,
  sourceExternalId: record.external_id,
  sourceExternalSystem: record.external_system,
  sourcePendingDate: record.pending_date,
  sourcePostedDate: record.posted_date,
  tagIds: [...record.tag_ids],
});

const advancedDraftFromTransaction = (
  transaction: Transaction,
): AdvancedTransactionEntryDraft => ({
  date: transaction.initiated_date,
  records: activeTransactionRecords(transaction).map(
    recordRowDraftFromJournalRecord,
  ),
});

const advancedDuplicateDraftFromTransaction = (
  transaction: Transaction,
): AdvancedTransactionEntryDraft => {
  const draft = advancedDraftFromTransaction(transaction);
  return {
    ...draft,
    records: draft.records.map((record) => ({
      ...record,
      source: "manual",
      sourceRecordId: undefined,
      sourceExternalId: undefined,
      sourceExternalSystem: undefined,
    })),
  };
};

const splitDraftFromTransaction = (
  transaction: Transaction,
): AdvancedTransactionEntryDraft => {
  const records = activeTransactionRecords(transaction);
  const sourceRole =
    transaction.transaction_class === "spend" ? "expense" : "income";
  const sourceRecord = records.find(
    (record) => record.record_role === sourceRole,
  );
  if (!sourceRecord) {
    throw new Error("Eligible Split transaction is missing its flow record.");
  }

  return {
    date: transaction.initiated_date,
    records: [
      ...records.map(recordRowDraftFromJournalRecord),
      {
        ...blankRecordRowDraft(),
        accountId: sourceRecord.account_id,
        currency: sourceRecord.currency,
        memberId: normalizeMemberId(sourceRecord.member_id),
        memo: sourceRecord.memo ?? "",
        tagIds: [...sourceRecord.tag_ids],
      },
    ],
  };
};

const merchantUserInput = (merchant: SpendMerchantDraft) => ({
  accountId: merchant.accountId,
  amount: merchant.amount.trim(),
  categoryId: merchant.categoryId,
});

const merchantHasUserInput = (
  merchant: ReturnType<typeof merchantUserInput>,
): boolean =>
  merchant.accountId !== undefined ||
  Boolean(merchant.amount) ||
  merchant.categoryId !== undefined;

const tabDraftUserInput = (draft: TransactionEntryTabDraft) => ({
  amount: draft.amount.trim(),
  boughtAccountId: draft.boughtAccountId,
  boughtAmount: draft.boughtAmount.trim(),
  boughtCurrency: normalizeCurrency(draft.boughtCurrency),
  categoryId: draft.categoryId,
  chargeAccountId: draft.chargeAccountId,
  chargeAmount: draft.chargeAmount.trim(),
  chargeCategoryId: draft.chargeCategoryId,
  chargeEnabled: draft.chargeEnabled,
  currency: normalizeCurrency(draft.currency),
  date: draft.date,
  destinationAccountId: draft.destinationAccountId,
  fundingAccountId: draft.fundingAccountId,
  memberId: draft.memberId,
  merchantAccountId: draft.merchantAccountId,
  memo: draft.memo.trim(),
  recordAsPending: draft.recordAsPending,
  soldAccountId: draft.soldAccountId,
  sourceAccountId: draft.sourceAccountId,
  spendMerchants: draft.spendMerchants
    .map(merchantUserInput)
    .filter(merchantHasUserInput),
  tagIds: draft.tagIds,
});

const recordRowUserInput = (row: JournalRecordRowDraft) => ({
  accountId: row.accountId,
  amount: row.amount.trim(),
  categoryId: row.categoryId,
  currency: normalizeCurrency(row.currency),
  memberId: row.memberId,
  memo: row.memo.trim(),
  pendingDateTime: row.pendingDateTime.trim(),
  postedDateTime: row.postedDateTime.trim(),
  settlement: row.settlement,
  reconciliationStatus: row.reconciliationStatus,
  source: row.source,
  sourceExternalId: row.sourceExternalId?.trim(),
  sourceExternalSystem: row.sourceExternalSystem?.trim(),
  tagIds: row.tagIds,
});

const draftUserInput = (draft: TransactionEntryDraft) => ({
  advanced: {
    date: draft.advanced.date,
    records: draft.advanced.records.map(recordRowUserInput),
  },
  tabs: {
    income: tabDraftUserInput(draft.tabs.income),
    refund: tabDraftUserInput(draft.tabs.refund),
    spend: tabDraftUserInput(draft.tabs.spend),
    transfer: tabDraftUserInput(draft.tabs.transfer),
    exchange: tabDraftUserInput(draft.tabs.exchange),
  },
});

const draftHasUserInput = (
  draft: TransactionEntryDraft,
  baseline: TransactionEntryDraft,
): boolean =>
  JSON.stringify(draftUserInput(draft)) !==
  JSON.stringify(draftUserInput(baseline));

const draftFingerprint = (draft: TransactionEntryDraft): string =>
  JSON.stringify(draft);

const sharedLegacyDefault = (
  values: readonly string[],
  fallback: string,
): string => {
  const counts = new Map<string, number>();
  let sharedValue = fallback;
  let sharedCount = 0;
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > sharedCount) {
      sharedValue = value;
      sharedCount = count;
    }
  }
  return sharedValue;
};

const legacyDraftBaseline = (
  draft: TransactionEntryDraft,
): TransactionEntryDraft => {
  const baseline = defaultDraft();
  const sharedCurrency = sharedLegacyDefault(
    [
      ...entryTypes
        .filter(
          (entryType): entryType is ShorthandTransactionEntryType =>
            entryType !== "advanced",
        )
        .map((entryType) => draft.tabs[entryType].currency),
      ...draft.advanced.records.map((row) => row.currency),
    ],
    baseline.tabs.spend.currency,
  );
  const sharedDate = sharedLegacyDefault(
    [
      ...entryTypes
        .filter(
          (entryType): entryType is ShorthandTransactionEntryType =>
            entryType !== "advanced",
        )
        .map((entryType) => draft.tabs[entryType].date),
      draft.advanced.date,
    ],
    baseline.tabs.spend.date,
  );
  const tabBaseline = (
    entryType: ShorthandTransactionEntryType,
  ): TransactionEntryTabDraft => ({
    ...baseline.tabs[entryType],
    currency: sharedCurrency,
    date: sharedDate,
  });

  return {
    ...baseline,
    advanced: {
      date: sharedDate,
      records: baseline.advanced.records.map((row) => ({
        ...row,
        currency: sharedCurrency,
      })),
    },
    tabs: {
      income: tabBaseline("income"),
      refund: tabBaseline("refund"),
      spend: tabBaseline("spend"),
      transfer: tabBaseline("transfer"),
      exchange: tabBaseline("exchange"),
    },
  };
};

const shorthandMemberId = (
  records: readonly JournalRecord[],
): number | undefined => {
  const memberIds = records
    .map((record) => normalizeMemberId(record.member_id))
    .filter((memberId): memberId is number => memberId !== undefined);
  return [...new Set(memberIds)][0];
};

const shorthandMemo = (records: readonly JournalRecord[]): string => {
  const memos = records
    .map((record) => normalizeMemo(record.memo))
    .filter(Boolean);
  return [...new Set(memos)][0] ?? "";
};

const recordsHaveUniformShorthandFields = (
  records: readonly JournalRecord[],
): boolean => {
  const [first, ...rest] = records;
  return Boolean(
    first &&
    new Set(
      records
        .map((record) => normalizeMemberId(record.member_id))
        .filter((memberId) => memberId !== undefined),
    ).size <= 1 &&
    new Set(records.map((record) => normalizeMemo(record.memo)).filter(Boolean))
      .size <= 1 &&
    rest.every((record) => sameIds(first.tag_ids, record.tag_ids)),
  );
};

const recordsHaveExactlyUniformShorthandFields = (
  records: readonly JournalRecord[],
): boolean => {
  const [first, ...rest] = records;
  return Boolean(
    first &&
    rest.every(
      (record) =>
        normalizeMemberId(record.member_id) ===
          normalizeMemberId(first.member_id) &&
        normalizeMemo(record.memo) === normalizeMemo(first.memo) &&
        sameIds(first.tag_ids, record.tag_ids),
    ),
  );
};

const accountTypeForId = (
  lookups: LedgerLookupsSnapshot | undefined,
  accountId: number | undefined,
): Account["account_type"] | undefined =>
  lookups?.accounts.find((account) => account.account_id === accountId)
    ?.account_type;

const isMovementAccountType = (
  accountType: Account["account_type"] | undefined,
): boolean => accountType === "owned" || accountType === "party";

const shorthandFitFromTransaction = (
  transaction: Transaction,
  lookups: LedgerLookupsSnapshot,
): ShorthandFit | undefined => {
  const records = activeTransactionRecords(transaction);
  if (!recordsHaveUniformShorthandFields(records)) {
    return undefined;
  }

  const negativeRecords = records.filter(
    (record) => (signedAmountMantissa(record.amount) ?? 0n) < 0n,
  );
  const positiveRecords = records.filter(
    (record) => (signedAmountMantissa(record.amount) ?? 0n) > 0n,
  );
  if (negativeRecords.length === 0 || positiveRecords.length === 0) {
    return undefined;
  }

  if (transaction.transaction_class === "currency_exchange") {
    const balanceRecords = records.filter((record) =>
      isMovementAccountType(accountTypeForId(lookups, record.account_id)),
    );
    const systemExchangeRecords = records.filter(
      (record) =>
        lookups.accounts.find(
          (account) => account.account_id === record.account_id,
        )?.fqn === "system:exchange",
    );
    const negativeRecord = balanceRecords.find(
      (record) => (signedAmountMantissa(record.amount) ?? 0n) < 0n,
    );
    const positiveRecord = balanceRecords.find(
      (record) => (signedAmountMantissa(record.amount) ?? 0n) > 0n,
    );
    const soldSystemRecord = systemExchangeRecords.find(
      (record) => record.currency === negativeRecord?.currency,
    );
    const boughtSystemRecord = systemExchangeRecords.find(
      (record) => record.currency === positiveRecord?.currency,
    );
    if (
      records.length !== 4 ||
      balanceRecords.length !== 2 ||
      systemExchangeRecords.length !== 2 ||
      !negativeRecord ||
      !positiveRecord ||
      !soldSystemRecord ||
      !boughtSystemRecord ||
      negativeRecord.currency === positiveRecord.currency ||
      (signedAmountMantissa(soldSystemRecord.amount) ?? 0n) <= 0n ||
      (signedAmountMantissa(boughtSystemRecord.amount) ?? 0n) >= 0n ||
      absoluteMantissa(negativeRecord.amount) !==
        absoluteMantissa(soldSystemRecord.amount) ||
      absoluteMantissa(positiveRecord.amount) !==
        absoluteMantissa(boughtSystemRecord.amount)
    ) {
      return undefined;
    }
    return {
      additionalRecords: [],
      entryType: "exchange",
      negativeRecord,
      positiveRecord,
      systemExchangeRecords: [soldSystemRecord, boughtSystemRecord],
    };
  }

  if (new Set(records.map((record) => record.currency)).size !== 1) {
    return undefined;
  }

  const flowRecords = records.filter(
    (record) => accountTypeForId(lookups, record.account_id) === "flow",
  );
  const balanceRecords = records.filter((record) =>
    isMovementAccountType(accountTypeForId(lookups, record.account_id)),
  );
  const negativeBalanceRecords = balanceRecords.filter(
    (record) => (signedAmountMantissa(record.amount) ?? 0n) < 0n,
  );
  const positiveBalanceRecords = balanceRecords.filter(
    (record) => (signedAmountMantissa(record.amount) ?? 0n) > 0n,
  );

  if (
    transaction.transaction_class === "spend" &&
    records.length === balanceRecords.length + flowRecords.length &&
    balanceRecords.length === 2 &&
    negativeBalanceRecords.length === 1 &&
    positiveBalanceRecords.length === 1 &&
    flowRecords.length === 1 &&
    (signedAmountMantissa(flowRecords[0]?.amount ?? "") ?? 0n) > 0n
  ) {
    return {
      additionalRecords: flowRecords,
      entryType: "transfer",
      negativeRecord: negativeBalanceRecords[0]!,
      positiveRecord: positiveBalanceRecords[0]!,
    };
  }

  if (
    transaction.transaction_class === "spend" &&
    records.length === balanceRecords.length + flowRecords.length &&
    balanceRecords.length === 1 &&
    negativeBalanceRecords.length === 1 &&
    isMovementAccountType(
      accountTypeForId(lookups, negativeBalanceRecords[0]!.account_id),
    ) &&
    flowRecords.length >= 1 &&
    flowRecords.every(
      (record) => (signedAmountMantissa(record.amount) ?? 0n) > 0n,
    )
  ) {
    const [positiveRecord, ...additionalRecords] = flowRecords;
    return positiveRecord
      ? {
          additionalRecords,
          entryType: "spend",
          negativeRecord: negativeBalanceRecords[0]!,
          positiveRecord,
        }
      : undefined;
  }

  if (
    records.length === 2 &&
    negativeRecords.length === 1 &&
    positiveRecords.length === 1 &&
    absoluteMantissa(negativeRecords[0]!.amount) ===
      absoluteMantissa(positiveRecords[0]!.amount)
  ) {
    const negativeRecord = negativeRecords[0]!;
    const positiveRecord = positiveRecords[0]!;
    const negativeType = accountTypeForId(lookups, negativeRecord.account_id);
    const positiveType = accountTypeForId(lookups, positiveRecord.account_id);
    const entryType =
      transaction.transaction_class === "income" &&
      negativeType === "flow" &&
      isMovementAccountType(positiveType)
        ? "income"
        : transaction.transaction_class === "refund" &&
            negativeType === "flow" &&
            isMovementAccountType(positiveType)
          ? "refund"
          : transaction.transaction_class === "transfer" &&
              isMovementAccountType(negativeType) &&
              isMovementAccountType(positiveType)
            ? "transfer"
            : undefined;
    if (entryType) {
      return {
        additionalRecords: [],
        entryType,
        negativeRecord,
        positiveRecord,
      };
    }
  }

  return undefined;
};

const tabDraftFromShorthandFit = (
  transaction: Transaction,
  fit: ShorthandFit,
): TransactionEntryTabDraft => {
  const categorizedRecord =
    fit.entryType === "spend" ? fit.positiveRecord : fit.negativeRecord;
  const common = {
    ...blankTabDraft(),
    amount:
      fit.entryType === "exchange"
        ? inputAmountFromRecord(fit.negativeRecord)
        : inputAmountFromRecord(fit.positiveRecord),
    categoryId: categorizedRecord.category_id ?? undefined,
    currency:
      fit.entryType === "exchange"
        ? fit.negativeRecord.currency
        : fit.positiveRecord.currency,
    date: transaction.initiated_date,
    memberId: shorthandMemberId(activeTransactionRecords(transaction)),
    memo: shorthandMemo(activeTransactionRecords(transaction)),
    tagIds: [...fit.positiveRecord.tag_ids],
  };

  switch (fit.entryType) {
    case "income":
      return {
        ...common,
        destinationAccountId: fit.positiveRecord.account_id,
        sourceAccountId: fit.negativeRecord.account_id,
      };
    case "refund":
      return {
        ...common,
        destinationAccountId: fit.positiveRecord.account_id,
        merchantAccountId: fit.negativeRecord.account_id,
      };
    case "spend":
      return {
        ...common,
        amount: "",
        categoryId: undefined,
        fundingAccountId: fit.negativeRecord.account_id,
        merchantAccountId: undefined,
        spendMerchants: [fit.positiveRecord, ...fit.additionalRecords].map(
          (record) => ({
            accountId: record.account_id,
            amount: inputAmountFromRecord(record),
            categoryId: record.category_id ?? undefined,
            draftId: newJournalRecordDraftId(),
            sourceRecordId: record.record_id,
          }),
        ),
      };
    case "transfer": {
      const chargeRecord = fit.additionalRecords[0];
      return {
        ...common,
        chargeAccountId: chargeRecord?.account_id,
        chargeAmount: chargeRecord ? inputAmountFromRecord(chargeRecord) : "",
        chargeCategoryId: chargeRecord?.category_id ?? undefined,
        chargeEnabled: Boolean(chargeRecord),
        destinationAccountId: fit.positiveRecord.account_id,
        sourceAccountId: fit.negativeRecord.account_id,
      };
    }
    case "exchange":
      return {
        ...common,
        boughtAccountId: fit.positiveRecord.account_id,
        boughtAmount: inputAmountFromRecord(fit.positiveRecord),
        boughtCurrency: fit.positiveRecord.currency,
        soldAccountId: fit.negativeRecord.account_id,
      };
  }
};

const launchDraftFromTransaction = (
  launch: EntryPanelLaunch,
  lookups: LedgerLookupsSnapshot,
): LaunchDraft => {
  if (launch.type === "edit" && launch.amountConflict) {
    const conflictedRecordIDs = new Set(launch.amountConflict.recordIds);
    const advanced = advancedDraftFromTransaction(launch.transaction);
    const baseline = {
      ...defaultDraft(),
      activeTab: "advanced" as const,
      advanced,
    };
    const hasRetainedConflictIdentity = advanced.records.some(
      (record) =>
        record.sourceRecordId !== undefined &&
        conflictedRecordIDs.has(record.sourceRecordId),
    );
    const fallbackSigns = new Set<"negative" | "positive">();
    return {
      baseline,
      draft: {
        ...defaultDraft(),
        activeTab: "advanced",
        advanced: {
          ...advanced,
          records: advanced.records.map((record) => {
            const sign = record.amount.startsWith("-")
              ? "negative"
              : "positive";
            const matchesRetainedIdentity =
              record.sourceRecordId !== undefined &&
              conflictedRecordIDs.has(record.sourceRecordId);
            const isFallbackMatch =
              !hasRetainedConflictIdentity && !fallbackSigns.has(sign);
            if (!matchesRetainedIdentity && !isFallbackMatch) {
              return record;
            }
            fallbackSigns.add(sign);
            return {
              ...record,
              amount: amountWithSign(launch.amountConflict!.amount, sign),
            };
          }),
        },
      },
      persistence: "launch",
      replacement: {
        restoreCancelledOnSave:
          launch.transaction.lifecycle_status === "cancelled",
        transaction: launch.transaction,
      },
    };
  }

  if (launch.type === "split") {
    return {
      draft: {
        ...defaultDraft(),
        activeTab: "advanced",
        advanced: splitDraftFromTransaction(launch.transaction),
      },
      persistence: "launch",
      replacement: {
        transaction: launch.transaction,
      },
    };
  }

  const fit = shorthandFitFromTransaction(launch.transaction, lookups);
  if (
    !fit ||
    (launch.type === "duplicate" &&
      !recordsHaveExactlyUniformShorthandFields(
        activeTransactionRecords(launch.transaction),
      ))
  ) {
    return {
      draft: {
        ...defaultDraft(),
        activeTab: "advanced",
        advanced:
          launch.type === "duplicate"
            ? advancedDuplicateDraftFromTransaction(launch.transaction)
            : advancedDraftFromTransaction(launch.transaction),
      },
      persistence: launch.type === "duplicate" ? "ordinary" : "launch",
      replacement:
        launch.type === "duplicate"
          ? undefined
          : {
              transaction: launch.transaction,
            },
    };
  }

  return {
    draft: {
      ...defaultDraft(),
      activeTab: fit.entryType,
      advanced:
        launch.type === "duplicate"
          ? advancedDuplicateDraftFromTransaction(launch.transaction)
          : advancedDraftFromTransaction(launch.transaction),
      tabs: {
        ...defaultDraft().tabs,
        [fit.entryType]: tabDraftFromShorthandFit(launch.transaction, fit),
      },
    },
    persistence: launch.type === "duplicate" ? "ordinary" : "launch",
    replacement:
      launch.type === "duplicate"
        ? undefined
        : {
            fit,
            transaction: launch.transaction,
          },
  };
};

const validCurrencyPattern = /^([A-Z]{3}|C::.+)$/;
const fieldErrorsFromAPI = (message: string): FieldErrors => {
  const lower = message.toLowerCase();
  if (lower.includes("exchange accounts must have two distinct currencies")) {
    return { boughtAccountId: message };
  }
  const pairs: readonly [FieldName, readonly string[]][] = [
    ["amount", ["amount"]],
    ["boughtAmount", ["bought_amount"]],
    ["boughtAccountId", ["bought_account_id"]],
    ["boughtCurrency", ["bought_currency"]],
    ["categoryId", ["category_id", "category"]],
    ["currency", ["currency"]],
    ["date", ["initiated_date", "date"]],
    ["destinationAccountId", ["destination_account_id", "destination"]],
    ["fundingAccountId", ["funding_account_id", "funding"]],
    ["memberId", ["member_id", "member"]],
    ["merchantAccountId", ["counterparty_account_id", "counterparty"]],
    ["memo", ["memo"]],
    ["sourceAccountId", ["source_account_id", "source"]],
    ["soldAccountId", ["sold_account_id"]],
    ["tagIds", ["tag_ids", "tag"]],
  ];
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
  lookups?: LedgerLookupsSnapshot,
): FieldErrors => {
  const config = tabConfigs[entryType];
  const errors: FieldErrors = {};
  if (!draft.date) {
    errors.date = "Date is required.";
  }
  if (entryType !== "spend" && !normalizeAmount(draft.amount)) {
    errors.amount = "Enter a positive amount with up to 8 decimals.";
  }
  if (entryType === "exchange" && !normalizeAmount(draft.boughtAmount)) {
    errors.boughtAmount = "Enter a positive amount with up to 8 decimals.";
  }
  const currency =
    entryType === "exchange"
      ? (accountCurrency(lookups, draft.soldAccountId) ??
        normalizeCurrency(draft.currency))
      : normalizeCurrency(draft.currency);
  if (!currency) {
    errors.currency = "Currency is required.";
  } else if (!validCurrencyPattern.test(currency)) {
    errors.currency = "Use a 3-letter code or C:: crypto code.";
  }
  const boughtCurrency =
    entryType === "exchange"
      ? (accountCurrency(lookups, draft.boughtAccountId) ??
        normalizeCurrency(draft.boughtCurrency))
      : normalizeCurrency(draft.boughtCurrency);
  if (entryType === "exchange" && !boughtCurrency) {
    errors.boughtCurrency = "Bought currency is required.";
  } else if (
    entryType === "exchange" &&
    boughtCurrency &&
    !validCurrencyPattern.test(boughtCurrency)
  ) {
    errors.boughtCurrency = "Use a 3-letter code or C:: crypto code.";
  }
  if (!draft[config.primaryAccountField]) {
    errors[config.primaryAccountField] =
      `${fieldLabel(config.primaryAccountField, entryType)} is required.`;
  }
  if (entryType !== "spend" && !draft[config.secondaryAccountField]) {
    errors[config.secondaryAccountField] =
      `${fieldLabel(config.secondaryAccountField, entryType)} is required.`;
  }
  if (
    entryType !== "spend" &&
    entryType !== "transfer" &&
    entryType !== "exchange" &&
    !draft.categoryId
  ) {
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
  const hasChargeInput =
    draft.chargeEnabled ||
    draft.chargeAccountId !== undefined ||
    Boolean(draft.chargeAmount.trim()) ||
    draft.chargeCategoryId !== undefined;
  if (entryType === "transfer" && hasChargeInput) {
    if (!draft.chargeAccountId) {
      errors.chargeAccountId = "Charge account is required.";
    }
    if (!normalizeAmount(draft.chargeAmount)) {
      errors.chargeAmount =
        "Enter a positive charge amount with up to 8 decimals.";
    }
    if (!draft.chargeCategoryId) {
      errors.chargeCategoryId = "Charge category is required.";
    }
  }
  if (
    entryType === "exchange" &&
    draft.soldAccountId &&
    draft.boughtAccountId &&
    draft.soldAccountId === draft.boughtAccountId
  ) {
    errors.boughtAccountId = "Choose a different destination account.";
  } else if (
    entryType === "exchange" &&
    draft.soldAccountId &&
    draft.boughtAccountId &&
    currency &&
    boughtCurrency &&
    (accountCurrency(lookups, draft.soldAccountId) ?? currency) ===
      (accountCurrency(lookups, draft.boughtAccountId) ?? boughtCurrency)
  ) {
    errors.boughtCurrency = "Sold and bought currencies must differ.";
  }
  return errors;
};

const fieldErrorForDraft = (
  draft: TransactionEntryTabDraft,
  entryType: ShorthandTransactionEntryType,
  field: FieldName,
  lookups?: LedgerLookupsSnapshot,
): string | undefined => validateDraft(draft, entryType, lookups)[field];

const hasErrors = (errors: FieldErrors): boolean =>
  Object.values(errors).some(Boolean);

const spendMerchantFieldErrors = (
  merchant: SpendMerchantDraft,
): Partial<Record<SpendMerchantFieldName, string>> => ({
  ...(!merchant.accountId
    ? { accountId: "Merchant account is required." }
    : {}),
  ...(!normalizeAmount(merchant.amount)
    ? { amount: "Enter a positive amount with up to 8 decimals." }
    : {}),
  ...(!merchant.categoryId ? { categoryId: "Category is required." } : {}),
});

const spendMerchantErrors = (
  merchants: readonly SpendMerchantDraft[],
): SpendMerchantFieldErrors =>
  Object.fromEntries(
    merchants
      .map(
        (merchant) =>
          [merchant.draftId, spendMerchantFieldErrors(merchant)] as const,
      )
      .filter(([, errors]) => Object.keys(errors).length > 0),
  );

const hasSpendMerchantErrors = (errors: SpendMerchantFieldErrors): boolean =>
  Object.keys(errors).length > 0;

const firstSpendMerchantErrorFieldID = (
  merchants: readonly SpendMerchantDraft[],
  errors: SpendMerchantFieldErrors,
): string | undefined => {
  for (const [index, merchant] of merchants.entries()) {
    const merchantErrors = errors[merchant.draftId];
    if (!merchantErrors) {
      continue;
    }
    const field = (["accountId", "amount", "categoryId"] as const).find(
      (candidate) => merchantErrors[candidate],
    );
    if (field) {
      const suffix = {
        accountId: "account",
        amount: "amount",
        categoryId: "category",
      }[field];
      return `spend-merchant-${index}-${suffix}`;
    }
  }
  return undefined;
};

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
  lookups?: LedgerLookupsSnapshot,
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
    if (row.sourceRecordId === undefined && row.source === "imported") {
      const externalID = row.sourceExternalId?.trim() ?? "";
      const externalSystem = row.sourceExternalSystem?.trim() ?? "";
      if (externalID && !externalSystem) {
        errors[advancedErrorKey(rowIndex, "externalSystem")] =
          "External system is required with an external ID.";
      }
      if (externalSystem && !externalID) {
        errors[advancedErrorKey(rowIndex, "externalId")] =
          "External ID is required with an external system.";
      }
      if (row.sourceExternalId && row.sourceExternalId !== externalID) {
        errors[advancedErrorKey(rowIndex, "externalId")] =
          "Remove surrounding whitespace.";
      }
      if (
        row.sourceExternalSystem &&
        row.sourceExternalSystem !== externalSystem
      ) {
        errors[advancedErrorKey(rowIndex, "externalSystem")] =
          "Remove surrounding whitespace.";
      }
    }
    if (
      isMovementAccountType(accountTypeForId(lookups, row.accountId)) &&
      row.pendingDateTime.trim() &&
      !settlementDateTimeToISO(row.pendingDateTime, row.sourcePendingDate)
    ) {
      errors[advancedErrorKey(rowIndex, "pendingDateTime")] =
        "Enter a valid local date and time.";
    }
    if (
      isMovementAccountType(accountTypeForId(lookups, row.accountId)) &&
      row.settlement === "posted" &&
      row.postedDateTime.trim() &&
      !settlementDateTimeToISO(row.postedDateTime, row.sourcePostedDate)
    ) {
      errors[advancedErrorKey(rowIndex, "postedDateTime")] =
        "Enter a valid local date and time.";
    }
  });
  if (draft.records.length < 2) {
    errors.records = "At least two records are required.";
  }
  return errors;
};

const hasAdvancedErrors = (errors: AdvancedFieldErrors): boolean =>
  Object.values(errors).some(Boolean);

const hasAdvancedSettlementDateErrors = (
  errors: AdvancedFieldErrors,
): boolean =>
  Object.keys(errors).some(
    (key) =>
      key.endsWith(":pendingDateTime") || key.endsWith(":postedDateTime"),
  );

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

const externalMetadataFromDraftRow = (
  row: JournalRecordRowDraft,
): Partial<
  Pick<CreateJournalRecordRequest, "external_id" | "external_system">
> => ({
  ...(row.sourceExternalId !== undefined
    ? { external_id: row.sourceExternalId }
    : {}),
  ...(row.sourceExternalSystem !== undefined
    ? { external_system: row.sourceExternalSystem }
    : {}),
});

const amountUsdFromDraftRow = (
  row: JournalRecordRowDraft,
): Pick<UpdateTransactionRequest["records"][number], "amount_usd"> => {
  if (row.sourceAmountUsd === undefined || !row.sourceAmount) {
    return {};
  }
  if (
    signedAmountMantissa(row.amount) !== signedAmountMantissa(row.sourceAmount)
  ) {
    return {};
  }
  if (
    !row.sourceCurrency ||
    normalizeCurrency(row.currency) !== normalizeCurrency(row.sourceCurrency)
  ) {
    return {};
  }
  return { amount_usd: row.sourceAmountUsd };
};

const amountUsdFromJournalRecord = (
  record: JournalRecord,
  amount: string,
  currency: string,
): Pick<UpdateTransactionRequest["records"][number], "amount_usd"> => {
  if (signedAmountMantissa(amount) !== signedAmountMantissa(record.amount)) {
    return {};
  }
  if (normalizeCurrency(currency) !== normalizeCurrency(record.currency)) {
    return {};
  }
  return { amount_usd: record.amount_usd };
};

const updateRecordFromDraftRow = (
  row: JournalRecordRowDraft,
  lookups: LedgerLookupsSnapshot | undefined,
): UpdateTransactionRequest["records"][number] => {
  const amount = normalizeSignedAmount(row.amount)!;
  const currency = normalizeCurrency(row.currency);
  const movementAccount = isMovementAccountType(
    accountTypeForId(lookups, row.accountId),
  );
  const pendingDate = movementAccount
    ? settlementDateTimeToISO(row.pendingDateTime, row.sourcePendingDate)
    : undefined;
  const postedDate =
    movementAccount && row.settlement === "posted"
      ? settlementDateTimeToISO(row.postedDateTime, row.sourcePostedDate)
      : undefined;
  const common = {
    account_id: row.accountId!,
    amount,
    category_id: row.categoryId ?? null,
    currency,
    ...amountUsdFromDraftRow(row),
    member_id: row.memberId ?? null,
    memo: row.memo.trim() ? row.memo.trim() : null,
    settlement: movementAccount
      ? {
          ...(pendingDate ? { pending_date: pendingDate } : {}),
          ...(postedDate ? { posted_date: postedDate } : {}),
          status: row.settlement,
        }
      : null,
    reconciliation_status: row.reconciliationStatus,
    tag_ids: [...row.tagIds],
  };
  if (row.sourceRecordId !== undefined) {
    return { ...common, record_id: row.sourceRecordId };
  }
  return {
    ...common,
    ...externalMetadataFromDraftRow(row),
    source: row.source,
  };
};

const updateBodyFromAdvancedDraft = (
  draft: AdvancedTransactionEntryDraft,
  lookups: LedgerLookupsSnapshot | undefined,
): UpdateTransactionRequest => ({
  initiated_date: draft.date,
  records: draft.records.map((row) => updateRecordFromDraftRow(row, lookups)),
});

const transactionRecordIDs = (transaction: Transaction): readonly number[] =>
  activeTransactionRecords(transaction).map((record) => record.record_id);

const advancedDraftRebasedOnWinner = (
  draft: AdvancedTransactionEntryDraft,
  winner: Transaction,
): AdvancedTransactionEntryDraft => {
  const winnerByID = new Map(
    activeTransactionRecords(winner).map((record) => [
      record.record_id,
      record,
    ]),
  );
  const locallyRetainedIDs = new Set(
    draft.records.flatMap((record) =>
      record.sourceRecordId === undefined ? [] : [record.sourceRecordId],
    ),
  );
  const records = draft.records.map((record): JournalRecordRowDraft => {
    const winningRecord =
      record.sourceRecordId === undefined
        ? undefined
        : winnerByID.get(record.sourceRecordId);
    return {
      ...record,
      source: winningRecord
        ? writableRecordSource(winningRecord)
        : record.sourceRecordId !== undefined
          ? "manual"
          : record.source,
      sourceAmount: winningRecord
        ? winningRecord.amount
        : record.sourceRecordId !== undefined
          ? undefined
          : record.sourceAmount,
      sourceAmountUsd: winningRecord
        ? winningRecord.amount_usd
        : record.sourceRecordId !== undefined
          ? undefined
          : record.sourceAmountUsd,
      sourceCurrency: winningRecord
        ? winningRecord.currency
        : record.sourceRecordId !== undefined
          ? undefined
          : record.sourceCurrency,
      sourceExternalId: winningRecord
        ? winningRecord.external_id
        : record.sourceRecordId !== undefined
          ? undefined
          : record.sourceExternalId,
      sourceExternalSystem: winningRecord
        ? winningRecord.external_system
        : record.sourceRecordId !== undefined
          ? undefined
          : record.sourceExternalSystem,
      sourceRecordId: winningRecord?.record_id,
    };
  });

  for (const record of activeTransactionRecords(winner)) {
    if (
      record.source === "imported" &&
      !locallyRetainedIDs.has(record.record_id)
    ) {
      records.push(recordRowDraftFromJournalRecord(record));
    }
  }

  return { ...draft, records };
};

const updateRecordFromShorthandDraft = (
  record: JournalRecord,
  draft: TransactionEntryTabDraft,
  accountId: number,
  amountSign: "negative" | "positive",
  categoryId: number | undefined,
  rawAmount = draft.amount,
  currency = draft.currency,
  preserveOriginalMember = false,
  preserveOriginalMemo = false,
): UpdateTransactionRequest["records"][number] => {
  const amount = amountWithSign(
    normalizeAmount(rawAmount) ?? rawAmount,
    amountSign,
  );
  const normalizedCurrency = normalizeCurrency(currency);
  return {
    account_id: accountId,
    amount,
    category_id: categoryId ?? null,
    currency: normalizedCurrency,
    ...amountUsdFromJournalRecord(record, amount, normalizedCurrency),
    member_id: preserveOriginalMember
      ? (record.member_id ?? null)
      : (draft.memberId ?? null),
    memo: preserveOriginalMemo
      ? (record.memo ?? null)
      : draft.memo.trim()
        ? draft.memo.trim()
        : null,
    settlement: record.settlement
      ? {
          pending_date: record.pending_date,
          posted_date: record.posted_date,
          status: record.settlement,
        }
      : null,
    reconciliation_status: record.reconciliation_status,
    record_id: record.record_id,
    tag_ids: [...draft.tagIds],
  };
};

const addedRecordFromShorthandDraft = (
  record: JournalRecord,
  draft: TransactionEntryTabDraft,
  accountId: number,
  amount: string,
  categoryId: number,
  preserveOriginalMember = false,
  preserveOriginalMemo = false,
): UpdateTransactionRequest["records"][number] => ({
  account_id: accountId,
  amount,
  category_id: categoryId,
  currency: normalizeCurrency(draft.currency),
  member_id: preserveOriginalMember
    ? (record.member_id ?? null)
    : (draft.memberId ?? null),
  memo: preserveOriginalMemo
    ? (record.memo ?? null)
    : draft.memo.trim()
      ? draft.memo.trim()
      : null,
  settlement: null,
  reconciliation_status: record.reconciliation_status,
  source: "manual",
  tag_ids: [...draft.tagIds],
});

const updateBodyFromShorthandDraft = (
  draft: TransactionEntryTabDraft,
  fit: ShorthandFit,
  lookups: LedgerLookupsSnapshot | undefined,
): UpdateTransactionRequest => {
  const amount = normalizeAmount(draft.amount) ?? draft.amount;
  const originalRecords = [
    fit.negativeRecord,
    fit.positiveRecord,
    ...fit.additionalRecords,
    ...(fit.systemExchangeRecords ?? []),
  ];
  const preserveOriginalMember =
    draft.memberId === shorthandMemberId(originalRecords);
  const preserveOriginalMemo =
    normalizeMemo(draft.memo) === shorthandMemo(originalRecords);
  if (fit.entryType === "exchange" && fit.systemExchangeRecords) {
    const boughtAmount =
      normalizeAmount(draft.boughtAmount) ?? draft.boughtAmount;
    const soldCurrency =
      accountCurrency(lookups, draft.soldAccountId) ?? draft.currency;
    const boughtCurrency =
      accountCurrency(lookups, draft.boughtAccountId) ?? draft.boughtCurrency;
    const [soldSystemRecord, boughtSystemRecord] = fit.systemExchangeRecords;
    return {
      initiated_date: draft.date,
      records: [
        updateRecordFromShorthandDraft(
          fit.negativeRecord,
          draft,
          draft.soldAccountId!,
          "negative",
          undefined,
          amount,
          soldCurrency,
          preserveOriginalMember,
          preserveOriginalMemo,
        ),
        updateRecordFromShorthandDraft(
          soldSystemRecord,
          draft,
          soldSystemRecord.account_id,
          "positive",
          undefined,
          amount,
          soldCurrency,
          preserveOriginalMember,
          preserveOriginalMemo,
        ),
        updateRecordFromShorthandDraft(
          boughtSystemRecord,
          draft,
          boughtSystemRecord.account_id,
          "negative",
          undefined,
          boughtAmount,
          boughtCurrency,
          preserveOriginalMember,
          preserveOriginalMemo,
        ),
        updateRecordFromShorthandDraft(
          fit.positiveRecord,
          draft,
          draft.boughtAccountId!,
          "positive",
          undefined,
          boughtAmount,
          boughtCurrency,
          preserveOriginalMember,
          preserveOriginalMemo,
        ),
      ],
    };
  }
  const spendTotal = draft.spendMerchants.reduce(
    (total, merchant) =>
      total +
      (signedAmountMantissa(normalizeAmount(merchant.amount) ?? "") ?? 0n),
    0n,
  );
  const chargeAmount = normalizeAmount(draft.chargeAmount);
  const negativeAmount =
    fit.entryType === "spend"
      ? formatMantissa(spendTotal)
      : fit.entryType === "transfer" && chargeAmount
        ? formatMantissa(
            (signedAmountMantissa(amount) ?? 0n) +
              (signedAmountMantissa(chargeAmount) ?? 0n),
          )
        : amount;
  const negativeDraft = { ...draft, amount: negativeAmount };
  const negativeAccountId =
    fit.entryType === "spend"
      ? draft.fundingAccountId!
      : fit.entryType === "transfer"
        ? draft.sourceAccountId!
        : fit.entryType === "income"
          ? draft.sourceAccountId!
          : draft.merchantAccountId!;
  const positiveAccountId = draft.destinationAccountId!;
  const primarySpendMerchant = draft.spendMerchants[0];
  const originalSpendRecords = [fit.positiveRecord, ...fit.additionalRecords];

  const records: UpdateTransactionRequest["records"] = [
    updateRecordFromShorthandDraft(
      fit.negativeRecord,
      negativeDraft,
      negativeAccountId,
      "negative",
      fit.entryType === "income" || fit.entryType === "refund"
        ? draft.categoryId
        : undefined,
      negativeDraft.amount,
      negativeDraft.currency,
      preserveOriginalMember,
      preserveOriginalMemo,
    ),
    ...(fit.entryType === "spend" && primarySpendMerchant
      ? draft.spendMerchants.map((merchant) => {
          const originalRecord = originalSpendRecords.find(
            (record) => record.record_id === merchant.sourceRecordId,
          );
          return originalRecord
            ? updateRecordFromShorthandDraft(
                originalRecord,
                draft,
                merchant.accountId!,
                "positive",
                merchant.categoryId,
                merchant.amount,
                draft.currency,
                preserveOriginalMember,
                preserveOriginalMemo,
              )
            : addedRecordFromShorthandDraft(
                fit.positiveRecord,
                draft,
                merchant.accountId!,
                normalizeAmount(merchant.amount)!,
                merchant.categoryId!,
                preserveOriginalMember,
                preserveOriginalMemo,
              );
        })
      : [
          updateRecordFromShorthandDraft(
            fit.positiveRecord,
            draft,
            positiveAccountId,
            "positive",
            undefined,
            draft.amount,
            draft.currency,
            preserveOriginalMember,
            preserveOriginalMemo,
          ),
        ]),
    ...(fit.entryType === "transfer" &&
    chargeAmount &&
    draft.chargeAccountId &&
    draft.chargeCategoryId
      ? [
          fit.additionalRecords[0]
            ? updateRecordFromShorthandDraft(
                fit.additionalRecords[0],
                draft,
                draft.chargeAccountId,
                "positive",
                draft.chargeCategoryId,
                chargeAmount,
                draft.currency,
                preserveOriginalMember,
                preserveOriginalMemo,
              )
            : addedRecordFromShorthandDraft(
                fit.positiveRecord,
                draft,
                draft.chargeAccountId,
                chargeAmount,
                draft.chargeCategoryId,
                preserveOriginalMember,
                preserveOriginalMemo,
              ),
        ]
      : []),
  ];
  if (
    preserveOriginalMember &&
    draft.memberId !== undefined &&
    records.every((record) => record.member_id === null)
  ) {
    records[0] = { ...records[0]!, member_id: draft.memberId };
  }
  const normalizedMemo = normalizeMemo(draft.memo);
  if (
    preserveOriginalMemo &&
    normalizedMemo &&
    records.every((record) => record.memo === null)
  ) {
    records[0] = { ...records[0]!, memo: normalizedMemo };
  }

  return {
    initiated_date: draft.date,
    records,
  };
};

const advancedFieldErrorsFromAPI = (message: string): AdvancedFieldErrors => {
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
      ["externalId", ["external_id", "external id"]],
      ["externalSystem", ["external_system", "external system"]],
      ["memberId", ["member_id", "member"]],
      ["memo", ["memo"]],
      ["postedDateTime", ["posted_date", "posted date"]],
      ["pendingDateTime", ["pending_date", "pending date"]],
      ["settlement", ["settlement"]],
      ["reconciliationStatus", ["reconciliation_status", "reconciliation"]],
      ["tagIds", ["tag_ids", "tag"]],
    ];

  if (rowIndex === undefined || Number.isNaN(rowIndex)) {
    if (lower.includes("initiated_date") || lower.includes("initiated date")) {
      return { date: message };
    }
    return {};
  }

  for (const [field, matches] of fieldMatches) {
    if (matches.some((match) => lower.includes(match))) {
      return { [advancedErrorKey(rowIndex, field)]: message };
    }
  }
  return { [advancedErrorKey(rowIndex, "amount")]: message };
};

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? (
    <p className="text-destructive text-xs" data-entry-field-error role="alert">
      {message}
    </p>
  ) : null;

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

const classificationDisplayAmounts = (
  classification: TransactionClassification,
) =>
  classification.primary_amounts.length > 0
    ? [
        ...classification.primary_amounts,
        ...classification.shapes
          .filter((shape) => shape.shape === "transfer")
          .flatMap((shape) => shape.amounts),
      ]
    : classification.shapes.flatMap((shape) => shape.amounts);

const ClassificationPreview = ({
  classification,
  error,
}: {
  readonly classification: TransactionClassification | undefined;
  readonly error: string | undefined;
}) => (
  <div
    data-testid="classification-preview"
    className="border-2 border-[var(--border-ink)] bg-[var(--band)] p-2"
  >
    <p className="font-heading text-xs font-semibold uppercase">
      Server classification
    </p>
    {classification ? (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <ClassBadge transactionClass={classification.transaction_class} />
        <span className="font-mono text-xs">
          {classification.shapes
            .map((shape) => accountingWordLabel(shape.shape))
            .join(" + ")}
        </span>
        {classificationDisplayAmounts(classification).map((amount, index) => (
          <AmountText
            key={`${displayAmountKey(amount)}:${index}`}
            amount={amount}
            positiveSign={
              classification.transaction_class !== "transfer" &&
              classification.transaction_class !== "currency_exchange"
            }
            transactionClass={classification.transaction_class}
          />
        ))}
        {classification.shapes.flatMap((shape) =>
          shape.effective_rate
            ? [
                <span
                  key={`${shape.effective_rate.sold_currency}:${shape.effective_rate.bought_currency}`}
                  className="font-mono text-xs"
                >
                  1 {shape.effective_rate.bought_currency} ={" "}
                  {shape.effective_rate.rate}{" "}
                  {shape.effective_rate.sold_currency}
                </span>,
              ]
            : [],
        )}
      </div>
    ) : (
      <p
        className={
          error
            ? "text-destructive mt-1 text-xs"
            : "text-muted-foreground mt-1 text-xs"
        }
      >
        {error ?? "Complete valid records to preview their derived semantics."}
      </p>
    )}
  </div>
);

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
    ...(entryType === "spend" ? blankSpendTabDraft() : blankTabDraft()),
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
        spendMerchants: [
          {
            ...blankSpendMerchantDraft(),
            accountId: draft.spendMerchants[0]?.accountId,
          },
        ],
      };
    case "transfer":
      return {
        ...nextDraft,
        destinationAccountId: draft.destinationAccountId,
        sourceAccountId: draft.sourceAccountId,
      };
    case "exchange":
      return {
        ...nextDraft,
        boughtAccountId: draft.boughtAccountId,
        boughtCurrency: draft.boughtCurrency,
        currency: draft.currency,
        soldAccountId: draft.soldAccountId,
      };
  }
};

const stickyNextAdvancedDraft = (
  draft: AdvancedTransactionEntryDraft,
  resetPendingSettlement = false,
): AdvancedTransactionEntryDraft => ({
  date: draft.date,
  records:
    draft.records.length >= 2
      ? draft.records.map((row) => ({
          ...blankRecordRowDraft(),
          accountId: row.accountId,
          categoryId: row.categoryId,
          currency: normalizeCurrency(row.currency) || "USD",
          settlement: resetPendingSettlement ? "posted" : row.settlement,
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

const visibleMember = (member: Member): boolean =>
  !member.is_hidden && !member.tombstoned_at;

const visibleTag = (tag: Tag): boolean => !tag.is_hidden && !tag.tombstoned_at;

const mergeLookupEntities = <Entity,>(
  current: readonly Entity[],
  additions: readonly Entity[],
  idFor: (entity: Entity) => number,
): readonly Entity[] => {
  const merged = new Map(
    current.map((entity) => [idFor(entity), entity] as const),
  );
  for (const addition of additions) {
    merged.set(idFor(addition), addition);
  }
  return [...merged.values()];
};

const EntryRailRow = ({
  editable,
  maps,
  transaction,
}: {
  readonly editable: boolean;
  readonly maps: Pick<LookupMaps, "accountsById">;
  readonly transaction: Transaction;
}) => {
  const amounts = lineDisplayAmounts(transaction);
  const hasMoreParts = transactionHasMoreParts(transaction);
  const partsDescription = hasMoreParts
    ? moreTransactionPartsLabel(transaction)
    : undefined;
  const displayTitleContext = transactionAccountFqnContext(transaction, maps);
  const content = (
    <>
      <span className="text-muted-foreground shrink-0">
        {formatInitiatedDate(transaction.initiated_date)}
      </span>
      <ClassIcon
        transactionClass={transaction.transaction_class}
        className="size-4 shrink-0"
        focusable={false}
      />
      <Tooltip
        label={displayTitleContext}
        className="min-w-0 flex-1"
        focusable={false}
        triggerLabel={
          editable ? undefined : `Recent transaction ${displayTitleContext}`
        }
      >
        <span className="block truncate">{transaction.display_title}</span>
      </Tooltip>
      {amounts.length > 0 ? (
        <span className="flex shrink-0 items-center gap-1">
          {amounts.map((amount, index) => (
            <AmountText
              key={`${displayAmountKey(amount)}:${index}`}
              amount={amount}
              chip
              positiveSign={
                transaction.transaction_class !== "transfer" &&
                transaction.transaction_class !== "currency_exchange"
              }
              tone="neutral"
              className="text-xs"
            />
          ))}
        </span>
      ) : null}
      {hasMoreParts ? <MorePartsIndicator transaction={transaction} /> : null}
    </>
  );

  return editable ? (
    <button
      type="button"
      tabIndex={-1}
      className="session-tick flex w-full items-center gap-1 border-l-2 border-[var(--color-class-adjustment-ink)] bg-[var(--band)] px-2 py-1 text-left font-mono text-xs hover:bg-[var(--color-interactive-bright)]"
      aria-label={`Edit saved transaction ${displayTitleContext}${
        partsDescription ? `. ${partsDescription}` : ""
      }`}
      onClick={() => {
        openTransactionEntryLaunch(
          { transaction, type: "edit" },
          captureTransactionEntryLaunchContext(),
        );
      }}
    >
      {content}
    </button>
  ) : (
    <div
      aria-label={
        partsDescription
          ? `Recent transaction ${displayTitleContext}. ${partsDescription}`
          : undefined
      }
      className="flex items-center gap-1 px-2 py-1 font-mono text-xs"
      role={partsDescription ? "group" : undefined}
    >
      {content}
    </div>
  );
};

export const EntryPanel = ({
  closeRequestRef,
  initialTab,
  initialTemplateId,
  launch,
  lookups: lookupSnapshot,
  onClose,
  onSaved,
  open,
  recentTransactions = [],
}: EntryPanelProps) => {
  const [draft, setDraft] = useState<TransactionEntryDraft>(defaultDraft);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [merchantFieldErrors, setMerchantFieldErrors] =
    useState<SpendMerchantFieldErrors>({});
  const [advancedFieldErrors, setAdvancedFieldErrors] =
    useState<AdvancedFieldErrors>({});
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [classification, setClassification] = useState<
    TransactionClassification | undefined
  >();
  const [classificationError, setClassificationError] = useState<
    string | undefined
  >();
  const [exchangeRate, setExchangeRate] = useState<string | undefined>();
  const [exchangeRateError, setExchangeRateError] = useState<
    string | undefined
  >();
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelledConflictSavePending, setCancelledConflictSavePending] =
    useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionTransactions, setSessionTransactions] = useState<
    readonly Transaction[]
  >([]);
  const [categoryRetryToken, setCategoryRetryToken] = useState(0);
  const appliedInitialTemplateRef = useRef<number | undefined>(undefined);
  const [replacement, setReplacement] = useState<
    ReplacementContext | undefined
  >();
  const [replacementRefreshRequired, setReplacementRefreshRequired] =
    useState(false);
  const templatesResource = useTransactionTemplatesResource(
    open && !replacement,
  );
  const templatesColdLoading =
    templatesResource.loading && !templatesResource.snapshot;
  const templates = useMemo(
    () => templatesResource.snapshot?.templates ?? [],
    [templatesResource.snapshot],
  );
  const [pendingLaunchDraft, setPendingLaunchDraft] = useState<
    PendingLaunchDraft | undefined
  >();
  const [initializedLaunchKey, setInitializedLaunchKey] = useState<
    string | undefined
  >();
  const [initializedLaunch, setInitializedLaunch] = useState<
    EntryPanelLaunch | undefined
  >();
  const [draftPersistence, setDraftPersistence] =
    useState<DraftPersistenceMode>("ordinary");
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);
  const [discardingPendingLaunch, setDiscardingPendingLaunch] = useState(false);
  const [pendingTemplateApplication, setPendingTemplateApplication] = useState<{
    readonly targetTab: TransactionEntryType;
    readonly template: TransactionTemplate;
  }>();
  const [confirmTemplateReplaceOpen, setConfirmTemplateReplaceOpen] =
    useState(false);
  const [confirmClearDraftOpen, setConfirmClearDraftOpen] = useState(false);
  const [clearingDraft, setClearingDraft] = useState(false);
  const [clearDraftError, setClearDraftError] = useState<string>();
  const [confirmCloseDiscardOpen, setConfirmCloseDiscardOpen] = useState(false);
  const [discardingConflictedEdit, setDiscardingConflictedEdit] =
    useState(false);
  const [attentionErrorCount, setAttentionErrorCount] = useState(0);
  const [inlineCreatedLookups, setInlineCreatedLookups] = useState<{
    readonly accounts: readonly Account[];
    readonly categories: readonly Category[];
    readonly tags: readonly Tag[];
  }>({ accounts: [], categories: [], tags: [] });
  const [pickerLifecycle, setPickerLifecycle] = useState(0);
  const [templatePickerOpenOnFocus, setTemplatePickerOpenOnFocus] =
    useState(true);
  const [
    advancedSettlementDatesLaunchKey,
    setAdvancedSettlementDatesLaunchKey,
  ] = useState<string>();
  const lookups = useMemo<LedgerLookupsSnapshot | undefined>(() => {
    if (!lookupSnapshot) {
      return undefined;
    }
    return {
      ...lookupSnapshot,
      accounts: mergeLookupEntities(
        lookupSnapshot.accounts,
        inlineCreatedLookups.accounts,
        (account) => account.account_id,
      ),
      categories: mergeLookupEntities(
        lookupSnapshot.categories,
        inlineCreatedLookups.categories,
        (category) => category.category_id,
      ),
      tags: mergeLookupEntities(
        lookupSnapshot.tags,
        inlineCreatedLookups.tags,
        (tag) => tag.tag_id,
      ),
    };
  }, [inlineCreatedLookups, lookupSnapshot]);
  const lookupMaps = useMemo(() => buildLookupMaps(lookups), [lookups]);
  const latestSessionTransaction = sessionTransactions[0];
  const latestSessionTransactionContext = latestSessionTransaction
    ? transactionAccountFqnContext(latestSessionTransaction, lookupMaps)
    : undefined;
  const entryPanelRef = useRef<HTMLElement>(null);
  const entryScrollRegionRef = useRef<HTMLDivElement>(null);
  const addChargeButtonRef = useRef<HTMLButtonElement>(null);
  const addAdvancedRecordButtonRef = useRef<HTMLButtonElement>(null);
  const advancedRemoveButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const addMerchantButtonRef = useRef<HTMLButtonElement>(null);
  const clearDraftButtonRef = useRef<HTMLButtonElement>(null);
  const merchantRemoveButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const rememberedActiveTabRef = useRef<TransactionEntryType>("spend");
  const initialTabOverrideRef = useRef<TransactionEntryType | undefined>(
    undefined,
  );
  const userSelectedActiveTabRef = useRef(false);
  const initializedLaunchKeyRef = useRef<string | undefined>(undefined);
  const initializedLaunchRef = useRef<EntryPanelLaunch | undefined>(undefined);
  const wasOpenRef = useRef(open);
  const latestLookupsRef = useRef<LedgerLookupsSnapshot | undefined>(lookups);
  const latestDraftRef = useRef(draft);
  const latestDraftPersistenceRef = useRef(draftPersistence);
  const latestReplacementRef = useRef(replacement);
  const launchDraftBaselineRef = useRef<TransactionEntryDraft | undefined>(
    undefined,
  );
  const ordinaryDraftBaselineRef = useRef<TransactionEntryDraft | undefined>(
    undefined,
  );
  const ordinaryBaselineMustPersistRef = useRef(false);
  const ordinaryDraftStoredRef = useRef(false);
  const lastStoredDraftFingerprintRef = useRef<string | undefined>(undefined);
  const templateFocusDeferredRef = useRef(false);
  const cancelledConflictSavePendingRef = useRef(false);
  const preserveFocusOnReplacementChangeRef = useRef(false);

  const publishRefreshedReplacement = useCallback(() => {
    if (
      !replacement ||
      !launch ||
      (!replacementRefreshRequired &&
        replacement.transaction.etag === launch.transaction.etag)
    ) {
      return undefined;
    }
    return onSaved(replacement.transaction, {
      operation: "refreshed",
      previousTransactions: [launch.transaction],
    });
  }, [launch, onSaved, replacement, replacementRefreshRequired]);

  const focusTemplatePicker = useCallback(() => {
    setTemplatePickerOpenOnFocus(false);
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(document.getElementById("entry-template"), {
        preventScroll: true,
      });
      setTemplatePickerOpenOnFocus(true);
    });
  }, []);

  const requestClose = useCallback(() => {
    if (cancelledConflictSavePendingRef.current) {
      return;
    }
    const modifiedReplacement =
      replacement !== undefined &&
      launchDraftBaselineRef.current !== undefined &&
      JSON.stringify(draft) !== JSON.stringify(launchDraftBaselineRef.current);
    if (modifiedReplacement) {
      setConfirmCloseDiscardOpen(true);
      return;
    }
    const refreshedReplacement = publishRefreshedReplacement();
    if (refreshedReplacement) {
      void refreshedReplacement.finally(onClose);
      return;
    }
    onClose();
  }, [draft, onClose, publishRefreshedReplacement, replacement]);

  useEffect(() => {
    if (!closeRequestRef) {
      return;
    }
    closeRequestRef.current = requestClose;
    return () => {
      closeRequestRef.current = null;
    };
  }, [closeRequestRef, requestClose]);

  useEffect(() => {
    latestLookupsRef.current = lookups;
  }, [lookups]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSessionCount(0);
      setSessionTransactions([]);
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    latestDraftRef.current = draft;
    latestDraftPersistenceRef.current = draftPersistence;
    latestReplacementRef.current = replacement;
  }, [draft, draftPersistence, replacement]);

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
  const activeCategoryCreationIntent = activeConfig?.categoryIntents[0];
  const availableTemplates = useMemo(
    () =>
      activeTab === "advanced"
        ? templates
        : activeTab === "exchange"
          ? []
          : templates.filter((template) =>
              template.compatible_shorthands.includes(activeTab),
            ),
    [activeTab, templates],
  );
  const templateOptions = useMemo<readonly EntityOption[]>(
    () =>
      availableTemplates.map((template) => ({
        detail: template.fqn,
        id: template.transaction_template_id,
        label: template.name,
        searchLabel: template.fqn,
      })),
    [availableTemplates],
  );
  const launchKey = launch
    ? `${launch.type}:${launch.transaction.transaction_id}`
    : `create:${initialTab ?? "remembered"}`;
  const editorSessionRef = useRef({ generation: 0 });
  useLayoutEffect(() => {
    editorSessionRef.current = {
      generation: editorSessionRef.current.generation + 1,
    };
  }, [launchKey, open]);
  const advancedSettlementDatesToggled =
    advancedSettlementDatesLaunchKey === launchKey;
  const launchLookupsReady = Boolean(lookups);
  const currentDraftReady =
    draftReady &&
    launchLookupsReady &&
    initializedLaunchKey === launchKey &&
    (launch === undefined || initializedLaunch === launch);
  const categoryPicker = useCategoryPickerCategoriesResource(
    activeConfig?.categoryIntents ?? [],
    open &&
      currentDraftReady &&
      activeTab !== "advanced" &&
      Boolean(activeConfig?.categoryIntents.length),
    categoryRetryToken,
  );

  const cancelPendingLaunch = useCallback(() => {
    setConfirmDiscardDraftOpen(false);
    setPendingLaunchDraft(undefined);
    openTransactionEntryPanel(
      undefined,
      captureTransactionEntryLaunchContext(),
    );
    window.requestAnimationFrame(() => {
      dateInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const discardPendingLaunch = useCallback(async () => {
    if (!pendingLaunchDraft || discardingPendingLaunch) {
      return;
    }
    setDiscardingPendingLaunch(true);
    if (pendingLaunchDraft.discardOrdinaryDraft) {
      ordinaryDraftStoredRef.current = false;
      lastStoredDraftFingerprintRef.current = undefined;
      await waitForStoredTransactionEntryDraftDiscard(
        ordinaryDraftBaselineRef.current,
      );
    }
    if (pendingLaunchDraft.persistence === "ordinary") {
      ordinaryDraftBaselineRef.current = pendingLaunchDraft.draft;
      ordinaryBaselineMustPersistRef.current = false;
      ordinaryDraftStoredRef.current = false;
    }
    setPickerLifecycle((current) => current + 1);
    setDraft(pendingLaunchDraft.draft);
    setReplacement(pendingLaunchDraft.replacement);
    setDraftPersistence(pendingLaunchDraft.persistence);
    launchDraftBaselineRef.current =
      pendingLaunchDraft.persistence === "launch"
        ? (pendingLaunchDraft.baseline ?? pendingLaunchDraft.draft)
        : undefined;
    setPendingLaunchDraft(undefined);
    setConfirmDiscardDraftOpen(false);
    setFieldErrors({});
    setAdvancedFieldErrors({});
    setGeneralError(undefined);
    setDiscardingPendingLaunch(false);
  }, [discardingPendingLaunch, pendingLaunchDraft]);

  useEffect(() => {
    if (!open) {
      initializedLaunchKeyRef.current = undefined;
      initializedLaunchRef.current = undefined;
      window.queueMicrotask(() => {
        setInitializedLaunchKey(undefined);
        setInitializedLaunch(undefined);
      });
      return;
    }
    if (
      initializedLaunchKeyRef.current === launchKey &&
      (launch === undefined || initializedLaunchRef.current === launch)
    ) {
      return;
    }
    if (!launchLookupsReady) {
      return;
    }

    initializedLaunchKeyRef.current = launchKey;
    initializedLaunchRef.current = launch;
    let active = true;
    void readTransactionEntryDraft().then((storedDraft) => {
      if (active) {
        const storedEnvelope =
          storedDraft && "draft" in storedDraft && "baseline" in storedDraft
            ? storedDraft
            : undefined;
        const legacyStoredDraft =
          storedDraft && !("draft" in storedDraft) ? storedDraft : undefined;
        const migratedDraft = migrateStoredDraft(
          storedEnvelope?.draft ?? legacyStoredDraft,
        );
        const ordinaryBaseline = storedEnvelope
          ? migrateStoredDraft(storedEnvelope.baseline)
          : legacyDraftBaseline(migratedDraft);
        const ordinaryBaselineMustPersist =
          storedEnvelope?.persistBaseline ?? false;
        const launchDraft = launch
          ? launchDraftFromTransaction(launch, latestLookupsRef.current!)
          : undefined;
        const rememberedActiveTab =
          storedDraft === undefined
            ? getUiPreferencesSnapshot().transactionEntryActiveTab
            : migratedDraft.activeTab;
        const launchInitialTab =
          initialTemplateId === undefined ? initialTab : undefined;
        const ordinaryDraft = launchInitialTab
          ? {
              ...migratedDraft,
              activeTab: launchInitialTab,
            }
          : {
              ...migratedDraft,
              activeTab: rememberedActiveTab,
            };
        const nextDraft = launchDraft ?? {
          draft: ordinaryDraft,
          persistence: "ordinary" as const,
        };
        rememberedActiveTabRef.current = rememberedActiveTab;
        initialTabOverrideRef.current = launchDraft
          ? undefined
          : launchInitialTab;
        userSelectedActiveTabRef.current = false;
        setPendingLaunchDraft(undefined);
        setConfirmDiscardDraftOpen(false);
        const inFlightLaunchChanged =
          latestDraftPersistenceRef.current === "launch" &&
          launchDraftBaselineRef.current !== undefined &&
          JSON.stringify(latestDraftRef.current) !==
            JSON.stringify(launchDraftBaselineRef.current);
        const ordinaryDraftHasUserInput = draftHasUserInput(
          migratedDraft,
          ordinaryBaseline,
        );
        const existingOrdinaryDraftWouldBeDiscarded =
          Boolean(launchDraft) && ordinaryDraftHasUserInput;
        ordinaryDraftBaselineRef.current = ordinaryBaseline;
        ordinaryBaselineMustPersistRef.current = ordinaryBaselineMustPersist;
        ordinaryDraftStoredRef.current = storedDraft !== undefined;
        lastStoredDraftFingerprintRef.current =
          storedDraft === undefined ||
          (!ordinaryBaselineMustPersist && !ordinaryDraftHasUserInput)
            ? undefined
            : draftFingerprint(migratedDraft);
        if (inFlightLaunchChanged || existingOrdinaryDraftWouldBeDiscarded) {
          setDraft(
            inFlightLaunchChanged ? latestDraftRef.current : migratedDraft,
          );
          setReplacement(
            inFlightLaunchChanged ? latestReplacementRef.current : undefined,
          );
          setDraftPersistence(inFlightLaunchChanged ? "launch" : "ordinary");
          setPendingLaunchDraft({
            ...nextDraft,
            discardOrdinaryDraft: existingOrdinaryDraftWouldBeDiscarded,
          });
          setConfirmDiscardDraftOpen(true);
        } else {
          if (launchDraft?.persistence === "ordinary") {
            ordinaryDraftBaselineRef.current = nextDraft.draft;
            ordinaryBaselineMustPersistRef.current = false;
            ordinaryDraftStoredRef.current = false;
          }
          setDraft(nextDraft.draft);
          setReplacement(nextDraft.replacement);
          setDraftPersistence(nextDraft.persistence);
          launchDraftBaselineRef.current =
            nextDraft.persistence === "launch"
              ? (nextDraft.baseline ?? nextDraft.draft)
              : undefined;
        }
        setPickerLifecycle((current) => current + 1);
        setInitializedLaunchKey(launchKey);
        setInitializedLaunch(launch);
        setDraftReady(true);
        setSaving(false);
        setReplacementRefreshRequired(false);
      }
    });

    return () => {
      active = false;
    };
  }, [
    initialTab,
    initialTemplateId,
    launch,
    launchKey,
    launchLookupsReady,
    open,
  ]);

  useEffect(() => {
    if (!open || !currentDraftReady || draftPersistence !== "ordinary") {
      return;
    }

    const ordinaryBaseline = ordinaryDraftBaselineRef.current;
    if (!ordinaryBaseline) {
      return;
    }
    const storedDraft = draftForStorage(draft);
    const baseline = draftForStorage(ordinaryBaseline);
    const fingerprint = draftFingerprint(storedDraft);
    if (
      ordinaryDraftStoredRef.current &&
      lastStoredDraftFingerprintRef.current === fingerprint
    ) {
      return;
    }

    if (!draftHasUserInput(storedDraft, baseline)) {
      if (!ordinaryDraftStoredRef.current) {
        return;
      }
      if (!ordinaryBaselineMustPersistRef.current) {
        ordinaryDraftStoredRef.current = false;
        lastStoredDraftFingerprintRef.current = undefined;
        void deleteTransactionEntryDraft().catch(() => {
          // Draft storage is disposable and the next write self-heals it.
        });
        return;
      }
    }

    ordinaryDraftStoredRef.current = true;
    lastStoredDraftFingerprintRef.current = fingerprint;
    void writeTransactionEntryDraft(
      storedDraft,
      baseline,
      ordinaryBaselineMustPersistRef.current,
    ).catch(() => {
      // Draft storage is disposable and later draft changes retry the write.
    });
  }, [currentDraftReady, draft, draftForStorage, draftPersistence, open]);

  useEffect(() => {
    if (!open) {
      templateFocusDeferredRef.current = false;
      return;
    }
    if (!currentDraftReady) {
      return;
    }
    if (preserveFocusOnReplacementChangeRef.current) {
      preserveFocusOnReplacementChangeRef.current = false;
      return;
    }
    if (!replacement && templatesColdLoading) {
      templateFocusDeferredRef.current = true;
      return;
    }

    const templateFocusWasDeferred = templateFocusDeferredRef.current;
    templateFocusDeferredRef.current = false;
    const activeElement = document.activeElement;
    const animationFrame = window.requestAnimationFrame(() => {
      if (
        entryPanelRef.current?.contains(document.activeElement) &&
        (templateFocusWasDeferred || document.activeElement !== activeElement)
      ) {
        return;
      }
      if (replacement) {
        dateInputRef.current?.focus({ preventScroll: true });
      } else {
        focusWithoutTooltip(document.getElementById("entry-template"), {
          preventScroll: true,
        });
      }
    });
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [currentDraftReady, open, replacement, templatesColdLoading]);

  const selectedEntityIds = useMemo(() => {
    const accountIds = new Set<number>();
    const categoryIds = new Set<number>();
    const memberIds = new Set<number>();
    const tagIds = new Set<number>();
    const addNumber = (values: Set<number>, value: number | undefined) => {
      if (value !== undefined) {
        values.add(value);
      }
    };
    const addTabDraft = (tabDraft: TransactionEntryTabDraft) => {
      addNumber(accountIds, tabDraft.boughtAccountId);
      addNumber(accountIds, tabDraft.chargeAccountId);
      addNumber(accountIds, tabDraft.destinationAccountId);
      addNumber(accountIds, tabDraft.fundingAccountId);
      addNumber(accountIds, tabDraft.merchantAccountId);
      addNumber(accountIds, tabDraft.sourceAccountId);
      addNumber(accountIds, tabDraft.soldAccountId);
      addNumber(categoryIds, tabDraft.chargeCategoryId);
      for (const merchant of tabDraft.spendMerchants) {
        addNumber(accountIds, merchant.accountId);
        addNumber(categoryIds, merchant.categoryId);
      }
      addNumber(categoryIds, tabDraft.categoryId);
      addNumber(memberIds, tabDraft.memberId);
      for (const tagId of tabDraft.tagIds) {
        tagIds.add(tagId);
      }
    };
    for (const tabDraft of Object.values(draft.tabs)) {
      addTabDraft(tabDraft);
    }
    for (const row of draft.advanced.records) {
      addNumber(accountIds, row.accountId);
      addNumber(categoryIds, row.categoryId);
      addNumber(memberIds, row.memberId);
      for (const tagId of row.tagIds) {
        tagIds.add(tagId);
      }
    }
    return { accountIds, categoryIds, memberIds, tagIds };
  }, [draft]);

  const optionAccounts = useMemo(
    () =>
      (lookups?.accounts ?? []).filter(
        (account) =>
          !account.tombstoned_at &&
          (visibleAccount(account) ||
            selectedEntityIds.accountIds.has(account.account_id)),
      ),
    [lookups, selectedEntityIds],
  );
  const exactMatchAccountOptions = useMemo(
    () =>
      (lookups?.accounts ?? [])
        .filter((account) => !account.tombstoned_at)
        .map((account) => entityOption(account, account.account_id)),
    [lookups],
  );

  const options = useMemo(() => {
    const categories = [
      ...(categoryPicker.snapshot?.categories ?? []),
      ...(lookups?.categories ?? []).filter(
        (category) =>
          selectedEntityIds.categoryIds.has(category.category_id) &&
          !category.tombstoned_at &&
          !(categoryPicker.snapshot?.categories ?? []).some(
            (pickerCategory) =>
              pickerCategory.category_id === category.category_id,
          ),
      ),
    ];
    const allCategories = (lookups?.categories ?? []).filter(
      (category) =>
        !category.tombstoned_at &&
        (!category.is_hidden ||
          selectedEntityIds.categoryIds.has(category.category_id)),
    );
    const members = (lookups?.members ?? []).filter(
      (member) =>
        !member.tombstoned_at &&
        (visibleMember(member) ||
          selectedEntityIds.memberIds.has(member.member_id)),
    );
    const tags = (lookups?.tags ?? []).filter(
      (tag) =>
        !tag.tombstoned_at &&
        (visibleTag(tag) || selectedEntityIds.tagIds.has(tag.tag_id)),
    );
    return {
      movementAccounts: optionAccounts
        .filter(
          (account) =>
            account.account_type === "owned" ||
            account.account_type === "party",
        )
        .map((account) => entityOption(account, account.account_id)),
      allCategories: allCategories.map((category) =>
        entityOption(category, category.category_id),
      ),
      categories: categories.map((category) =>
        entityOption(category, category.category_id),
      ),
      flowAccounts: optionAccounts
        .filter((account) => account.account_type === "flow")
        .map((account) => entityOption(account, account.account_id)),
      currencies: lookupCurrencies(lookups),
      members: members.map(memberOption),
      tags: tags.map((tag) => entityOption(tag, tag.tag_id)),
    };
  }, [categoryPicker.snapshot, lookups, optionAccounts, selectedEntityIds]);
  const createConflictOptions = useMemo(
    () => ({
      accounts: (lookups?.accounts ?? [])
        .filter((account) => !account.tombstoned_at)
        .map((account) => entityOption(account, account.account_id)),
      categories: (lookups?.categories ?? [])
        .filter((category) => !category.tombstoned_at)
        .map((category) => entityOption(category, category.category_id)),
      tags: (lookups?.tags ?? [])
        .filter((tag) => !tag.tombstoned_at)
        .map((tag) => entityOption(tag, tag.tag_id)),
    }),
    [lookups],
  );
  const createFlowAccountOption = async (fqn: string) => {
    const result = await createLedgerAccount({
      account_type: "flow",
      fqn,
    });
    const created = result.data;
    if (!created) {
      throw new Error(apiErrorMessage(result.error));
    }
    setInlineCreatedLookups((current) => ({
      ...current,
      accounts: mergeLookupEntities(
        current.accounts,
        [created],
        (account) => account.account_id,
      ),
    }));
    invalidateAccountsPage();
    void refreshLedgerLookups();
    return entityOption(created, created.account_id);
  };
  const createCategoryOption = async (
    fqn: string,
    economicIntent: CategoryEconomicIntent,
  ) => {
    const result = await createLedgerCategory({
      economic_intent: economicIntent,
      fqn,
    });
    const created = result.data;
    if (!created) {
      throw new Error(apiErrorMessage(result.error));
    }
    setInlineCreatedLookups((current) => ({
      ...current,
      categories: mergeLookupEntities(
        current.categories,
        [created],
        (category) => category.category_id,
      ),
    }));
    invalidateCategoriesPage();
    addCategoryPickerCategory(created);
    void refreshLedgerLookups();
    return entityOption(created, created.category_id);
  };
  const createTagOption = async (fqn: string) => {
    const result = await createLedgerTag({ fqn });
    const created = result.data;
    if (!created) {
      throw new Error(apiErrorMessage(result.error));
    }
    setInlineCreatedLookups((current) => ({
      ...current,
      tags: mergeLookupEntities(current.tags, [created], (tag) => tag.tag_id),
    }));
    invalidateTagsPage();
    void refreshLedgerLookups();
    return entityOption(created, created.tag_id);
  };
  const categoryPickerReady =
    activeTab === "advanced" ||
    activeTab === "exchange" ||
    (activeTab === "transfer" && !activeTabDraft?.chargeEnabled) ||
    Boolean(categoryPicker.snapshot);
  const ready = Boolean(lookups && currentDraftReady);
  const canSubmit = Boolean(
    lookups && currentDraftReady && categoryPickerReady && !saving,
  );
  const balances = advancedBalances(draft.advanced);
  const advancedCategoryErrors = useCallback(
    (advancedDraft: AdvancedTransactionEntryDraft): AdvancedFieldErrors => {
      const errors: AdvancedFieldErrors = {};
      advancedDraft.records.forEach((row, rowIndex) => {
        const accountType = accountTypeForId(lookups, row.accountId);
        if (accountType === "flow" && !row.categoryId) {
          errors[advancedErrorKey(rowIndex, "categoryId")] =
            "Category is required for a flow record.";
        }
        if (accountType && accountType !== "flow" && row.categoryId) {
          errors[advancedErrorKey(rowIndex, "categoryId")] =
            "Only flow records can have a category.";
        }
      });
      return errors;
    },
    [lookups],
  );
  const localAdvancedErrors = useMemo(
    () => ({
      ...validateAdvancedDraft(draft.advanced, lookups),
      ...advancedCategoryErrors(draft.advanced),
    }),
    [advancedCategoryErrors, draft.advanced, lookups],
  );
  const showAdvancedSettlementDates =
    advancedSettlementDatesToggled ||
    hasAdvancedSettlementDateErrors(advancedFieldErrors) ||
    hasAdvancedSettlementDateErrors(localAdvancedErrors);
  const advancedCanSubmit =
    !hasAdvancedErrors(localAdvancedErrors) && allCurrenciesBalanced(balances);
  const exchangeDraft = draft.tabs.exchange;
  const exchangeSoldAccountCurrency = accountCurrency(
    lookups,
    exchangeDraft.soldAccountId,
  );
  const exchangeBoughtAccountCurrency = accountCurrency(
    lookups,
    exchangeDraft.boughtAccountId,
  );
  const exchangeSoldCurrency =
    exchangeSoldAccountCurrency ?? normalizeCurrency(exchangeDraft.currency);
  const exchangeBoughtCurrency =
    exchangeBoughtAccountCurrency ??
    normalizeCurrency(exchangeDraft.boughtCurrency);
  const exchangeCurrenciesValid = Boolean(
    exchangeSoldCurrency &&
    validCurrencyPattern.test(exchangeSoldCurrency) &&
    exchangeBoughtCurrency &&
    validCurrencyPattern.test(exchangeBoughtCurrency),
  );
  const exchangeAccountsHaveSameCurrency = Boolean(
    exchangeDraft.soldAccountId &&
    exchangeDraft.boughtAccountId &&
    exchangeSoldCurrency &&
    exchangeSoldCurrency === exchangeBoughtCurrency,
  );
  const submitDisabled =
    !canSubmit ||
    (activeTab === "advanced" && !advancedCanSubmit) ||
    (activeTab === "exchange" && exchangeAccountsHaveSameCurrency);

  useEffect(() => {
    if (
      !open ||
      activeTab !== "advanced" ||
      !lookups ||
      hasAdvancedErrors(localAdvancedErrors)
    ) {
      const timeout = window.setTimeout(() => {
        setClassification(undefined);
        setClassificationError(undefined);
      }, 0);
      return () => {
        window.clearTimeout(timeout);
      };
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      void classifyJournalTransaction({
        records: updateBodyFromAdvancedDraft(draft.advanced, lookups).records,
      }).then((result) => {
        if (!active) {
          return;
        }
        if (result.data) {
          setClassification(result.data);
          setClassificationError(undefined);
          setAdvancedFieldErrors({});
          return;
        }
        const message = apiErrorMessage(
          result.error,
          "Draft could not be classified.",
        );
        setClassification(undefined);
        setClassificationError(message);
        setAdvancedFieldErrors((current) => ({
          ...current,
          ...advancedFieldErrorsFromAPI(message),
        }));
      });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeTab, draft.advanced, localAdvancedErrors, lookups, open]);

  useEffect(() => {
    if (
      !open ||
      activeTab !== "exchange" ||
      !lookups ||
      !exchangeDraft.soldAccountId ||
      !exchangeDraft.boughtAccountId ||
      exchangeAccountsHaveSameCurrency ||
      !exchangeCurrenciesValid ||
      !normalizeAmount(exchangeDraft.amount) ||
      !normalizeAmount(exchangeDraft.boughtAmount)
    ) {
      const timeout = window.setTimeout(() => {
        setExchangeRate(undefined);
        setExchangeRateError(undefined);
      }, 0);
      return () => {
        window.clearTimeout(timeout);
      };
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      const records = updateBodyFromAdvancedDraft(
        shorthandDraftToAdvanced("exchange", exchangeDraft, lookups),
        lookups,
      ).records;
      void classifyJournalTransaction({ records }).then((result) => {
        if (!active) {
          return;
        }
        const rate = result.data?.shapes.find(
          (shape) => shape.shape === "exchange",
        )?.effective_rate;
        if (rate) {
          setExchangeRate(
            `1 ${rate.bought_currency} = ${rate.rate} ${rate.sold_currency}`,
          );
          setExchangeRateError(undefined);
          return;
        }
        setExchangeRate(undefined);
        setExchangeRateError(
          apiErrorMessage(result.error, "Exchange could not be classified."),
        );
      });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    activeTab,
    exchangeAccountsHaveSameCurrency,
    exchangeCurrenciesValid,
    exchangeDraft,
    lookups,
    open,
  ]);
  const offscreenFieldErrors = useCallback((): readonly HTMLElement[] => {
    const scrollRegion = entryScrollRegionRef.current;
    if (!scrollRegion) {
      return [];
    }
    const visibleBounds = scrollRegion.getBoundingClientRect();
    return Array.from(
      scrollRegion.querySelectorAll<HTMLElement>("[data-entry-field-error]"),
    ).filter((error) => {
      const errorBounds = error.getBoundingClientRect();
      return (
        errorBounds.top < visibleBounds.top ||
        errorBounds.bottom > visibleBounds.bottom
      );
    });
  }, []);

  const measureAttentionErrors = useCallback(() => {
    setAttentionErrorCount(offscreenFieldErrors().length);
  }, [offscreenFieldErrors]);

  useLayoutEffect(() => {
    const scrollRegion = entryScrollRegionRef.current;
    if (!scrollRegion) {
      setAttentionErrorCount(0);
      return;
    }
    measureAttentionErrors();
    const resizeObserver = new ResizeObserver(measureAttentionErrors);
    resizeObserver.observe(scrollRegion);
    return () => {
      resizeObserver.disconnect();
    };
  }, [
    activeTab,
    advancedFieldErrors,
    fieldErrors,
    measureAttentionErrors,
    merchantFieldErrors,
  ]);

  const focusFirstError = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const error =
          offscreenFieldErrors()[0] ??
          entryScrollRegionRef.current?.querySelector<HTMLElement>(
            "[data-entry-field-error]",
          );
        if (!error) {
          return;
        }
        error.scrollIntoView({ block: "center" });
        const fieldSelector = "input, textarea, button, [role='combobox']";
        const previousElement = error.previousElementSibling;
        const adjacentField =
          previousElement instanceof HTMLElement
            ? previousElement.matches(fieldSelector)
              ? previousElement
              : previousElement.querySelector<HTMLElement>(fieldSelector)
            : null;
        const field =
          adjacentField ??
          error.parentElement?.querySelector<HTMLElement>(fieldSelector);
        focusWithoutTooltip(field, { preventScroll: true });
      });
    });
  }, [offscreenFieldErrors]);

  const focusSpendMerchantError = useCallback(
    (
      merchants: readonly SpendMerchantDraft[],
      errors: SpendMerchantFieldErrors,
    ) => {
      const fieldID = firstSpendMerchantErrorFieldID(merchants, errors);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const field = fieldID ? document.getElementById(fieldID) : null;
          field?.scrollIntoView({ block: "center" });
          focusWithoutTooltip(field, { preventScroll: true });
        });
      });
    },
    [],
  );

  const loadingMessage = "Loading lookups...";

  const tabIsAvailable = (entryType: TransactionEntryType): boolean =>
    !replacement ||
    entryType === "advanced" ||
    replacement.fit?.entryType === entryType;

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
          [activeShorthandTab]: {
            ...currentDraft.tabs[activeShorthandTab],
            ...patch,
          },
        },
      }));
      setFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        const fields = new Set(Object.keys(patch) as FieldName[]);
        if (
          activeShorthandTab === "exchange" &&
          (fields.has("currency") ||
            fields.has("boughtCurrency") ||
            fields.has("soldAccountId") ||
            fields.has("boughtAccountId"))
        ) {
          fields.add("currency");
          fields.add("boughtCurrency");
        }
        for (const field of fields) {
          const message = fieldErrorForDraft(
            nextTabDraft,
            activeShorthandTab,
            field,
            lookups,
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
    [activeShorthandTab, activeTabDraft, lookups],
  );

  const updateSpendMerchant = useCallback(
    (
      index: number,
      merchant: SpendMerchantDraft,
      patch: Partial<SpendMerchantDraft>,
    ) => {
      setDraft((currentDraft) => ({
        ...currentDraft,
        tabs: {
          ...currentDraft.tabs,
          spend: {
            ...currentDraft.tabs.spend,
            spendMerchants: currentDraft.tabs.spend.spendMerchants.map(
              (merchant, merchantIndex) =>
                merchantIndex === index ? { ...merchant, ...patch } : merchant,
            ),
          },
        },
      }));
      setMerchantFieldErrors((currentErrors) => {
        const currentMerchantErrors = currentErrors[merchant.draftId];
        if (!currentMerchantErrors) {
          return currentErrors;
        }
        const nextMerchantErrors = { ...currentMerchantErrors };
        for (const field of Object.keys(patch) as SpendMerchantFieldName[]) {
          delete nextMerchantErrors[field];
        }
        const nextErrors = { ...currentErrors };
        if (Object.keys(nextMerchantErrors).length === 0) {
          delete nextErrors[merchant.draftId];
        } else {
          nextErrors[merchant.draftId] = nextMerchantErrors;
        }
        return nextErrors;
      });
      setGeneralError(undefined);
    },
    [],
  );

  const validateSpendMerchantField = useCallback(
    (merchant: SpendMerchantDraft, field: SpendMerchantFieldName) => {
      const message = spendMerchantFieldErrors(merchant)[field];
      setMerchantFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        const nextMerchantErrors = {
          ...(nextErrors[merchant.draftId] ?? {}),
        };
        if (message) {
          nextMerchantErrors[field] = message;
          nextErrors[merchant.draftId] = nextMerchantErrors;
        } else {
          delete nextMerchantErrors[field];
          if (Object.keys(nextMerchantErrors).length === 0) {
            delete nextErrors[merchant.draftId];
          } else {
            nextErrors[merchant.draftId] = nextMerchantErrors;
          }
        }
        return nextErrors;
      });
    },
    [],
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
      const enabledRemoveButton = (index: number) => {
        const button = advancedRemoveButtonRefs.current[index];
        return button && !button.disabled ? button : undefined;
      };
      const target =
        enabledRemoveButton(rowIndex) ??
        enabledRemoveButton(rowIndex - 1) ??
        addAdvancedRecordButtonRef.current;
      focusWithoutTooltip(target, { preventScroll: true });
    });
  }, []);

  const focusAfterMerchantRemoval = useCallback((merchantIndex: number) => {
    window.requestAnimationFrame(() => {
      const enabledRemoveButton = (index: number) => {
        const button = merchantRemoveButtonRefs.current[index];
        return button && !button.disabled ? button : undefined;
      };
      const target =
        enabledRemoveButton(merchantIndex) ??
        enabledRemoveButton(merchantIndex - 1) ??
        addMerchantButtonRef.current;
      focusWithoutTooltip(target, { preventScroll: true });
    });
  }, []);

  const focusAfterMerchantAddition = useCallback((merchantIndex: number) => {
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(
        document.getElementById(`spend-merchant-${merchantIndex}-account`),
        { preventScroll: true },
      );
    });
  }, []);

  const focusAfterChargeRemoval = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(addChargeButtonRef.current, { preventScroll: true });
    });
  }, []);

  const focusAfterChargeAddition = useCallback(() => {
    window.requestAnimationFrame(() => {
      focusWithoutTooltip(document.getElementById("transfer-charge-account"), {
        preventScroll: true,
      });
    });
  }, []);

  const retryCategoryPicker = () => {
    setCategoryRetryToken((currentToken) => currentToken + 1);
  };

  const editActiveTabAsJournal = useCallback(() => {
    if (!activeShorthandTab || !activeTabDraft) {
      return;
    }

    let advancedDraft = shorthandDraftToAdvanced(
      activeShorthandTab,
      activeTabDraft,
      lookups,
    );
    if (replacement?.fit?.entryType === activeShorthandTab) {
      advancedDraft = advancedDraftFromShorthandReplacement(
        activeShorthandTab,
        activeTabDraft,
        replacement.fit,
        lookups,
      );
    }

    userSelectedActiveTabRef.current = true;
    if (!replacement) {
      rememberedActiveTabRef.current = "advanced";
      setTransactionEntryActiveTab("advanced");
    }
    setDraft((currentDraft) => ({
      ...currentDraft,
      activeTab: "advanced",
      advanced: {
        ...advancedDraft,
        originatingShorthandTab: activeShorthandTab,
      },
    }));
    setFieldErrors({});
    setAdvancedFieldErrors({});
    setGeneralError(undefined);
  }, [activeShorthandTab, activeTabDraft, lookups, replacement]);

  const updateActiveTab = (entryType: TransactionEntryType) => {
    if (!tabIsAvailable(entryType)) {
      return;
    }
    if (
      entryType === "advanced" &&
      replacement &&
      activeShorthandTab &&
      activeTabDraft
    ) {
      editActiveTabAsJournal();
      return;
    }
    userSelectedActiveTabRef.current = true;
    if (!replacement) {
      rememberedActiveTabRef.current = entryType;
      setTransactionEntryActiveTab(entryType);
    }
    setDraft((currentDraft) => ({ ...currentDraft, activeTab: entryType }));
    setFieldErrors({});
    setAdvancedFieldErrors({});
    setGeneralError(undefined);
  };

  const applyTemplate = useCallback(
    (template: TransactionTemplate, targetTab: TransactionEntryType) => {
      userSelectedActiveTabRef.current = true;
      initialTabOverrideRef.current = undefined;
      rememberedActiveTabRef.current = targetTab;
      setTransactionEntryActiveTab(targetTab);
      setPickerLifecycle((current) => current + 1);
      setDraft(draftFromTemplate(template, targetTab, lookups));
      setFieldErrors({});
      setMerchantFieldErrors({});
      setAdvancedFieldErrors({});
      setGeneralError(undefined);
      setClassification(undefined);
      setClassificationError(undefined);
      setExchangeRate(undefined);
      setExchangeRateError(undefined);
      focusTemplatePicker();
    },
    [focusTemplatePicker, lookups],
  );

  const requestTemplateApplication = useCallback(
    (template: TransactionTemplate, targetTab: TransactionEntryType) => {
      if (draftHasUserInput(draft, defaultDraft())) {
        setPendingTemplateApplication({ targetTab, template });
        setConfirmTemplateReplaceOpen(true);
        return;
      }
      applyTemplate(template, targetTab);
    },
    [applyTemplate, draft],
  );

  const confirmTemplateApplication = useCallback(() => {
    if (!pendingTemplateApplication) {
      return;
    }
    applyTemplate(
      pendingTemplateApplication.template,
      pendingTemplateApplication.targetTab,
    );
    setPendingTemplateApplication(undefined);
    setConfirmTemplateReplaceOpen(false);
  }, [applyTemplate, pendingTemplateApplication]);

  const resetCreateDraft = useCallback(async () => {
    if (clearingDraft) {
      return;
    }
    setClearingDraft(true);
    setClearDraftError(undefined);
    try {
      await deleteTransactionEntryDraft();
    } catch {
      setClearDraftError("The saved draft could not be deleted. Try again.");
      setConfirmClearDraftOpen(true);
      setClearingDraft(false);
      return;
    }

    const blankDraft = defaultDraft();
    ordinaryDraftBaselineRef.current = blankDraft;
    ordinaryBaselineMustPersistRef.current = false;
    ordinaryDraftStoredRef.current = false;
    lastStoredDraftFingerprintRef.current = undefined;
    launchDraftBaselineRef.current = undefined;
    initialTabOverrideRef.current = undefined;
    userSelectedActiveTabRef.current = true;
    rememberedActiveTabRef.current = "spend";
    setTransactionEntryActiveTab("spend");
    setDraftPersistence("ordinary");
    setDraft(blankDraft);
    setPickerLifecycle((current) => current + 1);
    setPendingTemplateApplication(undefined);
    setConfirmTemplateReplaceOpen(false);
    setConfirmClearDraftOpen(false);
    setFieldErrors({});
    setMerchantFieldErrors({});
    setAdvancedFieldErrors({});
    setGeneralError(undefined);
    setClassification(undefined);
    setClassificationError(undefined);
    setExchangeRate(undefined);
    setExchangeRateError(undefined);
    setClearingDraft(false);
    focusTemplatePicker();
  }, [clearingDraft, focusTemplatePicker]);

  const requestClearDraft = useCallback(() => {
    setClearDraftError(undefined);
    if (draftHasUserInput(draft, defaultDraft())) {
      setConfirmClearDraftOpen(true);
      return;
    }
    void resetCreateDraft();
  }, [draft, resetCreateDraft]);

  useEffect(() => {
    if (!open) {
      appliedInitialTemplateRef.current = undefined;
    }
  }, [open]);

  useEffect(() => {
    if (
      !open ||
      !currentDraftReady ||
      replacement ||
      initialTemplateId === undefined ||
      appliedInitialTemplateRef.current === initialTemplateId
    ) {
      return;
    }
    const initialTemplate = templates.find(
      (template) => template.transaction_template_id === initialTemplateId,
    );
    if (!initialTemplate) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      appliedInitialTemplateRef.current = initialTemplateId;
      requestTemplateApplication(
        initialTemplate,
        templateEntryType(initialTemplate),
      );
    });
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    currentDraftReady,
    initialTemplateId,
    open,
    replacement,
    requestTemplateApplication,
    templates,
  ]);

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
          lookups,
        );
        if (message) {
          return { ...currentErrors, [field]: message };
        }
        const nextErrors = { ...currentErrors };
        delete nextErrors[field];
        return nextErrors;
      });
    },
    [activeShorthandTab, activeTabDraft, lookups],
  );

  const submit = useCallback(
    async (closeAfterSave = false) => {
      if (!canSubmit) {
        return;
      }

      if (replacement) {
        let body: UpdateTransactionRequest | undefined;

        if (activeTab === "advanced") {
          const nextAdvancedErrors = localAdvancedErrors;
          setAdvancedFieldErrors(nextAdvancedErrors);
          setFieldErrors({});
          setGeneralError(undefined);
          if (
            hasAdvancedErrors(nextAdvancedErrors) ||
            !allCurrenciesBalanced(advancedBalances(draft.advanced))
          ) {
            focusFirstError();
            return;
          }
          body = updateBodyFromAdvancedDraft(draft.advanced, lookups);
        } else {
          if (
            !activeShorthandTab ||
            !activeTabDraft ||
            replacement.fit?.entryType !== activeShorthandTab
          ) {
            setGeneralError(
              "Use the matching shorthand tab or Advanced to update this transaction.",
            );
            return;
          }
          const nextFieldErrors = validateDraft(
            activeTabDraft,
            activeShorthandTab,
            lookups,
          );
          setFieldErrors(nextFieldErrors);
          setGeneralError(undefined);
          if (hasErrors(nextFieldErrors)) {
            focusFirstError();
            return;
          }
          const nextMerchantErrors =
            activeShorthandTab === "spend"
              ? spendMerchantErrors(activeTabDraft.spendMerchants)
              : {};
          setMerchantFieldErrors(nextMerchantErrors);
          if (hasSpendMerchantErrors(nextMerchantErrors)) {
            focusSpendMerchantError(
              activeTabDraft.spendMerchants,
              nextMerchantErrors,
            );
            return;
          }
          body = updateBodyFromShorthandDraft(
            activeTabDraft,
            replacement.fit,
            lookups,
          );
        }

        const submitSessionGeneration = editorSessionRef.current.generation;
        const adoptReplacementWinner = async (winning: Transaction) => {
          let winningLookups = lookups;
          if (
            activeTransactionRecords(winning).some(
              (record) =>
                accountTypeForId(winningLookups, record.account_id) ===
                undefined,
            )
          ) {
            await refreshLedgerLookups();
            if (
              editorSessionRef.current.generation !== submitSessionGeneration
            ) {
              return;
            }
            winningLookups = getTransactionsSnapshot().lookups;
          }
          const winningFit = winningLookups
            ? shorthandFitFromTransaction(winning, winningLookups)
            : undefined;
          const structurallyChanged =
            !sameIds(
              transactionRecordIDs(replacement.transaction),
              transactionRecordIDs(winning),
            ) ||
            (activeShorthandTab !== undefined &&
              winningFit?.entryType !== activeShorthandTab);
          const nextReplacement = {
            fit:
              structurallyChanged || replacement.fit === undefined
                ? undefined
                : winningFit,
            restoreCancelledOnSave: winning.lifecycle_status === "cancelled",
            transaction: winning,
          };
          latestReplacementRef.current = nextReplacement;
          preserveFocusOnReplacementChangeRef.current = true;
          setReplacement(nextReplacement);
          if (structurallyChanged) {
            setDraft((current) => {
              const currentAdvanced =
                current.activeTab === "advanced"
                  ? current.advanced
                  : replacement.fit?.entryType === current.activeTab
                    ? advancedDraftFromShorthandReplacement(
                        current.activeTab,
                        current.tabs[current.activeTab],
                        replacement.fit,
                        winningLookups,
                      )
                    : current.advanced;
              return {
                ...current,
                activeTab: "advanced",
                advanced: advancedDraftRebasedOnWinner(
                  currentAdvanced,
                  winning,
                ),
              };
            });
          } else {
            setDraft((current) =>
              current.activeTab === "advanced"
                ? {
                    ...current,
                    advanced: advancedDraftRebasedOnWinner(
                      current.advanced,
                      winning,
                    ),
                  }
                : current,
            );
          }
          setGeneralError(
            winning.lifecycle_status === "cancelled"
              ? structurallyChanged
                ? "This transaction was cancelled elsewhere. Your draft was rebased with the latest record identities; review the Advanced journal and save again to restore the transaction and reapply it."
                : "This transaction was cancelled elsewhere. Your draft is preserved; review it and save again to restore the transaction and reapply it."
              : structurallyChanged
                ? "This transaction changed elsewhere. Your draft was rebased with the latest record identities; review the Advanced journal and save again to reapply it."
                : "This transaction changed elsewhere. Your draft is preserved; review it and save again to reapply it to the refreshed transaction.",
          );
        };
        const cancelledConflictRetry =
          replacement.transaction.lifecycle_status === "cancelled" &&
          replacement.restoreCancelledOnSave === true;
        cancelledConflictSavePendingRef.current = cancelledConflictRetry;
        setCancelledConflictSavePending(cancelledConflictRetry);
        setSaving(true);
        try {
          if (replacementRefreshRequired) {
            const refreshed = await fetchTransactionById(
              replacement.transaction.transaction_id,
            );
            if (
              editorSessionRef.current.generation !== submitSessionGeneration
            ) {
              return;
            }
            if (!refreshed.data) {
              setGeneralError(
                `This transaction changed elsewhere, but the latest version could not be loaded. Your draft is preserved; try again. ${apiErrorMessage(refreshed.error)}`,
              );
              return;
            }
            setReplacementRefreshRequired(false);
            await adoptReplacementWinner(refreshed.data);
            return;
          }
          const transactionForReplace = replacement.transaction;
          if (transactionForReplace.lifecycle_status === "cancelled") {
            if (!replacement.restoreCancelledOnSave) {
              setGeneralError(
                "Restore this cancelled transaction before editing it.",
              );
              return;
            }
            const restored = await restoreTransactionById(
              transactionForReplace.transaction_id,
            );
            if (
              editorSessionRef.current.generation !== submitSessionGeneration
            ) {
              return;
            }
            if (!restored.data) {
              setGeneralError(
                apiErrorMessage(
                  restored.error,
                  "The cancelled transaction could not be restored. Your draft is preserved; refresh and try again.",
                ),
              );
              return;
            }
            await adoptReplacementWinner(restored.data);
            return;
          }
          const result = await replaceLedgerTransaction(
            transactionForReplace.transaction_id,
            transactionForReplace.etag,
            body,
          );

          if (result.data) {
            const previousTransactions = [
              ...(launch &&
              launch.transaction.etag !== replacement.transaction.etag
                ? [launch.transaction]
                : []),
              ...(replacement.transaction.etag !== transactionForReplace.etag
                ? [replacement.transaction]
                : []),
            ];
            setReplacement(undefined);
            setReplacementRefreshRequired(false);
            launchDraftBaselineRef.current = undefined;
            latestReplacementRef.current = undefined;
            await onSaved(result.data, {
              operation: "updated",
              previousTransactions: [
                transactionForReplace,
                ...previousTransactions,
              ],
            });
            setFieldErrors({});
            setAdvancedFieldErrors({});
            setGeneralError(undefined);
            onClose();
            return;
          }

          if (result.response?.status === 412) {
            if (
              editorSessionRef.current.generation !== submitSessionGeneration
            ) {
              return;
            }
            const refreshed = await fetchTransactionById(
              replacement.transaction.transaction_id,
            );
            if (
              editorSessionRef.current.generation !== submitSessionGeneration
            ) {
              return;
            }
            if (refreshed.data) {
              setReplacementRefreshRequired(false);
              await adoptReplacementWinner(refreshed.data);
              return;
            }
            setReplacementRefreshRequired(true);
            setGeneralError(
              `This transaction changed elsewhere, but the latest version could not be loaded. Your draft is preserved; try again. ${apiErrorMessage(refreshed.error)}`,
            );
            return;
          }

          if (editorSessionRef.current.generation !== submitSessionGeneration) {
            return;
          }

          const message = apiErrorMessage(
            result.error,
            "Transaction could not be saved.",
          );
          if (activeTab === "advanced") {
            const apiFieldErrors = advancedFieldErrorsFromAPI(message);
            setAdvancedFieldErrors(apiFieldErrors);
            if (hasAdvancedSettlementDateErrors(apiFieldErrors)) {
              setAdvancedSettlementDatesLaunchKey(launchKey);
            }
            setGeneralError(
              hasAdvancedErrors(apiFieldErrors) ? undefined : message,
            );
          } else {
            const apiFieldErrors = fieldErrorsFromAPI(message);
            setFieldErrors(apiFieldErrors);
            setGeneralError(hasErrors(apiFieldErrors) ? undefined : message);
          }
          focusFirstError();
          return;
        } finally {
          cancelledConflictSavePendingRef.current = false;
          if (editorSessionRef.current.generation === submitSessionGeneration) {
            setCancelledConflictSavePending(false);
            setSaving(false);
          }
        }
      }

      if (activeTab === "advanced") {
        const nextAdvancedErrors = localAdvancedErrors;
        setAdvancedFieldErrors(nextAdvancedErrors);
        setFieldErrors({});
        setGeneralError(undefined);
        if (
          hasAdvancedErrors(nextAdvancedErrors) ||
          !allCurrenciesBalanced(advancedBalances(draft.advanced))
        ) {
          focusFirstError();
          return;
        }

        const body = {
          initiated_date: draft.advanced.date,
          records: draft.advanced.records.map((row) => {
            const movementAccount = isMovementAccountType(
              accountTypeForId(lookups, row.accountId),
            );
            const pendingDate = movementAccount
              ? settlementDateTimeToISO(row.pendingDateTime)
              : undefined;
            const postedDate =
              movementAccount && row.settlement === "posted"
                ? settlementDateTimeToISO(row.postedDateTime)
                : undefined;
            return {
              account_id: row.accountId!,
              amount: normalizeSignedAmount(row.amount)!,
              category_id: row.categoryId ?? null,
              currency: normalizeCurrency(row.currency),
              member_id: row.memberId ?? null,
              memo: row.memo.trim() ? row.memo.trim() : null,
              settlement: movementAccount
                ? {
                    ...(pendingDate ? { pending_date: pendingDate } : {}),
                    ...(postedDate ? { posted_date: postedDate } : {}),
                    status: row.settlement,
                  }
                : null,
              reconciliation_status: "unreconciled" as const,
              source: row.source,
              ...(row.source === "imported"
                ? {
                    external_id: row.sourceExternalId,
                    external_system: row.sourceExternalSystem,
                  }
                : {}),
              tag_ids: [...row.tagIds],
            };
          }),
        } satisfies CreateTransactionRequest;

        setSaving(true);
        try {
          const result = await createJournalTransaction(body);

          if (result.data) {
            const originatingShorthandTab =
              draft.advanced.originatingShorthandTab;
            const resetPendingSettlement = Boolean(
              originatingShorthandTab &&
              draft.tabs[originatingShorthandTab].recordAsPending,
            );
            const nextDraft = {
              ...draft,
              advanced: stickyNextAdvancedDraft(
                draft.advanced,
                resetPendingSettlement,
              ),
              tabs: originatingShorthandTab
                ? {
                    ...draft.tabs,
                    [originatingShorthandTab]: {
                      ...draft.tabs[originatingShorthandTab],
                      recordAsPending: false,
                    },
                  }
                : draft.tabs,
            };
            setPickerLifecycle((current) => current + 1);
            setDraft(nextDraft);
            setAdvancedFieldErrors({});
            setGeneralError(undefined);
            setSessionCount((count) => count + 1);
            setSessionTransactions((current) => [result.data, ...current]);
            if (draftPersistence === "launch") {
              setDraftPersistence("ordinary");
            }
            if (
              draftPersistence === "ordinary" ||
              draftPersistence === "launch"
            ) {
              const storedNextDraft = draftForStorage(nextDraft);
              ordinaryDraftBaselineRef.current = storedNextDraft;
              ordinaryBaselineMustPersistRef.current = true;
              ordinaryDraftStoredRef.current = true;
              lastStoredDraftFingerprintRef.current =
                draftFingerprint(storedNextDraft);
              await writeTransactionEntryDraft(
                storedNextDraft,
                storedNextDraft,
                true,
              );
            }
            await onSaved(result.data, { operation: "created" });
            if (closeAfterSave) {
              onClose();
            } else {
              window.requestAnimationFrame(() => {
                dateInputRef.current?.focus({ preventScroll: true });
              });
            }
            return;
          }

          const message = apiErrorMessage(
            result.error,
            "Transaction could not be saved.",
          );
          const apiFieldErrors = advancedFieldErrorsFromAPI(message);
          setAdvancedFieldErrors(apiFieldErrors);
          if (hasAdvancedSettlementDateErrors(apiFieldErrors)) {
            setAdvancedSettlementDatesLaunchKey(launchKey);
          }
          setGeneralError(
            hasAdvancedErrors(apiFieldErrors) ? undefined : message,
          );
          focusFirstError();
          return;
        } finally {
          setSaving(false);
        }
      }

      if (!activeShorthandTab || !activeTabDraft) {
        return;
      }

      const nextFieldErrors = validateDraft(
        activeTabDraft,
        activeShorthandTab,
        lookups,
      );
      setFieldErrors(nextFieldErrors);
      setGeneralError(undefined);
      if (hasErrors(nextFieldErrors)) {
        focusFirstError();
        return;
      }
      const nextMerchantErrors =
        activeShorthandTab === "spend"
          ? spendMerchantErrors(activeTabDraft.spendMerchants)
          : {};
      setMerchantFieldErrors(nextMerchantErrors);
      if (hasSpendMerchantErrors(nextMerchantErrors)) {
        focusSpendMerchantError(
          activeTabDraft.spendMerchants,
          nextMerchantErrors,
        );
        return;
      }

      const spendMerchantRecords = activeTabDraft.spendMerchants.map(
        (merchant) => ({
          accountId: merchant.accountId!,
          amount: normalizeAmount(merchant.amount)!,
          categoryId: merchant.categoryId!,
        }),
      );
      const primarySpendMerchant = spendMerchantRecords[0];
      const amount =
        activeShorthandTab === "spend"
          ? primarySpendMerchant?.amount
          : normalizeAmount(activeTabDraft.amount);
      const soldAccountCurrency =
        activeShorthandTab === "exchange"
          ? accountCurrency(lookups, activeTabDraft.soldAccountId)
          : undefined;
      const boughtAccountCurrency =
        activeShorthandTab === "exchange"
          ? accountCurrency(lookups, activeTabDraft.boughtAccountId)
          : undefined;
      const currency =
        soldAccountCurrency ?? normalizeCurrency(activeTabDraft.currency);
      const categoryRequired =
        activeShorthandTab !== "spend" &&
        activeShorthandTab !== "transfer" &&
        activeShorthandTab !== "exchange";
      if (
        !amount ||
        !currency ||
        (categoryRequired && !activeTabDraft.categoryId)
      ) {
        return;
      }

      const common = {
        amount,
        currency,
        initiated_date: activeTabDraft.date,
        member_id: activeTabDraft.memberId ?? null,
        memo: activeTabDraft.memo.trim() ? activeTabDraft.memo.trim() : null,
        settlement: {
          status: activeTabDraft.recordAsPending
            ? ("pending" as const)
            : ("posted" as const),
        },
        reconciliation_status: "unreconciled" as const,
        tag_ids: [...activeTabDraft.tagIds],
      };

      setSaving(true);
      try {
        const recordCommon = {
          currency,
          member_id: activeTabDraft.memberId ?? null,
          memo: activeTabDraft.memo.trim() ? activeTabDraft.memo.trim() : null,
          reconciliation_status: "unreconciled" as const,
          source: "manual" as const,
          tag_ids: [...activeTabDraft.tagIds],
        };
        const spendTotal = spendMerchantRecords.reduce(
          (total, merchant) =>
            total + (signedAmountMantissa(merchant.amount) ?? 0n),
          0n,
        );
        const chargeAmount = normalizeAmount(activeTabDraft.chargeAmount);
        const transferTotal =
          (signedAmountMantissa(amount) ?? 0n) +
          (chargeAmount ? (signedAmountMantissa(chargeAmount) ?? 0n) : 0n);
        const result =
          activeShorthandTab === "spend"
            ? spendMerchantRecords.length > 1
              ? await createJournalTransaction({
                  initiated_date: activeTabDraft.date,
                  records: [
                    {
                      ...recordCommon,
                      account_id: activeTabDraft.fundingAccountId ?? -1,
                      amount: formatMantissa(-spendTotal),
                      category_id: null,
                      settlement: common.settlement,
                    },
                    ...spendMerchantRecords.map((merchant) => ({
                      ...recordCommon,
                      account_id: merchant.accountId,
                      amount: merchant.amount,
                      category_id: merchant.categoryId,
                      settlement: null,
                    })),
                  ],
                } satisfies CreateTransactionRequest)
              : await createSpend({
                  ...common,
                  category_id: primarySpendMerchant!.categoryId,
                  counterparty_account_id: primarySpendMerchant!.accountId,
                  funding_account_id: activeTabDraft.fundingAccountId ?? -1,
                } satisfies CreateSpendTransactionRequest)
            : activeShorthandTab === "income"
              ? await createIncome({
                  ...common,
                  category_id: activeTabDraft.categoryId!,
                  destination_account_id:
                    activeTabDraft.destinationAccountId ?? -1,
                  source_account_id: activeTabDraft.sourceAccountId ?? -1,
                } satisfies CreateIncomeTransactionRequest)
              : activeShorthandTab === "refund"
                ? await createRefund({
                    ...common,
                    category_id: activeTabDraft.categoryId!,
                    counterparty_account_id:
                      activeTabDraft.merchantAccountId ?? -1,
                    destination_account_id:
                      activeTabDraft.destinationAccountId ?? -1,
                  } satisfies CreateRefundTransactionRequest)
                : activeShorthandTab === "exchange"
                  ? await createExchange({
                      bought_account_id: activeTabDraft.boughtAccountId ?? -1,
                      bought_amount:
                        normalizeAmount(activeTabDraft.boughtAmount) ?? "",
                      ...(boughtAccountCurrency === undefined
                        ? {
                            bought_currency: normalizeCurrency(
                              activeTabDraft.boughtCurrency,
                            ),
                          }
                        : {}),
                      initiated_date: activeTabDraft.date,
                      member_id: activeTabDraft.memberId ?? null,
                      memo: activeTabDraft.memo.trim()
                        ? activeTabDraft.memo.trim()
                        : null,
                      settlement: common.settlement,
                      reconciliation_status: "unreconciled",
                      sold_account_id: activeTabDraft.soldAccountId ?? -1,
                      sold_amount: amount,
                      ...(soldAccountCurrency === undefined
                        ? {
                            sold_currency: normalizeCurrency(
                              activeTabDraft.currency,
                            ),
                          }
                        : {}),
                      tag_ids: [...activeTabDraft.tagIds],
                    } satisfies CreateExchangeTransactionRequest)
                  : chargeAmount &&
                      activeTabDraft.chargeAccountId &&
                      activeTabDraft.chargeCategoryId
                    ? await createJournalTransaction({
                        initiated_date: activeTabDraft.date,
                        records: [
                          {
                            ...recordCommon,
                            account_id: activeTabDraft.sourceAccountId ?? -1,
                            amount: formatMantissa(-transferTotal),
                            category_id: null,
                            settlement: common.settlement,
                          },
                          {
                            ...recordCommon,
                            account_id:
                              activeTabDraft.destinationAccountId ?? -1,
                            amount,
                            category_id: null,
                            settlement: common.settlement,
                          },
                          {
                            ...recordCommon,
                            account_id: activeTabDraft.chargeAccountId,
                            amount: chargeAmount,
                            category_id: activeTabDraft.chargeCategoryId,
                            settlement: null,
                          },
                        ],
                      } satisfies CreateTransactionRequest)
                    : await createTransfer({
                        ...common,
                        destination_account_id:
                          activeTabDraft.destinationAccountId ?? -1,
                        source_account_id: activeTabDraft.sourceAccountId ?? -1,
                      } satisfies CreateTransferTransactionRequest);

        if (result.data) {
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
          setSessionTransactions((current) => [result.data, ...current]);
          if (draftPersistence === "launch") {
            setDraftPersistence("ordinary");
          }
          if (
            draftPersistence === "ordinary" ||
            draftPersistence === "launch"
          ) {
            const storedNextDraft = draftForStorage(nextDraft);
            ordinaryDraftBaselineRef.current = storedNextDraft;
            ordinaryBaselineMustPersistRef.current = true;
            ordinaryDraftStoredRef.current = true;
            lastStoredDraftFingerprintRef.current =
              draftFingerprint(storedNextDraft);
            await writeTransactionEntryDraft(
              storedNextDraft,
              storedNextDraft,
              true,
            );
          }
          await onSaved(result.data, { operation: "created" });
          if (latestDraftRef.current.activeTab === activeShorthandTab) {
            setPickerLifecycle((current) => current + 1);
          }
          if (closeAfterSave) {
            onClose();
          } else {
            window.requestAnimationFrame(() => {
              dateInputRef.current?.focus({ preventScroll: true });
            });
          }
          return;
        }

        const message = apiErrorMessage(
          result.error,
          "Transaction could not be saved.",
        );
        const apiFieldErrors = fieldErrorsFromAPI(message);
        setFieldErrors(apiFieldErrors);
        setGeneralError(hasErrors(apiFieldErrors) ? undefined : message);
        focusFirstError();
      } finally {
        setSaving(false);
      }
    },
    [
      activeTab,
      activeShorthandTab,
      activeTabDraft,
      canSubmit,
      draft,
      draftForStorage,
      draftPersistence,
      focusSpendMerchantError,
      focusFirstError,
      localAdvancedErrors,
      launch,
      launchKey,
      lookups,
      onClose,
      onSaved,
      replacement,
      replacementRefreshRequired,
    ],
  );

  const primaryAccountValue =
    activeTabDraft && activeConfig
      ? accountValue(activeTabDraft, activeConfig.primaryAccountField)
      : undefined;
  const secondaryAccountValue =
    activeTabDraft && activeConfig
      ? accountValue(activeTabDraft, activeConfig.secondaryAccountField)
      : undefined;
  const primaryAccountOptions =
    activeTab === "exchange" && exchangeBoughtAccountCurrency
      ? options.movementAccounts.filter(
          (option) =>
            option.id === primaryAccountValue ||
            accountCurrency(lookups, option.id) !==
              exchangeBoughtAccountCurrency,
        )
      : activeConfig
        ? options[activeConfig.primaryAccountOptionSet]
        : [];
  const secondaryAccountOptions =
    activeTab === "exchange" && exchangeSoldAccountCurrency
      ? options.movementAccounts.filter(
          (option) =>
            option.id === secondaryAccountValue ||
            accountCurrency(lookups, option.id) !== exchangeSoldAccountCurrency,
        )
      : activeConfig
        ? options[activeConfig.secondaryAccountOptionSet]
        : [];
  const chargeIsRetainedImportedRecord =
    replacement?.fit?.additionalRecords[0]?.source === "imported";

  if (!open) {
    return null;
  }

  const panelModeLabel = replacement ? "Edit transaction" : "New transaction";
  const panelTitle = replacement
    ? (activeConfig?.title.replace("New", "Edit") ?? "Edit journal")
    : (activeConfig?.title ?? "New journal");

  return (
    <section
      ref={entryPanelRef}
      className="bg-card flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      aria-labelledby="entry-panel-title"
      onKeyDown={(event) => {
        if (
          confirmDiscardDraftOpen ||
          confirmTemplateReplaceOpen ||
          confirmClearDraftOpen
        ) {
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          void submit(event.shiftKey);
        }
      }}
    >
      <div className="flex items-center justify-between border-b-2 border-[var(--border-ink)] p-4">
        <div>
          <p className="text-muted-foreground font-heading text-xs font-semibold uppercase">
            {replacement ? panelModeLabel : `${tabLabels[activeTab]} entry`}
          </p>
          <h2 id="entry-panel-title" className="text-pixel text-base">
            {panelTitle}
          </h2>
        </div>
        {cancelledConflictSavePending ? (
          <Tooltip label="Wait for the cancelled-conflict retry before closing.">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Close transaction editor"
              disabled
            >
              <Close aria-hidden="true" />
            </Button>
          </Tooltip>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Close transaction editor"
            onClick={requestClose}
          >
            <Close aria-hidden="true" />
          </Button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Transaction type"
        aria-busy={clearingDraft}
        className="grid grid-cols-6 border-b-2 border-[var(--border-ink)]"
      >
        {entryTypes.map((entryType) => {
          const disabled = clearingDraft || !tabIsAvailable(entryType);
          return (
            <button
              key={entryType}
              id={`${entryType}-entry-tab`}
              type="button"
              role="tab"
              aria-controls={`${entryType}-entry-panel`}
              aria-selected={activeTab === entryType}
              disabled={disabled}
              className={`font-heading h-9 border-r border-[var(--border-ink)] text-xs font-semibold uppercase last:border-r-0 ${
                activeTab === entryType
                  ? "bg-primary text-primary-foreground"
                  : disabled
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-muted text-foreground hover:bg-[var(--color-interactive-bright)]"
              }`}
              onClick={() => {
                updateActiveTab(entryType);
              }}
            >
              {tabLabels[entryType]}
            </button>
          );
        })}
      </div>

      {!replacement ? (
        <div
          aria-busy={clearingDraft}
          inert={clearingDraft ? true : undefined}
          className="border-b-2 border-[var(--border-ink)] bg-[var(--band)] px-4 py-3"
        >
          <div className="mx-auto flex w-full max-w-[560px] flex-col gap-1">
            {templatesColdLoading ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">
                  Start from a template
                </span>
                <Skeleton
                  className="h-9 w-full"
                  data-testid="entry-template-loading"
                />
                <span className="sr-only" role="status">
                  Loading template choices
                </span>
              </div>
            ) : (
              <EntityPicker
                key={`entry-template-${pickerLifecycle}`}
                id="entry-template"
                clearOnSelect
                disabled={!currentDraftReady || clearingDraft}
                label="Start from a template"
                openOnFocus={templatePickerOpenOnFocus}
                options={templateOptions}
                placeholder="Type a template name or skip"
                value={undefined}
                onChange={(templateId) => {
                  if (templateId === undefined) {
                    return;
                  }
                  const template = availableTemplates.find(
                    (candidate) =>
                      candidate.transaction_template_id === templateId,
                  );
                  if (template) {
                    requestTemplateApplication(template, activeTab);
                  }
                }}
              />
            )}
            {templatesResource.errorMessage ? (
              <div
                className="border-destructive text-destructive mt-1 flex items-center justify-between gap-2 border-2 px-2 py-1 text-xs"
                role="alert"
              >
                <span>
                  {templatesResource.snapshot
                    ? "Template choices could not be refreshed."
                    : "Templates could not be loaded."}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void refreshTransactionTemplates();
                  }}
                >
                  <Reload aria-hidden="true" />
                  Retry
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!ready ? (
        <div className="flex flex-1 items-start p-4">
          <p className="text-muted-foreground text-sm">{loadingMessage}</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <form
          id={`${activeTab}-entry-panel`}
          role="tabpanel"
          aria-labelledby={`${activeTab}-entry-tab`}
          aria-busy={clearingDraft}
          inert={clearingDraft ? true : undefined}
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${
            ready ? "" : "hidden"
          }`}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div
            ref={entryScrollRegionRef}
            data-testid="entry-scroll-region"
            className={`min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain p-4 ${
              activeTab === "advanced"
                ? "flex min-w-0 flex-col"
                : "mx-auto flex w-full max-w-[560px] flex-col"
            }`}
            onScroll={measureAttentionErrors}
          >
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
                        validateAdvancedDraft(draft.advanced, lookups),
                      );
                    }}
                    onChange={(event) => {
                      updateAdvancedDraft({ date: event.target.value });
                    }}
                  />
                  <FieldError message={advancedFieldErrors.date} />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  aria-expanded={showAdvancedSettlementDates}
                  onClick={() => {
                    setAdvancedSettlementDatesLaunchKey((current) =>
                      current === launchKey ? undefined : launchKey,
                    );
                  }}
                >
                  <Clock aria-hidden="true" />
                  Edit pending/posted dates
                </Button>

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
                          {classification?.records.find(
                            (record) => record.record_index === rowIndex,
                          ) ? (
                            <span className="font-mono text-xs font-semibold uppercase">
                              {recordRoleLabel(
                                classification.records.find(
                                  (record) => record.record_index === rowIndex,
                                )!.record_role,
                              )}
                            </span>
                          ) : null}
                          <Tooltip
                            label={
                              row.source === "imported" &&
                              row.sourceRecordId !== undefined
                                ? "Imported records keep their identity and cannot be removed"
                                : `Remove record ${rowIndex + 1}`
                            }
                            asChild={
                              !(
                                row.source === "imported" &&
                                row.sourceRecordId !== undefined
                              )
                            }
                            className={
                              row.source === "imported" &&
                              row.sourceRecordId !== undefined
                                ? "cursor-not-allowed"
                                : undefined
                            }
                            redispatchEscape={false}
                            triggerLabel={
                              row.source === "imported" &&
                              row.sourceRecordId !== undefined
                                ? `Remove record ${rowIndex + 1} unavailable`
                                : undefined
                            }
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
                              disabled={
                                row.source === "imported" &&
                                row.sourceRecordId !== undefined
                              }
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
                              key={`${pickerLifecycle}:advanced:${row.draftId}:account`}
                              exactMatchOptions={exactMatchAccountOptions}
                              id={`advanced-record-${rowIndex}-account`}
                              label={`Record ${rowIndex + 1} account`}
                              labelClassName="sr-only"
                              options={optionAccounts.map((account) =>
                                entityOption(account, account.account_id),
                              )}
                              value={row.accountId}
                              onChange={(accountId) => {
                                const nextAccountType = accountTypeForId(
                                  lookups,
                                  accountId,
                                );
                                updateAdvancedRow(rowIndex, {
                                  accountId,
                                  categoryId:
                                    nextAccountType &&
                                    nextAccountType !== "flow"
                                      ? undefined
                                      : row.categoryId,
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
                            {accountTypeForId(lookups, row.accountId) ===
                            "flow" ? (
                              <EntityPicker
                                key={`${pickerLifecycle}:advanced:${row.draftId}:category`}
                                id={`advanced-record-${rowIndex}-category`}
                                label={`Record ${rowIndex + 1} category`}
                                labelClassName="sr-only"
                                options={options.allCategories}
                                value={row.categoryId}
                                onChange={(categoryId) => {
                                  updateAdvancedRow(rowIndex, { categoryId });
                                }}
                              />
                            ) : (
                              <span className="inline-flex h-9" aria-hidden />
                            )}
                            <FieldError
                              message={
                                advancedFieldError(
                                  advancedFieldErrors,
                                  rowIndex,
                                  "categoryId",
                                ) ??
                                advancedFieldError(
                                  localAdvancedErrors,
                                  rowIndex,
                                  "categoryId",
                                )
                              }
                            />
                          </AdvancedRecordField>
                          <AdvancedRecordField
                            label="Tags"
                            className="col-span-full"
                          >
                            <EntityMultiPicker
                              key={`${pickerLifecycle}:advanced:${row.draftId}:tags`}
                              createConflictOptions={createConflictOptions.tags}
                              createOption={createTagOption}
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
                              key={`${pickerLifecycle}:advanced:${row.draftId}:member`}
                              hierarchical={false}
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
                          <AdvancedRecordField label="Origin">
                            {row.sourceRecordId !== undefined ? (
                              <Tooltip
                                asChild
                                label={retainedRecordOriginLabel(
                                  row,
                                  replacement?.transaction,
                                )}
                              >
                                <div
                                  className="bg-muted h-9 min-w-0 truncate border-2 border-[var(--border-ink)] px-2 py-[0.375rem] font-mono text-sm shadow-[var(--shadow-pixel)]"
                                  tabIndex={0}
                                >
                                  {retainedRecordOriginLabel(
                                    row,
                                    replacement?.transaction,
                                  )}
                                </div>
                              </Tooltip>
                            ) : (
                              <Select
                                value={row.source}
                                onValueChange={(value) => {
                                  updateAdvancedRow(rowIndex, {
                                    source:
                                      value as JournalRecordRowDraft["source"],
                                    ...(value === "manual"
                                      ? {
                                          sourceExternalId: undefined,
                                          sourceExternalSystem: undefined,
                                        }
                                      : {}),
                                  });
                                }}
                              >
                                <SelectTrigger
                                  id={`advanced-record-${rowIndex}-source`}
                                  className="w-full"
                                  aria-label={`Record ${rowIndex + 1} origin`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="manual">Manual</SelectItem>
                                  <SelectItem value="imported">
                                    Imported
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </AdvancedRecordField>
                          {row.sourceRecordId === undefined &&
                          row.source === "imported" ? (
                            <>
                              <AdvancedRecordField label="External system">
                                <input
                                  id={`advanced-record-${rowIndex}-external-system`}
                                  aria-label={`Record ${rowIndex + 1} external system`}
                                  aria-invalid={Boolean(
                                    advancedFieldError(
                                      advancedFieldErrors,
                                      rowIndex,
                                      "externalSystem",
                                    ),
                                  )}
                                  className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                                  value={row.sourceExternalSystem ?? ""}
                                  onBlur={() => {
                                    setAdvancedFieldErrors(
                                      validateAdvancedDraft(draft.advanced),
                                    );
                                  }}
                                  onChange={(event) => {
                                    updateAdvancedRow(rowIndex, {
                                      sourceExternalSystem:
                                        event.target.value || null,
                                    });
                                  }}
                                />
                                <FieldError
                                  message={advancedFieldError(
                                    advancedFieldErrors,
                                    rowIndex,
                                    "externalSystem",
                                  )}
                                />
                              </AdvancedRecordField>
                              <AdvancedRecordField label="External ID">
                                <input
                                  id={`advanced-record-${rowIndex}-external-id`}
                                  aria-label={`Record ${rowIndex + 1} external ID`}
                                  aria-invalid={Boolean(
                                    advancedFieldError(
                                      advancedFieldErrors,
                                      rowIndex,
                                      "externalId",
                                    ),
                                  )}
                                  className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                                  value={row.sourceExternalId ?? ""}
                                  onBlur={() => {
                                    setAdvancedFieldErrors(
                                      validateAdvancedDraft(draft.advanced),
                                    );
                                  }}
                                  onChange={(event) => {
                                    updateAdvancedRow(rowIndex, {
                                      sourceExternalId:
                                        event.target.value || null,
                                    });
                                  }}
                                />
                                <FieldError
                                  message={advancedFieldError(
                                    advancedFieldErrors,
                                    rowIndex,
                                    "externalId",
                                  )}
                                />
                              </AdvancedRecordField>
                            </>
                          ) : null}
                          {isMovementAccountType(
                            accountTypeForId(lookups, row.accountId),
                          ) ? (
                            <>
                              <AdvancedRecordField label="Settlement">
                                <div className="flex flex-col gap-2">
                                  <label
                                    htmlFor={`advanced-record-${rowIndex}-settlement`}
                                    className="sr-only"
                                  >
                                    Record {rowIndex + 1} settlement
                                  </label>
                                  <Select
                                    value={row.settlement}
                                    onValueChange={(value) => {
                                      updateAdvancedRow(rowIndex, {
                                        settlement:
                                          value as JournalRecordRowDraft["settlement"],
                                      });
                                    }}
                                  >
                                    <SelectTrigger
                                      id={`advanced-record-${rowIndex}-settlement`}
                                      className="w-full"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="posted">
                                        Posted
                                      </SelectItem>
                                      <SelectItem value="pending">
                                        Pending
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FieldError
                                    message={advancedFieldError(
                                      advancedFieldErrors,
                                      rowIndex,
                                      "settlement",
                                    )}
                                  />
                                </div>
                              </AdvancedRecordField>
                              {showAdvancedSettlementDates ? (
                                <>
                                  <AdvancedRecordField label="Pending date">
                                    <input
                                      id={`advanced-record-${rowIndex}-pending-date`}
                                      type="datetime-local"
                                      step="any"
                                      aria-label={`Record ${rowIndex + 1} pending date`}
                                      className="bg-card h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                                      value={row.pendingDateTime}
                                      onBlur={() => {
                                        setAdvancedFieldErrors(
                                          validateAdvancedDraft(
                                            draft.advanced,
                                            lookups,
                                          ),
                                        );
                                      }}
                                      onChange={(event) => {
                                        updateAdvancedRow(rowIndex, {
                                          pendingDateTime: event.target.value,
                                        });
                                      }}
                                    />
                                    <FieldError
                                      message={
                                        advancedFieldError(
                                          advancedFieldErrors,
                                          rowIndex,
                                          "pendingDateTime",
                                        ) ??
                                        advancedFieldError(
                                          localAdvancedErrors,
                                          rowIndex,
                                          "pendingDateTime",
                                        )
                                      }
                                    />
                                  </AdvancedRecordField>
                                  <AdvancedRecordField label="Posted date">
                                    <input
                                      id={`advanced-record-${rowIndex}-posted-date`}
                                      type="datetime-local"
                                      step="any"
                                      aria-label={`Record ${rowIndex + 1} posted date`}
                                      className="bg-card disabled:bg-muted disabled:text-muted-foreground h-9 w-full border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] disabled:cursor-not-allowed disabled:border-[var(--muted-foreground)] disabled:shadow-none"
                                      disabled={row.settlement !== "posted"}
                                      value={row.postedDateTime}
                                      onBlur={() => {
                                        setAdvancedFieldErrors(
                                          validateAdvancedDraft(
                                            draft.advanced,
                                            lookups,
                                          ),
                                        );
                                      }}
                                      onChange={(event) => {
                                        updateAdvancedRow(rowIndex, {
                                          postedDateTime: event.target.value,
                                        });
                                      }}
                                    />
                                    <FieldError
                                      message={
                                        advancedFieldError(
                                          advancedFieldErrors,
                                          rowIndex,
                                          "postedDateTime",
                                        ) ??
                                        advancedFieldError(
                                          localAdvancedErrors,
                                          rowIndex,
                                          "postedDateTime",
                                        )
                                      }
                                    />
                                  </AdvancedRecordField>
                                </>
                              ) : null}
                            </>
                          ) : null}
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
                      records: [
                        ...draft.advanced.records,
                        blankRecordRowDraft(),
                      ],
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
                <div
                  className={
                    activeTab === "exchange"
                      ? "grid grid-cols-1 gap-3"
                      : "grid grid-cols-[1fr_130px] gap-3"
                  }
                >
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
                  {activeTab !== "exchange" ? (
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
                  ) : null}
                </div>

                {activeTab !== "spend" ? (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`${activeTab}-amount`}
                      className="text-sm font-semibold"
                    >
                      {activeTab === "refund"
                        ? "Amount received"
                        : activeTab === "exchange"
                          ? "Amount sold"
                          : "Amount"}
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
                ) : null}

                {activeTab === "exchange" ? (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="exchange-sold-currency"
                      className="text-sm font-semibold"
                    >
                      Currency sold
                    </label>
                    <input
                      id="exchange-sold-currency"
                      list="entry-currency-options"
                      className="bg-card read-only:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                      readOnly={exchangeSoldAccountCurrency !== undefined}
                      value={exchangeSoldCurrency}
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
                ) : null}

                <EntityPicker
                  key={`${pickerLifecycle}:${activeTab}:${activeConfig.primaryAccountField}`}
                  id={`${activeTab}-${activeConfig.primaryAccountField}`}
                  label={activeConfig.primaryAccountLabel}
                  options={primaryAccountOptions}
                  value={primaryAccountValue}
                  onChange={(accountId) => {
                    updateActiveTabDraft({
                      [activeConfig.primaryAccountField]: accountId,
                      ...(activeTab === "exchange"
                        ? {}
                        : {
                            currency:
                              accountCurrency(lookups, accountId) ??
                              activeTabDraft.currency,
                          }),
                    });
                  }}
                />
                <FieldError
                  message={fieldErrors[activeConfig.primaryAccountField]}
                />

                {activeTab === "spend" ? (
                  <>
                    {activeTabDraft.spendMerchants.map(
                      (merchant, merchantIndex) => {
                        const merchantIsRetainedImportedRecord =
                          merchant.sourceRecordId !== undefined &&
                          replacement?.transaction.records.some(
                            (record) =>
                              record.record_id === merchant.sourceRecordId &&
                              record.source === "imported",
                          );
                        const merchantCanBeRemoved =
                          activeTabDraft.spendMerchants.length > 1;
                        return (
                          <fieldset
                            key={merchant.draftId}
                            className="flex flex-col gap-3 border-2 border-[var(--border-ink)] bg-[var(--band)] p-3"
                            aria-label={`Merchant ${merchantIndex + 1}`}
                          >
                            <legend className="font-heading px-1 text-xs font-semibold uppercase">
                              Merchant {merchantIndex + 1}
                            </legend>
                            <EntityPicker
                              key={`${pickerLifecycle}:${activeTab}:${merchant.draftId}:account`}
                              createConflictOptions={
                                createConflictOptions.accounts
                              }
                              createOption={createFlowAccountOption}
                              id={`spend-merchant-${merchantIndex}-account`}
                              label="Merchant account"
                              options={options.flowAccounts}
                              value={merchant.accountId}
                              onChange={(accountId) => {
                                updateSpendMerchant(merchantIndex, merchant, {
                                  accountId,
                                });
                              }}
                            />
                            <FieldError
                              message={
                                merchantFieldErrors[merchant.draftId]?.accountId
                              }
                            />
                            <div className="flex flex-col gap-1">
                              <label
                                htmlFor={`spend-merchant-${merchantIndex}-amount`}
                                className="text-sm font-semibold"
                              >
                                Amount
                              </label>
                              <input
                                id={`spend-merchant-${merchantIndex}-amount`}
                                inputMode="decimal"
                                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                                value={merchant.amount}
                                onBlur={() => {
                                  validateSpendMerchantField(
                                    merchant,
                                    "amount",
                                  );
                                }}
                                onChange={(event) => {
                                  updateSpendMerchant(merchantIndex, merchant, {
                                    amount: event.target.value,
                                  });
                                }}
                              />
                              <FieldError
                                message={
                                  merchantFieldErrors[merchant.draftId]?.amount
                                }
                              />
                            </div>
                            <EntityPicker
                              key={`${pickerLifecycle}:${activeTab}:${merchant.draftId}:category`}
                              createConflictOptions={
                                createConflictOptions.categories
                              }
                              createOption={(fqn) =>
                                createCategoryOption(fqn, "expense")
                              }
                              id={`spend-merchant-${merchantIndex}-category`}
                              label="Category"
                              options={options.categories}
                              value={merchant.categoryId}
                              onChange={(categoryId) => {
                                updateSpendMerchant(merchantIndex, merchant, {
                                  categoryId,
                                });
                              }}
                            />
                            <FieldError
                              message={
                                merchantFieldErrors[merchant.draftId]
                                  ?.categoryId
                              }
                            />
                            {merchantCanBeRemoved &&
                            merchantIsRetainedImportedRecord ? (
                              <Tooltip
                                label="Imported records keep their identity and cannot be removed"
                                className="w-full cursor-not-allowed"
                                redispatchEscape={false}
                                triggerLabel="Remove merchant unavailable"
                              >
                                <Button
                                  ref={(element) => {
                                    merchantRemoveButtonRefs.current[
                                      merchantIndex
                                    ] = element;
                                  }}
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  disabled={merchantIsRetainedImportedRecord}
                                >
                                  <Trash aria-hidden="true" />
                                  Remove merchant
                                </Button>
                              </Tooltip>
                            ) : merchantCanBeRemoved ? (
                              <Button
                                ref={(element) => {
                                  merchantRemoveButtonRefs.current[
                                    merchantIndex
                                  ] = element;
                                }}
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  updateActiveTabDraft({
                                    spendMerchants:
                                      activeTabDraft.spendMerchants.filter(
                                        (_merchant, index) =>
                                          index !== merchantIndex,
                                      ),
                                  });
                                  setMerchantFieldErrors((currentErrors) => {
                                    const nextErrors = { ...currentErrors };
                                    delete nextErrors[merchant.draftId];
                                    return nextErrors;
                                  });
                                  focusAfterMerchantRemoval(merchantIndex);
                                }}
                              >
                                <Trash aria-hidden="true" />
                                Remove merchant
                              </Button>
                            ) : null}
                          </fieldset>
                        );
                      },
                    )}
                    <Button
                      ref={addMerchantButtonRef}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const merchantIndex =
                          activeTabDraft.spendMerchants.length;
                        updateActiveTabDraft({
                          spendMerchants: [
                            ...activeTabDraft.spendMerchants,
                            blankSpendMerchantDraft(),
                          ],
                        });
                        focusAfterMerchantAddition(merchantIndex);
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Add merchant
                    </Button>
                  </>
                ) : (
                  <>
                    <EntityPicker
                      key={`${pickerLifecycle}:${activeTab}:${activeConfig.secondaryAccountField}`}
                      createConflictOptions={createConflictOptions.accounts}
                      createOption={
                        activeConfig.secondaryAccountOptionSet ===
                        "flowAccounts"
                          ? createFlowAccountOption
                          : undefined
                      }
                      id={`${activeTab}-${activeConfig.secondaryAccountField}`}
                      label={activeConfig.secondaryAccountLabel}
                      options={secondaryAccountOptions}
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
                  </>
                )}

                {activeTab === "exchange" ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="exchange-bought-amount"
                        className="text-sm font-semibold"
                      >
                        Amount bought
                      </label>
                      <input
                        id="exchange-bought-amount"
                        inputMode="decimal"
                        className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                        value={activeTabDraft.boughtAmount}
                        onBlur={() => {
                          validateField("boughtAmount");
                        }}
                        onChange={(event) => {
                          updateActiveTabDraft({
                            boughtAmount: event.target.value,
                          });
                        }}
                      />
                      <FieldError message={fieldErrors.boughtAmount} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="exchange-bought-currency"
                        className="text-sm font-semibold"
                      >
                        Currency bought
                      </label>
                      <input
                        id="exchange-bought-currency"
                        list="entry-currency-options"
                        className="bg-card read-only:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                        readOnly={exchangeBoughtAccountCurrency !== undefined}
                        value={exchangeBoughtCurrency}
                        onBlur={() => {
                          validateField("boughtCurrency");
                        }}
                        onChange={(event) => {
                          updateActiveTabDraft({
                            boughtCurrency: event.target.value.toUpperCase(),
                          });
                        }}
                      />
                      <FieldError message={fieldErrors.boughtCurrency} />
                    </div>
                    {exchangeRate ? (
                      <p className="min-w-0 font-mono text-sm break-all">
                        {exchangeRate}
                      </p>
                    ) : exchangeRateError ? (
                      <p
                        className="text-destructive font-mono text-xs"
                        role="alert"
                      >
                        {exchangeRateError}
                      </p>
                    ) : (
                      <p className="text-muted-foreground font-mono text-xs">
                        {!exchangeCurrenciesValid
                          ? "Enter valid exchange currencies to see the effective rate."
                          : "Enter both exchange amounts to see the effective rate."}
                      </p>
                    )}
                  </>
                ) : null}

                {activeTab !== "spend" &&
                activeTab !== "transfer" &&
                activeTab !== "exchange" ? (
                  <EntityPicker
                    key={`${pickerLifecycle}:${activeTab}:category`}
                    createConflictOptions={createConflictOptions.categories}
                    createOption={(fqn) =>
                      createCategoryOption(fqn, activeCategoryCreationIntent!)
                    }
                    disabled={!categoryPickerReady}
                    id={`${activeTab}-category`}
                    label={
                      activeTab === "refund" ? "Expense category" : "Category"
                    }
                    options={options.categories}
                    placeholder={
                      categoryPickerReady ? "Search" : "Loading categories"
                    }
                    value={activeTabDraft.categoryId}
                    onChange={(categoryId) => {
                      updateActiveTabDraft({ categoryId });
                    }}
                  />
                ) : null}
                {activeTab !== "transfer" && activeTab !== "exchange" ? (
                  <FieldError message={fieldErrors.categoryId} />
                ) : null}
                {activeTab !== "exchange" &&
                (activeTab !== "transfer" || activeTabDraft.chargeEnabled) ? (
                  <RetryableFieldError
                    message={categoryPicker.errorMessage}
                    onRetry={retryCategoryPicker}
                  />
                ) : null}

                <EntityMultiPicker
                  key={`${pickerLifecycle}:${activeTab}:tags`}
                  createConflictOptions={createConflictOptions.tags}
                  createOption={createTagOption}
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
                  key={`${pickerLifecycle}:${activeTab}:member`}
                  hierarchical={false}
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
                  activeTabDraft.chargeEnabled ? (
                    <fieldset
                      className="flex flex-col gap-3 border-2 border-[var(--border-ink)] bg-[var(--band)] p-3"
                      aria-label="Transfer charge"
                    >
                      <legend className="font-heading px-1 text-xs font-semibold uppercase">
                        Charge
                      </legend>
                      <EntityPicker
                        key={`${pickerLifecycle}:transfer:charge-account`}
                        createConflictOptions={createConflictOptions.accounts}
                        createOption={createFlowAccountOption}
                        id="transfer-charge-account"
                        label="Charge account"
                        options={options.flowAccounts}
                        value={activeTabDraft.chargeAccountId}
                        onChange={(chargeAccountId) => {
                          updateActiveTabDraft({ chargeAccountId });
                        }}
                      />
                      <FieldError message={fieldErrors.chargeAccountId} />
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="transfer-charge-amount"
                          className="text-sm font-semibold"
                        >
                          Charge amount
                        </label>
                        <input
                          id="transfer-charge-amount"
                          className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                          inputMode="decimal"
                          value={activeTabDraft.chargeAmount}
                          onBlur={() => {
                            validateField("chargeAmount");
                          }}
                          onChange={(event) => {
                            updateActiveTabDraft({
                              chargeAmount: event.target.value,
                            });
                          }}
                        />
                        <FieldError message={fieldErrors.chargeAmount} />
                      </div>
                      <EntityPicker
                        key={`${pickerLifecycle}:transfer:charge-category`}
                        createConflictOptions={createConflictOptions.categories}
                        createOption={(fqn) =>
                          createCategoryOption(fqn, "expense")
                        }
                        id="transfer-charge-category"
                        label="Charge category"
                        options={options.categories}
                        value={activeTabDraft.chargeCategoryId}
                        onChange={(chargeCategoryId) => {
                          updateActiveTabDraft({ chargeCategoryId });
                        }}
                      />
                      <FieldError message={fieldErrors.chargeCategoryId} />
                      {chargeIsRetainedImportedRecord ? (
                        <Tooltip
                          label="Imported records keep their identity and cannot be removed"
                          className="w-full cursor-not-allowed"
                          redispatchEscape={false}
                          triggerLabel="Remove charge unavailable"
                        >
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled
                          >
                            <Trash aria-hidden="true" />
                            Remove charge
                          </Button>
                        </Tooltip>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            updateActiveTabDraft({
                              chargeAccountId: undefined,
                              chargeAmount: "",
                              chargeCategoryId: undefined,
                              chargeEnabled: false,
                            });
                            focusAfterChargeRemoval();
                          }}
                        >
                          <Trash aria-hidden="true" />
                          Remove charge
                        </Button>
                      )}
                    </fieldset>
                  ) : (
                    <Button
                      ref={addChargeButtonRef}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        updateActiveTabDraft({
                          chargeEnabled: true,
                        });
                        focusAfterChargeAddition();
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Add charge
                    </Button>
                  )
                ) : null}

                {!replacement ? (
                  <label className="flex items-center gap-2 font-mono text-sm">
                    <Checkbox
                      checked={activeTabDraft.recordAsPending}
                      onCheckedChange={(checked) => {
                        updateActiveTabDraft({
                          recordAsPending: checked === true,
                        });
                      }}
                    />
                    Record as pending
                  </label>
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
              <>
                <ClassificationPreview
                  classification={classification}
                  error={classificationError}
                />
                <BalanceMeter balances={balances} />
              </>
            ) : null}
            {advancedFieldErrors.records ? (
              <FieldError message={advancedFieldErrors.records} />
            ) : null}
            {generalError ? (
              <p
                className="border-destructive bg-card text-destructive border-2 p-2 text-sm"
                role="alert"
              >
                {generalError}
              </p>
            ) : null}
            {attentionErrorCount > 0 ? (
              <button
                type="button"
                className="font-heading w-full border-2 border-[var(--color-class-adjustment-ink)] bg-[var(--color-class-adjustment-bright)] px-2 py-1 text-left text-xs font-semibold text-[var(--color-class-adjustment-ink)] uppercase"
                onClick={focusFirstError}
              >
                {attentionErrorCount}{" "}
                {attentionErrorCount === 1 ? "field needs" : "fields need"}{" "}
                attention
              </button>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="text-muted-foreground flex min-w-0 flex-1 items-center font-mono text-sm">
                {replacement ? (
                  <span className="truncate">
                    Replacing transaction #
                    {replacement.transaction.transaction_id}
                  </span>
                ) : (
                  <>
                    <span className="shrink-0">
                      Entries this session:{" "}
                      <span
                        key={sessionCount}
                        className="text-foreground inline-block animate-[score-pop_150ms_steps(2)]"
                      >
                        {sessionCount}
                      </span>
                    </span>
                    {latestSessionTransaction &&
                    latestSessionTransactionContext ? (
                      <Tooltip
                        label={latestSessionTransactionContext}
                        className="ml-2 min-w-0 xl:hidden"
                        triggerLabel={`Saved transaction ${latestSessionTransactionContext}`}
                      >
                        <span className="block truncate">
                          saved · {latestSessionTransaction.display_title}
                        </span>
                      </Tooltip>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!replacement ? (
                  <Button
                    ref={clearDraftButtonRef}
                    type="button"
                    variant="outline"
                    disabled={saving || clearingDraft}
                    onClick={requestClearDraft}
                  >
                    <Trash aria-hidden="true" />
                    {clearingDraft ? "Clearing" : "Clear draft"}
                  </Button>
                ) : null}
                {!replacement ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitDisabled}
                    onClick={() => {
                      void submit(true);
                    }}
                  >
                    <Check aria-hidden="true" />
                    {saving ? "Saving" : "Save and close"}
                  </Button>
                ) : null}
                <Button
                  ref={submitButtonRef}
                  type="submit"
                  disabled={submitDisabled}
                >
                  <Check aria-hidden="true" />
                  {saving
                    ? "Saving"
                    : replacement
                      ? "Update transaction"
                      : "Save and add another"}
                </Button>
              </div>
            </div>
          </div>
        </form>
        {!replacement ? (
          <aside
            className="bg-card hidden min-h-0 w-[280px] shrink-0 flex-col overflow-y-auto border-l-2 border-[var(--border-ink)] xl:flex"
            aria-label="Transaction entry context"
            aria-busy={clearingDraft}
            inert={clearingDraft ? true : undefined}
          >
            <section className="flex flex-col gap-1 p-3">
              <h3 className="font-heading text-xs font-bold uppercase">
                This session
              </h3>
              {sessionTransactions.length > 0 ? (
                sessionTransactions.map((transaction) => (
                  <EntryRailRow
                    key={transaction.transaction_id}
                    editable
                    maps={lookupMaps}
                    transaction={transaction}
                  />
                ))
              ) : (
                <p className="text-muted-foreground font-body text-xs">
                  Saved entries stamp in here.
                </p>
              )}
            </section>
            {recentTransactions.length > 0 ? (
              <section className="flex flex-col gap-1 border-t-2 border-[var(--border-ink)] p-3">
                <h3 className="font-heading text-xs font-bold uppercase">
                  Recent
                </h3>
                {recentTransactions.map((transaction) => (
                  <EntryRailRow
                    key={transaction.transaction_id}
                    editable={false}
                    maps={lookupMaps}
                    transaction={transaction}
                  />
                ))}
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
      <ConfirmationDialog
        cancelLabel="Keep draft"
        cancelPendingTooltip="Draft deletion is in progress; the saved draft cannot be reopened yet."
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Discard draft"
        confirmPendingTooltip="Draft deletion is already in progress."
        errorMessage={undefined}
        onConfirm={() => {
          void discardPendingLaunch();
        }}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !discardingPendingLaunch) {
            cancelPendingLaunch();
          }
        }}
        open={confirmDiscardDraftOpen}
        pending={discardingPendingLaunch}
        pendingLabel="Discarding"
        title="Discard entry draft"
      >
        <p>
          Opening this saved transaction will replace the current entry draft.
        </p>
      </ConfirmationDialog>
      <ConfirmationDialog
        cancelLabel="Keep draft"
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Replace draft"
        errorMessage={undefined}
        onConfirm={confirmTemplateApplication}
        onOpenChange={(nextOpen) => {
          setConfirmTemplateReplaceOpen(nextOpen);
          if (!nextOpen) {
            setPendingTemplateApplication(undefined);
            focusTemplatePicker();
          }
        }}
        open={confirmTemplateReplaceOpen}
        pending={false}
        pendingLabel="Replacing"
        title="Replace entry draft?"
      >
        <p>
          This template will permanently replace every unsaved field in the
          current draft.
        </p>
      </ConfirmationDialog>
      <ConfirmationDialog
        cancelLabel="Keep draft"
        cancelPendingTooltip="Draft deletion is in progress."
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Clear draft"
        confirmPendingTooltip="Draft deletion is already in progress."
        errorMessage={clearDraftError}
        onConfirm={() => {
          void resetCreateDraft();
        }}
        onOpenChange={(nextOpen) => {
          if (clearingDraft) {
            return;
          }
          setConfirmClearDraftOpen(nextOpen);
          if (!nextOpen) {
            setClearDraftError(undefined);
            window.requestAnimationFrame(() => {
              focusWithoutTooltip(clearDraftButtonRef.current, {
                preventScroll: true,
              });
            });
          }
        }}
        open={confirmClearDraftOpen}
        pending={clearingDraft}
        pendingLabel="Clearing"
        title="Clear entry draft?"
      >
        <p>
          Every unsaved field will return to its blank default. This cannot be
          undone; saved entries from this session will remain.
        </p>
      </ConfirmationDialog>
      <ConfirmationDialog
        cancelLabel="Keep editing"
        cancelPendingTooltip="Transaction refresh is in progress."
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Discard changes"
        confirmPendingTooltip="Transaction refresh is already in progress."
        errorMessage={undefined}
        onConfirm={() => {
          const refreshedReplacement = publishRefreshedReplacement();
          if (refreshedReplacement) {
            setDiscardingConflictedEdit(true);
            void refreshedReplacement.finally(() => {
              setDiscardingConflictedEdit(false);
              onClose();
            });
            return;
          }
          onClose();
        }}
        onOpenChange={(nextOpen) => {
          if (!discardingConflictedEdit) {
            setConfirmCloseDiscardOpen(nextOpen);
          }
        }}
        open={confirmCloseDiscardOpen}
        pending={discardingConflictedEdit}
        pendingLabel="Discarding"
        title="Discard transaction changes?"
      >
        <p>Your unsaved edits will be lost.</p>
      </ConfirmationDialog>
    </section>
  );
};
