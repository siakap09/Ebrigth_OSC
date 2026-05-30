"use client";

import { BRANCHES, FAReport, FA_REPORT_MAX_PER_CRITERION, faReportTotal } from "@fa/_types";
import { format, parseISO } from "date-fns";

/**
 * Shared FA certificate render — used by:
 *   - the single-cert page at /fa-system/shared/reports/[id]/certificate
 *   - the bulk-print page at /fa-system/shared/reports/print
 *
 * Layout mirrors the eBright "Foundation Appraisal Assessment" PDF template
 * (red header, slate identity strip, 4 score rows with circles, single
 * Remarks box, and a Total Score circle in the bottom-right). Marketing
 * wanted the print output to be visually identical to the PDF so parents
 * recognise the document straight away.
 */
export function CertificateBody({ report }: { report: FAReport }) {
  const branchName = BRANCHES.find(b => b.code === report.branch)?.name ?? report.branch;
  const total = faReportTotal(report);
  const totalMax = FA_REPORT_MAX_PER_CRITERION * 4;

  return (
    // Outer wrapper has its own horizontal padding so the red banner and
    // every section inside it stays well clear of the A4 page edge. Bumped
    // from 28px to 48px after the user flagged the TOTAL SCORE pill
    // appearing to run off the paper.
    <div style={{ background: "white", padding: "0 48px" }}>
      {/* Red header bar with white wordmark + address. The "ebright"
          wordmark is wrapped in a white-bordered frame so it reads as a
          logo lock-up rather than plain text (closest we can get without
          an SVG asset). */}
      <div style={{ background: "#dc2626", color: "white", padding: "16px 24px" }}>
        <div className="flex items-start justify-between gap-6">
          <div
            style={{
              display: "inline-block",
              padding: "6px 14px",
              border: "2px solid white",
              fontFamily: "var(--font-display, serif)",
              fontWeight: 700,
              fontSize: 26,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            ebright
          </div>
          <div className="text-right text-[11px] leading-snug" style={{ opacity: 0.92 }}>
            <div className="font-semibold">EBRIGHT SDN. BHD.</div>
            <div>21-2, Jalan USJ 10/1D, Taipan Business Centre,</div>
            <div>47620 Subang Jaya, Selangor.</div>
          </div>
        </div>
        <h1
          className="text-left"
          style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 800,
            fontSize: 40,
            marginTop: 14,
            letterSpacing: "0.01em",
          }}
        >
          Foundation Appraisal Assessment
        </h1>
      </div>

      {/* Slate block — contains BOTH the identity strip AND the four-
          criterion score rows. In the PDF template this is one continuous
          tinted rectangle, so we wrap them together and only end the
          slate before Remarks (which sits on white paper per the PDF). */}
      <div
        className="px-10 py-7"
        style={{ background: "#e7eaf0", borderRadius: 4 }}
      >
        <div className="grid grid-cols-[200px_1fr] gap-y-4 gap-x-5 text-base">
          <div className="text-ink-700 font-semibold">Student&apos;s name</div>
          <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900">
            {report.studentName || "—"}
          </div>
          <div className="text-ink-700 font-semibold">Date of Assessment</div>
          <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900 font-mono">
            {format(parseISO(report.assessmentDate), "d MMMM yyyy")}
          </div>
          <div className="text-ink-700 font-semibold">Grade</div>
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900 font-mono w-24 text-center">
              G{report.grade}
            </div>
            <div className="text-ink-700 font-semibold">Branch</div>
            <div className="bg-white rounded-full border border-ink-300 px-5 py-2 text-ink-900 flex-1">
              {branchName} <span className="text-ink-500 font-mono">({report.branch})</span>
            </div>
          </div>
        </div>

        <h2
          className="text-center mt-8 mb-5"
          style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 700,
            fontSize: 28,
          }}
        >
          Score
        </h2>

        {/* Four criteria rows. Each row is criterion title + description on
            the left, score circle on the right — mirrors the PDF layout. */}
        <div className="space-y-5">
          {CRITERIA.map(c => (
            <CriterionRow
              key={c.key}
              title={c.title}
              description={c.description}
              score={report[c.key]}
            />
          ))}
        </div>
      </div>

      {/* White section below the slate block — Remarks + Prepared by.
          NO horizontal padding here so the Remarks box's left edge and
          TOTAL SCORE pill's right edge line up with the slate block's
          OUTER edges above (its tinted background). With px-10 the row
          was inset 40px further than the slate, which looked misaligned
          even though it matched the slate's content. */}
      <div className="pt-2 pb-10">
        <h2
          className="text-center mt-6 mb-4"
          style={{
            fontFamily: "var(--font-display, serif)",
            fontWeight: 700,
            fontSize: 28,
          }}
        >
          Remarks
        </h2>

        {/* Remarks box (red border) + TOTAL SCORE pill. Flex (not grid) so
            the Remarks side expands to fill ALL the leftover space — when
            grid's 1fr column had a long unbroken string in it, the column
            stopped expanding and the row looked half-empty with a gap
            before the TOTAL pill. flex-1 + min-w-0 + overflowWrap break
            the string and force the box to claim the full width, lining
            its right-edge-plus-pill perfectly with the slate above. */}
        <div className="flex gap-5 items-stretch">
          <div
            className="flex-1 min-w-0 bg-white rounded p-5 text-ink-800 whitespace-pre-wrap leading-relaxed"
            style={{
              border: "3px solid #dc2626",
              fontSize: 18,
              lineHeight: 1.6,
              minHeight: 160,
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {report.remarks
              ? report.remarks
              : <span className="text-ink-400 italic">No remarks</span>}
          </div>
          <div
            className="flex flex-col items-center justify-center flex-shrink-0"
            style={{
              background: "#9ca3af",
              padding: "16px 22px",
              borderRadius: 4,
              width: 140,
            }}
          >
            <div className="font-bold text-white tracking-wide text-center" style={{ fontSize: 15, lineHeight: 1.1 }}>
              TOTAL<br />SCORE
            </div>
            <div
              className="bg-white rounded-full flex items-center justify-center mt-3"
              style={{
                width: 84,
                height: 84,
                border: "2px solid #4b5563",
              }}
            >
              <div className="text-center">
                <div className="font-black text-ink-900 leading-none" style={{ fontSize: 28 }}>
                  {total}
                </div>
                <div className="text-ink-500 font-mono mt-0.5" style={{ fontSize: 11 }}>
                  /{totalMax}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prepared-by footer — smaller, less prominent than the PCM cert
            since the FA template has no signature box. Just the name on a
            dotted line so the document still reads as formally signed. */}
        <div className="mt-10">
          <div className="font-bold mb-2" style={{ fontSize: 14 }}>Prepared by:</div>
          <div
            className="pt-2 text-ink-900 max-w-md"
            style={{ borderTop: "2px dotted #1f2937", fontSize: 15 }}
          >
            {report.preparedBy || ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Internals ───────────────────────────────────────────────────────────

const CRITERIA = [
  {
    key: "communicationScore" as const,
    title: "Communication",
    description:
      "Did you understand what was said to you? Are you talking about the right thing? Can you be understood despite errors? Have you conveyed your idea clearly? Is your language creative?",
  },
  {
    key: "analysisScore" as const,
    title: "Analysis",
    description:
      "Did you understand the main idea? Have you broken down key points effectively? Are you considering different perspectives? Can you explain your reasoning clearly? Did you support your ideas with strong evidence?",
  },
  {
    key: "interactionScore" as const,
    title: "Interaction",
    description:
      "Are you actively engaging with others? Are you responding appropriately to what is said? Do you encourage discussion and teamwork? Are you showing interest and listening well? Are you making the conversation enjoyable and meaningful?",
  },
  {
    key: "performanceScore" as const,
    title: "Performance",
    description:
      "Did you present with confidence? Was your voice clear and engaging? Did you use body language effectively? Were you well-prepared? Did you connect with your audience?",
  },
];

/** One criterion row — title + question block on the left, score circle on
 *  the right. Score circle uses the same slate ring as TOTAL but smaller.*/
function CriterionRow({
  title, description, score,
}: { title: string; description: string; score: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-5 items-start">
      <div>
        <div
          className="font-bold mb-1"
          style={{
            fontFamily: "var(--font-display, serif)",
            color: "#4a6b3a",
            fontSize: 18,
          }}
        >
          {title}
        </div>
        <div className="text-ink-700 leading-relaxed" style={{ fontSize: 13 }}>
          {description}
        </div>
      </div>
      <div
        className="bg-white rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          width: 64,
          height: 64,
          border: "2px solid #4b5563",
          marginTop: 4,
        }}
      >
        <div className="text-center">
          <div className="font-black text-ink-900 leading-none" style={{ fontSize: 22 }}>
            {score}
          </div>
          <div className="text-ink-500 font-mono mt-0.5" style={{ fontSize: 10 }}>
            /{FA_REPORT_MAX_PER_CRITERION}
          </div>
        </div>
      </div>
    </div>
  );
}
