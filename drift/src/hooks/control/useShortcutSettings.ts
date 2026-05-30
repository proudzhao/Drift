import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  defaultOverlayShortcutLabel,
  defaultSendDanmakuShortcutLabel,
  defaultShortcutLabel,
  type AppConfig,
} from "../../types/config";

type UseShortcutSettingsParams = {
  config: AppConfig;
  saveConfig: (config: AppConfig) => Promise<void>;
};

export function useShortcutSettings({
  config,
  saveConfig,
}: UseShortcutSettingsParams) {
  const [draftShortcut, setDraftShortcut] = useState(
    config.shortcuts.toggleEditMode,
  );
  const [draftOverlayShortcut, setDraftOverlayShortcut] = useState(
    config.shortcuts.toggleOverlayWindow,
  );
  const [draftSendShortcut, setDraftSendShortcut] = useState(
    config.shortcuts.openSendDanmaku,
  );
  const [shortcutError, setShortcutError] = useState("");

  useEffect(() => {
    setDraftShortcut(config.shortcuts.toggleEditMode);
  }, [config.shortcuts.toggleEditMode]);

  useEffect(() => {
    setDraftOverlayShortcut(config.shortcuts.toggleOverlayWindow);
  }, [config.shortcuts.toggleOverlayWindow]);

  useEffect(() => {
    setDraftSendShortcut(config.shortcuts.openSendDanmaku);
  }, [config.shortcuts.openSendDanmaku]);

  async function saveShortcut() {
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>("set_edit_mode_shortcut", {
        shortcut: draftShortcut,
      });
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleEditMode: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function saveOverlayShortcut() {
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>(
        "set_overlay_window_shortcut",
        {
          shortcut: draftOverlayShortcut,
        },
      );
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleOverlayWindow: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function saveSendShortcut() {
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>(
        "set_send_danmaku_shortcut",
        {
          shortcut: draftSendShortcut,
        },
      );
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          openSendDanmaku: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function resetShortcut() {
    setDraftShortcut(defaultShortcutLabel());
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>("set_edit_mode_shortcut", {
        shortcut: defaultShortcutLabel(),
      });
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleEditMode: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function resetOverlayShortcut() {
    setDraftOverlayShortcut(defaultOverlayShortcutLabel());
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>(
        "set_overlay_window_shortcut",
        {
          shortcut: defaultOverlayShortcutLabel(),
        },
      );
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          toggleOverlayWindow: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  async function resetSendShortcut() {
    setDraftSendShortcut(defaultSendDanmakuShortcutLabel());
    setShortcutError("");
    try {
      const result = await invoke<{ shortcut: string }>(
        "set_send_danmaku_shortcut",
        {
          shortcut: defaultSendDanmakuShortcutLabel(),
        },
      );
      await saveConfig({
        ...config,
        shortcuts: {
          ...config.shortcuts,
          openSendDanmaku: result.shortcut,
        },
      });
    } catch (error) {
      setShortcutError(String(error));
    }
  }

  return {
    draftOverlayShortcut,
    draftSendShortcut,
    draftShortcut,
    resetOverlayShortcut,
    resetSendShortcut,
    resetShortcut,
    saveOverlayShortcut,
    saveSendShortcut,
    saveShortcut,
    setDraftOverlayShortcut,
    setDraftSendShortcut,
    setDraftShortcut,
    shortcutError,
  };
}
