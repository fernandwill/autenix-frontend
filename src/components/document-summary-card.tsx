import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FileUploadDocumentChange } from "@/components/file-upload";

interface DocumentSummaryCardProps {
  documents: FileUploadDocumentChange[];
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">My Documents</CardTitle>
      </CardHeader>
      <CardContent>
        {hasDocuments ? (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="w-1/4 py-3 font-medium">Created at</th>
                  <th className="w-1/3 py-3 font-medium">Checksum</th>
                  <th className="w-1/3 py-3 font-medium">Transaction hash</th>
                  <th className="w-20 py-3 text-right font-medium">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDocuments.map((document) => (
                  <tr key={document.id} className="border-b border-border last:border-b-0">
                    <td className="py-3 align-top font-medium text-foreground">
                      {formatTimestamp(document.timestamp)}
                    </td>
                    <td className="break-all py-3 align-top font-mono text-xs text-foreground">
                      {formatChecksum(document.checksum)}
                    </td>
                    <td className="break-all py-3 align-top font-mono text-xs text-foreground">
                      {formatTransactionHash(document)}
                    </td>
                    <td className="py-3 align-top text-right">
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
            Upload a document to see its notarization metadata here.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
