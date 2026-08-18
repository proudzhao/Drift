import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AccountSettings } from "./AccountSettings";

test("keeps login, validation, and logout actions in the status page", async () => {
  const user = userEvent.setup();
  const onStartLogin = vi.fn();
  const onValidateSession = vi.fn();
  const { rerender } = render(
    <AccountSettings
      authError=""
      authStatus={{ isLoggedIn: false }}
      isAuthBusy={false}
      isPolling={false}
      onLogout={vi.fn()}
      onStartLogin={onStartLogin}
      onValidateSession={onValidateSession}
      pollResult={null}
      qrSession={null}
    />,
  );

  await user.click(screen.getByRole("button", { name: "校验状态" }));
  await user.click(screen.getByRole("button", { name: "扫码登录" }));
  expect(onValidateSession).toHaveBeenCalledOnce();
  expect(onStartLogin).toHaveBeenCalledOnce();

  const onLogout = vi.fn();
  rerender(
    <AccountSettings
      authError=""
      authStatus={{ isLoggedIn: true, uid: 42, username: "DriftUser" }}
      isAuthBusy={false}
      isPolling={false}
      onLogout={onLogout}
      onStartLogin={onStartLogin}
      onValidateSession={onValidateSession}
      pollResult={null}
      qrSession={null}
    />,
  );

  await user.click(screen.getByRole("button", { name: "退出登录" }));
  expect(onLogout).toHaveBeenCalledOnce();
  expect(screen.getByText("42")).toHaveClass("drift-data-text");
});

test("keeps QR generation, polling status, and auth errors", () => {
  render(
    <AccountSettings
      authError="凭据已失效"
      authStatus={{ isLoggedIn: false }}
      isAuthBusy={false}
      isPolling={true}
      onLogout={vi.fn()}
      onStartLogin={vi.fn()}
      onValidateSession={vi.fn()}
      pollResult={{ code: 0, status: "scanned", message: "请在手机确认" }}
      qrSession={{ qrcodeKey: "preview-key", url: "https://example.com/login" }}
    />,
  );

  expect(screen.getByRole("img", { name: "B 站扫码登录二维码" })).toHaveAttribute(
    "src",
    expect.stringMatching(/^data:image\/svg\+xml/),
  );
  expect(screen.getByText("已扫码，等待手机确认")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("凭据已失效");
});
