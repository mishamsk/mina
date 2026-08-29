import {
  type Account,
  apiErrorMessage,
  type Category,
  type Member,
  pickAccounts,
  type PickAccountsData,
  pickCategories,
  type PickCategoriesData,
  pickMembers,
  type PickMembersData,
  pickTags,
  type PickTagsData,
  type Tag,
} from "@/api";

import type {
  EntityOption,
  EntityOptionLoader,
  EntityPickerLoadRequest,
  EntityPickerLoadResult,
  EntityPickerRow,
} from "./entity-picker";

type AccountPickerQuery = PickAccountsData["query"];
type CategoryPickerQuery = PickCategoriesData["query"];
type MemberPickerQuery = PickMembersData["query"];
type TagPickerQuery = PickTagsData["query"];

type AccountPickerBase = Omit<
  AccountPickerQuery,
  "parent_fqn" | "q" | "selected_ids"
> & {
  readonly selected_ids?: readonly number[];
};
type CategoryPickerBase = Omit<
  CategoryPickerQuery,
  "parent_fqn" | "q" | "selected_ids"
> & {
  readonly selected_ids?: readonly number[];
};
type MemberPickerBase = Omit<MemberPickerQuery, "q" | "selected_ids"> & {
  readonly selected_ids?: readonly number[];
};
type TagPickerBase = Omit<
  TagPickerQuery,
  "parent_fqn" | "q" | "selected_ids"
> & {
  readonly selected_ids?: readonly number[];
};

const selectedIDs = (
  base: readonly number[] | undefined,
  request: EntityPickerLoadRequest,
): number[] => [...new Set([...(base ?? []), ...request.selectedIds])];

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

const leafOptions = (rows: readonly EntityPickerRow[]): EntityOption[] =>
  rows.flatMap((row) => (row.kind === "leaf" ? [row.option] : []));

const hierarchyResult = (
  items: Parameters<typeof hierarchicalRows>[0],
  selectedItems: Parameters<typeof hierarchicalRows>[0],
  canCreate: boolean,
  eligibleCount?: number,
): EntityPickerLoadResult => {
  const rows = hierarchicalRows(items);
  return {
    canCreate,
    eligibleCount,
    rows,
    selectedOptions: leafOptions(hierarchicalRows(selectedItems)),
  };
};

export const accountPickerLoader =
  (base: AccountPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await pickAccounts({
      query: {
        ...base,
        q: request.query,
        parent_fqn: request.parentFqn,
        selected_ids: selectedIDs(base.selected_ids, request),
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Accounts could not be loaded."),
      );
    }
    return hierarchyResult(
      result.data.items,
      result.data.selected_items,
      result.data.can_create,
      result.data.eligible_count,
    );
  };

export const categoryPickerLoader =
  (base: CategoryPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await pickCategories({
      query: {
        ...base,
        q: request.query,
        parent_fqn: request.parentFqn,
        selected_ids: selectedIDs(base.selected_ids, request),
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Categories could not be loaded."),
      );
    }
    return hierarchyResult(
      result.data.items,
      result.data.selected_items,
      result.data.can_create,
    );
  };

export const tagPickerLoader =
  (base: TagPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await pickTags({
      query: {
        ...base,
        q: request.query,
        parent_fqn: request.parentFqn,
        selected_ids: selectedIDs(base.selected_ids, request),
      },
    });
    if (!result.data) {
      throw new Error(
        apiErrorMessage(result.error, "Tags could not be loaded."),
      );
    }
    return hierarchyResult(
      result.data.items,
      result.data.selected_items,
      result.data.can_create,
    );
  };

export const memberPickerLoader =
  (base: MemberPickerBase): EntityOptionLoader =>
  async (request) => {
    const result = await pickMembers({
      query: {
        ...base,
        q: request.query,
        selected_ids: selectedIDs(base.selected_ids, request),
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
      canCreate: false,
      rows,
      selectedOptions: result.data.selected_items.map((item) => ({
        hidden: item.is_hidden,
        id: item.member_id,
        label: item.title,
        searchLabel: item.title,
      })),
    };
  };
