import {
  createNoopSigner,
  createTransaction,
  getExplorerLink,
  type Address,
  type Commitment,
  type SolanaClient,
  type Transaction,
} from "gill";
import { getAddMemoInstruction } from "gill/programs";
import {
  assertIsFullySignedTransaction,
  compileTransaction,
  type FullySignedTransaction,
  type TransactionWithBlockhashLifetime,
} from "@solana/transactions";

export type GillWalletAdapter = {
  address: Address<string>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
};

export type SendMemoTransactionConfig = {
  client: SolanaClient;
  wallet: GillWalletAdapter;
  memo: string;
  commitment?: Commitment;
};

export type SendMemoTransactionResult = {
  signature: string;
  explorerUrl: string;
};

/**
 * Construct, sign, and submit a memo transaction using the Gill SDK.
 */
export async function sendMemoTransaction({
  client,
  wallet,
  memo,
  commitment = "confirmed",
}: SendMemoTransactionConfig): Promise<SendMemoTransactionResult> {
  if (!memo.trim()) {
    throw new Error("A memo message is required before submitting a transaction.");
  }

  const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();

  const transactionMessage = createTransaction({
    version: "legacy",
    feePayer: createNoopSigner(wallet.address),
    instructions: [
      getAddMemoInstruction({
        memo,
      }),
    ],
    latestBlockhash,
    computeUnitLimit: 50_000,
    computeUnitPrice: 1_000,
  });

  // Compile a transaction message into the wire-ready transaction format.
  const compiledTransaction = compileTransaction(transactionMessage);
  const signedTransaction = await wallet.signTransaction(compiledTransaction);
  assertIsFullySignedTransaction(signedTransaction);
  // Vite build expects Solana lifetime metadata, so we merge it back in before sending.
  const sendableTransaction: FullySignedTransaction & TransactionWithBlockhashLifetime = {
    ...signedTransaction,
    lifetimeConstraint: compiledTransaction.lifetimeConstraint,
  };
  const signature = await client.sendAndConfirmTransaction(sendableTransaction, {
    commitment,
  });

  return {
    signature,
    explorerUrl: getExplorerLink({
      cluster: inferClusterFromUrl(client.urlOrMoniker),
      transaction: signature,
    }),
  };
}

function inferClusterFromUrl(
  urlOrMoniker: SolanaClient["urlOrMoniker"],
): "devnet" | "mainnet" | "testnet" | "localnet" | "mainnet-beta" {
  const normalized = (typeof urlOrMoniker === "string" ? urlOrMoniker : urlOrMoniker.toString()).toLowerCase();

  if (normalized.includes("devnet")) return "devnet";
  if (normalized.includes("testnet")) return "testnet";
  if (normalized.includes("local")) return "localnet";
  if (normalized.includes("mainnet")) return "mainnet";

  return "mainnet-beta";
}
