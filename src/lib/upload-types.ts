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
  notaryAddress: string | null;
  notarizationAccount: string | null;
  hashVersion: number | null;
  bump: number | null;
  additional: number | null;
};

export type DocumentIdentifierParts = {
  notary: string;
  hash: string;
  version: number;
};

const DOCUMENT_IDENTIFIER_SEPARATOR = "_";

export const composeDocumentIdentifier = ({
  notary,
  hash,
  version,
}: DocumentIdentifierParts): string => `${notary}${DOCUMENT_IDENTIFIER_SEPARATOR}${hash}${DOCUMENT_IDENTIFIER_SEPARATOR}${version}`;

export const parseDocumentIdentifier = (identifier: string): DocumentIdentifierParts | null => {
  const parts = identifier.split(DOCUMENT_IDENTIFIER_SEPARATOR);
  if (parts.length !== 3) {
    return null;
  }

  const [notary, hash, rawVersion] = parts;
  if (!notary || !hash) {
    return null;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
    return null;
  }

  const version = Number.parseInt(rawVersion, 10);
  if (!Number.isFinite(version) || version < 0 || version > 255) {
    return null;
  }

  return { notary, hash, version };
};
