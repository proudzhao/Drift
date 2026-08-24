import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { AppUpdateState } from "../../hooks/control/useAppUpdate";
import { AboutSettings } from "./AboutSettings";

const openUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: openUrlMock,
}));

afterEach(() => {
  openUrlMock.mockReset();
});

const RELEASE_URL = "https://github.com/proudzhao/Drift/releases/latest";

function updateState(
  status: AppUpdateState["status"],
  overrides: Partial<AppUpdateState> = {},
): AppUpdateState {
  return {
    status,
    currentVersion: "0.8.0",
    latestVersion: "0.8.1",
    releaseUrl: RELEASE_URL,
    notes: "",
    downloadedBytes: 0,
    error: "",
    ...overrides,
  };
}

test("keeps updater actions, progress, notes, and release links", async () => {
  const user = userEvent.setup();
  const onCheckUpdate = vi.fn();
  const onInstallUpdate = vi.fn();
  const onLoadCurrentVersion = vi.fn();
  const onRestartApp = vi.fn();
  const onUpdateConfigChange = vi.fn();
  const props = {
    onCheckUpdate,
    onInstallUpdate,
    onLoadCurrentVersion,
    onRestartApp,
    onUpdateConfigChange,
    updateConfig: { checkOnStartup: true },
  };

  const { rerender } = render(
    <AboutSettings {...props} updateState={updateState("available")} />,
  );

  await user.click(screen.getByRole("button", { name: "检查更新" }));
  await user.click(
    screen.getByRole("switch", { name: "启动时自动检查更新" }),
  );
  await user.click(screen.getByRole("button", { name: "下载并安装" }));
  await user.click(screen.getByRole("button", { name: "GitHub Releases" }));
  await user.click(screen.getByRole("button", { name: "前往 GitHub 下载" }));

  rerender(
    <AboutSettings
      {...props}
      updateState={updateState("error", {
        error: "暂时无法获取更新信息，请稍后重试。",
      })}
    />,
  );
  await user.click(screen.getByRole("button", { name: "重试" }));
  await user.click(screen.getByRole("button", { name: "前往 GitHub 下载" }));

  rerender(
    <AboutSettings {...props} updateState={updateState("installed")} />,
  );
  await user.click(screen.getByRole("button", { name: "重启 Drift" }));
  await user.click(screen.getByRole("button", { name: "查看发布页" }));

  rerender(
    <AboutSettings
      {...props}
      updateState={updateState("downloading", {
        downloadedBytes: 512,
        totalBytes: 1024,
        notes: "修复内容",
        checkedAt: 1_700_000_000_000,
      })}
    />,
  );

  expect(onLoadCurrentVersion).toHaveBeenCalledOnce();
  expect(onCheckUpdate).toHaveBeenCalledTimes(2);
  expect(onUpdateConfigChange).toHaveBeenCalledWith({ checkOnStartup: false });
  expect(onInstallUpdate).toHaveBeenCalledOnce();
  expect(onRestartApp).toHaveBeenCalledOnce();
  expect(openUrlMock).toHaveBeenCalledTimes(4);
  expect(openUrlMock).toHaveBeenNthCalledWith(1, RELEASE_URL);
  expect(openUrlMock).toHaveBeenNthCalledWith(2, RELEASE_URL);
  expect(openUrlMock).toHaveBeenNthCalledWith(3, RELEASE_URL);
  expect(openUrlMock).toHaveBeenNthCalledWith(4, RELEASE_URL);
  expect(screen.getByText("正在下载更新 50%")).toBeVisible();
  expect(screen.getByText("50% · 512 B / 1.0 KB")).toBeVisible();
  expect(screen.getByText("修复内容")).toBeVisible();
  expect(screen.getByText("最近检查")).toBeVisible();
  expect(
    screen.getByText(new Date(1_700_000_000_000).toLocaleString()),
  ).toHaveClass("drift-data-text");
  expect(screen.getByText("0.8.0")).toHaveClass("drift-data-text");
  expect(screen.getByRole("region", { name: "产品" })).toBeVisible();
  expect(screen.getByRole("region", { name: "更新设置" })).toBeVisible();
});

test("keeps localized updater errors in a persistent danger banner", () => {
  render(
    <AboutSettings
      onCheckUpdate={vi.fn()}
      onInstallUpdate={vi.fn()}
      onLoadCurrentVersion={vi.fn()}
      onRestartApp={vi.fn()}
      onUpdateConfigChange={vi.fn()}
      updateConfig={{ checkOnStartup: true }}
      updateState={updateState("error", {
        error: "暂时无法获取更新信息，请稍后重试。",
      })}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "暂时无法获取更新信息，请稍后重试。",
  );
  expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "前往 GitHub 下载" }),
  ).toBeVisible();
  expect(screen.getByRole("alert")).toHaveClass(
    "drift-status-banner",
    "border-[var(--drift-ui-danger-border)]",
    "bg-[var(--drift-ui-danger-soft)]",
    "text-[var(--drift-ui-danger)]",
  );
});
