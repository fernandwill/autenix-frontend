import {
  createNoopSigner,
  createTransaction,
  getAddMemoInstruction,
  getExplorerLink,
  type Commitment,
  type SolanaClient,
  type Transaction,
} from "gill";

export type GillWalletAdapter = {
  address: string;
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

  const transaction = createTransaction({
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

  const compiled = transaction.compileToLegacyTransaction();
  const signedTransaction = await wallet.signTransaction(compiled);
  const signature = await client.sendAndConfirmTransaction(signedTransaction, {
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
