#!/usr/bin/env tsx
import "dotenv/config";
import { createX402Client } from "./client.js";

const tokenAddress = process.argv[2];
if (!tokenAddress) { console.error(JSON.stringify({ error: "Usage: price.ts <token_address>" })); process.exit(1); }

try {
  const client = createX402Client();
  const res = await client.post("/api/get_token_price", { token_address: tokenAddress, chain: "base" });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
