import { createSolanaClient, type SolanaClient } from "gill";

const DEFAULT_CLUSTER = (import.meta.env.VITE_SOLANA_CLUSTER ?? "devnet") as string;

let cachedClient: SolanaClient | null = null;

/**
 * Lazily create and memoize a Solana client configured for the application.
 *
 * Consumers can provide an explicit RPC endpoint/cluster name to get
 * an isolated client instance when needed (for example, when allowing users
 * to switch between devnet and mainnet).
 */
export function getSolanaClient(urlOrMoniker: string = DEFAULT_CLUSTER): SolanaClient {
  if (cachedClient && urlOrMoniker === cachedClient.urlOrMoniker) {
    return cachedClient;
  }

  const client = createSolanaClient({
    urlOrMoniker,
  });

  if (urlOrMoniker === DEFAULT_CLUSTER) {
    cachedClient = client;
  }

  return client;
}
