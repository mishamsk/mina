import { useCallback, useEffect, useRef } from "react";

export const useEntityFilterRequestGuard = () => {
  const requestsRef = useRef(new Map<AbortController, string>());
  const cancelEntityFilterRequests = useCallback(() => {
    for (const controller of requestsRef.current.keys()) {
      controller.abort();
    }
    requestsRef.current.clear();
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", cancelEntityFilterRequests);
    return () => {
      window.removeEventListener("popstate", cancelEntityFilterRequests);
      cancelEntityFilterRequests();
    };
  }, [cancelEntityFilterRequests]);

  const beginEntityFilterRequest = useCallback(() => {
    const controller = new AbortController();
    requestsRef.current.set(controller, window.location.pathname);
    return controller;
  }, []);
  const completeEntityFilterRequest = useCallback(
    (controller: AbortController): boolean => {
      const sourcePathname = requestsRef.current.get(controller);
      requestsRef.current.delete(controller);
      return (
        !controller.signal.aborted &&
        sourcePathname !== undefined &&
        window.location.pathname === sourcePathname
      );
    },
    [],
  );

  return {
    beginEntityFilterRequest,
    cancelEntityFilterRequests,
    completeEntityFilterRequest,
  };
};
