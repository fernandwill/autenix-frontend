import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, FileText, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DocumentDetailSnapshot } from "@/lib/upload-types";
import { buildDetailStorageKey } from "@/lib/upload-types";

// Retrieve a stored document snapshot from localStorage when available.
const loadSnapshot = (id: string): DocumentDetailSnapshot | null => {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(buildDetailStorageKey(id));
  if (!stored) return null;

  try {
    return JSON.parse(stored) as DocumentDetailSnapshot;
  } catch (error) {
    console.warn("Unable to read stored document snapshot.", error);
    return null;
  }
};

type MetaItem = { label: string; value: string; mono?: boolean };

const STATUS_VISUALS = {
  success: {
    icon: CheckCircle2,
    badgeClass: "border-emerald-200 bg-emerald-100 text-emerald-700",
  },
  error: {
    icon: AlertTriangle,
    badgeClass: "border-rose-200 bg-rose-100 text-rose-700",
  },
  converting: {
    icon: Loader2,
    badgeClass: "border-sky-200 bg-sky-100 text-sky-700",
  },
  default: {
    icon: Clock,
    badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
  },
} as const;

// DocumentDetailPage renders the persisted upload metadata for a specific entry.
export function DocumentDetailPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const [snapshot, setSnapshot] = useState<DocumentDetailSnapshot | null>(() =>
    entryId ? loadSnapshot(entryId) : null,
  );

  useEffect(() => {
    if (!entryId || typeof window === "undefined") return;

    const key = buildDetailStorageKey(entryId);
    const refresh = () => setSnapshot(loadSnapshot(entryId));
    const handleStorage = ({ key: changedKey }: StorageEvent) => {
      if (changedKey === key) refresh();
    };

    refresh();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [entryId]);

  const statusVisuals = snapshot
    ? STATUS_VISUALS[snapshot.status as keyof typeof STATUS_VISUALS] ?? STATUS_VISUALS.default
    : null;
  const statusIconClass = snapshot?.status === "converting" ? "h-4 w-4 animate-spin" : "h-4 w-4";

  const monoValueClass = "mt-1 font-mono text-sm text-slate-800";
  const defaultValueClass = "mt-1 font-medium text-slate-900";
  const labelClass = "text-xs font-semibold uppercase tracking-wider text-slate-400";
  const metaColumns: MetaItem[][] | null = snapshot
    ? [
        [
          { label: "File name", value: snapshot.fileName },
          { label: "Size", value: snapshot.sizeLabel },
          { label: "Status", value: snapshot.statusLabel },
        ],
        [
          { label: "Uploaded at", value: snapshot.uploadedAtLabel },
          { label: "Checksum", value: snapshot.checksum ?? "Calculating...", mono: true },
          { label: "Binary file", value: snapshot.binFileName ?? "Generating...", mono: true },
          { label: "Binary hash", value: snapshot.binHash ?? "Calculating...", mono: true },
          {
            label: "Transaction hash",
            value: snapshot.transactionHash ?? "Awaiting confirmation...",
            mono: true,
          },
        ],
      ]
    : null;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Back to uploads
            </Link>
          </Button>
          {entryId ? (
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Document ID: {entryId}
            </span>
          ) : null}
        </div>

        {snapshot ? (
          <div className="mt-10 overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
            <div className="flex flex-col gap-8 border-b border-slate-100 px-8 py-10 md:flex-row md:items-start md:justify-between">
              <div className="flex-1 space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-slate-900">{snapshot.fileName}</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    Uploaded {snapshot.uploadedAtLabel}
                    <span className="mx-2">·</span>
                    {snapshot.sizeLabel}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {statusVisuals ? (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${statusVisuals.badgeClass}`}
                    >
                      <statusVisuals.icon className={statusIconClass} />
                      {snapshot.statusLabel}
                    </span>
                  ) : null}

                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                    <ShieldCheck className="h-4 w-4" />
                    Only the binary hash is retained for on-chain verification
                  </span>
                </div>

                <p className="max-w-xl text-sm text-slate-600">{snapshot.statusDescription}</p>

                {snapshot.error ? (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <span>{snapshot.error}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-center md:min-w-[200px]">
                <div className="flex h-56 w-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500 shadow-inner">
                  <FileText className="mb-4 h-8 w-8 text-slate-400" />
                  Document preview
                </div>
              </div>
            </div>

            <div className="grid gap-6 px-8 py-10 md:grid-cols-2">
              {metaColumns?.map((items, columnIndex) => (
                <div key={columnIndex} className="space-y-4">
                  {items.map(({ label, value, mono }) => (
                    <div key={label}>
                      <span className={labelClass}>{label}</span>
                      <p className={mono ? monoValueClass : defaultValueClass}>{value}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-16 flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <FileText className="h-10 w-10 text-slate-400" />
            <h2 className="mt-6 text-xl font-semibold text-slate-900">Document details unavailable</h2>
            <p className="mt-3 max-w-md text-sm text-slate-500">
              We couldn't find details for this upload. Try opening the document from the uploads page
              again.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Return to uploads</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
