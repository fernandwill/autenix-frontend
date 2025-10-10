import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

// SolanaTransactionPanel exposes connection controls for the Gill SDK wallet.
export function SolanaTransactionPanel() {
  const { address, connect, disconnect, isConnecting, connectError } = useSolanaWallet();
  const isConnected = Boolean(address);
  const connectionCopy = isConnected
    ? {
        statusLabel: "Connected",
        buttonLabel: "Disconnect Wallet",
        buttonVariant: "outline" as const,
        action: disconnect,
      }
    : {
        statusLabel: "Not connected",
        buttonLabel: "Connect Solana Wallet",
        buttonVariant: "default" as const,
        action: connect,
      };
  const handleClick = connectionCopy.action;

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Gill SDK Wallet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant={connectionCopy.buttonVariant}
          className="w-full gap-2"
          disabled={isConnecting}
          onClick={handleClick}
        >
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {connectionCopy.buttonLabel}
        </Button>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Status: {connectionCopy.statusLabel}</p>
          {isConnected && address ? <p className="break-all font-mono text-[11px]">{address}</p> : null}
          {connectError ? <p className="text-destructive">{connectError}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
