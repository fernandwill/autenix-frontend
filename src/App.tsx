import { useState } from "react";
import { Route, Routes } from "react-router-dom";

// Main application layout stitches together uploads, hash lookup, and Solana status.
import { FileUpload, type FileUploadDocumentChange } from "@/components/file-upload";
import { DocumentSummaryCard } from "@/components/document-summary-card";
import { SolanaTransactionPanel } from "@/components/solana-transaction-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { DocumentDetailPage } from "@/pages/document-detail-page";

// HomePage combines upload, search, and wallet status workflows.
function HomePage() {
  const [documents, setDocuments] = useState<FileUploadDocumentChange[]>([]);

  return (
    <div className="relative flex min-h-screen flex-col bg-muted">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-6">
            {/* File uploader remains the primary document ingestion path. */}
            <FileUpload onDocumentsChange={setDocuments} />
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
                  className="sm:flex-1"
                  aria-label="Document hash search input"
                />
                <Button type="button" className="sm:self-start">
                  Search
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <SolanaTransactionPanel />
            <DocumentSummaryCard documents={documents} />
          </div>
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
      <Route path="/documents/:entryId" element={<DocumentDetailPage />} />
    </Routes>
  );
}

export default App;
