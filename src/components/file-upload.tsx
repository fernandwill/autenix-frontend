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
import { composeDocumentIdentifier, type TransactionStatus, type UploadStatus } from "@/lib/upload-types";
import { cn } from "@/lib/utils";
import { getSolanaClient } from "@/lib/solana/client";
import { submitNotarizationTransaction } from "@/lib/solana/transactions";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

export type FileUploadDocumentChange = {
  id: string;
  fileName: string;
  timestamp: string;
  checksum: string | null;
  binHash: string | null;
  binFileName: string | null;
  version: number | null;
  transactionHash: string | null;
  transactionUrl: string | null;
  transactionStatus: TransactionStatus;
  notaryAddress: string | null;
  documentIdentifier: string | null;
  error?: string | null;
};

type FileUploadProps = {
  onDocumentsChange?: (documents: FileUploadDocumentChange[]) => void;
};

interface UploadEntry {
  id: string;
  file: File | null;
  fileName: string;
  fileSize: number;
  fileType: string;
  progress: number;
  status: UploadStatus;
  uploadedAt: string;
  checksum?: string;
  binHash?: string;
  binFile?: File | null;
  binFileName?: string;
  version: number;
  error?: string;
  transactionHash?: string;
  transactionUrl?: string | null;
  transactionStatus?: TransactionStatus;
  transactionError?: string;
  notaryAddress?: Address<string> | null;
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf"] as const;
const MIN_VERSION = 0;
const MAX_VERSION = 255;

// Bound user-supplied versions to the valid 0–255 range enforced on-chain.
const clampVersion = (value: number): number => {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : MIN_VERSION;
  return Math.min(Math.max(normalized, MIN_VERSION), MAX_VERSION);
};

// Convert an internal upload entry into the consumer-friendly document summary shape.
const mapEntryToDocumentChange = (entry: UploadEntry): FileUploadDocumentChange => {
  const {
    id,
    fileName,
    uploadedAt: timestamp,
    checksum,
    binHash,
    binFileName,
    binFile,
    version,
    transactionHash,
    transactionUrl,
    transactionStatus,
    notaryAddress,
    transactionError,
    error,
  } = entry;
  const documentIdentifier = deriveDocumentIdentifier(entry);

  return {
    id: documentIdentifier ?? id,
    fileName,
    timestamp,
    checksum: checksum ?? null,
    binHash: binHash ?? null,
    binFileName: binFileName ?? binFile?.name ?? null,
    version: version ?? null,
    transactionHash: transactionHash ?? null,
    transactionUrl: transactionUrl ?? null,
    transactionStatus: transactionStatus ?? "idle",
    notaryAddress: notaryAddress ?? null,
    documentIdentifier,
    error: transactionError ?? error ?? null,
  };
};

// Determine whether the provided file is a supported PDF document.
const isPdfFile = (file: File) =>
  ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number]) ||
  file.name.toLowerCase().endsWith(".pdf");

// Generate the default .bin filename that mirrors the uploaded PDF name.
const deriveBinFileName = (fileName: string) => {
  const trimmed = fileName.replace(/\.pdf$/i, "");
  return `${trimmed}.bin`;
};

// Transform raw byte counts into a human readable label (e.g. "2.5 MB").
const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = (bytes / Math.pow(1024, power)).toFixed(1);
  return `${size} ${units[power]}`;
};

// Compose the canonical document identifier when both notary and hash inputs are available.
const deriveDocumentIdentifier = (entry: Pick<UploadEntry, "notaryAddress" | "binHash" | "version">): string | null => {
  if (!entry.notaryAddress || !entry.binHash) return null;

  try {
    return composeDocumentIdentifier({
      notary: entry.notaryAddress,
      hash: entry.binHash,
      version: entry.version,
    });
  } catch (error) {
    console.warn("Failed to compose document identifier.", error);
    return null;
  }
};


// Represent an array buffer as a hex string for hashes.
const arrayBufferToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

// Compute the checksum/hash pair needed for notarization.
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

// FileUpload coordinates PDF ingestion, notarization, and status updates.
export function FileUpload({ onDocumentsChange }: FileUploadProps) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [completedDocuments, setCompletedDocuments] = useState<FileUploadDocumentChange[]>([]);
  const [documentVersion, setDocumentVersion] = useState<number>(1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const client = useMemo(() => getSolanaClient(), []);
  const { address, signTransaction } = useSolanaWallet();

  // Derive the connected wallet instance from the Solana wallet hook.
  const wallet = useMemo(() => {
    if (!address || !signTransaction) return null;
    return {
      address: address as Address<string>,
      signTransaction,
    };
  }, [address, signTransaction]);

  // Normalize timestamps into milliseconds so sorting always prefers the newest documents.
  const toTimestampMillis = useCallback((value?: string | null) => {
    const parsed = Date.parse(value ?? "");
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  }, []);

  // Emit completed documents to parents ordered from newest to oldest.
  const emitDocumentsChange = useCallback(
    (documentsToEmit: FileUploadDocumentChange[]) => {
      if (!onDocumentsChange) return;

      const sortedEntries = [...documentsToEmit].sort(
        (a, b) => toTimestampMillis(b.timestamp) - toTimestampMillis(a.timestamp),
      );

      onDocumentsChange(sortedEntries);
    },
    [onDocumentsChange, toTimestampMillis],
  );

  useEffect(() => {
    emitDocumentsChange(completedDocuments);
  }, [completedDocuments, emitDocumentsChange]);

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
  const convertEntry = useCallback(
    async (entry: UploadEntry) => {
      const { id, file } = entry;
      let currentEntry: UploadEntry = entry;
      const normalizedVersion = clampVersion(currentEntry.version);
      if (normalizedVersion !== currentEntry.version) {
        currentEntry = { ...currentEntry, version: normalizedVersion };
      }
      let computedBinHash: string | null = entry.binHash ?? null;
      let binFile: File | null = entry.binFile ?? null;
      let binFileName = entry.binFileName ?? deriveBinFileName(entry.fileName);

      // Apply entry updates and refresh state with the latest entry snapshot.
      const syncEntry = (updates: Partial<UploadEntry>) => {
        currentEntry = { ...currentEntry, ...updates };
        setEntries((prev) => prev.map((item) => (item.id === id ? currentEntry : item)));
      };

      // Finalize the current entry in an error state and surface the reason to the UI.
      const finalizeWithError = (message: string) => {
        syncEntry({
          status: "error",
          error: message,
          progress: 0,
          transactionStatus: "error",
          transactionError: message,
          transactionHash: undefined,
          transactionUrl: null,
        });
      };

      syncEntry({
        status: "converting",
        progress: currentEntry.progress > 0 ? currentEntry.progress : 5,
        error: undefined,
        transactionError: undefined,
      });

      if (!wallet) {
        finalizeWithError("Please connect your wallet.");
        return;
      }

      syncEntry({
        notaryAddress: wallet.address,
      });

      if (!file) {
        finalizeWithError("Original PDF unavailable. Please upload the document again.");
        return;
      }

      if (!isPdfFile(file)) {
        finalizeWithError("Unsupported file type. Only PDF documents are supported.");
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
        if (!binFile) {
          try {
            binFile = new File([fileBuffer], binFileName, {
              type: "application/octet-stream",
            });
            binFileName = binFile.name;
          } catch (conversionError) {
            const message =
              conversionError instanceof Error
                ? conversionError.message
                : "Unable to convert the PDF into a binary document.";
            finalizeWithError(message);
            return;
          }
        }

        const { checksum, hash } = await computeDigestsFromBuffer(fileBuffer);
        computedBinHash = hash;
        syncEntry({
          checksum,
          binHash: hash,
          binFile: binFile ?? null,
          binFileName,
        });
      } catch (digestError) {
        console.warn("Failed to compute file digests.", digestError);
      }

      // Attempt to submit the notarization transaction through the connected wallet.
      const attemptTransactionSignature = async () => {
        syncEntry({
          transactionStatus: "pending",
          transactionError: undefined,
          transactionUrl: null,
        });

        const documentHashHex = computedBinHash ?? currentEntry.binHash ?? null;
        if (!documentHashHex) {
          syncEntry({
            transactionStatus: "error",
            transactionError: "Binary hash unavailable. Unable to submit notarization.",
            transactionHash: undefined,
            transactionUrl: null,
          });
          return;
        }

        try {
          const { signature, explorerUrl } = await submitNotarizationTransaction({
            client,
            wallet,
            documentHashHex,
            documentName: currentEntry.binFileName ?? binFileName,
            version: currentEntry.version,
          });

          syncEntry({
            transactionHash: signature,
            transactionStatus: "confirmed",
            transactionError: undefined,
            transactionUrl: explorerUrl,
          });
        } catch (error) {
          const rejectionCode = (error as { code?: number })?.code;
          const message =
            error instanceof Error
              ? error.message
              : "Failed to submit the notarization transaction.";
          const rejected =
            rejectionCode === 4001 ||
            /reject/i.test(message);

          if (rejected) {
            syncEntry({
              transactionStatus: "cancelled",
              transactionError: undefined,
              transactionUrl: null,
            });
            return;
          }

          syncEntry({
            transactionStatus: "error",
            transactionError: message,
            transactionHash: undefined,
            transactionUrl: null,
          });
        }
      };

      syncEntry({ progress: 100 });
      syncEntry({
        status: "success",
        progress: 100,
      });

      await attemptTransactionSignature();

      setCompletedDocuments((prev) => {
        const next = prev.filter((document) => document.id !== currentEntry.id);
        return [...next, mapEntryToDocumentChange(currentEntry)];
      });

      setEntries((prev) => prev.filter((item) => item.id !== id));
    },
    [client, wallet],
  );

  // Stage valid PDFs for conversion and trigger processing.
  const stageEntries = useCallback(
    (fileList: FileList | null) => {
      const accepted = Array.from(fileList ?? []).filter(
        (file) => isPdfFile(file) && file.size <= MAX_FILE_SIZE,
      );
      if (!accepted.length) return;

      const targetVersion = clampVersion(documentVersion);
      if (targetVersion !== documentVersion) {
        setDocumentVersion(targetVersion);
      }

      const preparedEntries = accepted.map((file) => ({
        id: nanoid(),
        file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        progress: 0,
        status: "idle" as UploadStatus,
        uploadedAt: new Date().toISOString(),
        transactionStatus: "idle" as TransactionStatus,
        binFile: null,
        binFileName: deriveBinFileName(file.name),
        version: targetVersion,
      } satisfies UploadEntry));

      setEntries((prev) => [...prev, ...preparedEntries]);

      preparedEntries.forEach((newEntry) => {
        void convertEntry(newEntry);
      });
    },
    [convertEntry, documentVersion],
  );

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
  const clearEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  // Clear all entries.
  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

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
        <div className="grid gap-2 sm:max-w-xs">
          <Label htmlFor="document-version-input" className="text-sm font-medium text-muted-foreground">
            Document version
          </Label>
          <Input
            id="document-version-input"
            type="number"
            inputMode="numeric"
            min={MIN_VERSION}
            max={MAX_VERSION}
            step={1}
            value={documentVersion}
            onChange={(event) => {
              const nextValue = Number.parseInt(event.target.value, 10);
              setDocumentVersion(Number.isNaN(nextValue) ? MIN_VERSION : clampVersion(nextValue));
            }}
            onBlur={(event) => {
              const nextValue = Number.parseInt(event.target.value, 10);
              setDocumentVersion(Number.isNaN(nextValue) ? MIN_VERSION : clampVersion(nextValue));
            }}
            aria-describedby="document-version-helper"
          />
          <p id="document-version-helper" className="text-xs text-muted-foreground">
            Applied to new uploads. Accepts only whole number (ex. 1).
          </p>
        </div>

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
