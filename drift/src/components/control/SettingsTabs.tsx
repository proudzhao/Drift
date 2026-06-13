import { classNames } from "../../utils/classNames";

export type SettingsTab =
  | "room"
  | "account"
  | "display"
  | "filter"
  | "shortcuts"
  | "diagnostics"
  | "about";

type SettingsTabsProps = {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
};

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "room", label: "直播间" },
  { id: "account", label: "账号" },
  { id: "display", label: "弹幕显示" },
  { id: "filter", label: "过滤规则" },
  { id: "shortcuts", label: "快捷键" },
  { id: "diagnostics", label: "诊断" },
  { id: "about", label: "关于" },
];

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <nav
      aria-label="设置分类"
      className="justify-self-center overflow-hidden rounded-[7px] border border-[#c7c7c7] bg-[#f8f8f8] shadow-drift-control"
    >
      <div className="grid grid-flow-col auto-cols-[minmax(52px,auto)]">
        {SETTINGS_TABS.map((tab) => (
          <button
            aria-pressed={activeTab === tab.id}
            className={classNames(
              "min-h-7 cursor-pointer appearance-none border-y-0 border-l-0 border-r border-solid border-[#d5d5d5] px-2 text-[11px] font-semibold whitespace-nowrap transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/25",
              activeTab === tab.id
                ? "bg-[#0a84ff] text-white hover:bg-[#0a84ff]"
                : "bg-transparent text-[#222222] hover:bg-[#eeeeee]",
            )}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
