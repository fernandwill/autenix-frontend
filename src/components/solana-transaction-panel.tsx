import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, SendHorizonal, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SolanaWindowProvider } from "@/types/solana";
import { getSolanaClient } from "@/lib/solana/client";
import { sendMemoTransaction } from "@/lib/solana/transactions";

type TransactionState = "idle" | "sending" | "sent";

const DEFAULT_MEMO = "Hello from the Gill SDK";

export function SolanaTransactionPanel() {
  const [memo, setMemo] = useState(DEFAULT_MEMO);
  const [provider, setProvider] = useState<SolanaWindowProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionState, setTransactionState] = useState<TransactionState>("idle");
  const [isConnecting, setIsConnecting] = useState(false);

  const client = useMemo(() => getSolanaClient(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setProvider(window.solana ?? null);
  }, []);

  const handleConnect = useCallback(async () => {
    setConnectError(null);
    if (!provider) {
      setConnectError("No Solana wallet detected. Install Phantom or another Wallet Standard provider.");
      return;
    }

    setIsConnecting(true);
    try {
      const result = await provider.connect({ onlyIfTrusted: false });
      setAddress(result.publicKey.toBase58());
      setSignature(null);
      setExplorerUrl(null);
    } catch (error) {
      if (error instanceof Error) {
        setConnectError(error.message);
      } else {
        setConnectError("Unable to connect to the Solana wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [provider]);

  const handleSendTransaction = useCallback(async () => {
    if (!provider || !provider.signTransaction || !address) {
      setTransactionError(
        "A connected Solana wallet that supports transaction signing is required to submit transactions.",
      );
      return;
    }

    setTransactionError(null);
    setTransactionState("sending");
    try {
      const { explorerUrl: url, signature: txSignature } = await sendMemoTransaction({
        client,
        wallet: {
          address,
          signTransaction: provider.signTransaction.bind(provider),
        },
        memo,
      });

      setSignature(txSignature);
      setExplorerUrl(url);
      setTransactionState("sent");
    } catch (error) {
      if (error instanceof Error) {
        setTransactionError(error.message);
      } else {
        setTransactionError("Failed to send the Solana transaction.");
      }
      setTransactionState("idle");
    }
  }, [address, client, memo, provider]);

  const isConnected = !!address;
  const isSendDisabled = transactionState === "sending" || !isConnected;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SendHorizonal className="h-5 w-5" /> Gill SDK Solana Transaction
        </CardTitle>
        <CardDescription>
          Use the Gill SDK to craft and submit a memo transaction on Solana directly from the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="solana-memo">
            Memo message
          </label>
          <Input
            id="solana-memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="Enter the memo text to attach to your transaction"
            disabled={transactionState === "sending"}
          />
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Cluster: {client.urlOrMoniker.toString()}</p>
          <p>
            Wallet status: {isConnected ? "Connected" : "Not connected"}
            {isConnected && address ? <span className="ml-1 font-mono text-xs">{address}</span> : null}
          </p>
        </div>
        {connectError ? <p className="text-sm text-destructive">{connectError}</p> : null}
        {transactionError ? <p className="text-sm text-destructive">{transactionError}</p> : null}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant={isConnected ? "outline" : "default"}
          className="flex-1 gap-2"
          disabled={isConnecting}
          onClick={handleConnect}
        >
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {isConnected ? "Reconnect Wallet" : "Connect Solana Wallet"}
        </Button>
        <Button type="button" className="flex-1 gap-2" disabled={isSendDisabled} onClick={handleSendTransaction}>
          {transactionState === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {transactionState === "sent" ? "Transaction Sent" : "Send Memo"}
        </Button>
      </CardFooter>
      {signature ? (
        <div className="border-t px-6 py-4 text-sm">
          <p className="font-medium text-foreground">Latest transaction</p>
          <p className="font-mono text-xs break-all text-muted-foreground">{signature}</p>
          {explorerUrl ? (
            <a
              className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
            >
              View in Solana Explorer <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
