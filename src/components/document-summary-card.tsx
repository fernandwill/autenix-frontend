import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileUploadDocumentChange } from "@/components/file-upload";

interface DocumentSummaryCardProps {
  document: FileUploadDocumentChange | null;
}

const FALLBACK = "N/A";

const formatTimestamp = (value?: string | null) => {
  if (!value) return FALLBACK;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? FALLBACK : date.toLocaleString();
};

const formatChecksum = (value?: string | null) => value ?? FALLBACK;

const formatTransactionHash = (document: FileUploadDocumentChange | null) => {
  if (!document) return FALLBACK;

  switch (document.transactionStatus) {
    case "pending":
      return "Awaiting signature";
    case "cancelled":
      return "Signature cancelled";
    case "error":
      return document.error ?? "Signing failed";
    default:
      return document.transactionHash ?? FALLBACK;
  }
};

export function DocumentSummaryCard({ document }: DocumentSummaryCardProps) {
  const items = [
    {
      label: "Timestamp",
      value: formatTimestamp(document?.timestamp),
    },
    {
      label: "Checksum",
      value: formatChecksum(document?.checksum),
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
            <p className="mt-1 break-all font-mono text-foreground">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
