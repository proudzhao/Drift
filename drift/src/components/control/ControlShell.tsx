import type { ReactNode } from "react";
import { getSettingsTabLabel, type SettingsTab } from "./settingsNavigation";
import { SettingsSidebar } from "./SettingsSidebar";

type ControlShellProps = {
  activeTab: SettingsTab;
  children: ReactNode;
  collapsed: boolean;
  footer: ReactNode;
  onCollapsedChange: (collapsed: boolean) => void;
  onTabChange: (tab: SettingsTab) => void;
  status: ReactNode;
  updateNotice?: ReactNode;
};

export function ControlShell({
  activeTab,
  children,
  collapsed,
  footer,
  onCollapsedChange,
  onTabChange,
  status,
  updateNotice,
}: ControlShellProps) {
  return (
    <main className="drift-control-shell grid h-screen min-h-screen grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-drift-void text-drift-ink">
      <SettingsSidebar
        activeTab={activeTab}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        onTabChange={onTabChange}
      />
      <section className="grid min-h-0 grid-rows-[46px_auto_minmax(0,1fr)_auto] overflow-hidden">
        <header className="flex items-center justify-between border-b border-drift-line px-4">
          <h1 className="m-0 text-[13px] font-bold text-drift-ink">
            {getSettingsTabLabel(activeTab)}
          </h1>
          <div className="text-[9px] text-[#789097]">{status}</div>
        </header>
        {updateNotice ?? null}
        <div className="row-start-3 min-h-0 overflow-hidden bg-drift-surface-dark text-drift-ink">
          {children}
        </div>
        <footer className="row-start-4 border-t border-drift-line px-4 py-2 text-[9px] text-[#60777e]">
          {footer}
        </footer>
      </section>
    </main>
  );
}
