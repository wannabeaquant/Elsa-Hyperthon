#!/usr/bin/env tsx
// Fetch on-chain transaction history for the agent wallet ($0.003)
// Useful for verifying past swaps and tracking actual execution
import "dotenv/config";
import { createX402Client } from "./client.js";

const walletAddress = process.env.WALLET_ADDRESS;
if (!walletAddress) { console.error(JSON.stringify({ error: "Missing WALLET_ADDRESS" })); process.exit(1); }

try {
  const client = createX402Client();
  const res = await client.post("/api/get_transaction_history", { wallet_address: walletAddress });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
