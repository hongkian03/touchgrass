import { useMemo, useState } from "react";
import {
  buildReportCardSvg,
  exportReportPdf,
  exportReportPng,
  rankForScore,
  type ReportCardData,
} from "../lib/reportCard";
import { Button } from "./ui/button";

type Props = {
  data: ReportCardData;
  onClose: () => void;
};

export function AchievementReportModal({ data, onClose }: Props) {
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svg = useMemo(() => {
    // Strip XML declaration for safe HTML embed.
    return buildReportCardSvg(data).replace(/^<\?xml[^>]*>\s*/i, "");
  }, [data]);
  const rank = rankForScore(data.score);
  const title = data.userName.trim() || "Friend";

  const run = async (kind: "pdf" | "png") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "pdf") await exportReportPdf(data);
      else await exportReportPng(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-testid="achievement-report"
      className="absolute inset-0 z-50 flex flex-col bg-white"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-base font-semibold">Your passport</h2>
          <p className="m-0 truncate text-[11px] text-muted-foreground">
            {title} · {rank}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          data-testid="report-close"
          className="h-8 shrink-0 px-3 text-xs"
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div
          data-testid="report-card-preview"
          className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-border shadow-sm [&>svg]:h-auto [&>svg]:w-full"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-3">
        <Button
          type="button"
          data-testid="report-download-pdf"
          disabled={busy !== null}
          className="w-full"
          onClick={() => void run("pdf")}
        >
          {busy === "pdf" ? "Building PDF…" : "Download PDF report"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          data-testid="report-download-png"
          disabled={busy !== null}
          className="w-full"
          onClick={() => void run("png")}
        >
          {busy === "png" ? "Saving…" : "Save image for socials"}
        </Button>
        {error ? (
          <p className="m-0 text-xs text-muted-foreground">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
