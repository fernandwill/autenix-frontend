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

import {
  documentHashFromHex,
  ensureU8,
  findNotarizationPda,
  getCreateNotarizationInstruction,
} from "@/lib/solana/notarization-program";

export type GillWalletAdapter = {
  address: Address<string>;
  signTransaction: (transactionBase64: string) => Promise<string>;
};

export type SubmitNotarizationTransactionConfig = {
  client: SolanaClient;
  wallet: GillWalletAdapter;
  documentHashHex: string;
  documentName: string;
  hashVersion?: number;
  version?: number;
  commitment?: Commitment;
};

export type SubmitNotarizationTransactionResult = {
  signature: string;
  explorerUrl: string;
};

/**
 * Construct, sign, and submit a notarization transaction using the deployed program.
 */
export async function submitNotarizationTransaction({
  client,
  wallet,
  documentHashHex,
  documentName,
  hashVersion = 1,
  version = 1,
  commitment = "confirmed",
}: SubmitNotarizationTransactionConfig): Promise<SubmitNotarizationTransactionResult> {
  const documentHash = documentHashFromHex(documentHashHex);
  const normalizedHashVersion = ensureU8(hashVersion, "hashVersion");
  const normalizedVersion = ensureU8(version, "version");

  const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();
  const [notarizationAddress] = await findNotarizationPda({
    documentHash,
    notary: wallet.address,
  });

  const instruction = getCreateNotarizationInstruction({
    documentHash,
    documentName,
    hashVersion: normalizedHashVersion,
    version: normalizedVersion,
    notarizationAccount: notarizationAddress,
    notary: wallet.address,
  });

  const transactionMessage = createTransaction({
    version: "legacy",
    feePayer: createNoopSigner(wallet.address),
    instructions: [instruction],
    latestBlockhash,
    computeUnitLimit: 200_000,
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
  const simulationMessage = extractSimulationMessage(error);
  const guidance =
    "Transaction simulation failed. Ensure your wallet has enough SOL on the selected network and try again.";
  const details: string[] = [guidance];

  if (simulationMessage && !simulationMessage.toLowerCase().includes(guidance.toLowerCase())) {
    details.push(`RPC message: ${simulationMessage}`);
  }

  if (logs.length) {
    details.push(`Simulation logs:\n${logs.join("\n")}`);
  }

  const detailedMessage = details.join("\n\n");

  const enhancedError = new Error(detailedMessage);
  if (error instanceof Error) {
    (enhancedError as { cause?: unknown }).cause = error;
  }
  return enhancedError;
}

function extractSimulationMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    const messageCandidate = (error as { message?: unknown }).message;
    if (typeof messageCandidate === "string") {
      return messageCandidate;
    }

    const causeCandidate = (error as { cause?: unknown }).cause;
    const causeMessage = extractSimulationMessage(causeCandidate);
    if (causeMessage) {
      return causeMessage;
    }

    const valueCandidate = (error as { value?: unknown }).value;
    if (valueCandidate) {
      return extractSimulationMessage(valueCandidate);
    }
  }

  return null;
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
