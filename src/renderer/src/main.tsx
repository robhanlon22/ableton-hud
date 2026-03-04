import { createRoot } from "react-dom/client";

import { HudApp } from "./app/hud-app";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<HudApp />);
