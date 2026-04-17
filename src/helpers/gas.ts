#!/usr/bin/env tsx
import "dotenv/config";
import { createX402Client } from "./client.js";

try {
  const client = createX402Client();
  const res = await client.post("/api/get_gas_prices", { chain: "base" });
  console.log(JSON.stringify(res.data));
} catch (err) {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
}
