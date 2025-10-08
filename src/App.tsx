import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { FileUpload } from "@/components/file-upload";

function App() {
  return (
    <div className="min-h-screen bg-muted">
      <header className="flex items-center justify-end px-10 py-6">
        <ConnectWalletButton />
      </header>
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 pb-12">
        <FileUpload />
      </main>
    </div>
  );
}

export default App;