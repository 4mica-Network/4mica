import { store } from "@stores/index";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import { ClerkAuthProvider } from "@/auth/ClerkAuthProvider";
import "@/i18n";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <ClerkAuthProvider>
          <App />
        </ClerkAuthProvider>
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
