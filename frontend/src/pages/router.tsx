import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "@/features/app-shell";

import { StatusPage } from "./status-page";
import { TransactionsPage } from "./transactions-page";

export const AppRoutes = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/transactions" replace />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="*" element={<Navigate to="/transactions" replace />} />
    </Routes>
  </AppShell>
);
