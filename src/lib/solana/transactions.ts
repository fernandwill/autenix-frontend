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

  const simulationDetails = extractSimulationErrorDetails(error);
  if (simulationDetails) {
    details.push(`Simulation error details: ${simulationDetails}`);
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
  return extractSimulationMessageInternal(error, new Set());
}

function extractSimulationMessageInternal(error: unknown, visited: Set<unknown>): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    const transactionMessage = extractSimulationMessageInternal(
      (error as { transactionError?: unknown }).transactionError,
      visited,
    );
    if (transactionMessage) {
      return transactionMessage;
    }

    const causeMessage = extractSimulationMessageInternal(error.cause, visited);
    if (causeMessage) {
      return causeMessage;
    }

    return error.message;
  }

  if (typeof error !== "object") {
    return null;
  }

  if (visited.has(error)) {
    return null;
  }
  visited.add(error);

  const messageCandidate = (error as { message?: unknown }).message;
  const message = extractSimulationMessageInternal(messageCandidate, visited);
  if (message) {
    return message;
  }

  const transactionErrorCandidate = (error as { transactionError?: unknown }).transactionError;
  const transactionMessage = extractSimulationMessageInternal(transactionErrorCandidate, visited);
  if (transactionMessage) {
    return transactionMessage;
  }

  const errCandidate = (error as { err?: unknown }).err;
  const errMessage = formatSimulationError(errCandidate);
  if (errMessage) {
    return errMessage;
  }

  const dataCandidate = (error as { data?: unknown }).data;
  const dataMessage = extractSimulationMessageInternal(dataCandidate, visited);
  if (dataMessage) {
    return dataMessage;
  }

  const valueCandidate = (error as { value?: unknown }).value;
  const valueMessage = extractSimulationMessageInternal(valueCandidate, visited);
  if (valueMessage) {
    return valueMessage;
  }

  const causeCandidate = (error as { cause?: unknown }).cause;
  if (causeCandidate) {
    return extractSimulationMessageInternal(causeCandidate, visited);
  }

  return null;
}

function extractSimulationLogs(error: unknown): string[] {
  const logs = new Set<string>();
  collectSimulationLogs(error, logs, new Set());
  return Array.from(logs);
}

function collectSimulationLogs(value: unknown, logs: Set<string>, visited: Set<unknown>) {
  if (!value || typeof value !== "object") {
    return;
  }

  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  const logsCandidate = (value as { logs?: unknown }).logs;
  if (Array.isArray(logsCandidate)) {
    logsCandidate.forEach((log) => {
      if (typeof log === "string") {
        logs.add(log);
      }
    });
  }

  const transactionErrorCandidate = (value as { transactionError?: unknown }).transactionError;
  if (transactionErrorCandidate) {
    collectSimulationLogs(transactionErrorCandidate, logs, visited);
  }

  const dataCandidate = (value as { data?: unknown }).data;
  if (dataCandidate) {
    collectSimulationLogs(dataCandidate, logs, visited);
  }

  const valueCandidate = (value as { value?: unknown }).value;
  if (valueCandidate) {
    collectSimulationLogs(valueCandidate, logs, visited);
  }

  const causeCandidate = (value as { cause?: unknown }).cause;
  if (causeCandidate) {
    collectSimulationLogs(causeCandidate, logs, visited);
  }
}

function extractSimulationErrorDetails(error: unknown): string | null {
  return extractSimulationErrorDetailsInternal(error, new Set());
}

function extractSimulationErrorDetailsInternal(error: unknown, visited: Set<unknown>): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if (visited.has(error)) {
    return null;
  }
  visited.add(error);

  const errCandidate = (error as { err?: unknown }).err;
  const errMessage = formatSimulationError(errCandidate);
  if (errMessage) {
    return errMessage;
  }

  const transactionErrorCandidate = (error as { transactionError?: unknown }).transactionError;
  const transactionMessage = extractSimulationErrorDetailsInternal(transactionErrorCandidate, visited);
  if (transactionMessage) {
    return transactionMessage;
  }

  const dataCandidate = (error as { data?: unknown }).data;
  const dataMessage = extractSimulationErrorDetailsInternal(dataCandidate, visited);
  if (dataMessage) {
    return dataMessage;
  }

  const valueCandidate = (error as { value?: unknown }).value;
  const valueMessage = extractSimulationErrorDetailsInternal(valueCandidate, visited);
  if (valueMessage) {
    return valueMessage;
  }

  const causeCandidate = (error as { cause?: unknown }).cause;
  if (causeCandidate) {
    return extractSimulationErrorDetailsInternal(causeCandidate, visited);
  }

  return null;
}

function formatSimulationError(err: unknown): string | null {
  if (err == null) {
    return null;
  }

  if (typeof err === "string") {
    return err;
  }

  if (typeof err === "number") {
    return err.toString();
  }

  if (Array.isArray(err)) {
    return err
      .map((entry) => formatSimulationError(entry))
      .filter((entry): entry is string => Boolean(entry))
      .join(", ");
  }

  if (typeof err === "object") {
    if ("InstructionError" in err) {
      const instructionError = (err as { InstructionError?: unknown }).InstructionError;
      if (Array.isArray(instructionError) && instructionError.length >= 2) {
        const [index, detail] = instructionError;
        const detailMessage = formatSimulationError(detail);
        const prefix = typeof index === "number" ? `instruction ${index}` : "instruction";
        if (detailMessage) {
          return `Error processing ${prefix}: ${detailMessage}`;
        }
        return `Error processing ${prefix}`;
      }
    }

    if ("Custom" in err && typeof (err as { Custom?: unknown }).Custom === "number") {
      const code = (err as { Custom: number }).Custom;
      return `custom program error: 0x${code.toString(16)}`;
    }

    if ("message" in err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }

    try {
      return JSON.stringify(err);
    } catch (jsonError) {
      console.warn("Unable to stringify simulation error details.", jsonError);
    }
  }

  return null;
}
