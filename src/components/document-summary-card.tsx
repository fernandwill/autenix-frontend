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

const formatTimestamp = (value?: string | null) => {
  if (!value) return FALLBACK;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return FALLBACK;

  const pad = (input: number) => String(input).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  return `${time}, ${day}/${month}/${year}`;
};

const formatChecksum = (value?: string | null) => value ?? FALLBACK;

const formatDocumentHash = (document: FileUploadDocumentChange) => {
  if (document.binHash) {
    return document.binHash;
  }
  return formatChecksum(document.checksum);
};

const formatDocumentName = (document: FileUploadDocumentChange) => {
  if (document.fileName) {
    return document.fileName;
  }

  if (document.binFileName) {
    return document.binFileName;
  }

  return FALLBACK;
};

const formatTransactionHash = (document: FileUploadDocumentChange): ReactNode => {
  if (document.transactionHash && document.transactionUrl) {
    return (
      <a
        href={document.transactionUrl}
        target="_blank"
        rel="noreferrer"
        className="break-all text-primary underline underline-offset-2"
      >
        {document.transactionHash}
      </a>
    );
  }

  return document.transactionHash ?? FALLBACK;
};

export function DocumentSummaryCard({
  documents,
  isLoading = false,
  error,
  walletAddress,
}: DocumentSummaryCardProps) {
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
                      {document.documentIdentifier ? (
                        <div className="mt-1 break-all text-xs text-muted-foreground">
                          {document.documentIdentifier}
                        </div>
                      ) : null}
                    </td>
                    <td className="w-[24%] px-4 py-3 align-top font-medium text-foreground">
                      {formatTimestamp(document.timestamp)}
                    </td>
                    <td className="w-[24%] break-all px-4 py-3 align-top font-mono text-xs text-foreground">
                      {formatDocumentHash(document)}
                    </td>
                    <td className="w-[24%] break-all px-4 py-3 align-top font-mono text-xs text-foreground">
                      {formatTransactionHash(document)}
                    </td>
                    <td className="w-28 px-4 py-3 align-top text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-md px-2 text-xs"
                      >
                        <Link to={`/documents/${document.id}`}>View Details</Link>
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