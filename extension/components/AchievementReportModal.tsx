import { useEffect, useMemo, useState } from "react";
import {
  buildReportCardSvg,
  exportReportPdf,
  exportReportPng,
  rankForScore,
  resolveStickerDataUrl,
  type ReportCardData,
} from "../lib/reportCard";
import { Pip } from "./Pip";
import { Button } from "./ui/button";

type Props = {
  data: ReportCardData;
  onClose: () => void;
};

export function AchievementReportModal({ data, onClose }: Props) {
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stickerDataUrl, setStickerDataUrl] = useState<string | undefined>(
    data.stickerHref,
  );

  useEffect(() => {
    let alive = true;
    void resolveStickerDataUrl(data.score >= 70 ? "gotit" : "hello").then(
      (url) => {
        if (alive) setStickerDataUrl(url);
      },
    );
    return () => {
      alive = false;
    };
  }, [data.score]);

  const enrichedData = useMemo(
    () => ({ ...data, stickerHref: stickerDataUrl }),
    [data, stickerDataUrl],
  );

  const svg = useMemo(() => {
    // Strip XML declaration for safe HTML embed.
    return buildReportCardSvg(enrichedData).replace(/^<\?xml[^>]*>\s*/i, "");
  }, [enrichedData]);
  const rank = rankForScore(data.score);
  const title = data.userName.trim() || "Friend";

  const run = async (kind: "pdf" | "png") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "pdf") await exportReportPdf(enrichedData);
      else await exportReportPng(enrichedData);
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Pip
            size={36}
            variant="sticker"
            pose="report"
            tilt={-4}
          />
          <div className="min-w-0">
            <h2 className="m-0 truncate text-sm font-semibold">
              Your passport
            </h2>
            <p className="m-0 truncate text-[11px] text-muted-foreground">
              {title} · {rank}
            </p>
          </div>
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
        <div className="relative mx-auto w-full max-w-[280px]">
          <div
            data-testid="report-card-preview"
            className="w-full overflow-hidden rounded-2xl border border-border shadow-sm [&>svg]:h-auto [&>svg]:w-full"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div
            data-testid="report-elon-presenter"
            className="pointer-events-none absolute -bottom-2 -right-3 flex items-end gap-1"
          >
            <span className="mb-4 rounded-full border border-[#d8f0c8] bg-[#e8f6df] px-2 py-0.5 text-[10px] font-semibold text-[#2d5a27] shadow-sm">
              Nice lawn! 👍
            </span>
            <Pip
              size={64}
              variant="sticker"
              pose={data.score >= 70 ? "chill" : "plant"}
              tilt={6}
            />
          </div>
        </div>
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
