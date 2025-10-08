import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileUploadDocumentChange } from "@/components/file-upload";

interface DocumentSummaryCardProps {
  document: FileUploadDocumentChange | null;
}

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const formatChecksum = (value: string | null | undefined) => value ?? "—";

const formatTransactionHash = (document: FileUploadDocumentChange | null) => {
  if (!document) return "—";

  if (document.transactionStatus === "pending") {
    return "Awaiting signature";
  }

  if (document.transactionStatus === "cancelled") {
    return "Signature cancelled";
  }

  if (document.transactionStatus === "error") {
    return document.error ?? "Signing failed";
  }

  return document.transactionHash ?? "—";
};

export function DocumentSummaryCard({ document }: DocumentSummaryCardProps) {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">My Document</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Timestamp</p>
          <p className="mt-1 font-mono text-foreground">{formatTimestamp(document?.timestamp)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Checksum</p>
          <p className="mt-1 break-all font-mono text-foreground">{formatChecksum(document?.checksum)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Transaction Hash</p>
          <p className="mt-1 break-all font-mono text-foreground">{formatTransactionHash(document)}</p>
        </div>
      </CardContent>
    </Card>
  );
}
