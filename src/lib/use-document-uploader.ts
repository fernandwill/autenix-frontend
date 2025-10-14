import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "gill";
import { nanoid } from "nanoid";

import {
  composeDocumentIdentifier,
  type TransactionStatus,
  type UploadStatus,
} from "@/lib/upload-types";
import { getSolanaClient } from "@/lib/solana/client";
import { submitNotarizationTransaction } from "@/lib/solana/transactions";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

export interface UploadEntry {
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

export type UseDocumentUploaderOptions = {
  initialVersion?: number;
  onDocumentsChange?: (documents: FileUploadDocumentChange[]) => void;
  onTransactionConfirmed?: (document: FileUploadDocumentChange) => void;
};

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = ["application/pdf"] as const;
export const MIN_VERSION = 0;
export const MAX_VERSION = 255;

export const clampVersion = (value: number): number => {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : MIN_VERSION;
  return Math.min(Math.max(normalized, MIN_VERSION), MAX_VERSION);
};

const isPdfFile = (file: File) =>
  ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number]) ||
  file.name.toLowerCase().endsWith(".pdf");

const deriveBinFileName = (fileName: string) => {
  const trimmed = fileName.replace(/\.pdf$/i, "");
  return `${trimmed}.bin`;
};

export const deriveDocumentIdentifier = (
  entry: Pick<UploadEntry, "notaryAddress" | "binHash" | "version">,
): string | null => {
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

export const useDocumentUploader = ({
  initialVersion = 1,
  onDocumentsChange,
  onTransactionConfirmed,
}: UseDocumentUploaderOptions = {}) => {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const [completedDocuments, setCompletedDocuments] = useState<FileUploadDocumentChange[]>([]);
  const [documentVersion, setDocumentVersion] = useState<number>(clampVersion(initialVersion));
  const client = useMemo(() => getSolanaClient(), []);
  const { address, signTransaction } = useSolanaWallet();

  const wallet = useMemo(() => {
    if (!address || !signTransaction) return null;
    return {
      address: address as Address<string>,
      signTransaction,
    };
  }, [address, signTransaction]);

  const toTimestampMillis = useCallback((value?: string | null) => {
    const parsed = Date.parse(value ?? "");
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  }, []);

  useEffect(() => {
    if (!onDocumentsChange) return;

    const sortedEntries = [...completedDocuments].sort(
      (a, b) => toTimestampMillis(b.timestamp) - toTimestampMillis(a.timestamp),
    );

    onDocumentsChange(sortedEntries);
  }, [completedDocuments, onDocumentsChange, toTimestampMillis]);

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

      const syncEntry = (updates: Partial<UploadEntry>) => {
        currentEntry = { ...currentEntry, ...updates };
        setEntries((prev) => prev.map((item) => (item.id === id ? currentEntry : item)));
      };

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
          fileReadError instanceof Error ? fileReadError.message : "Unable to read the PDF file.";
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
          const rejected = rejectionCode === 4001 || /reject/i.test(message);

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

      const documentChange = mapEntryToDocumentChange(currentEntry);
      if (documentChange.transactionStatus === "confirmed") {
        onTransactionConfirmed?.(documentChange);
      }
    },
    [client, onTransactionConfirmed, wallet],
  );

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

  const clearEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

  return {
    entries,
    documentVersion,
    setDocumentVersion,
    stageEntries,
    clearEntry,
    clearAll,
    wallet,
  };
};

export type DocumentUploaderHook = ReturnType<typeof useDocumentUploader>;
