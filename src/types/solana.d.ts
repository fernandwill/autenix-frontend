import type { Transaction } from "gill";

type PhantomPublicKey = {
  toBase58(): string;
};

type PhantomConnectResponse = {
  publicKey: PhantomPublicKey;
};

type PhantomEvent = "connect" | "disconnect" | "accountChanged";

type PhantomEventHandler = (args?: unknown) => void;

export interface SolanaWindowProvider {
  isPhantom?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<PhantomConnectResponse>;
  disconnect?: () => Promise<void>;
  publicKey?: PhantomPublicKey;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  on?: (event: PhantomEvent, handler: PhantomEventHandler) => void;
  off?: (event: PhantomEvent, handler: PhantomEventHandler) => void;
}

declare global {
  interface Window {
    solana?: SolanaWindowProvider;
  }
}

export {};
