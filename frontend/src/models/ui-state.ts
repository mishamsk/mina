export type ThemePreference = "system" | "light" | "dark";

export interface UiPreferences {
  readonly sidebarCollapsed: boolean;
  readonly theme: ThemePreference;
}

export interface StatusPageUiState {
  readonly showDetails: boolean;
}

export type TransactionEntryType = "spend" | "income" | "refund" | "transfer";

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

export interface TransactionEntryDraft {
  readonly activeTab: TransactionEntryType;
  readonly tabs: Record<TransactionEntryType, TransactionEntryTabDraft>;
}
