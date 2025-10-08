export type UploadStatus = "idle" | "converting" | "success" | "error";

export type DocumentDetailSnapshot = {
  id: string;
  fileName: string;
  sizeLabel: string;
  uploadedAt: string;
  uploadedAtLabel: string;
  status: UploadStatus;
  statusLabel: string;
  statusDescription: string;
  checksum: string | null;
  hash: string | null;
  error: string | null;
};

export const DOCUMENT_DETAIL_STORAGE_PREFIX = "document-detail:";

export const buildDetailStorageKey = (id: string) => `${DOCUMENT_DETAIL_STORAGE_PREFIX}${id}`;
