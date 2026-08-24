import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { classNames } from "../../utils/classNames";
import { Tooltip, TooltipProvider } from "../ui";
import {
  SETTINGS_NAV_GROUPS,
  type SettingsTab,
} from "./settingsNavigation";

type SettingsSidebarProps = {
  activeTab: SettingsTab;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onTabChange: (tab: SettingsTab) => void;
};

export function SettingsSidebar({
  activeTab,
  collapsed,
  onCollapsedChange,
  onTabChange,
}: SettingsSidebarProps) {
  const hideLabels = collapsed;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={classNames(
          "drift-settings-sidebar box-border flex min-h-0 shrink-0 flex-col border-r border-drift-line bg-[var(--drift-ui-sidebar)] py-2.5 max-[619px]:w-11 max-[619px]:px-1.5",
          hideLabels ? "w-11 px-1.5" : "w-[152px] px-2",
        )}
      >
        <div className="flex min-h-8 items-center gap-2 px-1.5">
          <span className="drift-theme-transition grid size-5 shrink-0 place-items-center rounded-md bg-drift-signal text-[11px] font-black text-[var(--drift-ui-on-signal)]">
            D
          </span>
          <strong
            className={classNames(
              "drift-theme-transition text-xs text-drift-ink max-[619px]:sr-only",
              hideLabels && "sr-only",
            )}
          >
            Drift
          </strong>
        </div>

        <nav aria-label="设置分类" className="mt-1 min-h-0 flex-1">
          {SETTINGS_NAV_GROUPS.map((group) => (
            <div className="mb-2" key={group.label}>
              <p
                className={classNames(
                  "drift-theme-transition mb-1 mt-0 px-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[var(--drift-ui-disabled)] max-[619px]:sr-only",
                  hideLabels && "sr-only",
                )}
              >
                {group.label}
              </p>
              <div className="grid gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activeTab;
                  return (
                    <Tooltip content={item.label} key={item.id}>
                      <button
                        aria-current={active ? "page" : undefined}
                        aria-label={item.label}
                        className={classNames(
                          "drift-theme-transition relative flex min-h-7 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[10px] text-[var(--drift-ui-muted)] hover:bg-[var(--drift-ui-hover)] hover:text-drift-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-signal/45 max-[619px]:justify-center max-[619px]:px-0",
                          active && "bg-[var(--drift-ui-selected)] text-drift-ink",
                        )}
                        onClick={() => onTabChange(item.id)}
                        type="button"
                      >
                        {active ? (
                          <span className="drift-theme-transition absolute -left-2 h-4 w-0.5 rounded-full bg-drift-signal shadow-[0_0_9px_color-mix(in_srgb,var(--drift-ui-signal)_55%,transparent)] max-[619px]:-left-1.5" />
                        ) : null}
                        <Icon aria-hidden="true" size={14} strokeWidth={1.7} />
                        <span
                          className={classNames(
                            "max-[619px]:sr-only",
                            hideLabels && "sr-only",
                          )}
                        >
                          {item.label}
                        </span>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          aria-label={hideLabels ? "展开侧边栏" : "收起侧边栏"}
          className="drift-theme-transition mt-2 flex min-h-7 items-center justify-center rounded-md border-0 bg-transparent text-[var(--drift-ui-subtle)] hover:bg-[var(--drift-ui-hover)] hover:text-drift-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-drift-signal/45 max-[619px]:hidden"
          onClick={() => onCollapsedChange(!hideLabels)}
          type="button"
        >
          {hideLabels ? (
            <PanelLeftOpen aria-hidden="true" size={14} />
          ) : (
            <PanelLeftClose aria-hidden="true" size={14} />
          )}
        </button>
      </aside>
    </TooltipProvider>
  );
}
