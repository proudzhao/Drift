import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AuthStatus,
  QrLoginPollResult,
  QrLoginSession,
} from "../../types/auth";

export function useAuthPanel() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authError, setAuthError] = useState("");
  const [qrSession, setQrSession] = useState<QrLoginSession | null>(null);
  const [qrPollResult, setQrPollResult] = useState<QrLoginPollResult | null>(
    null,
  );
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [isQrPolling, setIsQrPolling] = useState(false);

  useEffect(() => {
    void refreshAuthStatus();
  }, []);

  useEffect(() => {
    if (!qrSession || authStatus?.isLoggedIn) {
      return;
    }

    let cancelled = false;
    let interval: number | undefined;
    const stopPolling = () => {
      setIsQrPolling(false);
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
    const poll = async () => {
      setIsQrPolling(true);
      try {
        const result = await invoke<QrLoginPollResult>("auth_poll_qr_login", {
          qrcodeKey: qrSession.qrcodeKey,
        });
        if (cancelled) return;
        setQrPollResult(result);
        if (result.authStatus) {
          setAuthStatus(result.authStatus);
          setQrSession(null);
          stopPolling();
        }
        if (result.status === "expired" || result.status === "error") {
          stopPolling();
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(String(error));
          stopPolling();
        }
      }
    };

    void poll();
    interval = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [authStatus?.isLoggedIn, qrSession]);

  async function refreshAuthStatus() {
    setAuthError("");
    try {
      const status = await invoke<AuthStatus>("auth_get_status");
      setAuthStatus(status);
    } catch (error) {
      setAuthError(String(error));
    }
  }

  async function startQrLogin() {
    setAuthError("");
    setQrPollResult(null);
    setIsAuthBusy(true);
    try {
      const session = await invoke<QrLoginSession>("auth_start_qr_login");
      setQrSession(session);
      setAuthStatus((current) =>
        current?.isLoggedIn ? { ...current, isLoggedIn: false } : current,
      );
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function validateAuthSession() {
    setAuthError("");
    setIsAuthBusy(true);
    try {
      const status = await invoke<AuthStatus>("auth_validate_session");
      setAuthStatus(status);
      if (status.isLoggedIn) {
        setQrSession(null);
        setQrPollResult(null);
      }
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  async function logoutAuth() {
    setAuthError("");
    setIsAuthBusy(true);
    try {
      const status = await invoke<AuthStatus>("auth_logout");
      setAuthStatus(status);
      setQrSession(null);
      setQrPollResult(null);
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setIsAuthBusy(false);
    }
  }

  return {
    authError,
    authStatus,
    isAuthBusy,
    isQrPolling,
    logoutAuth,
    qrPollResult,
    qrSession,
    startQrLogin,
    validateAuthSession,
  };
}
