import "dotenv/config";
import axios from "axios";
import { withPaymentInterceptor } from "x402-axios";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

export function createX402Client() {
  const PRIVATE_KEY = requireEnv("PRIVATE_KEY") as `0x${string}`;
  const X402_SERVER_URL = process.env.X402_SERVER_URL ?? "https://x402-api.heyelsa.ai";
  const USE_MAINNET = process.env.USE_MAINNET !== "false";

  const chain = USE_MAINNET ? base : baseSepolia;
  const rpcUrl = USE_MAINNET
    ? (process.env.BASE_RPC_URL ?? "https://mainnet.base.org")
    : (process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org");

  const account = privateKeyToAccount(PRIVATE_KEY);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const baseAxios = axios.create({ baseURL: X402_SERVER_URL, timeout: 90_000 });
  return withPaymentInterceptor(baseAxios, walletClient);
}
