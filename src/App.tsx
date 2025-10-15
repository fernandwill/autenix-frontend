import { useCallback, useEffect, useMemo, useState, type KeyboardEventHandler } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "gill";

// Main application layout stitches together uploads, hash lookup, and Solana status.
import { FileUpload, type FileUploadDocumentChange } from "@/components/file-upload";
import { DocumentSummaryCard } from "@/components/document-summary-card";
import { SolanaTransactionPanel } from "@/components/solana-transaction-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { DocumentDetailPage } from "@/pages/document-detail-page";
import { DocumentUpdatePage } from "@/pages/document-update-page";
import { getSolanaClient } from "@/lib/solana/client";
import { buildExplorerUrl } from "@/lib/solana/explorer";
import { listNotarizationAccountsByNotary } from "@/lib/solana/notarization-account";
import { composeDocumentIdentifier } from "@/lib/upload-types";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

// HomePage combines upload, search, and wallet status workflows.
function HomePage() {
  const [localDocuments, setLocalDocuments] = useState<FileUploadDocumentChange[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { address } = useSolanaWallet();

  const {
    data: walletDocumentsData,
    isFetching: isFetchingWalletDocuments,
    isError: isWalletDocumentsError,
    error: walletDocumentsError,
    refetch: refetchWalletDocuments,
  } = useQuery({
    queryKey: ["wallet-notarized-documents", address],
    queryFn: async () => {
      if (!address) return [] as FileUploadDocumentChange[];

      const client = getSolanaClient();
      const notarizations = await listNotarizationAccountsByNotary({
        client,
        notary: address,
      });

      type SignatureLookupEntry = {
        accountAddress: string;
        signature: string | null;
        explorerUrl: string | null;
      };

      const signatures = await Promise.all(
        notarizations.map(async (item): Promise<SignatureLookupEntry> => {
          try {
            const { value } = await client.rpc
              .getSignaturesForAddress(item.accountAddress as Address<string>, { limit: 1 })
              .send();

            const signature = value?.[0]?.signature ?? null;
            return {
              accountAddress: item.accountAddress,
              signature,
              explorerUrl: signature ? buildExplorerUrl(client.urlOrMoniker, signature) : null,
            };
          } catch (error) {
            console.warn(
              `Failed to fetch transaction signatures for notarization account ${item.accountAddress}.`,
              error,
            );
            return {
              accountAddress: item.accountAddress,
              signature: null,
              explorerUrl: null,
            };
          }
        }),
      );

      const signatureLookup = new Map(
        signatures.map((entry) => [entry.accountAddress, entry] as const),
      );

      return notarizations.map((item) => {
        const documentIdentifier = composeDocumentIdentifier({
          notary: item.notary,
          hash: item.hash,
          version: item.version,
        });

        const signatureEntry = signatureLookup.get(item.accountAddress);

        const timestamp = Number.isFinite(item.timestamp)
          ? new Date(item.timestamp * 1000).toISOString()
          : new Date().toISOString();

        const normalizedName = item.documentName.replace(/\.bin$/i, ".pdf");

        return {
          id: documentIdentifier,
          fileName: normalizedName,
          timestamp,
          checksum: item.hash,
          binHash: item.hash,
          binFileName: item.documentName,
          version: item.version,
          transactionHash: signatureEntry?.signature ?? null,
          transactionUrl: signatureEntry?.explorerUrl ?? null,
          transactionStatus: "confirmed",
          notaryAddress: item.notary,
          documentIdentifier,
          error: null,
        } satisfies FileUploadDocumentChange;
      });
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  });

  const walletDocuments = useMemo(
    () => (address ? walletDocumentsData ?? [] : []),
    [address, walletDocumentsData],
  );
  const walletDocumentsErrorMessage = isWalletDocumentsError
    ? walletDocumentsError instanceof Error
      ? walletDocumentsError.message
      : "Failed to load notarized documents from the blockchain."
    : null;

  useEffect(() => {
    if (!address) return;
    if (!localDocuments.length) return;

    const existingIds = new Set(
      walletDocuments.map((document) => document.documentIdentifier).filter(Boolean) as string[],
    );

    const hasNewConfirmedDocument = localDocuments.some((document) => {
      if (!document.documentIdentifier) return false;
      if (document.transactionStatus !== "confirmed") return false;
      return !existingIds.has(document.documentIdentifier);
    });

    if (hasNewConfirmedDocument) {
      void refetchWalletDocuments();
    }
  }, [address, localDocuments, walletDocuments, refetchWalletDocuments]);

  const documents = useMemo(() => {
    const indexed = new Map<string, FileUploadDocumentChange>();

    walletDocuments.forEach((document) => {
      if (document.documentIdentifier) {
        indexed.set(document.documentIdentifier, document);
      }
    });

    const unresolved: FileUploadDocumentChange[] = [];

    localDocuments.forEach((document) => {
      const key = document.documentIdentifier;
      if (key) {
        const existing = indexed.get(key);
        indexed.set(key, existing ? { ...existing, ...document } : document);
      } else {
        unresolved.push(document);
      }
    });

    return [...indexed.values(), ...unresolved];
  }, [localDocuments, walletDocuments]);

  const hashLookup = useMemo(() => {
    const map = new Map<string, FileUploadDocumentChange>();

    documents.forEach((document) => {
      const register = (value?: string | null) => {
        if (!value) return;
        const normalized = value.trim();
        if (!normalized) return;
        map.set(normalized, document);
        map.set(normalized.toLowerCase(), document);
      };

      register(document.binHash);
      register(document.transactionHash);
    });

    return map;
  }, [documents]);

  const handleSearch = useCallback(() => {
    const rawQuery = searchValue.trim();
    if (!rawQuery) {
      setSearchError("Enter a binary hash or transaction hash to search.");
      return;
    }

    const normalizedQuery = rawQuery.toLowerCase();
    const match = hashLookup.get(rawQuery) ?? hashLookup.get(normalizedQuery);

    if (!match) {
      setSearchError(
        "No document matches that hash. Upload the file first or check the hash and try again.",
      );
      return;
    }

    setSearchError(null);
    setSearchValue("");
    if (!match.documentIdentifier) {
      setSearchError("The selected document does not have on-chain details yet. Try again after notarization completes.");
      return;
    }

    const searchParams = new URLSearchParams();
    if (match.transactionHash) {
      searchParams.set("signature", match.transactionHash);
    }
    if (match.transactionUrl) {
      searchParams.set("explorer", match.transactionUrl);
    }

    const search = searchParams.toString();
    navigate({
      pathname: `/documents/${encodeURIComponent(match.documentIdentifier)}`,
      search: search ? `?${search}` : undefined,
    });
  }, [hashLookup, navigate, searchValue]);

  const handleInputChange = useCallback((value: string) => {
    setSearchValue(value);
    if (searchError) {
      setSearchError(null);
    }
  }, [searchError]);

  const handleInputKeyDown = useCallback<KeyboardEventHandler<HTMLInputElement>>(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSearch();
      }
    },
    [handleSearch],
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-muted">
      <div className="absolute right-4 top-4 flex items-start gap-3">
        <SolanaTransactionPanel />
        <ThemeToggle />
      </div>
      <main className="flex flex-1 justify-center px-4 pb-12 pt-28 sm:pt-32">
        <div className="flex w-full max-w-5xl flex-col gap-8">
          {/* File uploader remains the primary document ingestion path. */}
          <FileUpload onDocumentsChange={setLocalDocuments} />
          {/* Divider offers a visual cue before the hash lookup path. */}
          <div className="flex items-center gap-4 text-xs font-semibold uppercase text-muted-foreground">
            <div className="h-px flex-1 bg-muted-foreground/40" aria-hidden="true" />
            <span aria-hidden="true">Or</span>
            <div className="h-px flex-1 bg-muted-foreground/40" aria-hidden="true" />
          </div>
          {/* Simple search control lets users query notarized artifacts by hash. */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Input
                id="document-hash-input"
                placeholder="Enter document hash..."
                value={searchValue}
                onChange={(event) => handleInputChange(event.target.value)}
                onKeyDown={handleInputKeyDown}
                className="sm:flex-1"
                aria-label="Document hash search input"
                aria-describedby={searchError ? "document-hash-error" : undefined}
              />
              <Button type="button" className="sm:self-start" onClick={handleSearch}>
                Search
              </Button>
            </div>
            {searchError ? (
              <p id="document-hash-error" className="mt-2 text-sm text-destructive">
                {searchError}
              </p>
            ) : null}
          </div>
          <DocumentSummaryCard
            documents={documents}
            isLoading={isFetchingWalletDocuments}
            error={walletDocumentsErrorMessage}
            walletAddress={address}
          />
        </div>
      </main>
    </div>
  );
}

// App wires the router to the top-level route structure.
function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/documents/:documentId/update" element={<DocumentUpdatePage />} />
      <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
    </Routes>
  );
}

export default App;
