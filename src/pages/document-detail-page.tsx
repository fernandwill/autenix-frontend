import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Loader2,
  ShieldCheck,
  X,
  Upload,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
import { ThemeToggle } from "@/components/theme-toggle";
import { getSolanaClient } from "@/lib/solana/client";
import { buildExplorerUrl } from "@/lib/solana/explorer";
import { getNotarizationAccountDetails } from "@/lib/solana/notarization-account";
import {
  composeDocumentIdentifier,
  parseDocumentIdentifier,
  type DocumentDetailSnapshot,
} from "@/lib/upload-types";
import {
  ACCEPTED_TYPES,
  MIN_VERSION,
  MAX_VERSION,
  clampVersion,
  deriveDocumentIdentifier,
  useDocumentUploader,
  type FileUploadDocumentChange,
  type UploadEntry,
} from "@/lib/use-document-uploader";
import { cn } from "@/lib/utils";
type CopyField = "binary" | "transaction" | "notary" | "account";
type MetaItem = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  copyField?: CopyField;
  copyValue?: string;
  copyMessage?: string;
};

type StatusVisual = {
  icon: LucideIcon;
  badgeClass: string;
  iconClass: string;
  label: string;
};

type BaseStatusVisual = Omit<StatusVisual, "label">;

const STATUS_VISUALS: Record<"success" | "error" | "converting" | "default", BaseStatusVisual> = {
  success: {
    icon: CheckCircle2,
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    iconClass: "h-4 w-4",
  },
  error: {
    icon: AlertTriangle,
    badgeClass:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
    iconClass: "h-4 w-4",
  },
  converting: {
    icon: Loader2,
    badgeClass:
      "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300",
    iconClass: "h-4 w-4 animate-spin",
  },
  default: {
    icon: Clock,
    badgeClass:
      "border-border bg-muted text-muted-foreground dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200",
    iconClass: "h-4 w-4",
  },
} as const;

const SIGNATURE_STATUS_VISUALS: Record<"confirmed" | "error", StatusVisual> = {
  confirmed: {
    icon: CheckCircle2,
    badgeClass:
      "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    iconClass: "h-4 w-4",
    label: "Signature confirmed",
  },
  error: {
    icon: XCircle,
    badgeClass:
      "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300",
    iconClass: "h-4 w-4",
    label: "Signature failed",
  },
} as const;

const deriveStatusVisual = (snapshot: DocumentDetailSnapshot | null): StatusVisual | null => {
  if (!snapshot) return null;

  const transactionStatus =
    snapshot.transactionStatus ??
    (snapshot.transactionHash ? "confirmed" : snapshot.error ? "error" : "idle");

  const baseKey = snapshot.status as keyof typeof STATUS_VISUALS;
  const fallback = STATUS_VISUALS[baseKey] ?? STATUS_VISUALS.default;

  if (snapshot.status === "success" && transactionStatus === "confirmed") {
    return SIGNATURE_STATUS_VISUALS.confirmed;
  }

  if (transactionStatus === "error") {
    return SIGNATURE_STATUS_VISUALS.error;
  }

  return {
    ...fallback,
    label: snapshot.statusLabel,
  };
};

const deriveStatusDescription = (snapshot: DocumentDetailSnapshot | null): string | null => {
  if (!snapshot) return null;

  const transactionStatus =
    snapshot.transactionStatus ??
    (snapshot.transactionHash ? "confirmed" : snapshot.error ? "error" : "idle");

  if (snapshot.status === "error" || transactionStatus === "error") {
    const cause = snapshot.error?.trim();
    return cause ? `Your document failed to be notarized. ${cause}` : "Your document failed to be notarized.";
  }

  return snapshot.statusDescription;
};

const formatVersion = (value: number | null) => {
  if (value == null) return "Not set";
  return (value + 1).toString();
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = (bytes / Math.pow(1024, power)).toFixed(1);
  return `${size} ${units[power]}`;
};

// DocumentDetailPage renders the persisted upload metadata for a specific entry.
export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const signatureParam = searchParams.get("signature");
  const explorerParam = searchParams.get("explorer");
  const client = useMemo(() => getSolanaClient(), []);
  const parsedIdentifier = useMemo(
    () => (documentId ? parseDocumentIdentifier(documentId) : null),
    [documentId],
  );
  const [snapshot, setSnapshot] = useState<DocumentDetailSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [isContentVisible, setIsContentVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<CopyField | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateInputRef = useRef<HTMLInputElement | null>(null);
  const updateDefaultVersion = useMemo(
    () => clampVersion((snapshot?.version ?? 0) + 1),
    [snapshot],
  );

  const handleUpdateTransactionConfirmed = useCallback(
    async (documentChange: FileUploadDocumentChange) => {
      if (!documentChange.notaryAddress || !documentChange.binHash || documentChange.version == null) {
        return;
      }

      let nextIdentifier = documentChange.documentIdentifier ?? null;
      try {
        nextIdentifier = composeDocumentIdentifier({
          notary: documentChange.notaryAddress,
          hash: documentChange.binHash,
          version: documentChange.version,
        });
      } catch (error) {
        console.warn("Unable to compose document identifier from update.", error);
      }

      if (nextIdentifier && nextIdentifier !== documentId) {
        navigate(`/documents/${encodeURIComponent(nextIdentifier)}`);
        return;
      }

      try {
        setLoading(true);
        const details = await getNotarizationAccountDetails({
          client,
          notary: documentChange.notaryAddress,
          documentHashHex: documentChange.binHash,
          version: documentChange.version,
        });

        const timestampMs = Number.isFinite(details.timestamp)
          ? details.timestamp * 1000
          : Date.now();
        const uploadedAt = new Date(timestampMs).toISOString();
        const uploadedAtLabel = new Date(timestampMs).toLocaleString();
        const transactionHash = documentChange.transactionHash ?? null;
        const transactionUrl =
          documentChange.transactionUrl ??
          (transactionHash ? buildExplorerUrl(client.urlOrMoniker, transactionHash) : null);

        setSnapshot({
          id: documentId ?? nextIdentifier ?? documentChange.id,
          fileName: details.documentName || "Untitled document",
          sizeLabel: "Unavailable",
          uploadedAt,
          uploadedAtLabel,
          status: "success",
          statusLabel: "Notarized",
          statusDescription: "Document details retrieved directly from the blockchain.",
          version: details.version ?? null,
          checksum: null,
          binHash: details.hash ?? null,
          binFileName: details.documentName || null,
          transactionHash,
          transactionUrl,
          transactionStatus: transactionHash ? "confirmed" : "idle",
          error: null,
          notaryAddress: details.notary,
          notarizationAccount: details.accountAddress,
          hashVersion: details.hashVersion,
          bump: details.bump,
          additional: details.additional,
        });
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to refresh document details after the update.";
        setErrorMessage(message);
      } finally {
        setLoading(false);
      }
    },
    [client, documentId, navigate],
  );

  const {
    entries: updateEntries,
    documentVersion: updateVersion,
    setDocumentVersion: setUpdateVersion,
    stageEntries: stageUpdateEntries,
    clearEntry: clearUpdateEntry,
    clearAll: clearAllUpdateEntries,
  } = useDocumentUploader({
    initialVersion: updateDefaultVersion,
    onTransactionConfirmed: handleUpdateTransactionConfirmed,
  });

  useEffect(() => {
    setUpdateVersion(updateDefaultVersion);
  }, [setUpdateVersion, updateDefaultVersion]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!documentId) {
        setSnapshot(null);
        setErrorMessage("Document identifier missing.");
        return;
      }

      if (!parsedIdentifier) {
        setSnapshot(null);
        setErrorMessage("Invalid document identifier.");
        return;
      }

      setLoading(true);
      setIsContentVisible(false);
      setSnapshot(null);
      setErrorMessage(null);

      try {
        const details = await getNotarizationAccountDetails({
          client,
          notary: parsedIdentifier.notary,
          documentHashHex: parsedIdentifier.hash,
          version: parsedIdentifier.version,
        });

        if (cancelled) return;

        const timestampMs = Number.isFinite(details.timestamp)
          ? details.timestamp * 1000
          : Date.now();
        const uploadedAt = new Date(timestampMs).toISOString();
        const uploadedAtLabel = new Date(timestampMs).toLocaleString();

        const transactionHash = signatureParam ?? null;
        const transactionUrl =
          explorerParam ??
          (transactionHash ? buildExplorerUrl(client.urlOrMoniker, transactionHash) : null);

        setSnapshot({
          id: documentId,
          fileName: details.documentName || "Untitled document",
          sizeLabel: "Unavailable",
          uploadedAt,
          uploadedAtLabel,
          status: "success",
          statusLabel: "Notarized",
          statusDescription: "Document details retrieved directly from the blockchain.",
          version: details.version ?? null,
          checksum: null,
          binHash: details.hash ?? null,
          binFileName: details.documentName || null,
          transactionHash,
          transactionUrl,
          transactionStatus: transactionHash ? "confirmed" : "idle",
          error: null,
          notaryAddress: details.notary,
          notarizationAccount: details.accountAddress,
          hashVersion: details.hashVersion,
          bump: details.bump,
          additional: details.additional,
        });

        requestAnimationFrame(() => {
          if (!cancelled) {
            setIsContentVisible(true);
          }
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load document details from the blockchain.";
        setSnapshot(null);
        setErrorMessage(message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [client, documentId, parsedIdentifier, signatureParam, explorerParam]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const statusVisuals = deriveStatusVisual(snapshot);
  const statusDescription = deriveStatusDescription(snapshot);
  const transactionStatus =
    snapshot?.transactionStatus ??
    (snapshot?.transactionHash ? "confirmed" : snapshot?.error ? "error" : "idle");

  const monoValueClass = "mt-1 break-all font-mono text-sm text-foreground";
  const defaultValueClass = "mt-1 break-words font-medium text-foreground";
  const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  const copyToClipboard = (value: string | undefined | null) => {
    if (!value) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(() => {
        /* noop: clipboard unavailable */
      });
    }
  };

  const handleCopy = (field: CopyField, value?: string | null) => {
    if (!value) return;
    copyToClipboard(value);
    setCopiedField(field);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedField(null);
      copyTimerRef.current = null;
    }, 3000);
  };

  const openUpdateEntryDetails = useCallback((entry: UploadEntry) => {
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

  const onUpdateDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      stageUpdateEntries(event.dataTransfer.files);
    },
    [stageUpdateEntries],
  );

  const updateDropZoneLabel = useMemo(() => {
    if (!updateEntries.length) return "Drop notarized PDFs here";
    if (updateEntries.some((entry) => entry.status === "converting" || entry.status === "idle")) {
      return "Conversion in progress...";
    }
    if (updateEntries.some((entry) => entry.status === "error")) {
      return "Conversion finished with warnings";
    }
    return "Conversion complete";
  }, [updateEntries]);

  const handleUpdateEntryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>, entry: UploadEntry) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openUpdateEntryDetails(entry);
      }
    },
    [openUpdateEntryDetails],
  );

  const metaColumns: MetaItem[][] | null = snapshot
    ? [
        [
          { label: "File name", value: snapshot.fileName },
          { label: "Binary file", value: snapshot.binFileName ?? "Unavailable", mono: true },
          { label: "Status", value: snapshot.statusLabel },
          { label: "Document version", value: formatVersion(snapshot.version) },
          {
            label: "Hash version",
            value: snapshot.hashVersion != null ? snapshot.hashVersion.toString() : "Unknown",
          },
          {
            label: "Program bump",
            value: snapshot.bump != null ? snapshot.bump.toString() : "Unknown",
          },
        ],
        [
          { label: "On-chain timestamp", value: snapshot.uploadedAtLabel },
          {
            label: "Binary hash",
            value: snapshot.binHash ?? "Unavailable",
            mono: true,
            copyField: snapshot.binHash ? "binary" : undefined,
            copyValue: snapshot.binHash ?? undefined,
            copyMessage: snapshot.binHash ? "Binary hash copied!" : undefined,
          },
          {
            label: "Transaction hash",
            value:
              transactionStatus === "error"
                ? "Not available"
                : snapshot?.transactionUrl && snapshot.transactionHash
                  ? (
                      <a
                        href={snapshot.transactionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        {snapshot.transactionHash}
                      </a>
                    )
                  : snapshot.transactionHash ?? "Awaiting confirmation...",
            mono: true,
            copyField:
              transactionStatus === "error" || !snapshot?.transactionHash ? undefined : "transaction",
            copyValue:
              transactionStatus === "error" ? undefined : snapshot?.transactionHash ?? undefined,
            copyMessage:
              transactionStatus === "error" || !snapshot?.transactionHash
                ? undefined
                : "Transaction hash copied!",
          },
          {
            label: "Notary address",
            value: snapshot.notaryAddress ?? "Unknown",
            mono: true,
            copyField: snapshot.notaryAddress ? "notary" : undefined,
            copyValue: snapshot.notaryAddress ?? undefined,
            copyMessage: snapshot.notaryAddress ? "Notary address copied!" : undefined,
          },
          {
            label: "Notarization account",
            value: snapshot.notarizationAccount ?? "Unknown",
            mono: true,
            copyField: snapshot.notarizationAccount ? "account" : undefined,
            copyValue: snapshot.notarizationAccount ?? undefined,
            copyMessage: snapshot.notarizationAccount ? "Account address copied!" : undefined,
          },
        ],
      ]
    : null;

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" asChild className="gap-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Back to uploads
            </Link>
          </Button>
          {documentId ? (
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Document ID: {documentId}
            </span>
          ) : null}
        </div>

        {snapshot ? (
          <div
            className={`mt-10 overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-border transition-all duration-500 ${
              isContentVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}
          >
            <div className="flex flex-col gap-8 border-b border-border px-8 py-10 md:flex-row md:items-start md:justify-between">
              <div className="flex-1 space-y-6">
                <div>
                  <h1 className="text-3xl font-semibold text-foreground">{snapshot.fileName}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Uploaded {snapshot.uploadedAtLabel}
                    <span className="mx-2">·</span>
                    {snapshot.sizeLabel}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {statusVisuals ? (
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${statusVisuals.badgeClass}`}
                    >
                      <statusVisuals.icon className={statusVisuals.iconClass} />
                      {statusVisuals.label}
                    </span>
                  ) : null}

                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" />
                    Only the binary hash is retained for on-chain verification
                  </span>
                </div>

                {statusDescription ? (
                  <p className="max-w-xl text-sm text-muted-foreground">{statusDescription}</p>
                ) : null}

                {snapshot.error ? (
                  <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4" />
                    <span>{snapshot.error}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-center md:min-w-[200px]">
                <div className="flex h-56 w-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted text-sm font-medium text-muted-foreground shadow-inner">
                  <FileText className="mb-4 h-8 w-8 text-muted-foreground" />
                  Document preview
                </div>
              </div>
            </div>

              <div className="grid gap-6 px-8 py-10 md:grid-cols-2">
                {metaColumns?.map((items, columnIndex) => (
                  <div key={columnIndex} className="space-y-4">
                    {items.map(({ label, value, mono, copyField, copyValue, copyMessage }) => {
                      const isCopied = copyField ? copiedField === copyField : false;

                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between gap-2">
                            <span className={labelClass}>{label}</span>
                            <div className="flex items-center gap-2">
                              {copyMessage ? (
                                <div
                                  className={`transition-all duration-300 ${
                                    isCopied
                                      ? "translate-y-0 scale-100 opacity-100"
                                      : "-translate-y-1 scale-95 opacity-0"
                                  } pointer-events-none rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700`}
                                >
                                  {copyMessage}
                                </div>
                              ) : null}
                              {copyField && copyValue ? (
                                <Button
                                  aria-label={`Copy ${label.toLowerCase()}`}
                                  className="h-6 w-6"
                                  onClick={() => handleCopy(copyField, copyValue)}
                                  size="icon"
                                  type="button"
                                  variant="ghost"
                                >
                                  <Copy aria-hidden className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <div className={mono ? monoValueClass : defaultValueClass}>{value}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

            <div className="border-t border-border bg-muted/20 px-8 py-10">
              <Card className="w-full border border-dashed border-border/60 bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Update document</CardTitle>
                  <CardDescription>
                    Upload a revised notarized PDF to notarize a new on-chain version using the same wallet flow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-2 sm:max-w-xs">
                    <Label
                      htmlFor="document-update-version-input"
                      className="text-sm font-medium text-muted-foreground"
                    >
                      Document version
                    </Label>
                    <Input
                      id="document-update-version-input"
                      type="number"
                      inputMode="numeric"
                      min={MIN_VERSION}
                      max={MAX_VERSION}
                      step={1}
                      value={updateVersion}
                      onChange={(event) => {
                        const nextValue = Number.parseInt(event.target.value, 10);
                        setUpdateVersion(Number.isNaN(nextValue) ? MIN_VERSION : clampVersion(nextValue));
                      }}
                      onBlur={(event) => {
                        const nextValue = Number.parseInt(event.target.value, 10);
                        setUpdateVersion(Number.isNaN(nextValue) ? MIN_VERSION : clampVersion(nextValue));
                      }}
                      aria-describedby="document-update-version-helper"
                    />
                    <p id="document-update-version-helper" className="text-xs text-muted-foreground">
                      Applied to document updates. Accepts only whole numbers (e.g. 2).
                    </p>
                  </div>

                  <Label
                    htmlFor="document-update-input"
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={(event) => event.preventDefault()}
                    onDrop={onUpdateDrop}
                    className={cn(
                      "flex min-h-[210px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/40 px-6 py-10 text-center transition-colors",
                      updateEntries.length
                        ? "hover:border-primary/60"
                        : "hover:border-primary/80 hover:bg-muted/60",
                    )}
                  >
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold">{updateDropZoneLabel}</p>
                      <p className="text-sm text-muted-foreground">
                        Supported type: PDF (max 25 MB). Conversion runs automatically during upload.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(event) => {
                        event.preventDefault();
                        updateInputRef.current?.click();
                      }}
                    >
                      Browse PDF
                    </Button>
                  </Label>

                  <Input
                    ref={updateInputRef}
                    id="document-update-input"
                    type="file"
                    multiple
                    accept={ACCEPTED_TYPES.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      stageUpdateEntries(event.target.files);
                      event.target.value = "";
                    }}
                  />

                  {!!updateEntries.length && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-muted-foreground">
                          {updateEntries.length} update{updateEntries.length > 1 ? "s" : ""} processing
                        </p>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={clearAllUpdateEntries}>
                            Clear all
                          </Button>
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {updateEntries.map((entry) => (
                          <li
                            key={entry.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openUpdateEntryDetails(entry)}
                            onKeyDown={(event) => handleUpdateEntryKeyDown(event, entry)}
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
                                    Uploaded {new Date(entry.uploadedAt).toLocaleString()} · {formatBytes(entry.fileSize)}
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
                                  Checksum: <span className="font-mono">{entry.checksum ?? "Calculating..."}</span>
                                </p>
                                {entry.binFileName ? (
                                  <p className="break-all">
                                    Binary file: <span className="font-mono">{entry.binFileName}</span>
                                  </p>
                                ) : null}
                                <p className="break-all">
                                  Binary hash: <span className="font-mono">{entry.binHash ?? "Calculating..."}</span>
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

                              {entry.error ? <p className="text-xs text-destructive">{entry.error}</p> : null}
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="mt-1 h-8 w-8 text-muted-foreground transition hover:text-destructive"
                              onClick={(event) => {
                                event.stopPropagation();
                                clearUpdateEntry(entry.id);
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
            </div>
          </div>
        ) : (
          <div className="mt-16 flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-sm transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
            {loading ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                <h2 className="mt-6 text-xl font-semibold text-foreground">Fetching document details</h2>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  Retrieving notarization metadata directly from the Solana blockchain. This may take a few seconds.
                </p>
              </>
            ) : (
              <>
                <FileText className="h-10 w-10 text-muted-foreground" />
                <h2 className="mt-6 text-xl font-semibold text-foreground">Document details unavailable</h2>
                <p className="mt-3 max-w-md text-sm text-muted-foreground">
                  We couldn't find on-chain details for this identifier. Verify the link or open the document from the uploads page again.
                </p>
                {errorMessage ? (
                  <p className="mt-2 max-w-md text-sm text-destructive">{errorMessage}</p>
                ) : null}
                <Button asChild className="mt-6">
                  <Link to="/">Return to uploads</Link>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
