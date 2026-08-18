import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { ControlPanel } from "../components/control/ControlPanel";
import type { AppConfig } from "../types/config";
import type { DanmakuStatus } from "../types/danmaku";
import { PREVIEW_CONFIG, PREVIEW_STATUS } from "./fixtures";
import {
  getPreviewScenario,
  PreviewScenario,
  PreviewScenarioPicker,
  type PreviewScenarioId,
} from "./previewScenarios";
import "../styles/tailwind.css";
import "../App.css";

mockIPC((command, payload) => {
  if (command === "auth_get_status") return { isLoggedIn: false };
  if (command === "save_app_config") {
    return (payload as { config: AppConfig }).config;
  }
  if (command === "get_app_version") return { version: "0.7.0" };
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
  const [status, setStatus] = useState<DanmakuStatus>(PREVIEW_STATUS);
  const isConnected = ["connecting", "connected", "reconnecting"].includes(
    status.status,
  );

  return (
    <ControlPanel
      config={config}
      isConnected={isConnected}
      onConfigChange={setConfig}
      onStatusChange={setStatus}
      status={status}
    />
  );
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
        <ControlPanelPreview />
      ) : (
        <PreviewScenario scenarioId={selectedScenario.id} />
      )}
    </div>
  </React.StrictMode>,
);
