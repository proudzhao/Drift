import type { ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import type { UiTheme } from "../../types/config";
import { IconButton, Tooltip, TooltipProvider } from "../ui";
import { getSettingsTabLabel, type SettingsTab } from "./settingsNavigation";
import { SettingsSidebar } from "./SettingsSidebar";

type ControlShellProps = {
  activeTab: SettingsTab;
  children: ReactNode;
  collapsed: boolean;
  footer: ReactNode;
  isThemeSaving: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onTabChange: (tab: SettingsTab) => void;
  onThemeToggle: () => void | Promise<void>;
  status: ReactNode;
  theme: UiTheme;
  themeError: string;
  updateNotice?: ReactNode;
};

export function ControlShell({
  activeTab,
  children,
  collapsed,
  footer,
  isThemeSaving,
  onCollapsedChange,
  onTabChange,
  onThemeToggle,
  status,
  theme,
  themeError,
  updateNotice,
}: ControlShellProps) {
  const themeActionLabel =
    theme === "dark" ? "切换到亮色主题" : "切换到暗色主题";

  return (
    <TooltipProvider delayDuration={300}>
      <main className="drift-control-shell drift-theme-transition grid h-screen min-h-screen grid-cols-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--drift-ui-workspace)] text-drift-ink">
        <SettingsSidebar
          activeTab={activeTab}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          onTabChange={onTabChange}
        />
        <section className="grid min-h-0 grid-rows-[46px_auto_minmax(0,1fr)_auto] overflow-hidden">
          <header className="drift-theme-transition flex items-center justify-between border-b border-drift-line px-4">
            <h1 className="drift-theme-transition m-0 text-[13px] font-bold text-drift-ink">
              {getSettingsTabLabel(activeTab)}
            </h1>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <div className="drift-theme-transition min-w-0 truncate text-[9px] text-[var(--drift-ui-muted)]">
                {status}
              </div>
              {themeError ? (
                <span
                  className="drift-theme-transition min-w-0 truncate text-[9px] text-[var(--drift-ui-danger)]"
                  role="alert"
                >
                  {themeError}
                </span>
              ) : null}
              <Tooltip content={themeActionLabel}>
                <IconButton
                  aria-label={themeActionLabel}
                  disabled={isThemeSaving}
                  onClick={onThemeToggle}
                  size="sm"
                  variant="ghost"
                >
                  {theme === "dark" ? (
                    <Sun aria-hidden="true" size={14} />
                  ) : (
                    <Moon aria-hidden="true" size={14} />
                  )}
                </IconButton>
              </Tooltip>
            </div>
          </header>
          {updateNotice ?? null}
          <div className="drift-theme-transition row-start-3 min-h-0 overflow-hidden bg-drift-surface-dark text-drift-ink">
            {children}
          </div>
          <footer className="drift-theme-transition row-start-4 border-t border-drift-line px-4 py-2 text-[9px] text-[var(--drift-ui-subtle)]">
            {footer}
          </footer>
        </section>
      </main>
    </TooltipProvider>
  );
}
