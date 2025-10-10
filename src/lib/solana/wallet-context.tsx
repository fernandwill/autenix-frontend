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

import { assertIsFullySignedTransaction, transactionFromBase64, transactionToBase64, type Transaction as GillTransaction } from "gill";
import { getBase58Codec } from "@solana/codecs-strings";

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
const base58Codec = getBase58Codec();

// Provide wallet connection state and helpers to descendant components.
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

  // Attempt to connect to the detected Wallet Standard provider.
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

  // Gracefully disconnect from the wallet when users opt out.
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

  // Adapt Wallet Standard transaction signing outputs into Gill's base64 expectations.
  const signTransaction = useMemo(() => {
    if (!provider?.signTransaction) return null;

    return async (transactionBase64: string) => {
      const transaction = transactionFromBase64(transactionBase64);
      const { legacyTransaction, getSignedTransaction } = createLegacyTransactionAdapter(transaction);

      const signed = await provider.signTransaction!(legacyTransaction as unknown);

      if (signed instanceof Uint8Array) {
        return uint8ArrayToBase64(signed);
      }

      if (typeof signed === "object" && signed !== null) {
        const maybeSerialize = (signed as { serialize?: () => Uint8Array | number[] }).serialize;
        if (typeof maybeSerialize === "function") {
          const serialized = maybeSerialize.call(signed);
          const bytes = serialized instanceof Uint8Array ? serialized : new Uint8Array(serialized);
          return uint8ArrayToBase64(bytes);
        }
      }

      const signedTransaction = getSignedTransaction();
      assertIsFullySignedTransaction(signedTransaction);
      return transactionToBase64(signedTransaction);
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

// Convenient hook for consuming the wallet context with proper provider enforcement.
export function useSolanaWallet() {
  const context = useContext(SolanaWalletContext);
  if (!context) {
    throw new Error("useSolanaWallet must be used within a SolanaWalletProvider");
  }
  return context;
}

// Encode Uint8Array payloads into base64 regardless of runtime environment.
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

// Decode base64 strings into Uint8Arrays across browser and Node runtimes.
function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof globalThis.Buffer !== "undefined") {
    return new Uint8Array(globalThis.Buffer.from(base64, "base64"));
  }

  if (typeof atob !== "function") {
    throw new Error("Unable to decode base64 transaction payload in this environment.");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

type LegacyTransactionAdapter = {
  serialize: (options?: { requireAllSignatures?: boolean; verifySignatures?: boolean }) => Uint8Array;
  serializeMessage: () => Uint8Array;
  addSignature: (publicKey: { toBase58?: () => string; toBytes?: () => Uint8Array }, signature: Uint8Array | number[]) => void;
  signatures: Array<{
    publicKey: { toBase58: () => string; toBytes: () => Uint8Array };
    signature: Uint8Array | null;
  }>;
  feePayer?: { toBase58: () => string; toBytes: () => Uint8Array };
};

// Shim Gill transactions into the LegacyTransaction shape expected by wallet extensions.
function createLegacyTransactionAdapter(transaction: GillTransaction) {
  const messageBytes = new Uint8Array(transaction.messageBytes);
  const signatureEntries = new Map<string, Uint8Array | null>(
    Object.entries(transaction.signatures ?? {}).map(([address, signature]) => [
      address,
      signature ? new Uint8Array(signature) : null,
    ]),
  );

  const publicKeyCache = new Map<string, { toBase58: () => string; toBytes: () => Uint8Array }>();

  // Lazily construct PublicKey-like wrappers so wallet adapters accept Gill addresses.
  const getPublicKeyShim = (address: string) => {
    if (publicKeyCache.has(address)) {
      return publicKeyCache.get(address)!;
    }
    const shim = {
      toBase58: () => address,
      toBytes: () => new Uint8Array(base58Codec.encode(address)),
    };
    publicKeyCache.set(address, shim);
    return shim;
  };

  // Convert wallet signatures into Uint8Array form for consistent handling.
  const normalizeSignature = (signature: Uint8Array | number[]) =>
    signature instanceof Uint8Array ? signature : new Uint8Array(signature);

  // Derive a base58 address from the wallet-provided public key object.
  const normalizePublicKey = (publicKey: { toBase58?: () => string; toBytes?: () => Uint8Array }) => {
    if (typeof publicKey?.toBase58 === "function") {
      return publicKey.toBase58();
    }
    if (typeof publicKey?.toBytes === "function") {
      return base58Codec.decode(publicKey.toBytes());
    }
    throw new Error("Unable to normalize public key returned by wallet extension.");
  };

  // Format the collected signature map into the legacy signature array schema.
  const toLegacySignaturesArray = () =>
    Array.from(signatureEntries.entries()).map(([address, signature]) => ({
      publicKey: getPublicKeyShim(address),
      signature,
    }));

  const legacyTransaction: LegacyTransactionAdapter = {
    serializeMessage: () => messageBytes,
    serialize: () => serializeLegacyTransaction(),
    addSignature: (publicKey, signature) => {
      const address = normalizePublicKey(publicKey);
      signatureEntries.set(address, normalizeSignature(signature));
    },
    get signatures() {
      return toLegacySignaturesArray();
    },
    set signatures(value) {
      signatureEntries.clear();
      value.forEach(({ publicKey, signature }) => {
        const address = normalizePublicKey(publicKey);
        signatureEntries.set(address, signature ? normalizeSignature(signature) : null);
      });
    },
    feePayer: (() => {
      const first = signatureEntries.keys().next().value as string | undefined;
      return first ? getPublicKeyShim(first) : undefined;
    })(),
  };

  // Reconstruct a Gill transaction object that reflects any mutations from the wallet.
  const getSignedTransaction = (): GillTransaction => ({
    messageBytes: transaction.messageBytes,
    signatures: Object.fromEntries(signatureEntries) as GillTransaction["signatures"],
  });

  // Serialize the mutated signatures into the binary format wallet adapters expect.
  const serializeLegacyTransaction = () => {
    const signedTransaction = getSignedTransaction();
    const base64 = transactionToBase64(signedTransaction);
    return base64ToUint8Array(base64);
  };

  return {
    legacyTransaction,
    getSignedTransaction,
  };
}
