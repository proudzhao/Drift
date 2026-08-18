import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { SavedRoomGroup } from "../../types/config";
import { SavedRoomGroupControls } from "./SavedRoomGroupControls";

const GROUPS: SavedRoomGroup[] = [
  {
    id: "chat",
    name: "聊天",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  },
  {
    id: "game",
    name: "游戏",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  },
];

function renderGroupControls() {
  const callbacks = {
    onCreateGroup: vi.fn(async () => true),
    onDeleteGroup: vi.fn(async () => true),
    onRenameGroup: vi.fn(async () => true),
    onSearchQueryChange: vi.fn(),
    onSelectedGroupChange: vi.fn(),
  };

  render(
    <SavedRoomGroupControls
      groups={GROUPS}
      searchQuery=""
      selectedGroupId="chat"
      {...callbacks}
    />,
  );

  return callbacks;
}

test("uses the grouped room toolbar and keeps search and selection", async () => {
  const user = userEvent.setup();
  const callbacks = renderGroupControls();

  expect(
    screen.getByRole("toolbar", { name: "常用直播间工具栏" }),
  ).toBeVisible();
  await user.type(screen.getByRole("searchbox", { name: "搜索常用直播间" }), "深夜");
  await user.click(screen.getByRole("tab", { name: "游戏" }));

  expect(callbacks.onSearchQueryChange).toHaveBeenLastCalledWith("夜");
  expect(callbacks.onSelectedGroupChange).toHaveBeenCalledWith("game");
});

test("closes create and rename editors after successful promises", async () => {
  const user = userEvent.setup();
  const callbacks = renderGroupControls();

  await user.click(screen.getByRole("button", { name: "新建分组" }));
  await user.type(screen.getByRole("textbox", { name: "新分组名称" }), "赛事");
  await user.click(screen.getByRole("button", { name: "添加" }));
  expect(callbacks.onCreateGroup).toHaveBeenCalledWith("赛事");
  await waitFor(() => {
    expect(screen.queryByRole("textbox", { name: "新分组名称" })).not.toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "重命名分组" }));
  const renameInput = screen.getByRole("textbox", { name: "重命名分组" });
  await user.clear(renameInput);
  await user.type(renameInput, "闲聊");
  await user.click(screen.getByRole("button", { name: "保存" }));
  expect(callbacks.onRenameGroup).toHaveBeenCalledWith("chat", "闲聊");
  await waitFor(() => {
    expect(screen.queryByRole("textbox", { name: "重命名分组" })).not.toBeInTheDocument();
  });
});

test("keeps delete confirmation and cancellation", async () => {
  const user = userEvent.setup();
  const callbacks = renderGroupControls();

  await user.click(screen.getByRole("button", { name: "删除分组" }));
  expect(screen.getByRole("dialog", { name: "删除分组" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("dialog", { name: "删除分组" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "删除分组" }));
  await user.click(screen.getByRole("button", { name: "确认删除" }));
  expect(callbacks.onDeleteGroup).toHaveBeenCalledWith("chat");
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "删除分组" })).not.toBeInTheDocument();
  });
});
