import { useCallback, useMemo, useRef } from "react";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deriveDocumentIdentifier,
  useDocumentUploader,
  type FileUploadDocumentChange,
  type UploadEntry,
  ACCEPTED_TYPES,
} from "@/lib/use-document-uploader";
export type {FileUploadDocumentChange} from "@/lib/use-document-uploader";

type FileUploadProps = {
  onDocumentsChange?: (documents: FileUploadDocumentChange[]) => void;
};

const INITIAL_VERSION = 1;

// FileUpload coordinates PDF ingestion, notarization, and status updates.
export function FileUpload({ onDocumentsChange }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { entries, stageEntries, clearEntry, clearAll } = useDocumentUploader({
    initialVersion: INITIAL_VERSION,
    onDocumentsChange,
  });

  // Open the per-document detail page, falling back to same-tab navigation.
  const openEntryDetails = useCallback((entry: UploadEntry) => {
    const identifier = deriveDocumentIdentifier(entry);

    if (!identifier) {
      console.warn("Document identifier unavailable for entry", entry.id);
      return;
    }

    const detailUrl = `/documents/${encodeURIComponent(identifier)}`;
    const detailWindow = window.open(detailUrl, "_blank", "noopener,noreferrer");

    if (!detailWindow) {
      window.location.href = detailUrl;
    }
  }, []);

  // Convert an upload entry by hashing it and submitting a notarization transaction on Solana.

  // Support drag-and-drop uploads as an alternative to the file picker.
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      stageEntries(event.dataTransfer.files);
    },
    [stageEntries],
  );

  // Provide contextual helper text for the drop zone.
  const dropZoneLabel = useMemo(() => {
    if (!entries.length) return "Drop notarized PDFs here";
    if (entries.some((entry) => entry.status === "converting" || entry.status === "idle")) {
      return "Conversion in progress...";
    }
    if (entries.some((entry) => entry.status === "error")) {
      return "Conversion finished with warnings";
    }
    return "Conversion complete";
  }, [entries]);

  // Remove a single entry from the list.
  // Support keyboard activation for entry navigation.
  const handleEntryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>, entry: UploadEntry) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openEntryDetails(entry);
      }
    },
    [openEntryDetails],
  );

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Hash notarized PDFs for on-chain verification</CardTitle>
        <CardDescription>
          Upload a notarized PDF. Conversion starts immediately and preserves the binary document hash
          for smart-contract ingestion.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Label
          htmlFor="file-input"
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={(event) => event.preventDefault()}
          onDrop={onDrop}
          className={cn(
            "flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/40 px-6 py-10 text-center transition-colors",
            entries.length
              ? "hover:border-primary/60"
              : "hover:border-primary/80 hover:bg-muted/60",
          )}
        >
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">{dropZoneLabel}</p>
            <p className="text-sm text-muted-foreground">
              Supported type: PDF (max 25 MB). Conversion runs automatically during upload.
            </p>
          </div>
          <Button
            type="button"
            variant="default"
            onClick={(event) => {
              event.preventDefault();
              inputRef.current?.click();
            }}
          >
            Browse PDF
          </Button>
        </Label>

        <Input
          ref={inputRef}
          id="file-input"
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            stageEntries(event.target.files);
            event.target.value = "";
          }}
        />

        {!!entries.length && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">
                {entries.length} PDF{entries.length > 1 ? "s" : ""} processed
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear all
                </Button>
              </div>
            </div>

            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEntryDetails(entry)}
                  onKeyDown={(event) => handleEntryKeyDown(event, entry)}
                  className="flex items-start gap-3 rounded-md border bg-card/60 p-3 outline-none transition hover:border-primary/60 hover:bg-card/80 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="mt-1 rounded-md bg-primary/10 p-2">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium">{entry.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {new Date(entry.uploadedAt).toLocaleString()} ·{" "}
                          {formatBytes(entry.fileSize)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {entry.status === "converting" && (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            <span className="whitespace-nowrap">Converting...</span>
                          </>
                        )}
                        {entry.status === "success" && (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                            <span className="whitespace-nowrap text-green-600">Done</span>
                          </>
                        )}
                        {entry.status === "error" && <span className="text-destructive">Error</span>}
                      </div>
                    </div>

                    <Progress value={entry.progress} className="h-1.5" />

                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>
                        Version: <span className="font-mono">{entry.version + 1}</span>
                      </p>
                      <p className="break-all">
                        Checksum:{" "}
                        <span className="font-mono">
                          {entry.checksum ?? "Calculating..."}
                        </span>
                      </p>
                      {entry.binFileName ? (
                        <p className="break-all">
                          Binary file:{" "}
                          <span className="font-mono">{entry.binFileName}</span>
                        </p>
                      ) : null}
                      <p className="break-all">
                        Binary hash:{" "}
                        <span className="font-mono">
                          {entry.binHash ?? "Calculating..."}
                        </span>
                      </p>
                    </div>

                    {entry.status === "success" ? (
                      <p className="text-xs text-muted-foreground">
                        Conversion complete. The binary hash is ready for smart-contract submission.
                      </p>
                    ) : null}

                    {entry.transactionStatus === "pending" ? (
                      <p className="text-xs text-muted-foreground">Awaiting wallet confirmation...</p>
                    ) : null}
                    {entry.transactionStatus === "confirmed" && entry.transactionHash ? (
                      <p className="text-xs text-muted-foreground">
                        Transaction hash:{" "}
                        {entry.transactionUrl ? (
                          <a
                            href={entry.transactionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all font-mono text-primary underline underline-offset-2"
                          >
                            {entry.transactionHash}
                          </a>
                        ) : (
                          <span className="break-all font-mono">{entry.transactionHash}</span>
                        )}
                      </p>
                    ) : null}
                    {entry.transactionStatus === "cancelled" ? (
                      <p className="text-xs text-muted-foreground">Wallet signing cancelled.</p>
                    ) : null}
                    {entry.transactionStatus === "error" && entry.transactionError ? (
                      <p className="text-xs text-destructive">{entry.transactionError}</p>
                    ) : null}

                    {entry.error ? (
                      <p className="text-xs text-destructive">{entry.error}</p>
                    ) : null}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1 h-8 w-8 text-muted-foreground transition hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearEntry(entry.id);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
