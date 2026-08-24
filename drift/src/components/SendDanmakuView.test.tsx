import { createRef, type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import css from "../styles/tailwind.css?raw";
import { SendDanmakuView } from "./SendDanmakuView";

function renderView(
  overrides: Partial<ComponentProps<typeof SendDanmakuView>> = {},
) {
  const props: ComponentProps<typeof SendDanmakuView> = {
    canSend: true,
    feedback: "准备发送",
    inputRef: createRef<HTMLInputElement>(),
    isSending: false,
    onClose: vi.fn(),
    onDragStart: vi.fn(),
    onInputKeyDown: vi.fn(),
    onSend: vi.fn(),
    onTextChange: vi.fn(),
    remaining: 60,
    targetText: "星瞳_Official",
    text: "",
    tone: "signal",
    ...overrides,
  };
  render(<SendDanmakuView {...props} />);
  return props;
}

test("renders the Signal Cyan send surface and status rail", () => {
  renderView();

  expect(screen.getByRole("main")).toHaveClass(
    "drift-send-shell",
    "grid-cols-[minmax(0,1fr)]",
    "h-full",
    "w-full",
  );
  expect(screen.getByText("星瞳_Official")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("准备发送");
  expect(screen.getByText("60 字可用")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "弹幕内容" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "发送" })).toBeEnabled();
});

test("uses semantic theme colors without changing send state semantics", () => {
  renderView({ tone: "warning", remaining: 4 });
  const shell = screen.getByRole("main");

  expect(shell).toHaveClass("drift-send-shell");
  expect(shell.outerHTML).toContain("var(--drift-ui-");
  expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warning");
  expect(screen.getByText("4 字可用")).toBeVisible();

  const sendRule = css.slice(css.indexOf(".drift-send-shell {"));
  expect(sendRule).toContain("color-scheme: inherit;");
  expect(sendRule).toContain("background-color: var(--drift-ui-glass);");
  expect(sendRule).toContain("background: var(--drift-ui-send-background);");
  expect(sendRule).toContain("border-color: var(--drift-ui-send-border);");
  expect(sendRule).toContain("box-shadow:");
  expect(sendRule).toContain("backdrop-filter: blur(22px);");
});

test("shows sending and remaining-count states", () => {
  const { rerender } = render(
    <SendDanmakuView
      canSend={false}
      feedback="发送中"
      inputRef={createRef<HTMLInputElement>()}
      isSending
      onClose={vi.fn()}
      onDragStart={vi.fn()}
      onInputKeyDown={vi.fn()}
      onSend={vi.fn()}
      onTextChange={vi.fn()}
      remaining={5}
      targetText="测试主播"
      text="测试"
      tone="signal"
    />,
  );

  expect(screen.getByRole("button", { name: "发送中" })).toBeDisabled();
  expect(screen.getByText("5 字可用")).toHaveAttribute(
    "data-count-tone",
    "warning",
  );

  rerender(
    <SendDanmakuView
      canSend={false}
      feedback="弹幕内容不能超过 60 个字符"
      inputRef={createRef<HTMLInputElement>()}
      isSending={false}
      onClose={vi.fn()}
      onDragStart={vi.fn()}
      onInputKeyDown={vi.fn()}
      onSend={vi.fn()}
      onTextChange={vi.fn()}
      remaining={-3}
      targetText="测试主播"
      text="超长内容"
      tone="danger"
    />,
  );
  expect(screen.getByText("超出 3 字")).toHaveAttribute(
    "data-count-tone",
    "danger",
  );
  expect(screen.getByRole("textbox", { name: "弹幕内容" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("constrains long target text inside the draggable header", () => {
  renderView({
    targetText:
      "这是一个用于检查目标文本截断的超长主播名称_Official_持续直播特别加长版本",
  });

  expect(screen.getByText(/这是一个用于检查目标文本截断/).parentElement).toHaveClass(
    "flex-1",
    "overflow-hidden",
  );
});

test("forwards view interactions without owning business state", async () => {
  const user = userEvent.setup();
  const props = renderView();
  const input = screen.getByRole("textbox", { name: "弹幕内容" });

  fireEvent.change(input, { target: { value: "你好" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.mouseDown(screen.getByLabelText("拖动发送窗口"), {
    button: 0,
    screenX: 10,
    screenY: 20,
  });
  await user.click(screen.getByRole("button", { name: "发送" }));
  await user.click(screen.getByRole("button", { name: "关闭发送窗口" }));

  expect(props.onTextChange).toHaveBeenCalledWith("你好");
  expect(props.onInputKeyDown).toHaveBeenCalledOnce();
  expect(props.onDragStart).toHaveBeenCalledOnce();
  expect(props.onSend).toHaveBeenCalledOnce();
  expect(props.onClose).toHaveBeenCalledOnce();
});
