import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config.ts";
import {
  clearServiceWorkerAndCaches,
  registerServiceWorker,
} from "./lib/registerServiceWorker";

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("action") === "force_update_pro") {
    await clearServiceWorkerAndCaches().catch(() => {});
    params.delete("action");
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
    window.location.reload();
    return;
  }

  registerServiceWorker();
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
