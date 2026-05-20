export type SettingsTab = "room" | "display" | "filter" | "shortcuts" | "diagnostics";

type SettingsTabsProps = {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
};

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "room", label: "直播间" },
  { id: "display", label: "弹幕显示" },
  { id: "filter", label: "过滤规则" },
  { id: "shortcuts", label: "快捷键" },
  { id: "diagnostics", label: "诊断" },
];

export function SettingsTabs({ activeTab, onTabChange }: SettingsTabsProps) {
  return (
    <nav className="settings-tabs" aria-label="设置分类">
      {SETTINGS_TABS.map((tab) => (
        <button
          aria-pressed={activeTab === tab.id}
          className={activeTab === tab.id ? "is-active" : ""}
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
