import {
  Activity,
  CircleUserRound,
  Info,
  Keyboard,
  ListFilter,
  MessagesSquare,
  RadioTower,
  type LucideIcon,
} from "lucide-react";

export type SettingsTab =
  | "room"
  | "account"
  | "display"
  | "filter"
  | "shortcuts"
  | "diagnostics"
  | "about";

export type SettingsNavItem = {
  icon: LucideIcon;
  id: SettingsTab;
  label: string;
};

export type SettingsNavGroup = {
  items: SettingsNavItem[];
  label: string;
};

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    label: "连接",
    items: [
      { id: "room", label: "直播间", icon: RadioTower },
      { id: "account", label: "账号", icon: CircleUserRound },
    ],
  },
  {
    label: "显示",
    items: [
      { id: "display", label: "弹幕显示", icon: MessagesSquare },
      { id: "filter", label: "过滤规则", icon: ListFilter },
    ],
  },
  {
    label: "系统",
    items: [
      { id: "shortcuts", label: "快捷键", icon: Keyboard },
      { id: "diagnostics", label: "诊断", icon: Activity },
      { id: "about", label: "关于", icon: Info },
    ],
  },
];

export function getSettingsTabLabel(tab: SettingsTab) {
  for (const group of SETTINGS_NAV_GROUPS) {
    const item = group.items.find((candidate) => candidate.id === tab);
    if (item) return item.label;
  }
  return "设置";
}
