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
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <Button
        type="button"
        variant={connectionCopy.buttonVariant}
        className={cn(
          "min-w-[180px] items-center justify-between gap-2 px-4",
          isConnected ? "hover:border-destructive hover:bg-destructive hover:text-destructive-foreground" : "",
        )}
        disabled={isConnecting}
        onClick={connectionCopy.action}
      >
        <span className="flex items-center gap-2">
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          <span className="font-semibold">{connectionCopy.buttonLabel}</span>
        </span>
      </Button>
      {isConnected && address ? (
        <div className="w-full text-right">
          <span className="block truncate text-xs font-mono text-muted-foreground">{address}</span>
        </div>
      ) : null}
      {connectError ? (
        <p className="text-xs text-destructive" role="status">
          {connectError}
        </p>
      ) : null}
    </div>
  );
}
