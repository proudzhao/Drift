import { setTheme } from "@tauri-apps/api/app";
import type { UiTheme } from "../types/config";

export const UI_THEME_STORAGE_KEY = "drift-ui-theme";

export function normalizeUiTheme(value: unknown): UiTheme {
  return value === "light" ? "light" : "dark";
}

export function readStoredUiTheme(): UiTheme {
  try {
    return normalizeUiTheme(localStorage.getItem(UI_THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function readBootstrapUiTheme(): UiTheme {
  const documentTheme = document.documentElement.dataset.driftTheme;
  return documentTheme === "light" || documentTheme === "dark"
    ? documentTheme
    : readStoredUiTheme();
}

export function applyDocumentUiTheme(theme: UiTheme) {
  document.documentElement.dataset.driftTheme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  } catch {
    // Document theme remains usable when WebView storage is unavailable.
  }
}

export async function applyNativeAppTheme(theme: UiTheme) {
  try {
    await setTheme(theme);
  } catch {
    // Platform-native theme sync is best effort.
  }
}
