#!/usr/bin/env tsx
// Quick token balance check — cheaper than full portfolio ($0.005 vs $0.01)
import "dotenv/config";
import { createX402Client } from "./client.js";

const walletAddress = process.env.WALLET_ADDRESS;
if (!walletAddress) { console.error(JSON.stringify({ error: "Missing WALLET_ADDRESS" })); process.exit(1); }

try {
  const client = createX402Client();
  const res = await client.post("/api/get_balances", { wallet_address: walletAddress });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
