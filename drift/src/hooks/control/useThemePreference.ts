import { useEffect, useRef, useState } from "react";
import type { UiTheme } from "../../types/config";
import {
  applyDocumentUiTheme,
  applyNativeAppTheme,
} from "../../utils/uiTheme";

type UseThemePreferenceParams = {
  theme: UiTheme;
  saveTheme: (theme: UiTheme) => Promise<void>;
};

export function useThemePreference({
  theme: authorityTheme,
  saveTheme,
}: UseThemePreferenceParams) {
  const [theme, setTheme] = useState<UiTheme>(authorityTheme);
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const [themeError, setThemeError] = useState("");
  const isThemeSaveInFlight = useRef(false);

  useEffect(() => setTheme(authorityTheme), [authorityTheme]);

  async function toggleTheme() {
    if (isThemeSaveInFlight.current) return;
    isThemeSaveInFlight.current = true;
    const previousTheme = theme;
    const nextTheme: UiTheme = previousTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setThemeError("");
    setIsThemeSaving(true);
    applyDocumentUiTheme(nextTheme);
    void applyNativeAppTheme(nextTheme);
    try {
      await saveTheme(nextTheme);
    } catch {
      setTheme(previousTheme);
      applyDocumentUiTheme(previousTheme);
      void applyNativeAppTheme(previousTheme);
      setThemeError("主题保存失败，已恢复原主题");
    } finally {
      isThemeSaveInFlight.current = false;
      setIsThemeSaving(false);
    }
  }

  return { theme, isThemeSaving, themeError, toggleTheme };
}
