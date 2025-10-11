# Autenix Frontend

This project is a Vite powered React application used to explore notarization workflows. It now includes:

- A streamlined document upload flow with checksum and hash previews.
- Direct document detail hydration from the Solana blockchain using the notarization program accounts—no `localStorage` snapshots are required.
- A Solana transaction demo panel that relies on the **Gill SDK** to craft and submit memo transactions.

## Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

### Environment variables

The Solana integration relies on the `VITE_SOLANA_CLUSTER` environment variable. When omitted the app defaults to `devnet`.

```bash
VITE_SOLANA_CLUSTER="https://api.devnet.solana.com"
```

### Gill SDK usage

The `SolanaTransactionPanel` component demonstrates how to use `gill` to:

1. Initialize a Solana RPC client (`src/lib/solana/client.ts`).
2. Build and send a memo transaction after a wallet signs it (`src/lib/solana/transactions.ts`).

Any wallet that injects the [Solana Wallet Standard](https://solana.com/docs/wallets/standard) (for example Phantom) can be used to approve the transaction directly from the browser.

### Linting and formatting

Run ESLint across the project:

```bash
npm run lint
```
