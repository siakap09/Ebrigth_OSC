"use client";

import { Suspense, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useFAStore } from "@pcm/_lib/store";
import { PcmReport } from "@pcm/_types";
import { ArrowLeft, Printer } from "lucide-react";
import { CertificateBody } from "@pcm/_components/fa/CertificateBody";

/**
 * Bulk-print: renders one CertificateBody per ?ids=… entry, each on its
 * own A4 sheet via the .fa-print-cert-page page-break class.
 *
 * The page export is just a Suspense wrapper — Next.js refuses to
 * statically prerender any tree that reads useSearchParams() without
 * one. Without the wrapper the prod build aborts before the page is
 * even rendered.
 */
export default function ReportsBulkPrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-ink-500 text-sm">Loading certificates…</div>}>
      <BulkPrintInner />
    </Suspense>
  );
}

function BulkPrintInner() {
  const search = useSearchParams();
  const ids = useMemo(() => {
    const raw = search.get("ids") ?? "";
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }, [search]);

  const allReports = useFAStore(s => s.reports);
  const reports = useMemo(() => {
    const byInv = new Map(allReports.map(r => [r.invitationId, r]));
    return ids.map(id => byInv.get(id)).filter(Boolean) as PcmReport[];
  }, [allReports, ids]);

  // Briefly defer the print call so React has flushed the certs before
  // the browser snapshots the page. Without this the dialog occasionally
  // opens against an empty DOM.
  useEffect(() => {
    if (reports.length === 0) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [reports.length]);

  if (reports.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivory-100">
        <div className="text-center">
          <h1 className="fa-display text-2xl text-ink-900">Nothing to print</h1>
          <p className="text-ink-500 mt-2">The filter resolved to zero filled reports.</p>
          <Link href="/pcm-system/shared/reports" className="fa-btn-primary mt-4 inline-flex">
            Back to reports
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory-100 py-8 print:py-0 print:bg-white">
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 print:hidden flex items-center gap-2 bg-white shadow-lg rounded-full border border-ivory-300 px-3 py-2">
        <Link
          href="/pcm-system/shared/reports"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-ink-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>
        <span className="text-ink-300">|</span>
        <span className="fa-mono text-[11px] uppercase text-ink-500" style={{ letterSpacing: "0.1em" }}>
          {reports.length} certificate{reports.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold
                     bg-gradient-to-r from-violet-600 to-fuchsia-600
                     hover:from-violet-700 hover:to-fuchsia-700"
        >
          <Printer className="w-3.5 h-3.5" />
          Print again
        </button>
      </div>

      {reports.map((report, idx) => (
        <article
          key={report.id}
          // .fa-print-cert-page is declared in pcm-globals.css — forces a
          // page-break between certs in bulk print.
          className="fa-print-cert-page mx-auto print:shadow-none"
          style={{ maxWidth: "900px", padding: "16px 24px", marginBottom: idx === reports.length - 1 ? 0 : 24 }}
        >
          <CertificateBody report={report} />
        </article>
      ))}
    </div>
  );
}
