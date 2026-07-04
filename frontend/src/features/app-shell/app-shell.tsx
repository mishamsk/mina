import {
  Archive,
  CardText,
  Chart,
  Close,
  Folder,
  Hash,
  Home,
  ListBox,
  Menu,
  Plus,
  SettingsCog2,
  User,
  Wallet,
} from "pixelarticons/react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { NavLink } from "react-router";

import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { setSidebarCollapsed, usePreferencesView } from "@/store";

type PixelIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly disabled?: boolean;
  readonly icon: PixelIcon;
  readonly label: string;
  readonly to: string;
}

const primaryNavItems: readonly NavItem[] = [
  { disabled: true, icon: Home, label: "Overview", to: "/overview" },
  { icon: ListBox, label: "Transactions", to: "/transactions" },
  { disabled: true, icon: Wallet, label: "Accounts", to: "/accounts" },
];

const referenceNavItems: readonly NavItem[] = [
  { disabled: true, icon: Folder, label: "Categories", to: "/categories" },
  { disabled: true, icon: Hash, label: "Tags", to: "/tags" },
  { disabled: true, icon: User, label: "Members", to: "/members" },
  { disabled: true, icon: CardText, label: "Templates", to: "/templates" },
];

const utilityNavItems: readonly NavItem[] = [
  { icon: Chart, label: "Status", to: "/status" },
  { disabled: true, icon: SettingsCog2, label: "Settings", to: "/settings" },
];

interface AppShellProps {
  readonly children: ReactNode;
}

const navLinkClass = ({ collapsed }: { collapsed: boolean }) =>
  cn(
    "font-heading flex h-9 items-center gap-3 border-2 border-transparent px-2 text-sm font-semibold text-[var(--frame-muted)] uppercase",
    "hover:border-[var(--border-ink)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--frame-foreground)]",
    "aria-[current=page]:border-[var(--border-ink)] aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground aria-[current=page]:shadow-[var(--shadow-chip)] aria-[current=page]:hover:bg-primary aria-[current=page]:hover:text-primary-foreground",
    collapsed && "justify-center px-0",
  );

const DisabledNavItem = ({
  collapsed,
  icon: Icon,
  label,
}: Pick<NavItem, "icon" | "label"> & { readonly collapsed: boolean }) => {
  const item = (
    <button
      type="button"
      disabled
      aria-label={label}
      className={cn(
        "font-heading flex h-9 w-full items-center gap-3 border-2 border-transparent px-2 text-sm font-semibold text-[var(--frame-muted)] uppercase opacity-60",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </button>
  );

  return collapsed ? (
    <Tooltip label={label} asChild>
      <span className="flex w-full">{item}</span>
    </Tooltip>
  ) : (
    item
  );
};

const SidebarNav = ({
  collapsed,
  items,
}: {
  readonly collapsed: boolean;
  readonly items: readonly NavItem[];
}) => (
  <nav className="flex flex-col gap-1">
    {items.map((item) => {
      if (item.disabled) {
        return (
          <DisabledNavItem
            key={item.label}
            collapsed={collapsed}
            icon={item.icon}
            label={item.label}
          />
        );
      }

      const navLink = (
        <NavLink
          className={navLinkClass({ collapsed })}
          key={item.label}
          to={item.to}
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          <span className={cn(collapsed && "sr-only")}>{item.label}</span>
        </NavLink>
      );

      return collapsed ? (
        <Tooltip key={item.label} label={item.label} asChild>
          {navLink}
        </Tooltip>
      ) : (
        navLink
      );
    })}
  </nav>
);

const NewTransactionButton = ({
  collapsed,
}: {
  readonly collapsed: boolean;
}) => {
  const button = (
    <Button
      type="button"
      disabled
      className={cn("w-full", collapsed && "px-0")}
      aria-label="New transaction"
    >
      <Plus aria-hidden="true" />
      <span className={cn(collapsed && "sr-only")}>New transaction</span>
    </Button>
  );

  return collapsed ? (
    <Tooltip label="New transaction" className="w-full">
      {button}
    </Tooltip>
  ) : (
    button
  );
};

export const AppShell = ({ children }: AppShellProps) => {
  const {
    preferences: { sidebarCollapsed },
  } = usePreferencesView();

  return (
    <div className="bg-background text-foreground min-h-svh">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-10 flex flex-col border-r-2 border-[var(--border-ink)] bg-[var(--frame)] text-[var(--frame-foreground)] shadow-[var(--shadow-pixel)]",
          sidebarCollapsed ? "w-[76px]" : "w-64",
        )}
        aria-label="Primary"
      >
        <div
          className={cn(
            "flex h-16 items-center gap-3 border-b-2 border-[var(--border-ink)] px-3",
            sidebarCollapsed && "justify-center px-2",
          )}
        >
          <Archive
            className="size-6 shrink-0 text-[var(--color-class-adjustment-bright)]"
            aria-hidden="true"
          />
          <span
            className={cn(
              "text-pixel text-base leading-none",
              sidebarCollapsed && "sr-only",
            )}
          >
            Mina
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          <NewTransactionButton collapsed={sidebarCollapsed} />

          <SidebarNav collapsed={sidebarCollapsed} items={primaryNavItems} />

          <section className="flex flex-col gap-2">
            <p
              className={cn(
                "text-pixel text-muted-foreground px-2 text-xs",
                "text-[var(--frame-muted)]",
                sidebarCollapsed && "sr-only",
              )}
            >
              Reference
            </p>
            <SidebarNav
              collapsed={sidebarCollapsed}
              items={referenceNavItems}
            />
          </section>

          <div className="mt-auto flex flex-col gap-3">
            <Separator />
            <SidebarNav collapsed={sidebarCollapsed} items={utilityNavItems} />
          </div>
        </div>

        <div className="border-t-2 border-[var(--border-ink)] p-3">
          <Tooltip
            label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            asChild
          >
            <Button
              type="button"
              variant="outline"
              size={sidebarCollapsed ? "icon" : "default"}
              className="w-full"
              aria-expanded={!sidebarCollapsed}
              aria-label={
                sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              onClick={() => {
                setSidebarCollapsed(!sidebarCollapsed);
              }}
            >
              {sidebarCollapsed ? (
                <Menu aria-hidden="true" />
              ) : (
                <Close aria-hidden="true" />
              )}
              <span className={cn(sidebarCollapsed && "sr-only")}>
                {sidebarCollapsed ? "Expand" : "Collapse"}
              </span>
            </Button>
          </Tooltip>
        </div>
      </aside>

      <main
        className={cn(
          "min-h-svh bg-[var(--ground)] bg-[linear-gradient(90deg,rgb(237_234_247_/_4%)_1px,transparent_1px),linear-gradient(180deg,rgb(237_234_247_/_4%)_1px,transparent_1px)] bg-[size:16px_16px] px-5 pt-7 pb-3 transition-[margin] duration-150 ease-[steps(2)] sm:px-8",
          sidebarCollapsed ? "ml-[76px]" : "ml-64",
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          {children}
        </div>
      </main>
    </div>
  );
};
