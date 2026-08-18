import { useMemo } from "react";
import type {
  AuthStatus,
  QrLoginPollResult,
  QrLoginSession,
} from "../../types/auth";
import { createQrSvgDataUri } from "../../utils/qrCode";
import { Button } from "../ui";
import {
  DataValue,
  SettingsPage,
  SettingsRow,
  SettingsSection,
  StatusBanner,
  StatusDot,
} from "./settings-ui";

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
    <SettingsPage>
      <StatusBanner
        actions={
          <>
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
          </>
        }
        description={statusText}
        title={isLoggedIn ? "已登录 B 站" : "未登录 B 站"}
        tone={isLoggedIn ? "success" : "warning"}
      />

      {authStatus ? (
        <SettingsSection title="账号信息">
          <SettingsRow
            control={<DataValue>{authStatus.username || "未获取"}</DataValue>}
            label="昵称"
          />
          <SettingsRow
            control={<DataValue>{authStatus.uid ?? "未获取"}</DataValue>}
            label="UID"
          />
          <SettingsRow
            control={
              <DataValue>{formatUnixTime(authStatus.lastValidatedAt)}</DataValue>
            }
            label="最近校验"
          />
          <SettingsRow
            control={<DataValue>{formatUnixTime(authStatus.expiresAt)}</DataValue>}
            label="过期时间"
          />
        </SettingsSection>
      ) : null}

      {qrSession ? (
        <SettingsSection
          description={pollResult?.message || "请使用 B 站手机客户端扫码"}
          title="扫码登录"
        >
          <div className="grid grid-cols-[156px_minmax(0,1fr)] items-center gap-4 p-3 max-[519px]:grid-cols-1">
            <div className="qr-scan-surface grid size-[156px] place-items-center rounded-lg bg-white">
              {qrSrc ? (
                <img
                  alt="B 站扫码登录二维码"
                  className="size-[140px] [image-rendering:pixelated]"
                  src={qrSrc}
                />
              ) : (
                <span className="text-[10px] text-[var(--control-warning)]">
                  二维码生成失败
                </span>
              )}
            </div>
            <StatusDot
              label={qrStatusText(pollResult, isPolling)}
              tone={pollResult?.status === "error" ? "danger" : "signal"}
            />
          </div>
        </SettingsSection>
      ) : null}

      {authError || authStatus?.error ? (
        <StatusBanner
          description={authError || authStatus?.error}
          title="账号状态异常"
          tone="danger"
        />
      ) : null}
    </SettingsPage>
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
