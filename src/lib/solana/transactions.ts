import {
  assertIsFullySignedTransaction,
  compileTransaction,
  createNoopSigner,
  createTransaction,
  getExplorerLink,
  transactionFromBase64,
  transactionToBase64,
  type Address,
  type Commitment,
  type FullySignedTransaction,
  type SolanaClient,
  type TransactionWithBlockhashLifetime,
} from "gill";
import { getAddMemoInstruction } from "gill/programs";

export type GillWalletAdapter = {
  address: Address<string>;
  signTransaction: (transactionBase64: string) => Promise<string>;
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
      // TODO: Swap this helper for your program's instruction builder (using your program ID) when ready.
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
  const transactionBase64 = transactionToBase64(compiledTransaction);
  const signedTransactionBase64 = await wallet.signTransaction(transactionBase64);
  const signedTransaction = transactionFromBase64(signedTransactionBase64);

  assertIsFullySignedTransaction(signedTransaction);

  // Vite build expects Solana lifetime metadata, so we merge it back in before sending.
  const sendableTransaction: FullySignedTransaction & TransactionWithBlockhashLifetime = {
    ...signedTransaction,
    lifetimeConstraint: compiledTransaction.lifetimeConstraint,
  };
  try {
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
  } catch (error) {
    throw enhanceSendError(error);
  }
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

function enhanceSendError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const isSimulationFailure = /transaction simulation failed/i.test(message);
  if (!isSimulationFailure) {
    return error instanceof Error ? error : new Error(message);
  }

  const logs = extractSimulationLogs(error);
  const guidance =
    "Transaction simulation failed. Ensure your wallet has enough SOL on the selected network and try again.";
  const detailedMessage = logs.length
    ? `${guidance}\nSimulation logs:\n${logs.join("\n")}`
    : guidance;

  const enhancedError = new Error(detailedMessage);
  if (error instanceof Error) {
    (enhancedError as { cause?: unknown }).cause = error;
  }
  return enhancedError;
}

function extractSimulationLogs(error: unknown): string[] {
  if (!error || typeof error !== "object") {
    return [];
  }

  const logsCandidate = (error as { logs?: unknown }).logs;
  if (Array.isArray(logsCandidate)) {
    return logsCandidate.filter((log): log is string => typeof log === "string");
  }

  const causeCandidate = (error as { cause?: unknown }).cause;
  if (causeCandidate) {
    const logs = extractSimulationLogs(causeCandidate);
    if (logs.length) {
      return logs;
    }
  }

  const valueCandidate = (error as { value?: unknown }).value;
  if (valueCandidate && typeof valueCandidate === "object") {
    const errCandidate = (valueCandidate as { err?: unknown; logs?: unknown }).logs;
    if (Array.isArray(errCandidate)) {
      return errCandidate.filter((log): log is string => typeof log === "string");
    }
  }

  return [];
}
