import { StatusPage } from "./status-page";

const statusRoutePaths = new Set(["/"]);

export const AppRoutes = () => {
  const path = globalThis.location?.pathname ?? "/";

  if (statusRoutePaths.has(path)) {
    return <StatusPage />;
  }

  return <StatusPage />;
};
