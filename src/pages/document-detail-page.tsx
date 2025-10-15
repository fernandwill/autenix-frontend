import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSolanaClient } from "@/lib/solana/client";
import { buildExplorerUrl } from "@/lib/solana/explorer";
import { getNotarizationAccountDetails } from "@/lib/solana/notarization-account";
import { parseDocumentIdentifier, type DocumentDetailSnapshot } from "@/lib/upload-types";
import { formatVersion } from "@/lib/format";
type CopyField = "binary" | "transaction" | "notary" | "account";
type MetaItem = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  copyField?: CopyField;
  copyValue?: string;
  copyMessage?: string;
};

type StatusVisual = {
  icon: LucideIcon;
  badgeClass: string;
  iconClass: string;
  label: string;
};

type BaseStatusVisual = Omit<StatusVisual, "label">;

const STATUS_VISUALS: Record<"success" | "error" | "converting" | "default", BaseStatusVisual> = {
  success: {
    icon: CheckCircle2,
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    iconClass: "h-4 w-4",
  },
  error: {
    icon: AlertTriangle,
    badgeClass:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
    iconClass: "h-4 w-4",
  },
  converting: {
    icon: Loader2,
    badgeClass:
      "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
    iconClass: "h-4 w-4 animate-spin",
  },
  default: {
    icon: Clock,
    badgeClass:
      "border-border bg-muted text-muted-foreground dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
    iconClass: "h-4 w-4",
  },
} as const;

const SIGNATURE_STATUS_VISUALS: Record<"confirmed" | "error", StatusVisual> = {
  confirmed: {
    icon: CheckCircle2,
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    iconClass: "h-4 w-4",
    label: "Signature confirmed",
  },
  error: {
    icon: XCircle,
    badgeClass:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
    iconClass: "h-4 w-4",
    label: "Signature failed",
  },
} as const;

const deriveStatusVisual = (snapshot: DocumentDetailSnapshot | null): StatusVisual | null => {
  if (!snapshot) return null;

  const transactionStatus =
    snapshot.transactionStatus ??
    (snapshot.transactionHash ? "confirmed" : snapshot.error ? "error" : "idle");

  const baseKey = snapshot.status as keyof typeof STATUS_VISUALS;
  const fallback = STATUS_VISUALS[baseKey] ?? STATUS_VISUALS.default;

  if (snapshot.status === "success" && transactionStatus === "confirmed") {
    return SIGNATURE_STATUS_VISUALS.confirmed;
  }

  if (transactionStatus === "error") {
    return SIGNATURE_STATUS_VISUALS.error;
  }

  return {
    ...fallback,
    label: snapshot.statusLabel,
  };
};

const deriveStatusDescription = (snapshot: DocumentDetailSnapshot | null): string | null => {
  if (!snapshot) return null;

  const transactionStatus =
    snapshot.transactionStatus ??
    (snapshot.transactionHash ? "confirmed" : snapshot.error ? "error" : "idle");

  if (snapshot.status === "error" || transactionStatus === "error") {
    const cause = snapshot.error?.trim();
    return cause ? `Your document failed to be notarized. ${cause}` : "Your document failed to be notarized.";
  }

  return snapshot.statusDescription;
};

// DocumentDetailPage renders the persisted upload metadata for a specific entry.
export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const signatureParam = searchParams.get("signature");
  const explorerParam = searchParams.get("explorer");
  const client = useMemo(() => getSolanaClient(), []);
  const parsedIdentifier = useMemo(
    () => (documentId ? parseDocumentIdentifier(documentId) : null),
    [documentId],
  );
  const [snapshot, setSnapshot] = useState<DocumentDetailSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<CopyField | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const encodedDocumentId = documentId ? encodeURIComponent(documentId) : null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!documentId) {
        setSnapshot(null);
        setErrorMessage("Document identifier missing.");
        return;
      }

      if (!parsedIdentifier) {
        setSnapshot(null);
        setErrorMessage("Invalid document identifier.");
        return;
      }

      setLoading(true);
      setIsContentVisible(false);
      setSnapshot(null);
      setErrorMessage(null);

      try {
        const details = await getNotarizationAccountDetails({
          client,
          notary: parsedIdentifier.notary,
          documentHashHex: parsedIdentifier.hash,
          version: parsedIdentifier.version,
        });

        if (cancelled) return;

        const timestampMs = Number.isFinite(details.timestamp)
          ? details.timestamp * 1000
          : Date.now();
        const uploadedAt = new Date(timestampMs).toISOString();
        const uploadedAtLabel = new Date(timestampMs).toLocaleString();

        const transactionHash = signatureParam ?? null;
        const transactionUrl =
          explorerParam ??
          (transactionHash ? buildExplorerUrl(client.urlOrMoniker, transactionHash) : null);

        setSnapshot({
          id: documentId,
          fileName: details.documentName || "Untitled document",
          sizeLabel: "Unavailable",
          uploadedAt,
          uploadedAtLabel,
          status: "success",
          statusLabel: "Notarized",
          statusDescription: "Document details retrieved directly from the blockchain.",
          version: details.version ?? null,
          checksum: null,
          binHash: details.hash ?? null,
          binFileName: details.documentName || null,
          transactionHash,
          transactionUrl,
          transactionStatus: transactionHash ? "confirmed" : "idle",
          error: null,
          notaryAddress: details.notary,
          notarizationAccount: details.accountAddress,
          hashVersion: details.hashVersion,
          bump: details.bump,
          additional: details.additional,
        });

        requestAnimationFrame(() => {
          if (!cancelled) {
            setIsContentVisible(true);
          }
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load document details from the blockchain.";
        setSnapshot(null);
        setErrorMessage(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [client, documentId, parsedIdentifier, signatureParam, explorerParam]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const statusVisuals = deriveStatusVisual(snapshot);
  const statusDescription = deriveStatusDescription(snapshot);
  const transactionStatus =
    snapshot?.transactionStatus ??
    (snapshot?.transactionHash ? "confirmed" : snapshot?.error ? "error" : "idle");

  const monoValueClass = "mt-1 break-all font-mono text-sm text-foreground";
  const defaultValueClass = "mt-1 break-words font-medium text-foreground";
  const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  const copyToClipboard = (value: string | undefined | null) => {
    if (!value) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {
        /* noop: clipboard unavailable */
      });
    }
  };

  const handleCopy = (field: CopyField, value?: string | null) => {
    if (!value) return;
    copyToClipboard(value);
    setCopiedField(field);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedField(null);
      copyTimerRef.current = null;
    }, 3000);
  };

  const metaColumns: MetaItem[][] | null = snapshot
    ? [
        [
          { label: "File name", value: snapshot.fileName },
          { label: "Binary file", value: snapshot.binFileName ?? "Unavailable", mono: true },
          { label: "Status", value: snapshot.statusLabel },
          { label: "Document version", value: formatVersion(snapshot.version) },
          {
            label: "Hash version",
            value: snapshot.hashVersion != null ? snapshot.hashVersion.toString() : "Unknown",
          },
          {
            label: "Program bump",
            value: snapshot.bump != null ? snapshot.bump.toString() : "Unknown",
          },
        ],
        [
          { label: "On-chain timestamp", value: snapshot.uploadedAtLabel },
          {
            label: "Binary hash",
            value: snapshot.binHash ?? "Unavailable",
            mono: true,
            copyField: snapshot.binHash ? "binary" : undefined,
            copyValue: snapshot.binHash ?? undefined,
            copyMessage: snapshot.binHash ? "Binary hash copied!" : undefined,
          },
          {
            label: "Transaction hash",
            value:
              transactionStatus === "error"
                ? "Not available"
                : snapshot?.transactionUrl && snapshot.transactionHash
                  ? (
                      <a
                        href={snapshot.transactionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {snapshot.transactionHash}
                      </a>
                    )
                  : snapshot.transactionHash ?? "Awaiting confirmation...",
            mono: true,
            copyField:
              transactionStatus === "error" || !snapshot?.transactionHash ? undefined : "transaction",
            copyValue:
              transactionStatus === "error" ? undefined : snapshot?.transactionHash ?? undefined,
            copyMessage:
              transactionStatus === "error" || !snapshot?.transactionHash
                ? undefined
                : "Transaction hash copied!",
          },
          {
            label: "Notary address",
            value: snapshot.notaryAddress ?? "Unknown",
            mono: true,
            copyField: snapshot.notaryAddress ? "notary" : undefined,
            copyValue: snapshot.notaryAddress ?? undefined,
            copyMessage: snapshot.notaryAddress ? "Notary address copied!" : undefined,
          },
          {
            label: "Notarization account",
            value: snapshot.notarizationAccount ?? "Unknown",
            mono: true,
            copyField: snapshot.notarizationAccount ? "account" : undefined,
            copyValue: snapshot.notarizationAccount ?? undefined,
            copyMessage: snapshot.notarizationAccount ? "Account address copied!" : undefined,
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            {documentId ? (
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Document ID: {documentId}
              </span>
            ) : null}
            {encodedDocumentId ? (
              <Button asChild size="sm" variant="default" className="h-8">
                <Link to={`/documents/${encodedDocumentId}/update`}>Update document</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {snapshot ? (
          <div
            className={`mt-10 overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-border transition-all duration-500 ${
              isContentVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
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
                      <statusVisuals.icon className={statusVisuals.iconClass} />
                      {statusVisuals.label}
                    </span>
                  ) : null}

                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Only the binary hash is retained for on-chain verification
                  </span>
                </div>

                {statusDescription ? (
                  <p className="max-w-xl text-sm text-muted-foreground">{statusDescription}</p>
                ) : null}

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
                    {items.map(({ label, value, mono, copyField, copyValue, copyMessage }) => {
                      const isCopied = copyField ? copiedField === copyField : false;

                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between gap-2">
                            <span className={labelClass}>{label}</span>
                            <div className="flex items-center gap-2">
                              {copyMessage ? (
                                <div
                                  className={`transition-all duration-300 ${
                                    isCopied
                                      ? "translate-y-0 scale-100 opacity-100"
                                      : "-translate-y-1 scale-95 opacity-0"
                                  } pointer-events-none rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700`}
                                >
                                  {copyMessage}
                                </div>
                              ) : null}
                              {copyField && copyValue ? (
                                <Button
                                  aria-label={`Copy ${label.toLowerCase()}`}
                                  className="h-6 w-6"
                                  onClick={() => handleCopy(copyField, copyValue)}
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Copy aria-hidden className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className={mono ? monoValueClass : defaultValueClass}>{value}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

          </div>
        ) : (
          <div className="mt-16 flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-sm transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
            {loading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <h2 className="mt-6 text-xl font-semibold text-foreground">Fetching document details</h2>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  Retrieving notarization metadata directly from the Solana blockchain. This may take a few seconds.
                </p>
              </>
            ) : (
              <>
                <FileText className="h-10 w-10 text-muted-foreground" />
                <h2 className="mt-6 text-xl font-semibold text-foreground">Document details unavailable</h2>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  We couldn't find on-chain details for this identifier. Verify the link or open the document from the uploads page again.
                </p>
                {errorMessage ? (
                  <p className="mt-2 max-w-md text-sm text-destructive">{errorMessage}</p>
                ) : null}
                <Button asChild className="mt-6">
                  <Link to="/">Return to uploads</Link>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
