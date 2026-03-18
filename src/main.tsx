import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config.ts";
import { registerServiceWorker } from "./lib/registerServiceWorker";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
