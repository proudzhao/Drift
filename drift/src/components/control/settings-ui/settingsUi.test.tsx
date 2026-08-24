import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  DataValue,
  EmptyState,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
  StatusDot,
  Toolbar,
} from ".";

test("composes the grouped workbench with accessible status", () => {
  render(
    <SettingsPage>
      <StatusBanner
        description="请检查房间号"
        title="连接失败"
        tone="warning"
      />
      <SettingsSection description="立即应用" title="外观">
        <SettingsRow
          control={<button>调整</button>}
          description="14–32px"
          label="字号"
        />
      </SettingsSection>
      <Toolbar aria-label="常用直播间工具栏">
        <input aria-label="搜索" />
      </Toolbar>
      <EmptyState
        description="输入房间号后可保存"
        title="暂无常用直播间"
      />
      <StatusDot label="已连接" tone="success" />
      <DataValue>123456</DataValue>
    </SettingsPage>,
  );

  expect(screen.getByRole("status")).toHaveTextContent("连接失败");
  expect(screen.getByRole("status")).toHaveClass(
    "drift-status-banner",
    "border-[var(--drift-ui-warning-border)]",
    "bg-[var(--drift-ui-warning-soft)]",
    "text-[var(--drift-ui-warning)]",
  );
  expect(screen.getByRole("region", { name: "外观" })).toBeVisible();
  expect(
    screen.getByRole("region", { name: "外观" }).querySelector(".rounded-lg"),
  ).toHaveClass(
    "drift-theme-transition",
    "bg-[var(--drift-ui-raised)]",
  );
  expect(
    screen.getByRole("toolbar", { name: "常用直播间工具栏" }),
  ).toBeVisible();
  expect(screen.getByText("暂无常用直播间")).toBeVisible();
  expect(screen.getByText("已连接")).toBeVisible();
  expect(screen.getByText("123456")).toHaveClass("drift-data-text");
});

test("keeps inline descriptions together without changing the default row", () => {
  render(
    <div>
      <SettingsRow
        control={<button>默认控件</button>}
        description="默认说明"
        label="默认标签"
      />
      <SettingsRow
        control={<button>连接控件</button>}
        description="连接说明"
        descriptionLayout="inline"
        label="房间号"
      />
    </div>,
  );

  expect(
    screen.getByText("默认说明").closest("[data-description-layout]"),
  ).toHaveAttribute("data-description-layout", "separate");

  const compactRow = screen
    .getByText("连接说明")
    .closest("[data-description-layout]");
  expect(compactRow).toHaveAttribute("data-description-layout", "inline");
  expect(
    screen.getByText("连接说明").closest(".settings-row-metadata"),
  ).toContainElement(screen.getByText("房间号"));
});
