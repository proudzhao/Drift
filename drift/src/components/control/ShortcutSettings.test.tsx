import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ShortcutSettings } from "./ShortcutSettings";

test("keeps shortcut change, save, and reset callbacks independent", async () => {
  const user = userEvent.setup();
  const onOverlayShortcutChange = vi.fn();
  const onResetOverlayShortcut = vi.fn();
  const onResetSendShortcut = vi.fn();
  const onResetShortcut = vi.fn();
  const onSaveOverlayShortcut = vi.fn();
  const onSaveSendShortcut = vi.fn();
  const onSaveShortcut = vi.fn();
  const onSendShortcutChange = vi.fn();
  const onShortcutChange = vi.fn();

  render(
    <ShortcutSettings
      draftOverlayShortcut="Command+Shift+O"
      draftSendShortcut="Command+Shift+S"
      draftShortcut="Command+Shift+E"
      onOverlayShortcutChange={onOverlayShortcutChange}
      onResetOverlayShortcut={onResetOverlayShortcut}
      onResetSendShortcut={onResetSendShortcut}
      onResetShortcut={onResetShortcut}
      onSaveOverlayShortcut={onSaveOverlayShortcut}
      onSaveSendShortcut={onSaveSendShortcut}
      onSaveShortcut={onSaveShortcut}
      onSendShortcutChange={onSendShortcutChange}
      onShortcutChange={onShortcutChange}
      shortcutError="快捷键冲突"
    />,
  );

  fireEvent.change(screen.getByLabelText("编辑模式"), {
    target: { value: "Command+1" },
  });
  fireEvent.change(screen.getByLabelText("弹幕窗口"), {
    target: { value: "Command+2" },
  });
  fireEvent.change(screen.getByLabelText("发送弹幕"), {
    target: { value: "Command+3" },
  });

  for (const button of screen.getAllByRole("button", { name: "保存" })) {
    await user.click(button);
  }
  for (const button of screen.getAllByRole("button", { name: /恢复/ })) {
    await user.click(button);
  }

  expect(onShortcutChange).toHaveBeenCalledWith("Command+1");
  expect(onOverlayShortcutChange).toHaveBeenCalledWith("Command+2");
  expect(onSendShortcutChange).toHaveBeenCalledWith("Command+3");
  expect(onSaveShortcut).toHaveBeenCalledOnce();
  expect(onSaveOverlayShortcut).toHaveBeenCalledOnce();
  expect(onSaveSendShortcut).toHaveBeenCalledOnce();
  expect(onResetShortcut).toHaveBeenCalledOnce();
  expect(onResetOverlayShortcut).toHaveBeenCalledOnce();
  expect(onResetSendShortcut).toHaveBeenCalledOnce();
  expect(screen.getByRole("region", { name: "快捷键" })).toBeVisible();
  expect(screen.getByRole("region", { name: "重置" })).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("快捷键冲突");
});
