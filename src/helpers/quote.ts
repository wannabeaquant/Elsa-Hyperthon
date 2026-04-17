#!/usr/bin/env tsx
// Usage: quote.ts <from_token> <to_token> <from_amount> <slippage>
import "dotenv/config";
import { createX402Client } from "./client.js";

const [, , fromToken, toToken, fromAmount, slippage] = process.argv;
if (!fromToken || !toToken || !fromAmount || !slippage) {
  console.error(JSON.stringify({ error: "Usage: quote.ts <from_token> <to_token> <from_amount> <slippage>" }));
  process.exit(1);
}

const walletAddress = process.env.WALLET_ADDRESS;
if (!walletAddress) { console.error(JSON.stringify({ error: "Missing WALLET_ADDRESS" })); process.exit(1); }

try {
  const client = createX402Client();
  const res = await client.post("/api/get_swap_quote", {
    from_chain: "base",
    from_token: fromToken,
    from_amount: fromAmount,
    to_chain: "base",
    to_token: toToken,
    wallet_address: walletAddress,
    slippage: parseFloat(slippage),
  });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
