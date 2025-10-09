import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

export function SolanaTransactionPanel() {
  const { address, connect, disconnect, isConnecting, connectError } = useSolanaWallet();
  const isConnected = Boolean(address);
  const statusLabel = isConnected ? "Connected" : "Not connected";
  const buttonLabel = isConnected ? "Disconnect Wallet" : "Connect Solana Wallet";
  const handleClick = () => (isConnected ? disconnect() : connect());

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Gill SDK Wallet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          variant={isConnected ? "outline" : "default"}
          className="w-full gap-2"
          disabled={isConnecting}
          onClick={handleClick}
        >
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          {buttonLabel}
        </Button>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Status: {statusLabel}</p>
          {isConnected && address ? <p className="break-all font-mono text-[11px]">{address}</p> : null}
          {connectError ? <p className="text-destructive">{connectError}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
