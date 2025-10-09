import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "gill";
import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import { nanoid } from "nanoid";

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
import { buildDetailStorageKey, type DocumentDetailSnapshot, type UploadStatus } from "@/lib/upload-types";
import { cn } from "@/lib/utils";
import { getSolanaClient } from "@/lib/solana/client";
import { sendMemoTransaction } from "@/lib/solana/transactions";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

export type FileUploadDocumentChange = {
  id: string;
  timestamp: string;
  checksum: string | null;
  hash: string | null;
  transactionHash: string | null;
  transactionStatus: "idle" | "pending" | "confirmed" | "cancelled" | "error";
  error?: string | null;
};

type FileUploadProps = {
  onDocumentChange?: (document: FileUploadDocumentChange) => void;
};

interface UploadEntry {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  uploadedAt: string;
  checksum?: string;
  hash?: string;
  error?: string;
  transactionSignature?: string;
  transactionStatus?: FileUploadDocumentChange["transactionStatus"];
  transactionError?: string;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf"] as const;

const DETAIL_STORAGE_AVAILABLE = typeof window !== "undefined" && "localStorage" in window;

// Pretty-print a byte count so users can see file sizes.
const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = (bytes / Math.pow(1024, power)).toFixed(1);
  return `${size} ${units[power]}`;
};

const getStatusLabel = (status: UploadStatus) => {
  switch (status) {
    case "success":
      return "Converted";
    case "converting":
      return "Converting";
    case "error":
      return "Error";
    default:
      return "Queued";
  }
};

const getStatusDescription = (status: UploadStatus) => {
  switch (status) {
    case "success":
      return "Your document has been notarized and its hash is ready to be published on-chain.";
    case "error":
      return "We were unable to convert this document. Review the status information below.";
    default:
      return "Conversion is running. You can leave this tab open while the process completes.";
  }
};

const createDetailSnapshot = (entry: UploadEntry): DocumentDetailSnapshot => {
  const uploadedAtLabel = entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleString() : "Unavailable";
  const statusLabel = getStatusLabel(entry.status);
  const statusDescription = getStatusDescription(entry.status);
  return {
    id: entry.id,
    fileName: entry.file.name,
    sizeLabel: formatBytes(entry.file.size),
    uploadedAt: entry.uploadedAt,
    uploadedAtLabel,
    status: entry.status,
    statusLabel,
    statusDescription,
    checksum: entry.checksum ?? null,
    hash: entry.hash ?? null,
    error: entry.error ?? null,
  };
};

const persistDetailSnapshot = (entry: UploadEntry) => {
  if (!DETAIL_STORAGE_AVAILABLE) {
    return;
  }

  try {
    const key = buildDetailStorageKey(entry.id);
    const snapshot = createDetailSnapshot(entry);
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("Failed to persist document detail snapshot.", error);
  }
};

const arrayBufferToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const computeDigestsFromBuffer = async (buffer: ArrayBuffer) => {
  if (!crypto?.subtle) {
    throw new Error("Web Crypto API is not available.");
  }

  const [checksumBuffer, hashBuffer] = await Promise.all([
    crypto.subtle.digest("SHA-1", buffer),
    crypto.subtle.digest("SHA-256", buffer),
  ]);

  return {
    checksum: arrayBufferToHex(checksumBuffer),
    hash: arrayBufferToHex(hashBuffer),
  };
};

export function FileUpload({ onDocumentChange }: FileUploadProps) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const client = useMemo(() => getSolanaClient(), []);
  const { address, signTransaction } = useSolanaWallet();

  const wallet = useMemo(() => {
    if (!address || !signTransaction) return null;
    return {
      address: address as Address<string>,
      signTransaction,
    };
  }, [address, signTransaction]);

  const emitDocumentChange = useCallback(
    (entry: UploadEntry) => {
      if (!onDocumentChange) return;

      onDocumentChange({
        id: entry.id,
        timestamp: entry.uploadedAt,
        checksum: entry.checksum ?? null,
        hash: entry.hash ?? null,
        transactionHash: entry.transactionSignature ?? null,
        transactionStatus: entry.transactionStatus ?? "idle",
        error: entry.transactionError ?? entry.error ?? null,
      });
    },
    [onDocumentChange],
  );

  useEffect(() => {
    if (!DETAIL_STORAGE_AVAILABLE) {
      return;
    }

    entries.forEach((entry) => {
      const key = buildDetailStorageKey(entry.id);
      if (window.localStorage.getItem(key)) {
        persistDetailSnapshot(entry);
      }
    });
  }, [entries]);

  const openEntryDetails = useCallback((entry: UploadEntry) => {
    persistDetailSnapshot(entry);

    const detailUrl = `/documents/${encodeURIComponent(entry.id)}`;
    const detailWindow = window.open(detailUrl, "_blank", "noopener,noreferrer");

    if (!detailWindow) {
      window.location.href = detailUrl;
    }
  }, []);

  const convertEntry = useCallback(
    async (entry: UploadEntry) => {
      const { id, file } = entry;
      let currentEntry: UploadEntry = entry;

      const applyUpdates = (updates: Partial<UploadEntry>, options?: { notify?: boolean }) => {
        currentEntry = { ...currentEntry, ...updates };
        setEntries((prev) =>
          prev.map((item) => (item.id === id ? currentEntry : item)),
        );
        if (options?.notify) {
          emitDocumentChange(currentEntry);
        }
      };

      const updateProgress = (progress: number) => {
        currentEntry = { ...currentEntry, progress };
        setEntries((prev) =>
          prev.map((item) => (item.id === id ? currentEntry : item)),
        );
      };

      const finalizeWithError = (message: string) => {
        applyUpdates(
          {
            status: "error",
            error: message,
            progress: 0,
            transactionStatus: "error",
            transactionError: message,
          },
          { notify: true },
        );
      };

      applyUpdates(
        {
          status: "converting",
          progress: currentEntry.progress > 0 ? currentEntry.progress : 5,
          error: undefined,
          transactionError: undefined,
        },
        { notify: false },
      );

      if (!wallet) {
        finalizeWithError("Please connect your wallet.");
        return;
      }

      let fileBuffer: ArrayBuffer;
      try {
        fileBuffer = await file.arrayBuffer();
      } catch (fileReadError) {
        const message =
          fileReadError instanceof Error
            ? fileReadError.message
            : "Unable to read the PDF file.";
        finalizeWithError(message);
        return;
      }

      try {
        const { checksum, hash } = await computeDigestsFromBuffer(fileBuffer);
        applyUpdates(
          {
            checksum,
            hash,
          },
          { notify: true },
        );
      } catch (digestError) {
        console.warn("Failed to compute file digests.", digestError);
      }

      const attemptTransactionSignature = async () => {
        applyUpdates(
          {
            transactionStatus: "pending",
            transactionError: undefined,
          },
          { notify: true },
        );

        const memoParts = [
          `Document ${currentEntry.file.name}`,
          currentEntry.hash ? `hash:${currentEntry.hash}` : null,
          currentEntry.checksum ? `checksum:${currentEntry.checksum}` : null,
        ].filter(Boolean);
        const memo = memoParts.join(" ") || `Document ${currentEntry.id}`;

        try {
          const { signature } = await sendMemoTransaction({
            client,
            wallet,
            memo,
          });

          applyUpdates(
            {
              transactionSignature: signature,
              transactionStatus: "confirmed",
              transactionError: undefined,
            },
            { notify: true },
          );
        } catch (error) {
          const rejectionCode = (error as { code?: number })?.code;
          const message =
            error instanceof Error
              ? error.message
              : "Failed to sign the Solana transaction.";
          const rejected =
            rejectionCode === 4001 ||
            /reject/i.test(message);

          if (rejected) {
            applyUpdates(
              {
                transactionStatus: "cancelled",
                transactionError: undefined,
              },
              { notify: true },
            );
            return;
          }

          applyUpdates(
            {
              transactionStatus: "error",
              transactionError: message,
            },
            { notify: true },
          );
        }
      };

      updateProgress(100);
      applyUpdates(
        {
          status: "success",
          progress: 100,
        },
        { notify: true },
      );

      await attemptTransactionSignature();
    },
    [client, emitDocumentChange, wallet],
  );

  const stageEntries = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;

      const accepted = Array.from(fileList).filter((file) => {
        const typeAccepted = ACCEPTED_TYPES.includes(
          file.type as (typeof ACCEPTED_TYPES)[number],
        );
        const sizeAccepted = file.size <= MAX_FILE_SIZE;
        return typeAccepted && sizeAccepted;
      });

      if (!accepted.length) return;

      const preparedEntries = accepted.map((file) => ({
        id: nanoid(),
        file,
        progress: 0,
        status: "idle" as UploadStatus,
        uploadedAt: new Date().toISOString(),
        transactionStatus: "idle" as FileUploadDocumentChange["transactionStatus"],
      }));

      setEntries((prev) => [...prev, ...preparedEntries]);

      preparedEntries.forEach((newEntry) => {
        emitDocumentChange(newEntry);
        void convertEntry(newEntry);
      });
    },
    [convertEntry, emitDocumentChange],
  );

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      stageEntries(event.dataTransfer.files);
    },
    [stageEntries],
  );

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

  // Removes a single entry.
  const clearEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  // Clears the entire queue.
  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

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
    <Card className="w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Hash notarized PDFs for on-chain verification</CardTitle>
        <CardDescription>
          Upload a notarized PDF. Conversion starts immediately and preserves the document hash for
          smart-contract ingestion.
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
            variant="secondary"
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
          onChange={(event) => stageEntries(event.target.files)}
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
                        <p className="truncate text-sm font-medium">{entry.file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Uploaded {new Date(entry.uploadedAt).toLocaleString()} ·{" "}
                          {formatBytes(entry.file.size)}
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
                      <p className="break-all">
                        Checksum:{" "}
                        <span className="font-mono">
                          {entry.checksum ?? "Calculating..."}
                        </span>
                      </p>
                      <p className="break-all">
                        Hash:{" "}
                        <span className="font-mono">
                          {entry.hash ?? "Calculating..."}
                        </span>
                      </p>
                    </div>

                    {entry.status === "success" ? (
                      <p className="text-xs text-muted-foreground">
                        Conversion complete. The document hash is ready for smart-contract submission.
                      </p>
                    ) : null}

                    {entry.transactionStatus === "pending" ? (
                      <p className="text-xs text-muted-foreground">Awaiting wallet confirmation...</p>
                    ) : null}
                    {entry.transactionStatus === "confirmed" && entry.transactionSignature ? (
                      <p className="text-xs text-muted-foreground">
                        Transaction hash:{" "}
                        <span className="break-all font-mono">{entry.transactionSignature}</span>
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
