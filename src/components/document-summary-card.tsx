import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileUploadDocumentChange } from "@/components/file-upload";

interface DocumentSummaryCardProps {
  documents: FileUploadDocumentChange[];
}

const FALLBACK = "N/A";
const UNTITLED = "Untitled document";

// Present timestamp values or fall back when parsing fails.
const formatTimestamp = (value?: string | null) => {
  if (!value) return FALLBACK;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? FALLBACK : date.toLocaleString();
};

// Surface checksum values while handling nullish content gracefully.
const formatChecksum = (value?: string | null) => value ?? FALLBACK;

// Normalize version values so display starts at 1 when defined.
const formatVersion = (value?: number | null) => {
  if (value == null) return FALLBACK;
  return (value + 1).toString();
};

const TRANSACTION_STATUS_LABELS: Record<FileUploadDocumentChange["transactionStatus"], string> = {
  idle: "Awaiting conversion",
  pending: "Awaiting signature",
  confirmed: "Signature confirmed",
  cancelled: "Signature cancelled",
  error: "Signature failed",
};

// Resolve the appropriate transaction hash label based on the document status.
const formatTransactionHash = (document: FileUploadDocumentChange): ReactNode => {
  if (document.transactionStatus === "error") {
    return document.error ?? "Signing failed";
  }

  if (document.transactionHash && document.transactionUrl) {
    return (
      <a
        href={document.transactionUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {document.transactionHash}
      </a>
    );
  }

  if (document.transactionHash) {
    return document.transactionHash;
  }

  const statusLabel = TRANSACTION_STATUS_LABELS[document.transactionStatus];
  return statusLabel ?? FALLBACK;
};

const formatTransactionStatus = (document: FileUploadDocumentChange): ReactNode => {
  if (document.transactionStatus === "error") {
    return document.error ?? TRANSACTION_STATUS_LABELS.error;
  }

  if (document.transactionStatus === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600">
        {TRANSACTION_STATUS_LABELS.confirmed}
        <CheckCircle2 aria-hidden className="h-4 w-4" />
      </span>
    );
  }

  return TRANSACTION_STATUS_LABELS[document.transactionStatus] ?? FALLBACK;
};

type CopyField = "binary" | "transaction";
type CopyStatusEntry = { binary?: boolean; transaction?: boolean };
type CopyStatusState = { [docId: string]: CopyStatusEntry | undefined };
type CopyTimerEntry = { binary?: ReturnType<typeof setTimeout>; transaction?: ReturnType<typeof setTimeout> };
type CopyTimerState = { [docId: string]: CopyTimerEntry | undefined };

// DocumentSummaryCard highlights the metadata for every uploaded document.
export function DocumentSummaryCard({ documents }: DocumentSummaryCardProps) {
  const hasDocuments = documents.length > 0;
  const sortedDocuments = [...documents].sort((a, b) => {
    const aTime = Date.parse(a.timestamp ?? "");
    const bTime = Date.parse(b.timestamp ?? "");
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });

  const [copyStatus, setCopyStatus] = useState<CopyStatusState>({});
  const copyTimers = useRef<CopyTimerState>({});

  useEffect(() => {
    const timersRef = copyTimers;
    return () => {
      Object.values(timersRef.current).forEach((timerMap) => {
        Object.values(timerMap ?? {}).forEach((timerId) => {
          if (timerId) clearTimeout(timerId);
        });
      });
    };
  }, [copyTimers]);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        /* noop: clipboard unavailable */
      });
    }
  };

  const handleCopy = (value: string, documentKey: string, field: CopyField) => {
    if (!documentKey) return;
    copyToClipboard(value);

    setCopyStatus((prev) => ({
      ...prev,
      [documentKey]: { ...(prev[documentKey] ?? {}), [field]: true },
    }));

    const existingTimer = copyTimers.current[documentKey]?.[field];
    if (existingTimer) clearTimeout(existingTimer);

    const timeoutId = setTimeout(() => {
      setCopyStatus((prev) => {
        const next: CopyStatusState = { ...prev };
        const fieldState = next[documentKey];
        if (!fieldState) return prev;

        const updatedFieldState: CopyStatusEntry = { ...fieldState };
        delete updatedFieldState[field];

        if (Object.keys(updatedFieldState).length === 0) {
          delete next[documentKey];
        } else {
          next[documentKey] = updatedFieldState;
        }

        return next;
      });

      const timerMap = { ...(copyTimers.current[documentKey] ?? {}) };
      delete timerMap[field];
      if (Object.keys(timerMap).length === 0) {
        delete copyTimers.current[documentKey];
      } else {
        copyTimers.current[documentKey] = timerMap;
      }
    }, 3000);

    copyTimers.current[documentKey] = {
      ...copyTimers.current[documentKey],
      [field]: timeoutId,
    };
  };

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">My Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {hasDocuments ? (
          <div className="space-y-5">
            <ul className="space-y-5">
              {sortedDocuments.map((document) => {
                const documentKey = document.id ? String(document.id) : "";

                const items: {
                  label: string;
                  value: ReactNode;
                  copyValue?: string;
                  copyKey?: CopyField;
                  copyMessage?: string;
                }[] = [
                  { label: "Status", value: formatTransactionStatus(document) },
                  { label: "Timestamp", value: formatTimestamp(document.timestamp) },
                  { label: "Version", value: formatVersion(document.version) },
                  { label: "Checksum", value: formatChecksum(document.checksum) },
                  {
                    label: "Binary Hash",
                    value: formatChecksum(document.binHash),
                    copyValue: document.binHash ?? undefined,
                    copyKey: "binary",
                    copyMessage: "Binary hash copied!",
                  },
                  {
                    label: "Transaction Hash",
                    value: formatTransactionHash(document),
                    copyValue: document.transactionHash ?? undefined,
                    copyKey: "transaction",
                    copyMessage: "Transaction hash copied!",
                  },
                ];

                return (
                  <li
                    key={document.id}
                    className="rounded-lg border border-muted bg-card/40 p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {document.fileName || UNTITLED}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {formatTimestamp(document.timestamp)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {items.map(({ label, value, copyValue, copyKey, copyMessage }) => {
                          const isCopied =
                            copyKey && documentKey ? copyStatus[documentKey]?.[copyKey] : false;

                          return (
                            <div key={label}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                                {copyValue && copyKey && documentKey ? (
                                  <Button
                                    aria-label={`Copy ${label.toLowerCase()}`}
                                    className="h-6 w-6"
                                    onClick={() => handleCopy(copyValue, documentKey, copyKey)}
                                    size="icon"
                                    type="button"
                                    variant="ghost"
                                  >
                                    <Copy aria-hidden className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                              <div
                                className={`transition-all duration-300 ${
                                  isCopied ? "max-h-12 opacity-100" : "max-h-0 opacity-0"
                                } overflow-hidden`}
                              >
                                {copyMessage ? (
                                  <div className="mt-1 rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                                    {copyMessage}
                                  </div>
                                ) : null}
                              </div>
                              <div className="mt-1 break-all font-mono text-foreground">{value}</div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/documents/${document.id}`}>View Details</Link>
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-6 text-center text-sm text-muted-foreground">
            Upload a document to see its notarization progress and metadata here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
