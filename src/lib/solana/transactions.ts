import {
  assertIsFullySignedTransaction,
  compileTransaction,
  createNoopSigner,
  createTransaction,
  getExplorerLink,
  getSignatureFromTransaction,
  transactionFromBase64,
  transactionToBase64,
  type Address,
  type Commitment,
  type Signature,
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
  const signature = getSignatureFromTransaction(signedTransaction);
  const explorerUrl = getExplorerLink({
    cluster: inferClusterFromUrl(client.urlOrMoniker),
    transaction: signature,
  });

  try {
    await client.sendAndConfirmTransaction(sendableTransaction, {
      commitment,
      skipPreflight: true,
    });

    return { signature, explorerUrl };
  } catch (error) {
    const confirmed = await confirmTransactionAfterSendFailure({
      client,
      commitment,
      signature,
    });

    if (confirmed) {
      return { signature, explorerUrl };
    }

    throw enhanceSendError(error);
  }
}

type ConfirmTransactionAfterSendFailureConfig = {
  client: SolanaClient;
  signature: string;
  commitment: Commitment;
  maxAttempts?: number;
};

async function confirmTransactionAfterSendFailure({
  client,
  signature: signatureString,
  commitment,
  maxAttempts = 5,
}: ConfirmTransactionAfterSendFailureConfig): Promise<boolean> {
  let attempt = 0;
  let delayMs = 500;
  while (attempt < maxAttempts) {
    try {
      const signature = signatureString as unknown as Signature;
      const { value } = await client.rpc
        .getSignatureStatuses([signature], { searchTransactionHistory: true })
        .send();
      const status = value?.[0] ?? null;

      if (hasSufficientConfirmation(status, commitment)) {
        return true;
      }

      if (status?.err) {
        return false;
      }
    } catch (statusError) {
      console.warn("Failed to query transaction status after send error.", statusError);
    }

    await wait(delayMs);
    delayMs = Math.min(delayMs * 2, 4_000);
    attempt += 1;
  }

  return false;
}

type SignatureStatusLike = {
  confirmations?: number | bigint | null;
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  err?: unknown;
} | null;

function hasSufficientConfirmation(status: SignatureStatusLike, commitment: Commitment): boolean {
  if (!status || status.err) {
    return false;
  }

  const requiredLevel = normalizeCommitment(commitment);
  const actualLevel = deriveConfirmationLevel(status);

  return confirmationLevelToPriority(actualLevel) >= confirmationLevelToPriority(requiredLevel);
}

type ConfirmationLevel = "processed" | "confirmed" | "finalized";

function deriveConfirmationLevel(status: Exclude<SignatureStatusLike, null>): ConfirmationLevel {
  if (status.confirmationStatus) {
    return status.confirmationStatus;
  }

  if (status.confirmations == null) {
    return "finalized";
  }

  const confirmations =
    typeof status.confirmations === "bigint"
      ? Number(status.confirmations)
      : status.confirmations;

  return confirmations > 0 ? "confirmed" : "processed";
}

function normalizeCommitment(commitment: Commitment): ConfirmationLevel {
  switch (commitment) {
    case "processed":
      return "processed";
    case "finalized":
      return "finalized";
    case "confirmed":
    default:
      return "confirmed";
  }
}

function confirmationLevelToPriority(level: ConfirmationLevel): number {
  switch (level) {
    case "processed":
      return 0;
    case "confirmed":
      return 1;
    case "finalized":
      return 2;
    default:
      return 1;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const normalizedSimulationMessage = simulationMessage
    ? normalizeSimulationMessage(simulationMessage)
    : null;
  const simulationDetails = extractSimulationErrorDetails(error);
  const guidance = deriveSimulationGuidance({
    simulationMessage: normalizedSimulationMessage ?? simulationMessage,
    simulationDetails,
    logs,
  });
  const details: string[] = [guidance];

  const rpcMessageToReport = normalizedSimulationMessage ?? simulationMessage;
  if (rpcMessageToReport && !guidance.toLowerCase().includes(rpcMessageToReport.toLowerCase())) {
    details.push(`RPC message: ${rpcMessageToReport}`);
  }

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

type SimulationGuidanceContext = {
  simulationMessage: string | null | undefined;
  simulationDetails: string | null;
  logs: string[];
};

function deriveSimulationGuidance({ simulationMessage, simulationDetails, logs }: SimulationGuidanceContext): string {
  const haystack = [simulationMessage, simulationDetails, ...logs]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (/insufficient funds|insufficient lamports/.test(haystack)) {
    return "Transaction simulation failed because the wallet does not have enough SOL to cover rent or fees on the selected network.";
  }

  const customProgramErrorCode =
    extractCustomProgramErrorCode(simulationMessage) ?? extractCustomProgramErrorCode(simulationDetails);
  if (customProgramErrorCode != null) {
    return `Transaction simulation failed with custom program error #${customProgramErrorCode}. Review the RPC message and simulation logs for more details.`;
  }

  return "Transaction simulation failed while executing the notarization program. Review the RPC message and simulation logs for more information.";
}

function normalizeSimulationMessage(message: string): string {
  const customProgramErrorCode = extractCustomProgramErrorCode(message);
  if (customProgramErrorCode == null) {
    return message;
  }

  const hexCode = `0x${customProgramErrorCode.toString(16)}`;
  const decimalCode = `#${customProgramErrorCode}`;
  const includesHex = message.toLowerCase().includes(hexCode.toLowerCase());
  const includesDecimal = message.includes(decimalCode);

  if (includesHex && includesDecimal) {
    return message;
  }

  if (includesDecimal) {
    return `${message} (${hexCode})`;
  }

  if (includesHex) {
    return `${message} (${decimalCode})`;
  }

  return `custom program error: ${decimalCode} (${hexCode})`;
}

function extractCustomProgramErrorCode(message: string | null | undefined): number | null {
  if (!message) {
    return null;
  }

  const match = /custom program error:\s*(?:#([0-9]+)|0x([0-9a-f]+))/i.exec(message);
  if (!match) {
    return null;
  }

  if (match[1]) {
    return Number.parseInt(match[1], 10);
  }

  if (match[2]) {
    return Number.parseInt(match[2], 16);
  }

  return null;
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
