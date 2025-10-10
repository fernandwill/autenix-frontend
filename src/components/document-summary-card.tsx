import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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

// Provide human readable labels for binary file names or fallback when missing.
const formatBinaryFile = (value?: string | null) => value ?? FALLBACK;

// Normalize version values for display while allowing zero as a valid version.
const formatVersion = (value?: number | null) => (value ?? FALLBACK).toString();

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

const formatTransactionStatus = (document: FileUploadDocumentChange): string => {
  if (document.transactionStatus === "error") {
    return document.error ?? TRANSACTION_STATUS_LABELS.error;
  }

  return TRANSACTION_STATUS_LABELS[document.transactionStatus] ?? FALLBACK;
};

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

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">My Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {hasDocuments ? (
          <ul className="space-y-5">
            {sortedDocuments.map((document) => {
              const items: { label: string; value: ReactNode }[] = [
                { label: "Status", value: formatTransactionStatus(document) },
                { label: "Timestamp", value: formatTimestamp(document.timestamp) },
                { label: "Version", value: formatVersion(document.version) },
                { label: "Checksum", value: formatChecksum(document.checksum) },
                { label: "Binary File", value: formatBinaryFile(document.binFileName) },
                { label: "Binary Hash", value: formatChecksum(document.binHash) },
                { label: "Transaction Hash", value: formatTransactionHash(document) },
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
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/documents/${document.id}`}>View details</Link>
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {items.map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
                        <div className="mt-1 break-all font-mono text-foreground">{value}</div>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-6 text-center text-sm text-muted-foreground">
            Upload a document to see its notarization progress and metadata here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
