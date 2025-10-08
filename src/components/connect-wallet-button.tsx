import { useCallback, useMemo, useState } from "react";
import { LogOut, Wallet } from "lucide-react";
import { BaseError } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export function ConnectWalletButton({ className }: { className?: string }) {
  const { address, status } = useAccount();
  const { connectAsync, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [localError, setLocalError] = useState<string | null>(null);

  const isConnecting = status === "connecting" || status === "reconnecting" || isPending;
  const isConnected = status === "connected" && !!address;

  const availableConnectors = useMemo(() => connectors.filter((connector) => connector.ready), [connectors]);

  const handleConnect = useCallback(async () => {
    setLocalError(null);

    const preferredConnector =
      availableConnectors.find((connector) => connector.id === "injected") ?? availableConnectors[0] ?? connectors[0];

    if (!preferredConnector) {
      setLocalError("No wallet connector available. Install MetaMask or another browser wallet.");
      return;
    }

    try {
      await connectAsync({ connector: preferredConnector });
    } catch (connectError) {
      if (connectError instanceof BaseError) {
        setLocalError(connectError.shortMessage || connectError.message);
      } else if (connectError instanceof Error) {
        setLocalError(connectError.message);
      } else {
        setLocalError("Failed to connect to wallet.");
      }
    }
  }, [availableConnectors, connectAsync, connectors]);

  const errorMessage = localError || (error ? (error instanceof BaseError ? error.shortMessage : error.message) : null);

  if (isConnected && address) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-full px-5"
          onClick={() => disconnect()}
        >
          <Wallet className="h-4 w-4" />
          {formatAddress(address)}
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      <Button
        type="button"
        className="gap-2 rounded-full px-5"
        disabled={isConnecting}
        onClick={handleConnect}
      >
        <Wallet className="h-4 w-4" />
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>
      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
    </div>
  );
}