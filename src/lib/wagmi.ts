import { http, createConfig } from "wagmi";
import { base, mainnet, sepolia } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const appName = "Notarization Portal";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected({
    shimDisconnect: true,
  }),
  coinbaseWallet({
    appName,
  }),
];

if (projectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true,
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [mainnet, base, sepolia],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
  },
  connectors,
  ssr: false,
});