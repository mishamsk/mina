import { useCallback, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import type { TransactionPageParams } from "@/api";
import type { TransactionFilters } from "@/models/transaction-filters";
import { transactionFilterSignature } from "@/models/transaction-filters";

import {
  readTransactionFiltersFromSearchParams,
  readTransactionPageFromSearchParams,
  transactionPageFromOffset,
} from "./transaction-page-position";
import { jumpToTransactionDatePage } from "./use-transactions-resource";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const formatLocalDate = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0
        ? String(part).padStart(4, "0")
        : String(part).padStart(2, "0"),
    )
    .join("-");

const todayLocalDate = (): string => formatLocalDate(new Date());

const shiftLocalDate = (anchorDate: string, days: -1 | 1): string => {
  const [year = 0, month = 1, day = 1] = anchorDate.split("-").map(Number);
  const localDate = new Date(0);
  localDate.setFullYear(year, month - 1, day);
  localDate.setDate(localDate.getDate() + days);
  return formatLocalDate(localDate);
};

interface UseTransactionDateJumpOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly params: TransactionPageParams;
  readonly readFiltersFromSearchParams?: (
    searchParams: URLSearchParams,
  ) => TransactionFilters;
  readonly setSearchParams: SetURLSearchParams;
}

export interface TransactionDateJumpAnchor {
  readonly date: string;
  readonly page: number;
}

export const useTransactionDateJump = ({
  page,
  pageSize,
  params,
  readFiltersFromSearchParams = readTransactionFiltersFromSearchParams,
  setSearchParams,
}: UseTransactionDateJumpOptions) => {
  const [dateJumpValue, setDateJumpValue] = useState("");
  const [dateJumpLoading, setDateJumpLoading] = useState(false);
  const [dateJumpAnchor, setDateJumpAnchor] =
    useState<TransactionDateJumpAnchor>();
  const activeDateJumpIdRef = useRef(0);

  const cancelDateJump = useCallback(() => {
    activeDateJumpIdRef.current += 1;
    setDateJumpLoading(false);
    setDateJumpAnchor(undefined);
  }, []);

  const jumpToDate = useCallback(
    async (anchorDate: string) => {
      if (!isoDatePattern.test(anchorDate)) {
        return;
      }

      const jumpId = activeDateJumpIdRef.current + 1;
      activeDateJumpIdRef.current = jumpId;
      const startingPage = page;
      const startingPageSize = pageSize;
      const startingFilterSignature = transactionFilterSignature(
        params.filters,
      );
      setDateJumpLoading(true);
      try {
        const result = await jumpToTransactionDatePage(
          {
            anchorDate,
            filters: params.filters,
            limit: pageSize,
            offset: params.offset,
          },
          () => activeDateJumpIdRef.current === jumpId,
        );
        if (!result) {
          return;
        }

        const landedPage = transactionPageFromOffset(result.offset, pageSize);
        let applied = false;
        setSearchParams((current) => {
          const currentPage = readTransactionPageFromSearchParams(current);
          const currentFilterSignature = transactionFilterSignature(
            readFiltersFromSearchParams(current),
          );
          if (
            activeDateJumpIdRef.current !== jumpId ||
            currentPage.page !== startingPage ||
            currentPage.pageSize !== startingPageSize ||
            currentFilterSignature !== startingFilterSignature
          ) {
            return current;
          }

          const next = new URLSearchParams(current);
          next.set("page", String(landedPage));
          next.set("pageSize", String(pageSize));
          applied = true;
          return next;
        });
        if (applied) {
          setDateJumpAnchor({ date: anchorDate, page: landedPage });
        }
      } finally {
        if (activeDateJumpIdRef.current === jumpId) {
          setDateJumpLoading(false);
        }
      }
    },
    [
      page,
      pageSize,
      params.filters,
      params.offset,
      readFiltersFromSearchParams,
      setSearchParams,
    ],
  );

  const jumpToAdjacentDate = useCallback(
    (days: -1 | 1) => {
      const nextDate = shiftLocalDate(dateJumpValue || todayLocalDate(), days);
      setDateJumpValue(nextDate);
      void jumpToDate(nextDate);
    },
    [dateJumpValue, jumpToDate],
  );

  const jumpToToday = useCallback(() => {
    const today = todayLocalDate();
    setDateJumpValue(today);
    void jumpToDate(today);
  }, [jumpToDate]);

  return {
    cancelDateJump,
    dateJumpAnchor,
    dateJumpLoading,
    dateJumpValue,
    jumpToAdjacentDate,
    jumpToDate,
    jumpToToday,
    setDateJumpValue,
  };
};
