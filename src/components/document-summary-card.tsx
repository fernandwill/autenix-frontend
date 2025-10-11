import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FileUploadDocumentChange } from "@/components/file-upload";

interface DocumentSummaryCardProps {
  documents: FileUploadDocumentChange[];
  isLoading?: boolean;
  error?: string | null;
  walletAddress?: string | null;
}

const FALLBACK = "N/A";

// Parse timestamps to milliseconds while ensuring invalid dates sort last.
const toMillis = (value?: string | null) => {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? null : parsed;
};

// Format an ISO timestamp into the "HH:MM:SS, DD/MM/YYYY" label used in the table.
const formatTimestamp = (value?: string | null) => {
  const millis = toMillis(value);
  if (millis == null) return FALLBACK;

  const date = new Date(millis);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}, ${pad(date.getDate())}/${pad(
    date.getMonth() + 1,
  )}/${date.getFullYear()}`;
};

// Provide a consistent placeholder when no checksum is available.
const formatChecksum = (value?: string | null) => value ?? FALLBACK;

// Prefer the notarized bin hash when present, otherwise fall back to the PDF checksum.
const formatDocumentHash = (document: FileUploadDocumentChange) =>
  document.binHash ?? formatChecksum(document.checksum);

// Choose the best available document title for display purposes.
const formatDocumentName = (document: FileUploadDocumentChange) =>
  document.fileName ?? document.binFileName ?? FALLBACK;

type TransactionDisplayOptions = {
  subtle?: boolean;
};

// Render the transaction hash as either a muted span or an explorer link.
const renderTransactionHashValue = (
  document: FileUploadDocumentChange,
  { subtle = false }: TransactionDisplayOptions = {},
): ReactNode => {
  const baseClass = "break-all font-mono text-xs";
  const textClass = subtle ? "text-muted-foreground" : "text-foreground";

  if (document.transactionHash && document.transactionUrl) {
    const linkColorClass = subtle ? "text-muted-foreground" : "text-primary";
    const linkClass = `${baseClass} ${linkColorClass} underline underline-offset-2`;

    return (
      <a href={document.transactionUrl} target="_blank" rel="noreferrer" className={linkClass}>
        {document.transactionHash}
      </a>
    );
  }

  return <span className={`${baseClass} ${textClass}`}>{document.transactionHash ?? FALLBACK}</span>;
};

// Display a sortable summary table of notarized documents for the connected wallet.
export function DocumentSummaryCard({
  documents,
  isLoading = false,
  error,
  walletAddress,
}: DocumentSummaryCardProps) {
  const hasDocuments = documents.length > 0;
  const sortedDocuments = [...documents].sort((a, b) => {
    const diff = (toMillis(b.timestamp) ?? Number.NEGATIVE_INFINITY) - (toMillis(a.timestamp) ?? Number.NEGATIVE_INFINITY);
    return diff || 0;
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          My Documents
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {hasDocuments ? (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="w-[28%] px-4 py-3 font-medium">Document</th>
                  <th className="w-[24%] px-4 py-3 font-medium">Created at</th>
                  <th className="w-[24%] px-4 py-3 font-medium">Document hash</th>
                  <th className="w-[24%] px-4 py-3 font-medium">Transaction hash</th>
                </tr>
              </thead>
              <tbody>
                {sortedDocuments.map((document) => (
                  <tr key={document.id} className="border-b border-border last:border-b-0">
                    <td className="w-[28%] px-4 py-3 align-top text-foreground">
                      <div className="font-medium">{formatDocumentName(document)}</div>
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {document.documentIdentifier ? (
                          <div className="break-all">{document.documentIdentifier}</div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="font-semibold text-muted-foreground">Transaction hash:</span>
                          {renderTransactionHashValue(document, { subtle: true })}
                        </div>
                      </div>
                    </td>
                    <td className="w-[24%] px-4 py-3 align-top font-medium text-foreground">
                      {formatTimestamp(document.timestamp)}
                    </td>
                    <td className="w-[24%] break-all px-4 py-3 align-top font-mono text-xs text-foreground">
                      {formatDocumentHash(document)}
                    </td>
                    <td className="w-[24%] px-4 py-3 align-top">
                      {renderTransactionHashValue(document)}
                    </td>
                    <td className="w-28 px-4 py-3 align-top text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-md px-2 text-xs"
                      >
                        <Link
                          to={{
                            pathname: `/documents/${document.id}`,
                            search: (() => {
                              const params = new URLSearchParams();
                              if (document.transactionHash) {
                                params.set("signature", document.transactionHash);
                              }
                              if (document.transactionUrl) {
                                params.set("explorer", document.transactionUrl);
                              }
                              const query = params.toString();
                              return query ? `?${query}` : "";
                            })(),
                          }}
                        >
                          View Details
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-muted-foreground/40 p-6 text-center text-sm text-muted-foreground">
            {walletAddress
              ? "No notarized documents found for this wallet yet. Upload a PDF to see it listed here."
              : "Connect your wallet or upload a document to see its notarization metadata here."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}