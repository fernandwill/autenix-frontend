import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, Wallet } from "lucide-react";
import { BaseError } from "viem";
import { ConnectorNotFoundError, useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const PREFERRED_CONNECTOR_STORAGE_KEY = "autenix-preferred-evm-connector";

export function ConnectWalletButton({ className }: { className?: string }) {
  const { address, status } = useAccount();
  const { connectAsync, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [localError, setLocalError] = useState<string | null>(null);
  const [preferredConnectorId, setPreferredConnectorId] = useState<string | null>(null);

  const isConnecting = status === "connecting" || status === "reconnecting" || isPending;
  const isConnected = status === "connected" && !!address;

  const availableConnectors = useMemo(() => connectors.filter((connector) => connector.ready), [connectors]);
  const hasAvailableConnector = availableConnectors.length > 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(PREFERRED_CONNECTOR_STORAGE_KEY);
    if (stored) {
      setPreferredConnectorId(stored);
    }
  }, []);

  const clearPreferredConnector = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PREFERRED_CONNECTOR_STORAGE_KEY);
    }
    setPreferredConnectorId(null);
  }, []);

  useEffect(() => {
    if (!(error instanceof ConnectorNotFoundError)) return;

    clearPreferredConnector();
    setLocalError("No wallet connector available. Install MetaMask or another browser wallet.");
  }, [clearPreferredConnector, error]);

  const handleConnect = useCallback(async () => {
    setLocalError(null);

    const preferredConnector =
      availableConnectors.find((connector) => connector.id === preferredConnectorId) ??
      availableConnectors.find((connector) => connector.id === "injected") ??
      availableConnectors[0] ??
      connectors[0];

    if (!preferredConnector) {
      setLocalError("No wallet connector available. Install MetaMask or another browser wallet.");
      return;
    }

    try {
      await connectAsync({ connector: preferredConnector });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PREFERRED_CONNECTOR_STORAGE_KEY, preferredConnector.id);
      }
      setPreferredConnectorId(preferredConnector.id);
    } catch (connectError) {
      if (connectError instanceof ConnectorNotFoundError) {
        clearPreferredConnector();
        setLocalError("No wallet connector available. Install MetaMask or another browser wallet.");
      } else if (connectError instanceof BaseError) {
        setLocalError(connectError.shortMessage || connectError.message);
      } else if (connectError instanceof Error) {
        setLocalError(connectError.message);
      } else {
        setLocalError("Failed to connect to wallet.");
      }
    }
  }, [availableConnectors, clearPreferredConnector, connectAsync, connectors, preferredConnectorId]);

  const handleDisconnect = useCallback(() => {
    clearPreferredConnector();
    disconnect();
  }, [clearPreferredConnector, disconnect]);

  const errorMessage =
    localError || (error ? (error instanceof BaseError ? error.shortMessage : error.message) : null);
  const helperMessage = !hasAvailableConnector
    ? "No compatible EVM wallets detected in this browser."
    : null;

  if (isConnected && address) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          type="button"
          variant="outline"
          className="gap-2 rounded-full px-5"
          onClick={handleDisconnect}
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
        disabled={isConnecting || !hasAvailableConnector}
        onClick={handleConnect}
      >
        <Wallet className="h-4 w-4" />
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>
      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
      {!errorMessage && helperMessage ? <p className="text-xs text-muted-foreground">{helperMessage}</p> : null}
    </div>
  );
}