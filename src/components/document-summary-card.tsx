import { useEffect, useMemo, useState, type ReactNode } from "react";
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
const PAGE_SIZE = 10;

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

const buildDocumentDetailLink = (
  document: FileUploadDocumentChange,
  { hash }: { hash?: string } = {},
) => {
  const params = new URLSearchParams();
  if (document.transactionHash) {
    params.set("signature", document.transactionHash);
  }
  if (document.transactionUrl) {
    params.set("explorer", document.transactionUrl);
  }

  const search = params.toString();
  const normalizedHash = hash
    ? hash.startsWith("#")
      ? hash
      : `#${hash}`
    : undefined;

  return {
    pathname: `/documents/${document.id}`,
    search: search ? `?${search}` : "",
    ...(normalizedHash ? { hash: normalizedHash } : {}),
  };
};

const buildDocumentUpdateLink = (document: FileUploadDocumentChange) => ({
  pathname: `/documents/${encodeURIComponent(document.id)}/update`,
});

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
  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      const diff =
        (toMillis(b.timestamp) ?? Number.NEGATIVE_INFINITY) -
        (toMillis(a.timestamp) ?? Number.NEGATIVE_INFINITY);
      return diff || 0;
    });
  }, [documents]);

  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setCurrentPage(0);
  }, [sortedDocuments.length]);

  const { totalPages, pageStart, pageEnd, paginatedDocuments, activePage } = useMemo(() => {
    const total = Math.ceil(sortedDocuments.length / PAGE_SIZE);
    const nextActivePage = total > 0 ? Math.min(currentPage, total - 1) : 0;
    const start = nextActivePage * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, sortedDocuments.length);

    return {
      totalPages: total,
      pageStart: start,
      pageEnd: end,
      paginatedDocuments: sortedDocuments.slice(start, end),
      activePage: nextActivePage,
    };
  }, [currentPage, sortedDocuments]);

  const paginationItems = useMemo(() => {
    if (totalPages <= 0) return [] as Array<number | string>;

    const items: Array<number | string> = [];
    const lastPage = totalPages - 1;
    const addItem = (value: number | string) => {
      if (items[items.length - 1] !== value) {
        items.push(value);
      }
    };

    addItem(0);

    if (lastPage === 0) {
      return items;
    }

    const leftSibling = Math.max(activePage - 1, 1);
    const rightSibling = Math.min(activePage + 1, Math.max(lastPage - 1, 1));

    if (leftSibling > 1) {
      addItem("ellipsis-left");
    }

    for (let page = leftSibling; page <= rightSibling; page += 1) {
      addItem(page);
    }

    if (rightSibling < lastPage - 1) {
      addItem("ellipsis-right");
    }

    addItem(lastPage);

    return items;
  }, [activePage, totalPages]);

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
          <>
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
                {paginatedDocuments.map((document) => (
                  <tr
                    key={document.id}
                    className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60"
                  >
                    <td className="w-[28%] px-4 py-3 align-top text-foreground">
                      <Link
                        to={buildDocumentDetailLink(document)}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {formatDocumentName(document)}{" "}
                        <span className="text-sm text-muted-foreground">
                          (Version {document.version == null ? "N/A" : document.version + 1})
                        </span>
                      </Link>
                      <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {document.documentIdentifier ? (
                          <div className="break-all">{document.documentIdentifier}</div>
                        ) : null}
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
                    <td
                      className="w-28 px-4 py-3 align-top text-right opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-within:opacity-100"
                    >
                      <Button
                        asChild
                        size="sm"
                        variant="default"
                        className="h-8 rounded-md px-2 text-xs"
                      >
                        <Link to={buildDocumentUpdateLink(document)}>Update</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="mt-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <span className="text-sm text-muted-foreground text-center">
                  Showing {pageStart + 1}-{pageEnd} of {sortedDocuments.length} documents
                </span>
                <div className="flex flex-wrap justify-center items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Go to previous page"
                    onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                    disabled={activePage === 0}
                    className="h-9 rounded-full px-4 text-sm"
                  >
                    Previous
                  </Button>
                  {paginationItems.map((item, index) =>
                    typeof item === "number" ? (
                      <Button
                        key={item}
                        variant={item === activePage ? "default" : "outline"}
                        size="sm"
                        className="h-9 rounded-full px-4 text-sm"
                        onClick={() => setCurrentPage(item)}
                      >
                        {item + 1}
                      </Button>
                    ) : (
                      <span
                        key={`${item}-${index}`}
                        className="px-2 text-muted-foreground"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ),
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Go to next page"
                    onClick={() =>
                      setCurrentPage((prev) =>
                        totalPages === 0 ? 0 : Math.min(totalPages - 1, prev + 1),
                      )
                    }
                    disabled={totalPages === 0 || activePage >= totalPages - 1}
                    className="h-9 rounded-full px-4 text-sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
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