import React from "react";
import { createRoot } from "react-dom/client";
import { HopApp } from "./App";
import { startCoachWatch } from "../../lib/startCoachWatch";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <HopApp />
    </React.StrictMode>,
  );
}

// Same coach path as content script (mock-browser provides chrome APIs)
startCoachWatch();
