import React from "react";
import ReactDOM from "react-dom/client";
import { PuddleStub } from "../../components/PuddleStub";
import "../../assets/puddle.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <PuddleStub subtitle="Week, insights, upload — next." />
    </div>
  </React.StrictMode>,
);
