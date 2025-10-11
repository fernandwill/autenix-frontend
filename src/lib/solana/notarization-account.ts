import { assertAccountExists, fetchEncodedAccount } from "@solana/accounts";
import { getAddressDecoder } from "@solana/addresses";
import type { Address, SolanaClient } from "gill";

import {
  documentHashFromHex,
  ensureU8,
  findNotarizationPda,
  NOTARIZATION_PROGRAM_ID,
} from "@/lib/solana/notarization-program";

const ACCOUNT_DISCRIMINATOR_LENGTH = 8;
const HASH_LENGTH = 32;
const PUBLIC_KEY_LENGTH = 32;
const TIMESTAMP_BYTE_LENGTH = 8;
const VERSION_BYTE_LENGTH = 1;
const LENGTH_PREFIX_BYTE_LENGTH = 4;
const NOTARY_OFFSET = ACCOUNT_DISCRIMINATOR_LENGTH + HASH_LENGTH;

const textDecoder = new TextDecoder();
const addressDecoder = getAddressDecoder();
const decodeBase64ToBytes = (value: string): Uint8Array => {
  if (typeof globalThis.Buffer !== "undefined") {
    return Uint8Array.from(globalThis.Buffer.from(value, "base64"));
  }

  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  throw new Error("Base64 decoding is not supported in this environment.");
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export type NotarizationAccountDetails = {
  hash: string;
  notary: string;
  timestamp: number;
  version: number;
  documentName: string;
  bump: number;
  hashVersion: number;
  additional: number;
  accountAddress: string;
};

const decodeNotarizationAccount = (data: Uint8Array) => {
  if (data.length < ACCOUNT_DISCRIMINATOR_LENGTH + HASH_LENGTH + PUBLIC_KEY_LENGTH) {
    throw new Error("Notarization account data is too short.");
  }

  let offset = ACCOUNT_DISCRIMINATOR_LENGTH;

  const hashBytes = data.slice(offset, offset + HASH_LENGTH);
  offset += HASH_LENGTH;

  const notaryBytes = data.slice(offset, offset + PUBLIC_KEY_LENGTH);
  offset += PUBLIC_KEY_LENGTH;

  if (offset + TIMESTAMP_BYTE_LENGTH > data.length) {
    throw new Error("Notarization account is missing timestamp information.");
  }

  const timestampView = new DataView(data.buffer, data.byteOffset + offset, TIMESTAMP_BYTE_LENGTH);
  const timestamp = Number(timestampView.getBigInt64(0, true));
  offset += TIMESTAMP_BYTE_LENGTH;

  if (offset + VERSION_BYTE_LENGTH > data.length) {
    throw new Error("Notarization account is missing version information.");
  }

  const version = data[offset];
  offset += VERSION_BYTE_LENGTH;

  if (offset + LENGTH_PREFIX_BYTE_LENGTH > data.length) {
    throw new Error("Notarization account is missing document name length.");
  }

  const nameLengthView = new DataView(data.buffer, data.byteOffset + offset, LENGTH_PREFIX_BYTE_LENGTH);
  const nameLength = nameLengthView.getUint32(0, true);
  offset += LENGTH_PREFIX_BYTE_LENGTH;

  if (offset + nameLength > data.length) {
    throw new Error("Notarization account contains an invalid document name length.");
  }

  const nameBytes = data.slice(offset, offset + nameLength);
  offset += nameLength;

  const bump = data[offset] ?? 0;
  const hashVersion = data[offset + 1] ?? 0;
  const additional = data[offset + 2] ?? 0;

  const documentName = textDecoder.decode(nameBytes).trim();

  return {
    hash: bytesToHex(hashBytes),
    notary: addressDecoder.decode(notaryBytes as Uint8Array & { length: 32 }),
    timestamp,
    version,
    documentName,
    bump,
    hashVersion,
    additional,
  } satisfies Omit<NotarizationAccountDetails, "accountAddress">;
};

type ProgramAccount = {
  pubkey: string;
  account: {
    data: unknown;
  };
};

const decodeAccountData = (data: unknown): Uint8Array => {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (typeof globalThis.Buffer !== "undefined" && globalThis.Buffer.isBuffer?.(data)) {
    return new Uint8Array(data as Buffer);
  }

  if (Array.isArray(data)) {
    const [content, encoding] = data as [unknown, unknown];
    if (typeof content === "string" && (encoding === "base64" || encoding == null)) {
      return decodeBase64ToBytes(content);
    }
  }

  if (typeof data === "string") {
    return decodeBase64ToBytes(data);
  }

  throw new Error("Unsupported account data encoding received from RPC response.");
};

export type GetNotarizationAccountDetailsConfig = {
  client: SolanaClient;
  notary: string;
  documentHashHex: string;
  version: number;
};

export async function getNotarizationAccountDetails({
  client,
  notary,
  documentHashHex,
  version,
}: GetNotarizationAccountDetailsConfig): Promise<NotarizationAccountDetails> {
  const normalizedVersion = ensureU8(version, "version");
  const documentHash = documentHashFromHex(documentHashHex);

  const [accountAddress] = await findNotarizationPda({
    notary: notary as Address<string>,
    documentHash,
    version: new Uint8Array([normalizedVersion]),
  });

  const account = await fetchEncodedAccount(client.rpc, accountAddress);
  assertAccountExists(account);

  const decoded = decodeNotarizationAccount(account.data);

  return {
    ...decoded,
    accountAddress,
  };
}

export type ListNotarizationAccountsConfig = {
  client: SolanaClient;
  notary: string;
};

export async function listNotarizationAccountsByNotary({
  client,
  notary,
}: ListNotarizationAccountsConfig): Promise<NotarizationAccountDetails[]> {
  if (!notary) {
    return [];
  }

  const rpc = client.rpc as unknown as {
    getProgramAccounts: (
      programAddress: string,
      config?: unknown,
    ) => { send: () => Promise<unknown> };
  };

  const response = (await rpc
    .getProgramAccounts(NOTARIZATION_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: NOTARY_OFFSET,
            bytes: notary,
          },
        },
      ],
      encoding: "base64",
    })
    .send()) as
    | ProgramAccount[]
    | { value: ProgramAccount[] }
    | { context: unknown; value: ProgramAccount[] };

  const accounts: ProgramAccount[] = Array.isArray((response as { value?: unknown }).value)
    ? ((response as { value: ProgramAccount[] }).value ?? [])
    : ((response as ProgramAccount[]) ?? []);

  return accounts.map((account) => {
    const rawData = decodeAccountData(account.account?.data);
    const decoded = decodeNotarizationAccount(rawData);

    return {
      ...decoded,
      accountAddress: account.pubkey,
    } satisfies NotarizationAccountDetails;
  });
}
