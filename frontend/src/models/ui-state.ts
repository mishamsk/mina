export type ThemePreference = "system" | "light" | "dark";

export interface UiPreferences {
  readonly sidebarCollapsed: boolean;
  readonly theme: ThemePreference;
}

export interface StatusPageUiState {
  readonly showDetails: boolean;
}

export type TransactionEntryType =
  "spend" | "income" | "refund" | "transfer" | "advanced";

export type JournalRecordDraftPostingStatus =
  "cancelled" | "expected" | "pending" | "posted";

export type JournalRecordDraftReconciliationStatus =
  "reconciled" | "unreconciled";

export interface TransactionEntryTabDraft {
  readonly amount: string;
  readonly categoryId: number | undefined;
  readonly currency: string;
  readonly date: string;
  readonly destinationAccountId: number | undefined;
  readonly fundingAccountId: number | undefined;
  readonly memberId: number | undefined;
  readonly merchantAccountId: number | undefined;
  readonly memo: string;
  readonly sourceAccountId: number | undefined;
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
  readonly sourceAmount: string | undefined;
  readonly sourceAmountUsd: string | null | undefined;
  readonly sourceCurrency: string | undefined;
  readonly sourceExternalId: string | null | undefined;
  readonly sourceExternalSystem: string | null | undefined;
  readonly pendingDateTime: string;
  readonly postedDateTime: string;
  readonly postingStatus: JournalRecordDraftPostingStatus;
  readonly reconciliationStatus: JournalRecordDraftReconciliationStatus;
  readonly showDates: boolean;
  readonly tagIds: readonly number[];
}

export interface AdvancedTransactionEntryDraft {
  readonly date: string;
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
