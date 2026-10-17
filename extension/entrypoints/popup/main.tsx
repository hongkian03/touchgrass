import React from "react";
import ReactDOM from "react-dom/client";
import { PuddleStub } from "../../components/PuddleStub";
import "../../assets/puddle.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ width: 360, minHeight: 520 }}>
      <PuddleStub subtitle="Today’s score lives here next." />
    </div>
  </React.StrictMode>,
);
