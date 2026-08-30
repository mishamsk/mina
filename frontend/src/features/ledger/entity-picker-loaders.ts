import {
  type Account,
  apiErrorMessage,
  type Category,
  getAccount,
  getAccountCreationAvailability,
  getCategory,
  getCategoryCreationAvailability,
  getMember,
  getTag,
  getTagCreationAvailability,
  type Member,
  searchAccounts,
  type SearchAccountsData,
  searchCategories,
  type SearchCategoriesData,
  searchMembers,
  type SearchMembersData,
  searchTags,
  type SearchTagsData,
  type Tag,
} from "@/api";

import type {
  EntityCreationAvailabilityLoader,
  EntityOption,
  EntityOptionLoader,
  EntityPickerLoadRequest,
  EntityPickerLoadResult,
  EntityPickerRow,
} from "./entity-picker";

type AccountPickerQuery = SearchAccountsData["query"];
type CategoryPickerQuery = SearchCategoriesData["query"];
type MemberPickerQuery = SearchMembersData["query"];
type TagPickerQuery = SearchTagsData["query"];

type AccountPickerBase = Omit<
  AccountPickerQuery,
  "exclude_ids" | "limit" | "parent_fqn" | "q"
> & {
  readonly exclude_ids?: readonly number[];
};
type CategoryPickerBase = Omit<
  CategoryPickerQuery,
  "exclude_ids" | "limit" | "parent_fqn" | "q"
> & {
  readonly exclude_ids?: readonly number[];
};
type MemberPickerBase = Omit<
  MemberPickerQuery,
  "exclude_ids" | "limit" | "q"
> & {
  readonly exclude_ids?: readonly number[];
};
type TagPickerBase = Omit<
  TagPickerQuery,
  "exclude_ids" | "limit" | "parent_fqn" | "q"
> & {
  readonly exclude_ids?: readonly number[];
};

const excludedIDs = (
  base: readonly number[] | undefined,
  request: EntityPickerLoadRequest,
): number[] => [...new Set([...(base ?? []), ...request.excludedIds])];

const pickerResultLimit = 6;

const selectedLabel = (title: string, fqn: string): string =>
  title === fqn ? fqn : `${fqn} (${title})`;

export const accountPickerOption = (account: Account): EntityOption => ({
  accountType: account.account_type,
  currency: account.currency,
  detail: account.fqn,
  hidden: account.is_hidden,
  id: account.account_id,
  label: account.display_label,
  metadata: `${account.account_type} · ${account.currency ? `${account.currency} · Single-currency` : "Multi-currency"}`,
  searchLabel: account.fqn,
  selectedLabel: selectedLabel(account.display_label, account.fqn),
});

export const categoryPickerOption = (category: Category): EntityOption => ({
  detail: category.fqn,
  hidden: category.is_hidden,
  id: category.category_id,
  label: category.display_label,
  metadata: category.economic_intent,
  searchLabel: category.fqn,
  selectedLabel: selectedLabel(category.display_label, category.fqn),
});

export const tagPickerOption = (tag: Tag): EntityOption => ({
  detail: tag.fqn,
  hidden: tag.is_hidden,
  id: tag.tag_id,
  label: tag.display_label,
  searchLabel: tag.fqn,
  selectedLabel: selectedLabel(tag.display_label, tag.fqn),
});

export const memberPickerOption = (member: Member): EntityOption => ({
  hidden: member.is_hidden,
  id: member.member_id,
  label: member.name,
  searchLabel: member.name,
  selectedLabel: member.name,
});

export const loadAccountOptionsByIds = async (
  ids: readonly number[],
): Promise<readonly EntityOption[]> => {
  const results = await Promise.all(
    [...new Set(ids)].map((accountId) =>
      getAccount({
        path: { account_id: accountId },
        query: { include_tombstoned: true },
      }),
    ),
  );
  return results.flatMap((result) =>
    result.data ? [accountPickerOption(result.data)] : [],
  );
};

export const loadCategoryOptionsByIds = async (
  ids: readonly number[],
): Promise<readonly EntityOption[]> => {
  const results = await Promise.all(
    [...new Set(ids)].map((categoryId) =>
      getCategory({
        path: { category_id: categoryId },
        query: { include_tombstoned: true },
      }),
    ),
  );
  return results.flatMap((result) =>
    result.data ? [categoryPickerOption(result.data)] : [],
  );
};

export const loadMemberOptionsByIds = async (
  ids: readonly number[],
): Promise<readonly EntityOption[]> => {
  const results = await Promise.all(
    [...new Set(ids)].map((memberId) =>
      getMember({
        path: { member_id: memberId },
        query: { include_tombstoned: true },
      }),
    ),
  );
  return results.flatMap((result) =>
    result.data ? [memberPickerOption(result.data)] : [],
  );
};

export const loadTagOptionsByIds = async (
  ids: readonly number[],
): Promise<readonly EntityOption[]> => {
  const results = await Promise.all(
    [...new Set(ids)].map((tagId) =>
      getTag({
        path: { tag_id: tagId },
        query: { include_tombstoned: true },
      }),
    ),
  );
  return results.flatMap((result) =>
    result.data ? [tagPickerOption(result.data)] : [],
  );
};

const hierarchicalRows = (
  items: readonly {
    readonly kind: "group" | "leaf";
    readonly title: string;
    readonly fqn: string;
    readonly is_hidden: boolean;
    readonly child_count?: number;
    readonly account_id?: number;
    readonly category_id?: number;
    readonly tag_id?: number;
    readonly account_type?: string;
    readonly currency?: string | null;
    readonly economic_intent?: string;
  }[],
): EntityPickerRow[] =>
  items.flatMap((item): EntityPickerRow[] => {
    if (item.kind === "group") {
      return [
        {
          group: {
            childCount: item.child_count ?? 0,
            fqn: item.fqn,
            parentFqn: item.fqn.includes(":")
              ? item.fqn.slice(0, item.fqn.lastIndexOf(":"))
              : "",
            segment: item.title,
          },
          kind: "group" as const,
        },
      ];
    }
    const id = item.account_id ?? item.category_id ?? item.tag_id;
    if (id === undefined) {
      return [];
    }
    const metadata = item.account_type
      ? `${item.account_type} · ${item.currency ? `${item.currency} · Single-currency` : "Multi-currency"}`
      : item.economic_intent;
    return [
      {
        kind: "leaf",
        option: {
          ...(item.account_type ? { accountType: item.account_type } : {}),
          ...(item.account_type ? { currency: item.currency } : {}),
          detail: item.fqn,
          hidden: item.is_hidden,
          id,
          label: item.title,
          ...(metadata ? { metadata } : {}),
          searchLabel: item.fqn,
          selectedLabel: selectedLabel(item.title, item.fqn),
        },
      },
    ];
  });

const hierarchyResult = (
  items: Parameters<typeof hierarchicalRows>[0],
  hasMore: boolean,
): EntityPickerLoadResult => {
  const rows = hierarchicalRows(items);
  return {
    hasMore,
    rows,
  };
};

export const accountPickerLoader =
  (base: AccountPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await searchAccounts({
      query: {
        ...base,
        exclude_ids: excludedIDs(base.exclude_ids, request),
        limit: pickerResultLimit,
        q: request.query,
        parent_fqn: request.parentFqn,
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Accounts could not be loaded."),
      );
    }
    return hierarchyResult(result.data.items, result.data.has_more);
  };

export const categoryPickerLoader =
  (base: CategoryPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await searchCategories({
      query: {
        ...base,
        exclude_ids: excludedIDs(base.exclude_ids, request),
        limit: pickerResultLimit,
        q: request.query,
        parent_fqn: request.parentFqn,
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Categories could not be loaded."),
      );
    }
    return hierarchyResult(result.data.items, result.data.has_more);
  };

export const tagPickerLoader =
  (base: TagPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await searchTags({
      query: {
        ...base,
        exclude_ids: excludedIDs(base.exclude_ids, request),
        limit: pickerResultLimit,
        q: request.query,
        parent_fqn: request.parentFqn,
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Tags could not be loaded."),
      );
    }
    return hierarchyResult(result.data.items, result.data.has_more);
  };

export const memberPickerLoader =
  (base: MemberPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await searchMembers({
      query: {
        ...base,
        exclude_ids: excludedIDs(base.exclude_ids, request),
        limit: pickerResultLimit,
        q: request.query,
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Members could not be loaded."),
      );
    }
    const rows: EntityPickerRow[] = result.data.items.map((item) => ({
      kind: "leaf",
      option: {
        hidden: item.is_hidden,
        id: item.member_id,
        label: item.title,
        searchLabel: item.title,
      },
    }));
    return {
      hasMore: result.data.has_more,
      rows,
    };
  };

const creationAvailability =
  (
    load: (fqn: string) => Promise<{
      readonly data?: { readonly available: boolean };
      readonly error?: unknown;
    }>,
    fallbackMessage: string,
  ): EntityCreationAvailabilityLoader =>
  async (fqn) => {
    const result = await load(fqn);
    if (!result.data) {
      throw new Error(apiErrorMessage(result.error, fallbackMessage));
    }
    return result.data.available;
  };

export const accountCreationAvailabilityLoader = creationAvailability(
  (fqn) => getAccountCreationAvailability({ query: { fqn } }),
  "Account creation availability could not be loaded.",
);

export const categoryCreationAvailabilityLoader = creationAvailability(
  (fqn) => getCategoryCreationAvailability({ query: { fqn } }),
  "Category creation availability could not be loaded.",
);

export const tagCreationAvailabilityLoader = creationAvailability(
  (fqn) => getTagCreationAvailability({ query: { fqn } }),
  "Tag creation availability could not be loaded.",
);
