import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "@/features/app-shell";

import { AccountGroupPage } from "./account-group-page";
import { AccountPage } from "./account-page";
import { AccountsPage } from "./accounts-page";
import { OverviewPage } from "./overview-page";
import { StatusPage } from "./status-page";
import { TransactionsPage } from "./transactions-page";

export const AppRoutes = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/accounts/group" element={<AccountGroupPage />} />
      <Route path="/accounts/:accountId" element={<AccountPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  </AppShell>
);
