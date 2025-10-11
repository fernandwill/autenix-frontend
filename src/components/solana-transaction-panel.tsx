import { Loader2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSolanaWallet } from "@/lib/solana/wallet-context";

interface SolanaTransactionPanelProps {
  className?: string;
}

// SolanaTransactionPanel renders wallet connection controls without a surrounding card.
export function SolanaTransactionPanel({ className }: SolanaTransactionPanelProps) {
  const { address, connect, disconnect, isConnecting, connectError } = useSolanaWallet();
  const isConnected = Boolean(address);
  const connectionCopy = isConnected
    ? {
        buttonLabel: "Disconnect Wallet",
        buttonVariant: "outline" as const,
        action: disconnect,
      }
    : {
        buttonLabel: "Connect Wallet",
        buttonVariant: "default" as const,
        action: connect,
      };

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        type="button"
        variant={connectionCopy.buttonVariant}
        className="min-w-[220px] gap-2 text-left"
        disabled={isConnecting}
        onClick={connectionCopy.action}
      >
        <span className="flex w-full items-center gap-2">
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          <span className="flex-1 font-semibold">{connectionCopy.buttonLabel}</span>
        </span>
        {isConnected && address ? (
          <span className="block truncate text-xs font-mono text-muted-foreground">{address}</span>
        ) : null}
      </Button>
      {connectError ? (
        <p className="text-xs text-destructive" role="status">
          {connectError}
        </p>
      ) : null}
    </div>
  );
}
