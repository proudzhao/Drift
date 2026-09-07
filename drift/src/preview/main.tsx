import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ControlPanel } from "../components/control/ControlPanel";
import type { AppConfig } from "../types/config";
import { EMPTY_DANMAKU_RECORDING_STATUS } from "../types/recording";
import { PREVIEW_CONFIG } from "./fixtures";
import {
  getPreviewScenario,
  PreviewScenario,
  PreviewScenarioPicker,
  type PreviewScenarioId,
} from "./previewScenarios";
import { ThemeScenarioScope } from "./ThemeScenarioScope";
import "../styles/tailwind.css";
import "../App.css";

mockIPC((command, payload) => {
  if (command === "plugin:app|set_app_theme") return null;
  if (command === "auth_get_status") return { isLoggedIn: false };
  if (command === "get_bilibili_room_sessions") return [];
  if (command === "get_filter_runtime_status") return { rooms: [] };
  if (command === "get_danmaku_recording_status") {
    return EMPTY_DANMAKU_RECORDING_STATUS;
  }
  if (command === "save_app_config") {
    return (payload as { config: AppConfig }).config;
  }
  if (command === "get_app_version") return { version: "0.8.0" };
  if (
    ["open_help_window", "show_window", "hide_window", "open_log_dir"].includes(
      command,
    )
  ) {
    return null;
  }
  if (command === "export_diagnostics") {
    return "drift-diagnostics-preview.txt";
  }
  throw new Error(`Preview does not mock command: ${command}`);
});

function ControlPanelPreview() {
  const [config, setConfig] = useState(PREVIEW_CONFIG);

  return <ControlPanel config={config} onConfigChange={setConfig} />;
}

const selectedScenario = getPreviewScenario(
  new URLSearchParams(location.search).get("scenario"),
);

function changeScenario(scenarioId: PreviewScenarioId) {
  const searchParams = new URLSearchParams(location.search);
  if (scenarioId === "default") {
    searchParams.delete("scenario");
  } else {
    searchParams.set("scenario", scenarioId);
  }
  location.search = searchParams.toString();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div>
      <PreviewScenarioPicker
        onScenarioChange={changeScenario}
        selectedScenarioId={selectedScenario.id}
      />
      {selectedScenario.id === "default" ? (
        <ThemeScenarioScope theme="dark">
          <ControlPanelPreview />
        </ThemeScenarioScope>
      ) : (
        <PreviewScenario scenarioId={selectedScenario.id} />
      )}
    </div>
  </React.StrictMode>,
);
