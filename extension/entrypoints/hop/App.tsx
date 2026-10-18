import { useCallback, useRef, useState } from "react";

/**
 * Claude-shaped composer for Playwright Groq hop tests.
 * contenteditable + remount helper + Enter-to-send (clears box like Claude).
 */
export function HopApp() {
  const [gen, setGen] = useState(0);
  const [sent, setSent] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const remount = useCallback(() => {
    setGen((g) => g + 1);
  }, []);

  const doSend = useCallback(() => {
    const el = boxRef.current;
    if (el) el.textContent = "";
    setSent((n) => n + 1);
  }, []);

  return (
    <main
      data-testid="hop"
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: "#f5f5f4",
      }}
    >
      <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>Claude-shaped hop</h1>
      <p style={{ fontSize: 13, color: "#57534e", margin: "0 0 16px" }}>
        Type a weather ask. Coach should toast top-right and open Gemini.
      </p>
      <p data-testid="hop-sent" style={{ fontSize: 12, color: "#78716c" }}>
        sent:{sent}
      </p>
      <div
        key={gen}
        ref={boxRef}
        data-testid="chat-input"
        className="ProseMirror"
        contentEditable
        role="textbox"
        aria-label="Write a message"
        suppressContentEditableWarning
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            doSend();
          }
        }}
        style={{
          minHeight: 120,
          width: "100%",
          maxWidth: 560,
          padding: 12,
          borderRadius: 12,
          border: "1px solid #d6d3d1",
          background: "#fff",
          fontSize: 15,
          lineHeight: 1.45,
          outline: "none",
        }}
      />
      <button
        type="button"
        data-testid="send-button"
        aria-label="Send"
        onClick={doSend}
        style={{ marginTop: 12, marginRight: 8, fontSize: 13 }}
      >
        Send
      </button>
      <button
        type="button"
        data-testid="hop-remount"
        onClick={remount}
        style={{ marginTop: 12, fontSize: 13 }}
      >
        Remount composer
      </button>
    </main>
  );
}
