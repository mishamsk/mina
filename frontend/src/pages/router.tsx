import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "@/features/app-shell";

import { OverviewPage } from "./overview-page";
import { StatusPage } from "./status-page";
import { TransactionsPage } from "./transactions-page";

export const AppRoutes = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  </AppShell>
);
