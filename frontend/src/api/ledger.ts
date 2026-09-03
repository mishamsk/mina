import {
  normalizeTransactionFilters,
  type TransactionFilters,
} from "@/models/transaction-filters";
import type {
  TransactionSort,
  TransactionSortDirection,
} from "@/models/transaction-sorting";

import type {
  AccountingHistoryRange,
  AccountType,
  CategoryEconomicIntent,
  ClassifyTransactionRequest,
  CreateAccountRequest,
  CreateCategoryRequest,
  CreateCreditLimitHistoryRequest,
  CreateExchangeTransactionRequest,
  CreateIncomeTransactionRequest,
  CreateMemberRequest,
  CreateRefundTransactionRequest,
  CreateSpendTransactionRequest,
  CreateTagRequest,
  CreateTransactionRequest,
  CreateTransferTransactionRequest,
  HouseholdFlowBreakdownDimension,
  HouseholdFlowDataset,
  HouseholdFlowEntityResponse,
  HouseholdFlowGrain,
  HouseholdFlowTrend,
  ReconciliationStatus,
  RestructureRequest,
  SetHiddenByPathRequest,
  SettlementStatus,
  Transaction,
  TransactionTemplateWriteRequest,
  UpdateAccountRequest,
  UpdateCategoryRequest,
  UpdateMemberHiddenRequest,
  UpdateMemberRequest,
  UpdateTagRequest,
  UpdateTransactionRequest,
} from "./generated-access";
import {
  bulkCategorizeJournalRecords,
  bulkReplaceTransactionAccount,
  bulkSetJournalRecordMember,
  bulkSetJournalRecordReconciliation,
  bulkSetJournalRecordSettlement,
  bulkUpdateJournalRecordTags,
  cancelTransaction,
  classifyTransaction,
  confirmExpectedTransaction as confirmGeneratedExpectedTransaction,
  createAccount as createGeneratedAccount,
  createCategory as createGeneratedCategory,
  createCreditLimitHistory as createGeneratedCreditLimitHistory,
  createExchangeTransaction,
  createIncomeTransaction,
  createMember as createGeneratedMember,
  createRefundTransaction,
  createSpendTransaction,
  createTag as createGeneratedTag,
  createTransaction as createGeneratedTransaction,
  createTransactionTemplate as createGeneratedTransactionTemplate,
  createTransferTransaction,
  deleteAccount as deleteGeneratedAccount,
  deleteCategory as deleteGeneratedCategory,
  deleteCreditLimitHistory as deleteGeneratedCreditLimitHistory,
  deleteMember as deleteGeneratedMember,
  deleteTag as deleteGeneratedTag,
  deleteTransaction,
  deleteTransactionTemplate as deleteGeneratedTransactionTemplate,
  dismissExpectedTransaction as dismissGeneratedExpectedTransaction,
  getAccount,
  getAccountingHistoryRange,
  getCategoryGroupOverview,
  getCategoryOverview,
  getHouseholdFlowReport,
  getTagGroupOverview,
  getTagOverview,
  getTransaction,
  getTransactionMonthTotals,
  listAccountBalances,
  listAccountGroups,
  listAccounts,
  listCategories,
  listCategoryGroups,
  listCreditLimitHistory as listGeneratedCreditLimitHistory,
  listMembers,
  listTagGroups,
  listTags,
  listTransactions,
  listTransactionTemplates,
  replaceTransaction as replaceGeneratedTransaction,
  replaceTransactionTemplate as replaceGeneratedTransactionTemplate,
  restoreTransaction,
  restructureAccounts as restructureGeneratedAccounts,
  restructureCategories as restructureGeneratedCategories,
  restructureTags as restructureGeneratedTags,
  restructureTransactionTemplates as restructureGeneratedTransactionTemplates,
  searchAccountJournalRecords,
  searchJournalRecords,
  setAccountHiddenByPath as setGeneratedAccountHiddenByPath,
  setCategoryHiddenByPath as setGeneratedCategoryHiddenByPath,
  setTagHiddenByPath as setGeneratedTagHiddenByPath,
  updateAccount as updateGeneratedAccount,
  updateCategory as updateGeneratedCategory,
  updateMember as updateGeneratedMember,
  updateMemberHidden as updateGeneratedMemberHidden,
  updateTag as updateGeneratedTag,
} from "./generated-access";

export interface TransactionPageParams {
  readonly anchorDate?: string;
  readonly filters?: Partial<TransactionFilters>;
  readonly includeExpectedByDefault?: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly sort: TransactionSort;
  readonly sortDirection: TransactionSortDirection;
}

export interface AccountRecordsPageParams {
  readonly includeRunningBalance: boolean;
  readonly limit: number;
  readonly offset: number;
}

export interface GroupRecordsPageParams {
  readonly accountFqnPrefix: string;
  readonly limit: number;
  readonly offset: number;
}

const lookupLimit = 500;

const listTransactionTemplatesPage = (offset: number, q?: string) =>
  listTransactionTemplates({
    query: {
      limit: lookupLimit,
      offset,
      q,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

export const fetchAllTransactionTemplates = async (q?: string) => {
  const firstPage = await listTransactionTemplatesPage(0, q);
  if (
    !firstPage.data ||
    firstPage.data.transaction_templates.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const transactionTemplates = [...firstPage.data.transaction_templates];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    const page = await listTransactionTemplatesPage(offset, q);
    if (!page.data) {
      return page;
    }
    transactionTemplates.push(...page.data.transaction_templates);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      transaction_templates: transactionTemplates,
    },
  };
};

const listAccountsPageForLookups = (offset: number) =>
  listAccounts({
    query: {
      include_hidden: true,
      include_tombstoned: true,
      limit: lookupLimit,
      offset,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllAccountsForLookups = async () => {
  const firstPage = await listAccountsPageForLookups(0);
  if (
    !firstPage.data ||
    firstPage.data.accounts.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const accounts = [...firstPage.data.accounts];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    const page = await listAccountsPageForLookups(offset);
    if (!page.data) {
      return page;
    }
    accounts.push(...page.data.accounts);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      accounts,
    },
  };
};

const listCategoriesPageForLookups = (offset: number) =>
  listCategories({
    query: {
      include_hidden: true,
      include_tombstoned: true,
      limit: lookupLimit,
      offset,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllCategoriesForLookups = async () => {
  const firstPage = await listCategoriesPageForLookups(0);
  if (
    !firstPage.data ||
    firstPage.data.categories.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const categories = [...firstPage.data.categories];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    const page = await listCategoriesPageForLookups(offset);
    if (!page.data) return page;
    categories.push(...page.data.categories);
  }

  return {
    ...firstPage,
    data: { ...firstPage.data, categories },
  };
};

const listTagsPageForLookups = (offset: number) =>
  listTags({
    query: {
      include_hidden: true,
      include_tombstoned: true,
      limit: lookupLimit,
      offset,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllTagsForLookups = async () => {
  const firstPage = await listTagsPageForLookups(0);
  if (
    !firstPage.data ||
    firstPage.data.tags.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const tags = [...firstPage.data.tags];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    const page = await listTagsPageForLookups(offset);
    if (!page.data) return page;
    tags.push(...page.data.tags);
  }

  return {
    ...firstPage,
    data: { ...firstPage.data, tags },
  };
};

const listMembersPageForLookups = (offset: number) =>
  listMembers({
    query: {
      include_hidden: true,
      include_tombstoned: true,
      limit: lookupLimit,
      offset,
      sort: "name",
      sort_dir: "asc",
    },
  });

const listAllMembersForLookups = async () => {
  const firstPage = await listMembersPageForLookups(0);
  if (
    !firstPage.data ||
    firstPage.data.members.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const members = [...firstPage.data.members];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    const page = await listMembersPageForLookups(offset);
    if (!page.data) return page;
    members.push(...page.data.members);
  }

  return {
    ...firstPage,
    data: { ...firstPage.data, members },
  };
};

const transactionFilterQuery = (
  filters: Partial<TransactionFilters> | undefined,
  includeExpectedByDefault = false,
) => {
  const normalized = normalizeTransactionFilters(filters);
  return {
    ...(normalized.filterText !== undefined
      ? { filter: normalized.filterText }
      : includeExpectedByDefault
        ? {
            filter:
              "(lifecycle:active or lifecycle:expected or lifecycle:cancelled)",
          }
        : {}),
    ...(normalized.classes.length > 0
      ? { transaction_class: [...normalized.classes] }
      : {}),
    ...(normalized.search ? { search: normalized.search } : {}),
  };
};

export type EntityOverviewRequest =
  | {
      readonly entityKind: "category";
      readonly scopeKind: "leaf";
      readonly entityId: number;
    }
  | {
      readonly entityKind: "category";
      readonly scopeKind: "group";
      readonly fqn: string;
    }
  | {
      readonly entityKind: "tag";
      readonly scopeKind: "leaf";
      readonly entityId: number;
    }
  | {
      readonly entityKind: "tag";
      readonly scopeKind: "group";
      readonly fqn: string;
    };

export interface HouseholdFlowSelection {
  readonly breakdown: HouseholdFlowBreakdownDimension;
  readonly excludedContributorIds: readonly string[];
  readonly grain: HouseholdFlowGrain;
  readonly namedSeriesCount: number;
  readonly periodCount: number;
  readonly anchorDate: string;
  readonly trend: HouseholdFlowTrend;
}

export const householdFlowSelectionFromDataset = (
  dataset: HouseholdFlowDataset,
): HouseholdFlowSelection => ({
  breakdown: dataset.configuration.breakdown_dimension,
  excludedContributorIds: dataset.configuration.excluded_contributor_ids,
  grain: dataset.configuration.grain,
  namedSeriesCount: dataset.configuration.named_series_count,
  periodCount: dataset.configuration.period_count,
  anchorDate:
    dataset.configuration.anchor_period.length === 4
      ? `${dataset.configuration.anchor_period}-01-01`
      : `${dataset.configuration.anchor_period}-01`,
  trend: dataset.configuration.trend,
});

const householdFlowQuery = (selection?: HouseholdFlowSelection) =>
  selection
    ? {
        breakdown: selection.breakdown,
        excluded_contributor_id: [...selection.excludedContributorIds],
        grain: selection.grain,
        named_series_count: selection.namedSeriesCount,
        anchor_date: selection.anchorDate,
        period_count: selection.periodCount,
        trend: selection.trend,
      }
    : undefined;

export const fetchEntityOverview = (
  request: EntityOverviewRequest,
  selection?: HouseholdFlowSelection,
): Promise<{
  data?: HouseholdFlowEntityResponse;
  error?: unknown;
  response?: Response;
}> => {
  if (request.entityKind === "category" && request.scopeKind === "leaf") {
    return getCategoryOverview({
      path: { category_id: request.entityId },
      query: householdFlowQuery(selection),
    });
  }
  if (request.entityKind === "category") {
    return getCategoryGroupOverview({
      query: { fqn: request.fqn, ...householdFlowQuery(selection) },
    });
  }
  if (request.scopeKind === "leaf") {
    return getTagOverview({
      path: { tag_id: request.entityId },
      query: householdFlowQuery(selection),
    });
  }
  return getTagGroupOverview({
    query: { fqn: request.fqn, ...householdFlowQuery(selection) },
  });
};

export const fetchHouseholdFlowReport = (
  selection?: HouseholdFlowSelection,
): Promise<{
  data?: HouseholdFlowDataset;
  error?: unknown;
}> => getHouseholdFlowReport({ query: householdFlowQuery(selection) });

export const fetchAccountingHistoryRange = (): Promise<{
  data?: AccountingHistoryRange;
  error?: unknown;
}> => getAccountingHistoryRange();

export const fetchTransactionPage = (params: TransactionPageParams) =>
  listTransactions({
    query: {
      limit: params.limit,
      offset: params.offset,
      anchor_date: params.anchorDate,
      ...transactionFilterQuery(
        params.filters,
        params.includeExpectedByDefault,
      ),
      sort: params.sort,
      sort_dir: params.sortDirection,
    },
  });

export const fetchTransactionById = (transactionId: number) =>
  getTransaction({
    path: {
      transaction_id: transactionId,
    },
  });

export const fetchAccountRecordsPage = (
  accountId: number,
  params: AccountRecordsPageParams,
) =>
  searchAccountJournalRecords({
    path: {
      account_id: accountId,
    },
    query: {
      include_running_balance: params.includeRunningBalance,
      limit: params.limit,
      offset: params.offset,
      sort: "initiated_date",
      sort_dir: "desc",
    },
  });

export const fetchGroupRecordsPage = (params: GroupRecordsPageParams) =>
  searchJournalRecords({
    query: {
      account_fqn_prefix: params.accountFqnPrefix,
      limit: params.limit,
      offset: params.offset,
      sort: "initiated_date",
      sort_dir: "desc",
    },
  });

export const fetchAccountHeader = async (accountId: number) => {
  const account = await getAccount({
    path: {
      account_id: accountId,
    },
    query: {
      include_tombstoned: true,
    },
  });
  const [balances, creditLimitHistory] = await Promise.all([
    listAccountBalances({
      query: {
        account_ids: [accountId],
        include_hidden: true,
      },
    }),
    account.data?.tombstoned_at
      ? Promise.resolve({
          data: {
            credit_limit_history: [],
            total_count: 0,
          },
          error: undefined,
        })
      : fetchCreditLimitHistory(accountId),
  ]);

  return { account, balances, creditLimitHistory };
};

export const deleteTransactionById = (transactionId: number) =>
  deleteTransaction({
    path: {
      transaction_id: transactionId,
    },
  });

export const deleteTransactionTemplateById = (transactionTemplateId: number) =>
  deleteGeneratedTransactionTemplate({
    path: {
      transaction_template_id: transactionTemplateId,
    },
  });

export const createLedgerTransactionTemplate = (
  request: TransactionTemplateWriteRequest,
) => createGeneratedTransactionTemplate({ body: request });

export const replaceLedgerTransactionTemplate = (
  transactionTemplateId: number,
  request: TransactionTemplateWriteRequest,
) =>
  replaceGeneratedTransactionTemplate({
    body: request,
    path: { transaction_template_id: transactionTemplateId },
  });

export const restructureLedgerTransactionTemplates = (
  request: RestructureRequest,
) => restructureGeneratedTransactionTemplates({ body: request });

export const cancelTransactionById = (transactionId: number) =>
  cancelTransaction({ path: { transaction_id: transactionId } });

export const restoreTransactionById = (transactionId: number) =>
  restoreTransaction({ path: { transaction_id: transactionId } });

export const fetchLedgerLookups = async () => {
  const [accounts, categories, tags, members] = await Promise.all([
    listAllAccountsForLookups(),
    listAllCategoriesForLookups(),
    listAllTagsForLookups(),
    listAllMembersForLookups(),
  ]);

  return { accounts, categories, members, tags };
};

export const fetchAccountGroupsForLookups = () =>
  listAccountGroups({
    query: {
      include_hidden: true,
    },
  });

export const fetchFeaturedAccountBalances = async () => {
  const [ownedAccounts, partyAccounts] = await Promise.all([
    listAccounts({
      query: {
        account_type: ["owned"],
        is_featured: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listAccounts({
      query: {
        account_type: ["party"],
        is_featured: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
  ]);
  if (!ownedAccounts.data) {
    return { accounts: ownedAccounts, balances: undefined };
  }
  if (!partyAccounts.data) {
    return { accounts: partyAccounts, balances: undefined };
  }
  const accounts = ownedAccounts;
  accounts.data.accounts = [
    ...ownedAccounts.data.accounts,
    ...partyAccounts.data.accounts,
  ].sort((left, right) => left.fqn.localeCompare(right.fqn));
  accounts.data.total_count += partyAccounts.data.total_count;

  if (accounts.data.accounts.length === 0) {
    return { accounts, balances: undefined };
  }

  const balances = await listAccountBalances({
    query: {
      account_ids: accounts.data.accounts.map((account) => account.account_id),
    },
  });

  return { accounts, balances };
};

export interface AccountsManagementParams {
  readonly accountTypes: readonly AccountType[];
  readonly includeHidden: boolean;
  readonly q: string;
}

export interface CategoriesManagementParams {
  readonly economicIntent?: CategoryEconomicIntent;
  readonly includeHidden: boolean;
  readonly q: string;
}

export interface TagsManagementParams {
  readonly includeHidden: boolean;
  readonly q: string;
}

export interface MembersManagementParams {
  readonly includeHidden: boolean;
  readonly q: string;
}

const listAccountsPageForManagement = (
  offset: number,
  params: AccountsManagementParams,
) =>
  listAccounts({
    query: {
      account_type:
        params.accountTypes.length > 0 ? [...params.accountTypes] : undefined,
      include_hidden: params.includeHidden,
      limit: lookupLimit,
      offset,
      q: params.q || undefined,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllAccountsForManagement = async (
  params: AccountsManagementParams,
  shouldContinue: () => boolean,
) => {
  const firstPage = await listAccountsPageForManagement(0, params);
  if (
    !firstPage.data ||
    firstPage.data.accounts.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }
  const accounts = [...firstPage.data.accounts];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    if (!shouldContinue()) {
      return firstPage;
    }
    const page = await listAccountsPageForManagement(offset, params);
    if (!page.data) {
      return page;
    }
    accounts.push(...page.data.accounts);
  }
  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      accounts,
    },
  };
};

export const fetchAccountsPage = async (
  params: AccountsManagementParams,
  shouldContinue: () => boolean = () => true,
) => {
  const [accounts, balances, groups] = await Promise.all([
    listAllAccountsForManagement(params, shouldContinue),
    listAccountBalances({
      query: {
        include_hidden: params.includeHidden,
      },
    }),
    listAccountGroups({
      query: {
        include_hidden: params.includeHidden,
      },
    }),
  ]);

  return { accounts, balances, groups };
};

const listCategoriesPageForManagement = (
  offset: number,
  params: CategoriesManagementParams,
) =>
  listCategories({
    query: {
      economic_intent: params.economicIntent
        ? [params.economicIntent]
        : undefined,
      include_hidden: params.includeHidden,
      limit: lookupLimit,
      offset,
      q: params.q || undefined,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

export const fetchCategoriesForManagement = async (
  params: CategoriesManagementParams,
  shouldContinue: () => boolean = () => true,
) => {
  const firstPage = await listCategoriesPageForManagement(0, params);
  if (
    !firstPage.data ||
    firstPage.data.categories.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const categories = [...firstPage.data.categories];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    if (!shouldContinue()) {
      return firstPage;
    }
    const page = await listCategoriesPageForManagement(offset, params);
    if (!page.data) {
      return page;
    }
    categories.push(...page.data.categories);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      categories,
    },
  };
};

export const fetchCategoriesPage = async (
  params: CategoriesManagementParams,
  shouldContinue: () => boolean = () => true,
) => {
  const [categories, groups] = await Promise.all([
    fetchCategoriesForManagement(params, shouldContinue),
    listCategoryGroups({
      query: {
        include_hidden: params.includeHidden,
      },
    }),
  ]);

  return { categories, groups };
};

const listTagsPageForManagement = (
  offset: number,
  params: TagsManagementParams,
) =>
  listTags({
    query: {
      include_hidden: params.includeHidden,
      limit: lookupLimit,
      offset,
      q: params.q || undefined,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllTagsForManagement = async (
  params: TagsManagementParams,
  shouldContinue: () => boolean,
) => {
  const firstPage = await listTagsPageForManagement(0, params);
  if (
    !firstPage.data ||
    firstPage.data.tags.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const tags = [...firstPage.data.tags];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    if (!shouldContinue()) {
      return firstPage;
    }
    const page = await listTagsPageForManagement(offset, params);
    if (!page.data) {
      return page;
    }
    tags.push(...page.data.tags);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      tags,
    },
  };
};

export const fetchTagsPage = async (
  params: TagsManagementParams,
  shouldContinue: () => boolean = () => true,
) => {
  const [tags, groups] = await Promise.all([
    listAllTagsForManagement(params, shouldContinue),
    listTagGroups({
      query: {
        include_hidden: params.includeHidden,
      },
    }),
  ]);

  return { groups, tags };
};

const listMembersPageForManagement = (
  offset: number,
  params: MembersManagementParams,
) =>
  listMembers({
    query: {
      include_hidden: params.includeHidden,
      limit: lookupLimit,
      offset,
      q: params.q || undefined,
      sort: "name",
      sort_dir: "asc",
    },
  });

const listAllMembersForManagement = async (
  params: MembersManagementParams,
  shouldContinue: () => boolean,
) => {
  const firstPage = await listMembersPageForManagement(0, params);
  if (
    !firstPage.data ||
    firstPage.data.members.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const members = [...firstPage.data.members];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    if (!shouldContinue()) {
      return firstPage;
    }
    const page = await listMembersPageForManagement(offset, params);
    if (!page.data) {
      return page;
    }
    members.push(...page.data.members);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      members,
    },
  };
};

export const fetchMembersPage = (
  params: MembersManagementParams,
  shouldContinue: () => boolean = () => true,
) => listAllMembersForManagement(params, shouldContinue);

export const confirmExpectedTransactionById = (
  transaction: Pick<Transaction, "transaction_id"> & {
    readonly actual_date?: string;
  },
) =>
  confirmGeneratedExpectedTransaction({
    body: { actual_date: transaction.actual_date, status: "posted" },
    path: {
      transaction_id: transaction.transaction_id,
    },
  });

export const dismissExpectedTransactionById = (
  transaction: Pick<Transaction, "transaction_id">,
) =>
  dismissGeneratedExpectedTransaction({
    path: {
      transaction_id: transaction.transaction_id,
    },
  });

export const fetchOverviewAccountBalances = () => listAccountBalances();

export const fetchOverviewAccounts = () =>
  listAccounts({
    query: {
      limit: lookupLimit,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

export const fetchAccountsByIds = (accountIds: readonly number[]) =>
  Promise.all(
    [...new Set(accountIds)].map((accountId) =>
      getAccount({
        path: {
          account_id: accountId,
        },
        query: {
          include_tombstoned: true,
        },
      }),
    ),
  );

export const fetchTransactionMonthTotalsByMonth = (month: string) =>
  getTransactionMonthTotals({
    query: {
      month,
    },
  });

export const createLedgerAccount = (body: CreateAccountRequest) =>
  createGeneratedAccount({ body });

export const updateLedgerAccount = (
  accountId: number,
  body: UpdateAccountRequest,
) =>
  updateGeneratedAccount({
    body,
    path: {
      account_id: accountId,
    },
  });

export const deleteLedgerAccountById = (accountId: number) =>
  deleteGeneratedAccount({
    path: {
      account_id: accountId,
    },
  });

export const setLedgerAccountHiddenByPath = (body: SetHiddenByPathRequest) =>
  setGeneratedAccountHiddenByPath({ body });

export const restructureLedgerAccounts = (body: RestructureRequest) =>
  restructureGeneratedAccounts({ body });

export const createLedgerCategory = (body: CreateCategoryRequest) =>
  createGeneratedCategory({ body });

export const updateLedgerCategory = (
  categoryId: number,
  body: UpdateCategoryRequest,
) =>
  updateGeneratedCategory({
    body,
    path: {
      category_id: categoryId,
    },
  });

export const deleteLedgerCategoryById = (categoryId: number) =>
  deleteGeneratedCategory({
    path: {
      category_id: categoryId,
    },
  });

export const setLedgerCategoryHiddenByPath = (body: SetHiddenByPathRequest) =>
  setGeneratedCategoryHiddenByPath({ body });

export const restructureLedgerCategories = (body: RestructureRequest) =>
  restructureGeneratedCategories({ body });

export const createLedgerTag = (body: CreateTagRequest) =>
  createGeneratedTag({ body });

export const updateLedgerTag = (tagId: number, body: UpdateTagRequest) =>
  updateGeneratedTag({
    body,
    path: {
      tag_id: tagId,
    },
  });

export const deleteLedgerTagById = (tagId: number) =>
  deleteGeneratedTag({
    path: {
      tag_id: tagId,
    },
  });

export const setLedgerTagHiddenByPath = (body: SetHiddenByPathRequest) =>
  setGeneratedTagHiddenByPath({ body });

export const restructureLedgerTags = (body: RestructureRequest) =>
  restructureGeneratedTags({ body });

export const createLedgerMember = (body: CreateMemberRequest) =>
  createGeneratedMember({ body });

export const updateLedgerMember = (
  memberId: number,
  body: UpdateMemberRequest,
) =>
  updateGeneratedMember({
    body,
    path: {
      member_id: memberId,
    },
  });

export const updateLedgerMemberHidden = (
  memberId: number,
  body: UpdateMemberHiddenRequest,
) =>
  updateGeneratedMemberHidden({
    body,
    path: {
      member_id: memberId,
    },
  });

export const deleteLedgerMemberById = (memberId: number) =>
  deleteGeneratedMember({
    path: {
      member_id: memberId,
    },
  });

export const fetchCreditLimitHistory = (accountId: number) =>
  listGeneratedCreditLimitHistory({
    path: {
      account_id: accountId,
    },
    query: {
      limit: lookupLimit,
      offset: 0,
      sort: "effective_date",
      sort_dir: "desc",
    },
  });

export const createLedgerCreditLimitHistory = (
  accountId: number,
  body: CreateCreditLimitHistoryRequest,
) =>
  createGeneratedCreditLimitHistory({
    body,
    path: {
      account_id: accountId,
    },
  });

export const deleteLedgerCreditLimitHistoryById = (
  creditLimitHistoryId: number,
) =>
  deleteGeneratedCreditLimitHistory({
    path: {
      credit_limit_history_id: creditLimitHistoryId,
    },
  });

export const createSpend = (body: CreateSpendTransactionRequest) =>
  createSpendTransaction({ body });

export const createIncome = (body: CreateIncomeTransactionRequest) =>
  createIncomeTransaction({ body });

export const createRefund = (body: CreateRefundTransactionRequest) =>
  createRefundTransaction({ body });

export const createTransfer = (body: CreateTransferTransactionRequest) =>
  createTransferTransaction({ body });

export const createExchange = (body: CreateExchangeTransactionRequest) =>
  createExchangeTransaction({ body });

export const classifyJournalTransaction = (body: ClassifyTransactionRequest) =>
  classifyTransaction({
    body: {
      records: body.records.map((record) => ({
        account_id: record.account_id,
        amount: record.amount,
        category_id: record.category_id,
        currency: record.currency,
      })),
    },
  });

export const createJournalTransaction = (body: CreateTransactionRequest) =>
  createGeneratedTransaction({ body });

export const replaceLedgerTransaction = (
  transactionId: number,
  etag: string,
  body: UpdateTransactionRequest,
) =>
  replaceGeneratedTransaction({
    body,
    headers: {
      "If-Match": etag,
    },
    path: {
      transaction_id: transactionId,
    },
  });

export const updateJournalRecordsCategory = (
  recordIds: readonly number[],
  categoryId: number,
) =>
  bulkCategorizeJournalRecords({
    body: {
      category_id: categoryId,
      record_ids: [...recordIds],
    },
  });

export const updateJournalRecordsTagsOperation = (
  recordIds: readonly number[],
  operation: "add" | "remove",
  tagIds: readonly number[],
) =>
  bulkUpdateJournalRecordTags({
    body: {
      ...(operation === "add"
        ? { add_tag_ids: [...tagIds] }
        : { remove_tag_ids: [...tagIds] }),
      record_ids: [...recordIds],
    },
  });

export const updateJournalRecordsMember = (
  recordIds: readonly number[],
  memberId: number | null,
) =>
  bulkSetJournalRecordMember({
    body: {
      member_id: memberId,
      record_ids: [...recordIds],
    },
  });

export const replaceTransactionAccount = (
  transactionIds: readonly number[],
  sourceAccountId: number,
  replacementAccountId: number,
) =>
  bulkReplaceTransactionAccount({
    body: {
      replacement_account_id: replacementAccountId,
      source_account_id: sourceAccountId,
      transaction_ids: [...transactionIds],
    },
  });

export const updateJournalRecordsSettlement = (
  recordIds: readonly number[],
  settlement: SettlementStatus,
  dates: {
    readonly pendingDate?: string;
    readonly postedDate?: string;
  } = {},
) =>
  bulkSetJournalRecordSettlement({
    body: {
      ...(dates.pendingDate ? { pending_date: dates.pendingDate } : {}),
      ...(dates.postedDate ? { posted_date: dates.postedDate } : {}),
      record_ids: [...recordIds],
      settlement,
    },
  });

export const updateJournalRecordsReconciliation = (
  recordIds: readonly number[],
  reconciliationStatus: ReconciliationStatus,
) =>
  bulkSetJournalRecordReconciliation({
    body: {
      reconciliation_status: reconciliationStatus,
      record_ids: [...recordIds],
    },
  });
