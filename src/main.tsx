import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { wagmiConfig } from "@/lib/wagmi";
import { SolanaWalletProvider } from "@/lib/solana/wallet-context";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SolanaWalletProvider>
            <App />
          </SolanaWalletProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);