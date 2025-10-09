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

import { VersionedTransaction } from "@solana/web3.js";

import type { SolanaWindowProvider } from "@/types/solana";

interface SolanaWalletContextValue {
  provider: SolanaWindowProvider | null;
  address: string | null;
  isConnecting: boolean;
  connectError: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: ((transactionBase64: string) => Promise<string>) | null;
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

    return async (transactionBase64: string) => {
      const serializedTransaction = base64ToUint8Array(transactionBase64);
      const transaction = VersionedTransaction.deserialize(serializedTransaction);
      const signed = await provider.signTransaction!(transaction);
      const signedBytes = signed instanceof Uint8Array ? signed : signed.serialize();
      return uint8ArrayToBase64(signedBytes);
    };
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

function base64ToUint8Array(base64: string) {
  if (typeof globalThis.Buffer !== "undefined") {
    return Uint8Array.from(globalThis.Buffer.from(base64, "base64"));
  }

  if (typeof atob !== "function") {
    throw new Error("Unable to decode base64 transaction payload in this environment.");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array) {
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(bytes).toString("base64");
  }

  if (typeof btoa !== "function") {
    throw new Error("Unable to encode base64 transaction payload in this environment.");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
