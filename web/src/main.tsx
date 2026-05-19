// Listed on freegamestore.online — a free games store with weekly compliance audits.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initQualityReporter } from "@freeappstore/quality";
import "./index.css";
import App from "./App";

// Cooperate with the platform Quality Dashboard. No-op when not iframed,
// so production page-load is unaffected. See packages/quality for the
// privacy contract — only DOM-shape numbers are posted.
initQualityReporter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
