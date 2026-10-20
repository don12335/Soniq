import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { RootErrorBoundary } from "@/shared/ui";
import { initGlobalErrorHandlers } from "@/shared/utils/globalErrorHandlers";
import { initTelemetry } from "@/shared/telemetry";
import { initClientVisitorSession } from "@/shared/api/visitorSession";
import { initBundleStampLog } from "@/shared/utils/bundleStampLog";
import { applyLayoutAttributes, isNative } from "@/shared/platform";

async function boot() {
  // Native builds must route fetch through CapacitorHttp before any request goes out.
  if (isNative()) {
    const { bootstrapNative } = await import("@/shared/platform/native/bootstrap");
    await bootstrapNative();
  }
  applyLayoutAttributes();

  // Initialize global error handlers, telemetry listeners and visitor session.
  initGlobalErrorHandlers();
  initTelemetry();
  initClientVisitorSession();
  initBundleStampLog();

  const rootElement = document.getElementById("root");

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </React.StrictMode>,
    );
  }
}

void boot();
