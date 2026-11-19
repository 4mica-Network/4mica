import { store } from "@stores/index";
import { MotionConfig } from "framer-motion";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import { ClerkAuthProvider } from "@/auth/ClerkAuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppCrash } from "@/components/ErrorBoundary/fallbacks";
import { MotionProvider } from "@/components/MotionProvider";
import { Notifications } from "@/components/Notifications";
import { reloadForNewVersion } from "@/lib/chunkReload";
import { captureVerifyToken } from "@/lib/verifyToken";
import "@/i18n";
import "react-toastify/dist/ReactToastify.css";
import "@/styles.css";

captureVerifyToken();

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  void import("@/lib/telemetry")
    .then(({ initTelemetry }) => initTelemetry(sentryDsn))
    .catch(() => {});
}

window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) {
    event.preventDefault();
  }
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

if (!document.documentElement.hasAttribute("data-unsupported")) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary fallback={AppCrash}>
        <Provider store={store}>
          <BrowserRouter>
            <ClerkAuthProvider>
              <MotionConfig reducedMotion="user">
                <MotionProvider>
                  <App />
                  <Notifications />
                </MotionProvider>
              </MotionConfig>
            </ClerkAuthProvider>
          </BrowserRouter>
        </Provider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
