"use client";

import { useState } from "react";
import Link from "next/link";
import { fileReport, type ReportReason, type ReportTarget } from "@/lib/db";
import { track } from "@/lib/telemetry";

const REASONS: { id: ReportReason; label: string }[] = [
  { id: "spam", label: "Spam or scam" },
  { id: "harassment", label: "Harassment" },
  { id: "hate", label: "Hate" },
  { id: "nudity", label: "Nudity" },
  { id: "violence", label: "Violence" },
  { id: "illegal", label: "Illegal" },
  { id: "other", label: "Something else" },
];

export default function ReportSheet({
  user, target, onClose, onAuthRequired,
}: {
  user: { id: string } | null;
  target: { type: ReportTarget; id: string; postId?: string | null; label: string };
  onClose: () => void;
  onAuthRequired: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!user) return onAuthRequired();
    if (!reason) return;
    setSending(true);
    const ok = await fileReport({
      reporterId: user.id, targetType: target.type, targetId: target.id,
      postId: target.postId ?? null, reason, details: details.trim(),
    });
    setSending(false);
    if (ok) {
      track("report", { postId: target.postId ?? undefined, props: { target: target.type, reason } });
      setDone(true);
      setTimeout(onClose, 1600);
    }
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="report-sheet glass" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="report-done">
            <div className="report-check">✓</div>
            <h3>Report received</h3>
            <p>Thanks — our team will review {target.label}. You won&apos;t see this again here.</p>
          </div>
        ) : (
          <>
            <div className="eyebrow" style={{ color: "var(--coral)" }}>⚑ Report</div>
            <h3 style={{ fontFamily: "var(--font-d)", margin: "6px 0 2px" }}>What&apos;s wrong with {target.label}?</h3>
            <p style={{ color: "var(--ink-dim)", fontSize: 13, margin: "0 0 14px" }}>
              Reports are confidential. Pick the closest reason — see{" "}
              <Link href="/guidelines" style={{ color: "var(--holo)" }}>what&apos;s allowed</Link>.
            </p>
            <div className="report-reasons">
              {REASONS.map((r) => (
                <button key={r.id} className="seg-opt" data-active={reason === r.id} onClick={() => setReason(r.id)}>{r.label}</button>
              ))}
            </div>
            <textarea
              className="report-details"
              placeholder="Add context (optional)"
              maxLength={1000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <div className="sheet-foot" style={{ marginTop: 14 }}>
              <button className="btn-sec" onClick={onClose}>Cancel</button>
              <button className="btn-upload" disabled={!reason || sending} onClick={submit}>
                {sending ? "Sending…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
