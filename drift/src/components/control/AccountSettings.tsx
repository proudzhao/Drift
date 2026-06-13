import { useMemo } from "react";
import type {
  AuthStatus,
  QrLoginPollResult,
  QrLoginSession,
} from "../../types/auth";
import { classNames } from "../../utils/classNames";
import { createQrSvgDataUri } from "../../utils/qrCode";
import { Button } from "../ui";

type AccountSettingsProps = {
  authError: string;
  authStatus: AuthStatus | null;
  isAuthBusy: boolean;
  isPolling: boolean;
  onLogout: () => void;
  onStartLogin: () => void;
  onValidateSession: () => void;
  pollResult: QrLoginPollResult | null;
  qrSession: QrLoginSession | null;
};

export function AccountSettings({
  authError,
  authStatus,
  isAuthBusy,
  isPolling,
  onLogout,
  onStartLogin,
  onValidateSession,
  pollResult,
  qrSession,
}: AccountSettingsProps) {
  const qrSrc = useMemo(() => {
    if (!qrSession) return "";
    try {
      return createQrSvgDataUri(qrSession.url);
    } catch {
      return "";
    }
  }, [qrSession]);
  const isLoggedIn = Boolean(authStatus?.isLoggedIn);
  const statusText = accountStatusText(authStatus, pollResult);

  return (
    <div className="grid min-h-0 content-start gap-3 overflow-y-auto pr-1">
      <section className="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-3.5 rounded-md border border-[#d1d1d1] bg-[#f2f2f2] px-4 py-3.5">
        <div className="grid min-w-0 grid-cols-[12px_minmax(0,1fr)] items-center gap-2.5">
          <span
            className={classNames(
              "size-2.5 rounded-full",
              isLoggedIn ? "bg-[#34c759]" : "bg-[#ff9500]",
            )}
          />
          <div className="grid min-w-0 gap-0.5">
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-[#202124]">
              {isLoggedIn ? "已登录 B 站" : "未登录 B 站"}
            </strong>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#6f7782]">
              {statusText}
            </span>
          </div>
        </div>
        <div className="grid grid-flow-col gap-2">
          <Button
            disabled={isAuthBusy}
            onClick={onValidateSession}
            size="sm"
          >
            校验状态
          </Button>
          {isLoggedIn ? (
            <Button
              disabled={isAuthBusy}
              onClick={onLogout}
              size="sm"
              variant="danger"
            >
              退出登录
            </Button>
          ) : (
            <Button
              disabled={isAuthBusy}
              onClick={onStartLogin}
              size="sm"
              variant="primary"
            >
              扫码登录
            </Button>
          )}
        </div>
      </section>

      {authStatus ? (
        <section className="grid grid-cols-2 gap-2">
          {[
            ["昵称", authStatus.username || "未获取"],
            ["UID", authStatus.uid ?? "未获取"],
            ["最近校验", formatUnixTime(authStatus.lastValidatedAt)],
            ["过期时间", formatUnixTime(authStatus.expiresAt)],
          ].map(([label, value]) => (
            <div
              className="grid min-w-0 gap-1 rounded-md border border-[#d5d5d5] bg-[#f5f5f5] px-3 py-2.5"
              key={label}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#6f7782]">
                {label}
              </span>
              <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-[#202124]">
                {value}
              </strong>
            </div>
          ))}
        </section>
      ) : null}

      {qrSession ? (
        <section className="grid grid-cols-[156px_minmax(0,1fr)] items-center gap-3.5 rounded-md border border-[#d1d1d1] bg-[#f2f2f2] p-3.5">
          <div className="grid size-[156px] place-items-center rounded-md border border-[#cfcfcf] bg-white">
            {qrSrc ? (
              <img
                alt="B 站扫码登录二维码"
                className="block size-[140px] [image-rendering:pixelated]"
                src={qrSrc}
              />
            ) : (
              <span className="px-2.5 text-center text-[11px] text-[#b45f06]">
                二维码生成失败
              </span>
            )}
          </div>
          <div className="grid min-w-0 gap-1.5">
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-[#202124]">
              {qrStatusText(pollResult, isPolling)}
            </strong>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#6f7782]">
              {pollResult?.message || "请使用 B 站手机客户端扫码"}
            </span>
          </div>
        </section>
      ) : null}

      {authError || authStatus?.error ? (
        <p className="m-0 text-[11px] leading-snug text-[#b45f06]">
          {authError || authStatus?.error}
        </p>
      ) : null}
    </div>
  );
}

function accountStatusText(
  authStatus: AuthStatus | null,
  pollResult: QrLoginPollResult | null,
) {
  if (pollResult?.status === "confirmed") return "扫码登录已确认";
  if (!authStatus) return "尚未读取登录状态";
  if (authStatus.isLoggedIn) return "登录态可用";
  if (authStatus.needsRelogin) return "需要重新登录";
  return "匿名模式可继续使用";
}

function qrStatusText(
  pollResult: QrLoginPollResult | null,
  isPolling: boolean,
) {
  if (pollResult?.status === "scanned") return "已扫码，等待手机确认";
  if (pollResult?.status === "expired") return "二维码已过期";
  if (pollResult?.status === "confirmed") return "登录成功";
  if (pollResult?.status === "error") return "扫码状态异常";
  return isPolling ? "等待扫码" : "二维码已生成";
}

function formatUnixTime(value?: number) {
  if (!value) return "未记录";
  return new Date(value * 1000).toLocaleString();
}
