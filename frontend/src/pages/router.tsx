import { Navigate, Route, Routes } from "react-router";

import { AppShell } from "@/features/app-shell";

import { AccountGroupPage } from "./account-group-page";
import { AccountPage } from "./account-page";
import { AccountsPage } from "./accounts-page";
import { CategoriesPage } from "./categories-page";
import { CategoryGroupPage } from "./category-group-page";
import { CategoryPage } from "./category-page";
import { MemberPage } from "./member-page";
import { MembersPage } from "./members-page";
import { OverviewPage } from "./overview-page";
import { RecurringPage } from "./recurring-page";
import { SettingsPage } from "./settings-page";
import { StatusPage } from "./status-page";
import { TagGroupPage } from "./tag-group-page";
import { TagPage } from "./tag-page";
import { TagsPage } from "./tags-page";
import { TemplatesPage } from "./templates-page";
import { TransactionsPage } from "./transactions-page";

export const AppRoutes = () => (
  <AppShell>
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/overview" element={<OverviewPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/recurring" element={<RecurringPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/accounts/group" element={<AccountGroupPage />} />
      <Route path="/accounts/:accountId" element={<AccountPage />} />
      <Route path="/categories" element={<CategoriesPage />} />
      <Route path="/categories/group" element={<CategoryGroupPage />} />
      <Route path="/categories/:categoryId" element={<CategoryPage />} />
      <Route path="/tags" element={<TagsPage />} />
      <Route path="/tags/group" element={<TagGroupPage />} />
      <Route path="/tags/:tagId" element={<TagPage />} />
      <Route path="/members" element={<MembersPage />} />
      <Route path="/members/:memberId" element={<MemberPage />} />
      <Route path="/templates" element={<TemplatesPage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  </AppShell>
);
