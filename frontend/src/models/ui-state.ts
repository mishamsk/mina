export type ThemePreference = "system" | "light" | "dark";

export interface UiPreferences {
  readonly sidebarCollapsed: boolean;
  readonly theme: ThemePreference;
  readonly transactionEntryActiveTab: TransactionEntryType;
}

export type TransactionEntryType =
  "spend" | "income" | "refund" | "transfer" | "exchange" | "advanced";

export interface SpendMerchantDraft {
  readonly accountId: number | undefined;
  readonly amount: string;
  readonly categoryId: number | undefined;
  readonly draftId: string;
  readonly sourceRecordId?: number;
}

export type JournalRecordDraftSettlement = "pending" | "posted";

export type JournalRecordDraftReconciliationStatus =
  "reconciled" | "unreconciled";

export interface TransactionEntryTabDraft {
  readonly amount: string;
  readonly boughtAmount: string;
  readonly boughtAccountId: number | undefined;
  readonly boughtCurrency: string;
  readonly categoryId: number | undefined;
  readonly chargeAccountId: number | undefined;
  readonly chargeAmount: string;
  readonly chargeCategoryId: number | undefined;
  readonly chargeEnabled: boolean;
  readonly currency: string;
  readonly date: string;
  readonly destinationAccountId: number | undefined;
  readonly fundingAccountId: number | undefined;
  readonly memberId: number | undefined;
  readonly merchantAccountId: number | undefined;
  readonly memo: string;
  readonly recordAsPending: boolean;
  readonly sourceAccountId: number | undefined;
  readonly soldAccountId: number | undefined;
  readonly spendMerchants: readonly SpendMerchantDraft[];
  readonly tagIds: readonly number[];
}

export interface JournalRecordRowDraft {
  readonly accountId: number | undefined;
  readonly amount: string;
  readonly categoryId: number | undefined;
  readonly currency: string;
  readonly draftId: string;
  readonly memberId: number | undefined;
  readonly memo: string;
  readonly pendingDateTime: string;
  readonly postedDateTime: string;
  readonly sourceAmount: string | undefined;
  readonly sourceAmountUsd: string | null | undefined;
  readonly sourceCurrency: string | undefined;
  readonly sourceExternalId: string | null | undefined;
  readonly sourceExternalSystem: string | null | undefined;
  readonly sourcePendingDate: string | null | undefined;
  readonly sourcePostedDate: string | null | undefined;
  readonly settlement: JournalRecordDraftSettlement;
  readonly reconciliationStatus: JournalRecordDraftReconciliationStatus;
  readonly source: "imported" | "manual";
  readonly tagIds: readonly number[];
}

export interface AdvancedTransactionEntryDraft {
  readonly date: string;
  readonly originatingShorthandTab?: Exclude<TransactionEntryType, "advanced">;
  readonly records: readonly JournalRecordRowDraft[];
}

export interface TransactionEntryDraft {
  readonly activeTab: TransactionEntryType;
  readonly advanced: AdvancedTransactionEntryDraft;
  readonly tabs: Record<
    Exclude<TransactionEntryType, "advanced">,
    TransactionEntryTabDraft
  >;
}
