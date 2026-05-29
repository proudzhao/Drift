import { useMemo } from "react";
import type {
  AuthStatus,
  QrLoginPollResult,
  QrLoginSession,
} from "../../types/auth";
import { createQrSvgDataUri } from "../../utils/qrCode";

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
    <div className="settings-page account-settings">
      <section className="account-summary">
        <div className="account-state">
          <span
            className="status-dot"
            data-status={isLoggedIn ? "connected" : "disconnected"}
          />
          <div>
            <strong>{isLoggedIn ? "已登录 B 站" : "未登录 B 站"}</strong>
            <span>{statusText}</span>
          </div>
        </div>
        <div className="account-actions">
          <button disabled={isAuthBusy} onClick={onValidateSession} type="button">
            校验状态
          </button>
          {isLoggedIn ? (
            <button disabled={isAuthBusy} onClick={onLogout} type="button">
              退出登录
            </button>
          ) : (
            <button disabled={isAuthBusy} onClick={onStartLogin} type="button">
              扫码登录
            </button>
          )}
        </div>
      </section>

      {authStatus ? (
        <section className="account-details">
          <div>
            <span>昵称</span>
            <strong>{authStatus.username || "未获取"}</strong>
          </div>
          <div>
            <span>UID</span>
            <strong>{authStatus.uid ?? "未获取"}</strong>
          </div>
          <div>
            <span>最近校验</span>
            <strong>{formatUnixTime(authStatus.lastValidatedAt)}</strong>
          </div>
          <div>
            <span>过期时间</span>
            <strong>{formatUnixTime(authStatus.expiresAt)}</strong>
          </div>
        </section>
      ) : null}

      {qrSession ? (
        <section className="qr-login-panel">
          <div className="qr-code-box">
            {qrSrc ? (
              <img alt="B 站扫码登录二维码" src={qrSrc} />
            ) : (
              <span>二维码生成失败</span>
            )}
          </div>
          <div className="qr-login-meta">
            <strong>{qrStatusText(pollResult, isPolling)}</strong>
            <span>{pollResult?.message || "请使用 B 站手机客户端扫码"}</span>
          </div>
        </section>
      ) : null}

      {authError || authStatus?.error ? (
        <p className="control-error">{authError || authStatus?.error}</p>
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
