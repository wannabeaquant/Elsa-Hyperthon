#!/usr/bin/env tsx
// Usage: swap.ts <from_token> <to_token> <from_amount> <slippage>
// DRY_RUN env var controls simulation vs real execution
import "dotenv/config";
import { createX402Client } from "./client.js";

const [, , fromToken, toToken, fromAmount, slippage] = process.argv;
if (!fromToken || !toToken || !fromAmount || !slippage) {
  console.error(JSON.stringify({ error: "Usage: swap.ts <from_token> <to_token> <from_amount> <slippage>" }));
  process.exit(1);
}

const walletAddress = process.env.WALLET_ADDRESS;
if (!walletAddress) { console.error(JSON.stringify({ error: "Missing WALLET_ADDRESS" })); process.exit(1); }

const dryRun = process.env.DRY_RUN !== "false";

// In DRY_RUN mode: never hit the API (saves $0.10). Return a simulated result
// so Claude can still log the trade decision to memory.json.
if (dryRun) {
  console.log(JSON.stringify({
    dry_run: true,
    simulated: true,
    from_token: fromToken,
    to_token: toToken,
    from_amount: fromAmount,
    to_amount: "estimated_via_quote",
    note: "Swap not executed — DRY_RUN=true. Log this trade decision to memory with dry_run:true.",
  }));
  process.exit(0);
}

try {
  const client = createX402Client();
  const res = await client.post("/api/execute_swap", {
    from_chain: "base",
    from_token: fromToken,
    from_amount: fromAmount,
    to_chain: "base",
    to_token: toToken,
    wallet_address: walletAddress,
    slippage: parseFloat(slippage),
    dry_run: false,
  });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
