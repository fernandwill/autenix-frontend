import { getExplorerLink } from "gill";

export type ExplorerCluster =
  | "devnet"
  | "mainnet"
  | "testnet"
  | "localnet"
  | "mainnet-beta";

export const deriveExplorerCluster = (urlOrMoniker: unknown): ExplorerCluster => {
  const normalized = (typeof urlOrMoniker === "string" ? urlOrMoniker : String(urlOrMoniker)).toLowerCase();

  if (normalized.includes("devnet")) return "devnet";
  if (normalized.includes("testnet")) return "testnet";
  if (normalized.includes("local")) return "localnet";
  if (normalized.includes("mainnet")) return "mainnet";

  return "mainnet-beta";
};

export const buildExplorerUrl = (urlOrMoniker: unknown, signature: string) =>
  getExplorerLink({
    cluster: deriveExplorerCluster(urlOrMoniker),
    transaction: signature,
  });
