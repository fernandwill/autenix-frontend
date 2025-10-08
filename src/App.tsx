import { FileUpload } from "@/components/file-upload";
import { SolanaTransactionPanel } from "@/components/solana-transaction-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function App() {
  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-6">
            <FileUpload />
            <div className="flex items-center gap-4 text-xs font-semibold uppercase text-muted-foreground">
              <div className="h-px flex-1 bg-muted-foreground/40" aria-hidden="true" />
              <span aria-hidden="true">Or</span>
              <div className="h-px flex-1 bg-muted-foreground/40" aria-hidden="true" />
            </div>
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <Label htmlFor="document-hash-input" className="text-sm font-medium text-muted-foreground">
                Enter document hash...
              </Label>
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
          <SolanaTransactionPanel />
        </div>
      </main>
    </div>
  );
}

export default App;
