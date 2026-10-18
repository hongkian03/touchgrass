import React from "react";
import ReactDOM from "react-dom/client";
import "../../assets/puddle.css";
// Popup-only reskin; must load after puddle.css so its overrides win
import "../../assets/popup-theme.css";
import { PopupApp } from "./App";

// "panel" when framed by the floating panel, "popup" in Chrome's own popup window
document.documentElement.dataset.surface =
  window.top !== window.self ? "panel" : "popup";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
