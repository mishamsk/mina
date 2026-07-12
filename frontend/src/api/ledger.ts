import {
  defaultTransactionPostingStatuses,
  normalizeTransactionFilters,
  type TransactionFilters,
} from "@/models/transaction-filters";

import type {
  CategoryEconomicIntent,
  CreateAccountRequest,
  CreateCategoryRequest,
  CreateCreditLimitHistoryRequest,
  CreateIncomeTransactionRequest,
  CreateMemberRequest,
  CreateRefundTransactionRequest,
  CreateSpendTransactionRequest,
  CreateTagRequest,
  CreateTransactionRequest,
  CreateTransferTransactionRequest,
  RecurringOccurrence,
  RestructureRequest,
  SetHiddenByPathRequest,
  Transaction,
  UpdateAccountRequest,
  UpdateCategoryRequest,
  UpdateMemberHiddenRequest,
  UpdateMemberRequest,
  UpdateTagRequest,
  UpdateTransactionRequest,
} from "./generated";
import {
  confirmRecurringOccurrence as confirmGeneratedRecurringOccurrence,
  createAccount as createGeneratedAccount,
  createCategory as createGeneratedCategory,
  createCreditLimitHistory as createGeneratedCreditLimitHistory,
  createIncomeTransaction,
  createMember as createGeneratedMember,
  createRefundTransaction,
  createSpendTransaction,
  createTag as createGeneratedTag,
  createTransaction as createGeneratedTransaction,
  createTransferTransaction,
  deleteAccount as deleteGeneratedAccount,
  deleteCategory as deleteGeneratedCategory,
  deleteCreditLimitHistory as deleteGeneratedCreditLimitHistory,
  deleteMember as deleteGeneratedMember,
  deleteTag as deleteGeneratedTag,
  deleteTransaction,
  dismissRecurringOccurrence as dismissGeneratedRecurringOccurrence,
  getAccount,
  getTransaction,
  getTransactionMonthTotals,
  listAccountBalances,
  listAccountGroups,
  listAccounts,
  listCategories,
  listCategoryGroups,
  listCreditLimitHistory as listGeneratedCreditLimitHistory,
  listMembers,
  listRecurringDefinitions,
  listRecurringOccurrences,
  listTagGroups,
  listTags,
  listTransactions,
  replaceTransaction as replaceGeneratedTransaction,
  restructureAccounts as restructureGeneratedAccounts,
  restructureCategories as restructureGeneratedCategories,
  restructureTags as restructureGeneratedTags,
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
} from "./generated";

export interface TransactionPageParams {
  readonly anchorDate?: string;
  readonly filters?: Partial<TransactionFilters>;
  readonly limit: number;
  readonly offset: number;
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

const dateTimeBound = (date: string, boundary: "end" | "start"): string => {
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const localDate =
    boundary === "start"
      ? new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
      : new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  return localDate.toISOString();
};

const transactionFilterQuery = (
  filters: Partial<TransactionFilters> | undefined,
) => {
  const normalized = normalizeTransactionFilters(filters);
  const postingStatuses =
    normalized.statuses.length > 0
      ? normalized.statuses
      : defaultTransactionPostingStatuses;
  return {
    ...(normalized.accountIds.length > 0
      ? { account_id: [...normalized.accountIds] }
      : {}),
    ...(normalized.amountMax ? { amount_max: normalized.amountMax } : {}),
    ...(normalized.amountMin ? { amount_min: normalized.amountMin } : {}),
    ...(normalized.amountUsdMax
      ? { amount_usd_max: normalized.amountUsdMax }
      : {}),
    ...(normalized.amountUsdMin
      ? { amount_usd_min: normalized.amountUsdMin }
      : {}),
    ...(normalized.categoryIds.length > 0
      ? { category_id: [...normalized.categoryIds] }
      : {}),
    ...(normalized.classes.length > 0
      ? { transaction_class: [...normalized.classes] }
      : {}),
    ...(normalized.initiatedFrom
      ? { initiated_date_from: normalized.initiatedFrom }
      : {}),
    ...(normalized.initiatedTo
      ? { initiated_date_to: normalized.initiatedTo }
      : {}),
    ...(normalized.memberIds.length > 0
      ? { member_id: [...normalized.memberIds] }
      : {}),
    ...(normalized.pendingFrom
      ? { pending_date_from: dateTimeBound(normalized.pendingFrom, "start") }
      : {}),
    ...(normalized.pendingTo
      ? { pending_date_to: dateTimeBound(normalized.pendingTo, "end") }
      : {}),
    ...(normalized.postedFrom
      ? { posted_date_from: dateTimeBound(normalized.postedFrom, "start") }
      : {}),
    ...(normalized.postedTo
      ? { posted_date_to: dateTimeBound(normalized.postedTo, "end") }
      : {}),
    ...(normalized.search ? { search: normalized.search } : {}),
    posting_status: [...postingStatuses],
    ...(normalized.tagIds.length > 0 ? { tag_id: [...normalized.tagIds] } : {}),
  };
};

export const fetchTransactionPage = (params: TransactionPageParams) =>
  listTransactions({
    query: {
      limit: params.limit,
      offset: params.offset,
      anchor_date: params.anchorDate,
      ...transactionFilterQuery(params.filters),
      // When sorting becomes user-facing, add sort and sort_dir to the URL state and snapshot key.
      sort: "initiated_date",
      sort_dir: "desc",
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
    },
  });

export const fetchGroupRecordsPage = (params: GroupRecordsPageParams) =>
  searchJournalRecords({
    query: {
      account_fqn_prefix: params.accountFqnPrefix,
      limit: params.limit,
      offset: params.offset,
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

export const fetchLedgerLookups = async () => {
  const [accounts, categories, tags, members] = await Promise.all([
    listAllAccountsForLookups(),
    listCategories({
      query: {
        include_hidden: true,
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listTags({
      query: {
        include_hidden: true,
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listMembers({
      query: {
        include_tombstoned: true,
        limit: lookupLimit,
        offset: 0,
        sort: "name",
        sort_dir: "asc",
      },
    }),
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
  const accounts = await listAccounts({
    query: {
      account_type: "balance",
      is_featured: true,
      limit: lookupLimit,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

  if (!accounts.data || accounts.data.accounts.length === 0) {
    return { accounts, balances: undefined };
  }

  const balances = await listAccountBalances({
    query: {
      account_ids: accounts.data.accounts.map((account) => account.account_id),
    },
  });

  return { accounts, balances };
};

export const fetchAccountsPage = async () => {
  const [accounts, balances, groups] = await Promise.all([
    listAccounts({
      query: {
        include_hidden: true,
        limit: lookupLimit,
        offset: 0,
        sort: "fqn",
        sort_dir: "asc",
      },
    }),
    listAccountBalances({
      query: {
        include_hidden: true,
      },
    }),
    listAccountGroups({
      query: {
        include_hidden: true,
      },
    }),
  ]);

  return { accounts, balances, groups };
};

const listCategoriesPageForManagement = (offset: number) =>
  listCategories({
    query: {
      include_hidden: true,
      limit: lookupLimit,
      offset,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllCategoriesForManagement = async () => {
  const firstPage = await listCategoriesPageForManagement(0);
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
    const page = await listCategoriesPageForManagement(offset);
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

export const fetchCategoriesPage = async () => {
  const [categories, groups] = await Promise.all([
    listAllCategoriesForManagement(),
    listCategoryGroups({
      query: {
        include_hidden: true,
      },
    }),
  ]);

  return { categories, groups };
};

const listTagsPageForManagement = (offset: number) =>
  listTags({
    query: {
      include_hidden: true,
      limit: lookupLimit,
      offset,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllTagsForManagement = async () => {
  const firstPage = await listTagsPageForManagement(0);
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
    const page = await listTagsPageForManagement(offset);
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

export const fetchTagsPage = async () => {
  const [tags, groups] = await Promise.all([
    listAllTagsForManagement(),
    listTagGroups({
      query: {
        include_hidden: true,
      },
    }),
  ]);

  return { groups, tags };
};

const listMembersPageForManagement = (offset: number, includeHidden: boolean) =>
  listMembers({
    query: {
      include_hidden: includeHidden,
      limit: lookupLimit,
      offset,
      sort: "name",
      sort_dir: "asc",
    },
  });

const listAllMembersForManagement = async (includeHidden: boolean) => {
  const firstPage = await listMembersPageForManagement(0, includeHidden);
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
    const page = await listMembersPageForManagement(offset, includeHidden);
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

export const fetchMembersPage = (includeHidden = false) =>
  listAllMembersForManagement(includeHidden);

const listExpectedRecurringOccurrencesPage = (offset: number) =>
  listRecurringOccurrences({
    query: {
      limit: lookupLimit,
      offset,
      sort: "scheduled_date",
      sort_dir: "asc",
      status: ["expected"],
    },
  });

const listRecurringDefinitionsPageForReview = (offset: number) =>
  listRecurringDefinitions({
    query: {
      limit: lookupLimit,
      offset,
      sort: "fqn",
      sort_dir: "asc",
    },
  });

const listAllRecurringDefinitionsForReview = async () => {
  const firstPage = await listRecurringDefinitionsPageForReview(0);
  if (
    !firstPage.data ||
    firstPage.data.recurring_definitions.length >= firstPage.data.total_count
  ) {
    return firstPage;
  }

  const recurringDefinitions = [...firstPage.data.recurring_definitions];
  for (
    let offset = lookupLimit;
    offset < firstPage.data.total_count;
    offset += lookupLimit
  ) {
    const page = await listRecurringDefinitionsPageForReview(offset);
    if (!page.data) {
      return page;
    }
    recurringDefinitions.push(...page.data.recurring_definitions);
  }

  return {
    ...firstPage,
    data: {
      ...firstPage.data,
      recurring_definitions: recurringDefinitions,
    },
  };
};

export const fetchRecurringReviewPage = async () => {
  const firstOccurrencesPage = await listExpectedRecurringOccurrencesPage(0);
  let occurrences = firstOccurrencesPage;

  if (!occurrences.data) {
    return {
      definitionError: undefined,
      definitions: [],
      occurrences,
      transactionError: undefined,
      transactions: [],
    };
  }

  if (
    occurrences.data.recurring_occurrences.length < occurrences.data.total_count
  ) {
    const recurringOccurrences = [...occurrences.data.recurring_occurrences];
    for (
      let offset = lookupLimit;
      offset < occurrences.data.total_count;
      offset += lookupLimit
    ) {
      const page = await listExpectedRecurringOccurrencesPage(offset);
      if (!page.data) {
        return {
          definitionError: undefined,
          definitions: [],
          occurrences: page,
          transactionError: undefined,
          transactions: [],
        };
      }
      recurringOccurrences.push(...page.data.recurring_occurrences);
    }

    occurrences = {
      ...occurrences,
      data: {
        ...occurrences.data,
        recurring_occurrences: recurringOccurrences,
      },
    };
  }

  const definitions = await listAllRecurringDefinitionsForReview();
  if (!definitions.data) {
    return {
      definitionError: definitions.error,
      definitions: [],
      occurrences,
      transactionError: undefined,
      transactions: [],
    };
  }

  const transactions: Transaction[] = [];
  for (const occurrence of occurrences.data.recurring_occurrences) {
    if (occurrence.generated_transaction_id === null) {
      continue;
    }
    const transaction = await getTransaction({
      path: {
        transaction_id: occurrence.generated_transaction_id,
      },
    });
    if (!transaction.data) {
      return {
        definitionError: undefined,
        definitions,
        occurrences,
        transactionError: transaction.error,
        transactions,
      };
    }
    transactions.push(transaction.data);
  }

  return {
    definitionError: undefined,
    definitions: definitions.data.recurring_definitions.filter((definition) =>
      occurrences.data.recurring_occurrences.some(
        (occurrence) =>
          occurrence.recurring_definition_id ===
          definition.recurring_definition_id,
      ),
    ),
    occurrences,
    transactionError: undefined,
    transactions,
  };
};

export const confirmRecurringOccurrenceById = (
  occurrence: Pick<RecurringOccurrence, "recurring_occurrence_id">,
) =>
  confirmGeneratedRecurringOccurrence({
    path: {
      recurring_occurrence_id: occurrence.recurring_occurrence_id,
    },
  });

export const dismissRecurringOccurrenceById = (
  occurrence: Pick<RecurringOccurrence, "recurring_occurrence_id">,
) =>
  dismissGeneratedRecurringOccurrence({
    path: {
      recurring_occurrence_id: occurrence.recurring_occurrence_id,
    },
  });

export const fetchOverviewAccountBalances = () => listAccountBalances();

export const fetchOverviewAccounts = () =>
  listAccounts({
    query: {
      account_type: "balance",
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

export const fetchCategoryPickerCategories = (
  economicIntents: readonly CategoryEconomicIntent[],
) =>
  listCategories({
    query: {
      economic_intent: [...new Set(economicIntents)].sort(),
      limit: lookupLimit,
      offset: 0,
      sort: "fqn",
      sort_dir: "asc",
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

export const createJournalTransaction = (body: CreateTransactionRequest) =>
  createGeneratedTransaction({ body });

export const replaceLedgerTransaction = (
  transactionId: number,
  body: UpdateTransactionRequest,
) =>
  replaceGeneratedTransaction({
    body,
    path: {
      transaction_id: transactionId,
    },
  });
