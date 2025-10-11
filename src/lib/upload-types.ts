export type UploadStatus = "idle" | "converting" | "success" | "error";
export type TransactionStatus = "idle" | "pending" | "confirmed" | "cancelled" | "error";

export type DocumentDetailSnapshot = {
  id: string;
  fileName: string;
  sizeLabel: string;
  uploadedAt: string;
  uploadedAtLabel: string;
  status: UploadStatus;
  statusLabel: string;
  statusDescription: string;
  version: number | null;
  checksum: string | null;
  binHash: string | null;
  binFileName: string | null;
  transactionHash: string | null;
  transactionUrl: string | null;
  transactionStatus?: TransactionStatus;
  error: string | null;
};

export const DOCUMENT_DETAIL_STORAGE_PREFIX = "document-detail:";

// Compose the localStorage key used to persist document details.
export const buildDetailStorageKey = (id: string) => `${DOCUMENT_DETAIL_STORAGE_PREFIX}${id}`;
