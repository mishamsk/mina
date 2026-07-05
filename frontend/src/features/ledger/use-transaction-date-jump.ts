import { useCallback, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router";

import type { TransactionPageParams } from "@/api";
import { transactionFilterSignature } from "@/models/transaction-filters";

import {
  readTransactionFiltersFromSearchParams,
  readTransactionPageFromSearchParams,
  transactionPageFromOffset,
} from "./transaction-page-position";
import { jumpToTransactionDatePage } from "./use-transactions-resource";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

interface UseTransactionDateJumpOptions {
  readonly page: number;
  readonly pageSize: number;
  readonly params: TransactionPageParams;
  readonly setSearchParams: SetURLSearchParams;
}

export const useTransactionDateJump = ({
  page,
  pageSize,
  params,
  setSearchParams,
}: UseTransactionDateJumpOptions) => {
  const [dateJumpValue, setDateJumpValue] = useState("");
  const [dateJumpLoading, setDateJumpLoading] = useState(false);
  const activeDateJumpIdRef = useRef(0);

  const cancelDateJump = useCallback(() => {
    activeDateJumpIdRef.current += 1;
    setDateJumpLoading(false);
  }, []);

  const jumpToDate = useCallback(
    async (anchorDate: string) => {
      if (!isoDatePattern.test(anchorDate) || dateJumpLoading) {
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
        let dateJumpApplied = false;
        setSearchParams((current) => {
          const currentPage = readTransactionPageFromSearchParams(current);
          const currentFilterSignature = transactionFilterSignature(
            readTransactionFiltersFromSearchParams(current),
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
          dateJumpApplied = true;
          return next;
        });
        if (dateJumpApplied) {
          setDateJumpValue("");
        }
      } finally {
        if (activeDateJumpIdRef.current === jumpId) {
          setDateJumpLoading(false);
        }
      }
    },
    [
      dateJumpLoading,
      page,
      pageSize,
      params.filters,
      params.offset,
      setSearchParams,
    ],
  );

  return {
    cancelDateJump,
    dateJumpLoading,
    dateJumpValue,
    jumpToDate,
    setDateJumpValue,
  };
};
