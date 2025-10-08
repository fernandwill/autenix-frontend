import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { FileUpload } from "@/components/file-upload";
import { SolanaTransactionPanel } from "@/components/solana-transaction-panel";

function App() {
  return (
    <div className="min-h-screen bg-muted">
      <header className="flex items-center justify-end px-10 py-6">
        <ConnectWalletButton />
      </header>
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 pb-12">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <FileUpload />
          <SolanaTransactionPanel />
        </div>
      </main>
    </div>
  );
}

export default App;