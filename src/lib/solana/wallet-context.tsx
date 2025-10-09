/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SolanaWindowProvider } from "@/types/solana";

interface SolanaWalletContextValue {
  provider: SolanaWindowProvider | null;
  address: string | null;
  isConnecting: boolean;
  connectError: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: SolanaWindowProvider["signTransaction"] | null;
}

const SolanaWalletContext = createContext<SolanaWalletContextValue | undefined>(undefined);

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<SolanaWindowProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProvider(window.solana ?? null);
  }, []);

  useEffect(() => {
    if (!provider?.on) return;

    const handleDisconnect = () => {
      setAddress(null);
    };

    provider.on("disconnect", handleDisconnect);
    return () => {
      provider.off?.("disconnect", handleDisconnect);
    };
  }, [provider]);

  const connect = useCallback(async () => {
    setConnectError(null);
    if (!provider) {
      setConnectError(
        "No Solana wallet detected. Install Phantom or another Wallet Standard provider.",
      );
      return;
    }

    setIsConnecting(true);
    try {
      const result = await provider.connect({ onlyIfTrusted: false });
      setAddress(result.publicKey.toBase58());
    } catch (error) {
      if (error instanceof Error) {
        setConnectError(error.message);
      } else {
        setConnectError("Unable to connect to the Solana wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const disconnect = useCallback(async () => {
    setConnectError(null);
    if (!provider) return;

    try {
      await provider.disconnect?.();
    } catch (error) {
      console.warn("Failed to disconnect Solana wallet.", error);
    } finally {
      setAddress(null);
    }
  }, [provider]);

  const signTransaction = useMemo(() => {
    if (!provider?.signTransaction) return null;
    return provider.signTransaction.bind(provider);
  }, [provider]);

  const value = useMemo(
    () => ({
      provider,
      address,
      isConnecting,
      connectError,
      connect,
      disconnect,
      signTransaction,
    }),
    [provider, address, isConnecting, connectError, connect, disconnect, signTransaction],
  );

  return <SolanaWalletContext.Provider value={value}>{children}</SolanaWalletContext.Provider>;
}

export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext);
  if (!context) {
    throw new Error("useSolanaWallet must be used within a SolanaWalletProvider");
  }
  return context;
}
