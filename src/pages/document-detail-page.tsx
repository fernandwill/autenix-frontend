import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, FileText, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
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

type MetaItem = { label: string; value: ReactNode; mono?: boolean };

const STATUS_VISUALS = {
  success: {
    icon: CheckCircle2,
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  error: {
    icon: AlertTriangle,
    badgeClass:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
  },
  converting: {
    icon: Loader2,
    badgeClass:
      "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
  },
  default: {
    icon: Clock,
    badgeClass:
      "border-border bg-muted text-muted-foreground dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
  },
} as const;

const formatVersion = (value: number | null) => (value ?? "Not set").toString();

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

  const monoValueClass = "mt-1 break-all font-mono text-sm text-foreground";
  const defaultValueClass = "mt-1 break-words font-medium text-foreground";
  const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  const metaColumns: MetaItem[][] | null = snapshot
    ? [
        [
          { label: "File name", value: snapshot.fileName },
          { label: "Size", value: snapshot.sizeLabel },
          { label: "Status", value: snapshot.statusLabel },
          { label: "Version", value: formatVersion(snapshot.version) },
        ],
        [
          { label: "Uploaded at", value: snapshot.uploadedAtLabel },
          { label: "Checksum", value: snapshot.checksum ?? "Calculating...", mono: true },
          { label: "Binary file", value: snapshot.binFileName ?? "Generating...", mono: true },
          { label: "Binary hash", value: snapshot.binHash ?? "Calculating...", mono: true },
          {
            label: "Transaction hash",
            value:
              snapshot.transactionUrl && snapshot.transactionHash ? (
                <a
                  href={snapshot.transactionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {snapshot.transactionHash}
                </a>
              ) : (
                snapshot.transactionHash ?? "Awaiting confirmation..."
              ),
            mono: true,
          },
        ],
      ]
    : null;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Back to uploads
            </Link>
          </Button>
          {entryId ? (
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Document ID: {entryId}
            </span>
          ) : null}
        </div>

        {snapshot ? (
          <div className="mt-10 overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-border">
            <div className="flex flex-col gap-8 border-b border-border px-8 py-10 md:flex-row md:items-start md:justify-between">
              <div className="flex-1 space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-foreground">{snapshot.fileName}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
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

                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Only the binary hash is retained for on-chain verification
                  </span>
                </div>

                <p className="max-w-xl text-sm text-muted-foreground">{snapshot.statusDescription}</p>

                {snapshot.error ? (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <span>{snapshot.error}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-center md:min-w-[200px]">
                <div className="flex h-56 w-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-sm font-medium text-muted-foreground shadow-inner">
                  <FileText className="mb-4 h-8 w-8 text-muted-foreground" />
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
                      <div className={mono ? monoValueClass : defaultValueClass}>{value}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-16 flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-sm">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <h2 className="mt-6 text-xl font-semibold text-foreground">Document details unavailable</h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
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
