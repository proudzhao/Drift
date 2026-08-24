import { useLayoutEffect, type ReactNode } from "react";
import type { UiTheme } from "../types/config";
import {
  UI_THEME_STORAGE_KEY,
  applyDocumentUiTheme,
} from "../utils/uiTheme";

export function ThemeScenarioScope({
  children,
  theme,
}: {
  children: ReactNode;
  theme: UiTheme;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.driftTheme;
    const previousColorScheme = root.style.colorScheme;
    let previousStoredTheme: string | null = null;

    try {
      previousStoredTheme = localStorage.getItem(UI_THEME_STORAGE_KEY);
    } catch {
      // The document theme remains usable without WebView storage.
    }

    applyDocumentUiTheme(theme);

    return () => {
      if (previousTheme === undefined) {
        delete root.dataset.driftTheme;
      } else {
        root.dataset.driftTheme = previousTheme;
      }
      root.style.colorScheme = previousColorScheme;

      try {
        if (previousStoredTheme === null) {
          localStorage.removeItem(UI_THEME_STORAGE_KEY);
        } else {
          localStorage.setItem(UI_THEME_STORAGE_KEY, previousStoredTheme);
        }
      } catch {
        // Preserve document cleanup when WebView storage is unavailable.
      }
    };
  }, [theme]);

  return <>{children}</>;
}
