import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileUploadDocumentChange } from "@/components/file-upload";

interface DocumentSummaryCardProps {
  document: FileUploadDocumentChange | null;
}

const FALLBACK = "N/A";

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

const TRANSACTION_STATUS_LABELS: Partial<Record<FileUploadDocumentChange["transactionStatus"], string>> = {
  pending: "Awaiting signature",
  cancelled: "Signature cancelled",
};

// Resolve the appropriate transaction hash label based on the document status.
const formatTransactionHash = (document: FileUploadDocumentChange | null): ReactNode => {
  if (!document) return FALLBACK;
  if (document.transactionStatus === "error") {
    return document.error ?? "Signing failed";
  }

  const statusLabel = TRANSACTION_STATUS_LABELS[document.transactionStatus];
  if (statusLabel) {
    return statusLabel;
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

  return document.transactionHash ?? FALLBACK;
};

// DocumentSummaryCard highlights key metadata for the most recent upload.
export function DocumentSummaryCard({ document }: DocumentSummaryCardProps) {
  const items: { label: string; value: ReactNode }[] = [
    {
      label: "Timestamp",
      value: formatTimestamp(document?.timestamp),
    },
    {
      label: "Checksum",
      value: formatChecksum(document?.checksum),
    },
    {
      label: "Binary File",
      value: formatBinaryFile(document?.binFileName),
    },
    {
      label: "Binary Hash",
      value: formatChecksum(document?.binHash),
    },
    {
      label: "Transaction Hash",
      value: formatTransactionHash(document),
    },
  ];

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">My Document</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {items.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
            <div className="mt-1 break-all font-mono text-foreground">{value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
