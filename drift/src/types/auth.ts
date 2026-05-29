export type AuthStatus = {
  isLoggedIn: boolean;
  uid?: number;
  username?: string;
  expiresAt?: number;
  lastValidatedAt?: number;
  needsRelogin?: boolean;
  error?: string;
};

export type QrLoginSession = {
  url: string;
  qrcodeKey: string;
};

export type QrLoginPollStatus =
  | "waiting"
  | "scanned"
  | "expired"
  | "confirmed"
  | "error";

export type QrLoginPollResult = {
  code: number;
  status: QrLoginPollStatus;
  message: string;
  authStatus?: AuthStatus;
};
