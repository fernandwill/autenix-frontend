import { getProgramDerivedAddress, getAddressEncoder, type ProgramDerivedAddress } from "@solana/addresses";
import { AccountRole, type Instruction } from "@solana/instructions";
import type { Address } from "gill";

const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111" as Address<string>;

const PDA_SEED_PREFIX = "notarization";
const DOCUMENT_HASH_BYTE_LENGTH = 32;
const DISCRIMINATOR_BYTE_LENGTH = 8;

const addressEncoder = getAddressEncoder();
const textEncoder = new TextEncoder();
const PDA_SEED_PREFIX_BYTES = textEncoder.encode(PDA_SEED_PREFIX);

export const NOTARIZATION_PROGRAM_ID = "2WDpVp8voZu2koiQ6guFZ9AQkxZcQ3jtr8bU494p2UAa" as Address<string>;

const CREATE_NOTARIZATION_DISCRIMINATOR = Uint8Array.from([71, 177, 199, 241, 100, 108, 216, 66]);
const UPDATE_NOTARIZATION_DISCRIMINATOR = Uint8Array.from([97, 79, 153, 194, 63, 120, 17, 137]);

export type NotarizationSeeds = {
  documentHash: Uint8Array;
  notary: Address<string>;
};

// Derive the PDA that stores notarization data for a wallet/hash combination.
export async function findNotarizationPda({
  documentHash,
  notary,
  version
}: {
  notary: Address,
  documentHash: Uint8Array,
  version: Uint8Array
}): Promise<ProgramDerivedAddress<Address<string>>> {
  if (documentHash.length !== DOCUMENT_HASH_BYTE_LENGTH) {
    throw new Error(`Document hash must be ${DOCUMENT_HASH_BYTE_LENGTH} bytes.`);
  }

  return getProgramDerivedAddress({
    programAddress: NOTARIZATION_PROGRAM_ID,
    seeds: [PDA_SEED_PREFIX_BYTES, addressEncoder.encode(notary), documentHash, version],
  });
}

export type CreateNotarizationInstructionArgs = NotarizationSeeds & {
  documentName: string;
  hashVersion: number;
  version: number;
  notarizationAccount: Address<string>;
};

// Build the instruction payload that initializes a notarization account.
export function getCreateNotarizationInstruction({
  documentHash,
  documentName,
  hashVersion,
  version,
  notarizationAccount,
  notary,
}: CreateNotarizationInstructionArgs): Instruction<Address<string>> {
  if (documentHash.length !== DOCUMENT_HASH_BYTE_LENGTH) {
    throw new Error(`Document hash must be ${DOCUMENT_HASH_BYTE_LENGTH} bytes.`);
  }

  const sanitizedName = documentName.trim() || "Untitled Document";
  const data = encodeCreateNotarizationData({
    documentHash,
    documentName: sanitizedName,
    hashVersion,
    version,
  });

  return {
    programAddress: NOTARIZATION_PROGRAM_ID,
    accounts: [
      { address: notary, role: AccountRole.WRITABLE_SIGNER },
      { address: notarizationAccount, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

export type UpdateNotarizationInstructionArgs = {
  notary: Address<string>;
  oldNotarization: Address<string>;
  newNotarization: Address<string>;
  oldDocumentHash: Uint8Array;
  newDocumentHash: Uint8Array;
  oldVersion: number;
  newVersion: number;
  hashVersion: number;
};

// Build the instruction payload that updates an existing notarization entry.
export function getUpdateNotarizationInstruction({
  hashVersion,
  newDocumentHash,
  newVersion,
  notary,
  oldDocumentHash,
  oldVersion,
  oldNotarization,
  newNotarization,
}: UpdateNotarizationInstructionArgs): Instruction<Address<string>> {
  if (oldDocumentHash.length !== DOCUMENT_HASH_BYTE_LENGTH) {
    throw new Error(`Old document hash must be ${DOCUMENT_HASH_BYTE_LENGTH} bytes.`);
  }
  if (newDocumentHash.length !== DOCUMENT_HASH_BYTE_LENGTH) {
    throw new Error(`New document hash must be ${DOCUMENT_HASH_BYTE_LENGTH} bytes.`);
  }

  const normalizedOldVersion = ensureU8(oldVersion, "oldVersion");
  const normalizedNewVersion = ensureU8(newVersion, "newVersion");
  const normalizedHashVersion = ensureU8(hashVersion, "hashVersion");

  const data = encodeUpdateNotarizationData({
    hashVersion: normalizedHashVersion,
    newDocumentHash,
    newVersion: normalizedNewVersion,
    oldDocumentHash,
    oldVersion: normalizedOldVersion,
  });

  return {
    programAddress: NOTARIZATION_PROGRAM_ID,
    accounts: [
      { address: notary, role: AccountRole.WRITABLE_SIGNER },
      { address: oldNotarization, role: AccountRole.READONLY },
      { address: newNotarization, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

// Convert a 32-byte hex string into the binary hash representation required by the program.
export function documentHashFromHex(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length !== DOCUMENT_HASH_BYTE_LENGTH * 2) {
    throw new Error(`Document hash must be ${DOCUMENT_HASH_BYTE_LENGTH * 2} hex characters.`);
  }
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error("Document hash must be a valid hexadecimal string.");
  }

  const bytes = new Uint8Array(DOCUMENT_HASH_BYTE_LENGTH);
  for (let i = 0; i < normalized.length; i += 2) {
    const byte = Number.parseInt(normalized.slice(i, i + 2), 16);
    bytes[i / 2] = byte;
  }
  return bytes;
}

// Guard that a numeric field fits into an unsigned 8-bit slot.
export function ensureU8(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} must be an integer between 0 and 255.`);
  }
  return value;
}

const U32_BYTE_LENGTH = 4;

// Encode a string with a little-endian u32 length prefix as expected by the program.
function encodeStringWithLength(value: string): Uint8Array {
  const utf8 = textEncoder.encode(value);
  const buffer = new Uint8Array(U32_BYTE_LENGTH + utf8.length);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, utf8.length, true);
  buffer.set(utf8, U32_BYTE_LENGTH);
  return buffer;
}

// Assemble the discriminator, hash, and metadata for the create instruction data blob.
function encodeCreateNotarizationData({
  documentHash,
  documentName,
  hashVersion,
  version,
}: {
  documentHash: Uint8Array;
  documentName: string;
  hashVersion: number;
  version: number;
}): Uint8Array {
  const nameBytes = encodeStringWithLength(documentName);
  const totalLength =
    DISCRIMINATOR_BYTE_LENGTH + DOCUMENT_HASH_BYTE_LENGTH + nameBytes.length + 2;

  const data = new Uint8Array(totalLength);
  let offset = 0;

  data.set(CREATE_NOTARIZATION_DISCRIMINATOR, offset);
  offset += DISCRIMINATOR_BYTE_LENGTH;
  data.set(documentHash, offset);
  offset += DOCUMENT_HASH_BYTE_LENGTH;
  data.set(nameBytes, offset);
  offset += nameBytes.length;
  data[offset] = hashVersion;
  data[offset + 1] = version;

  return data;
}

// Assemble the discriminator and field payload for the update instruction data blob.
function encodeUpdateNotarizationData({
  oldDocumentHash,
  oldVersion,
  newDocumentHash,
  newVersion,
  hashVersion,
}: {
  oldDocumentHash: Uint8Array;
  oldVersion: number;
  newDocumentHash: Uint8Array;
  newVersion: number;
  hashVersion: number;
}): Uint8Array {
  const totalLength =
    DISCRIMINATOR_BYTE_LENGTH +
    DOCUMENT_HASH_BYTE_LENGTH * 2 +
    3; /* oldVersion, newVersion, hashVersion */

  const data = new Uint8Array(totalLength);
  let offset = 0;

  data.set(UPDATE_NOTARIZATION_DISCRIMINATOR, offset);
  offset += DISCRIMINATOR_BYTE_LENGTH;
  data.set(oldDocumentHash, offset);
  offset += DOCUMENT_HASH_BYTE_LENGTH;
  data[offset] = oldVersion;
  offset += 1;
  data.set(newDocumentHash, offset);
  offset += DOCUMENT_HASH_BYTE_LENGTH;
  data[offset] = newVersion;
  offset += 1;
  data[offset] = hashVersion;

  return data;
}
