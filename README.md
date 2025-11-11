# Autenix

<img width="1000" height="1000" alt="{C1FADD4A-6412-464E-97E3-D036932257C8}" src="https://github.com/user-attachments/assets/a8fdd80c-ac84-48b2-a032-f59f798424b8" />

This project is a Vite powered React application used to explore notarization workflows. Core experiences include:

- **File upload notarization pipeline** – the `FileUpload` component works with `useDocumentUploader` to stream PDFs, compute hashes, and queue Gill-backed Solana notarization transactions once a wallet signs them.
- **Wallet connection and status controls** – `SolanaTransactionPanel` exposes connect and disconnect affordances while surfacing the active address for transaction signing.
- **On-chain hash search** – the home page in `App.tsx` lets users jump to notarized artifacts by entering a binary hash or transaction signature.
- **Wallet-synced document summaries** – `App.tsx` merges freshly uploaded entries with notarizations fetched for the connected wallet so the dashboard mirrors on-chain state.

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

Gill powers the notarization workflow itself rather than a standalone demo. `useDocumentUploader` (`src/lib/use-document-uploader.ts`) calls `submitNotarizationTransaction` (`src/lib/solana/transactions.ts`) to compile program instructions, obtain a wallet signature, and confirm the transaction on Solana.

Any wallet that injects the [Solana Wallet Standard](https://solana.com/docs/wallets/standard) (for example Phantom) can be used to approve the transaction directly from the browser.

### Document detail page

`DocumentDetailPage` (`src/pages/document-detail-page.tsx`) rehydrates notarized metadata straight from the blockchain, showing status badges, explorer links, and parsed document identifiers without relying on local storage snapshots.

### Document update page

`DocumentUpdatePage` (`src/pages/document-update-page.tsx`) lets users upload a new revision, increment the version, and trigger another notarization. After confirmation it refreshes the on-chain snapshot so the detail view reflects the latest binary hash.

### Linting and formatting

Run ESLint across the project:

```bash
npm run lint
```
