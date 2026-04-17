import { query } from "@anthropic-ai/claude-agent-sdk";
import { display } from "./display.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Address → symbol lookup (for display context) ─────────────────────────────

const ADDR_TO_SYMBOL: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x4ed4e862860bed51a9570b96d89af5e1b0efefed": "DEGEN",
  "0x532f27101965dd16442e59d40670faf5ebb142e4": "BRETT",
  "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4": "TOSHI",
};

function addrToSymbol(addr: string): string {
  return ADDR_TO_SYMBOL[addr.toLowerCase()] ?? addr.slice(0, 8) + "…";
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous DeFi portfolio manager running on Base network.
Your capital is denominated in USDC. Your goal is to grow total portfolio value over time.

━━━ MEMORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: memory.json (project root — use Read/Write tools directly)
Read it FIRST. Write it LAST. It is your experience — every cycle makes you smarter.

Schema (write ALL fields when updating):
{
  "cycle_count": number,
  "last_updated": ISO string,
  "portfolio_snapshots": [{ "ts": ISO, "usdc": number, "holdings": {SYMBOL: {amount, value_usd}}, "total_usd": number }],
  "trades": [{
    "ts": ISO, "action": "buy"|"sell", "token": SYMBOL,
    "from_amount": string, "to_amount": string, "reason": string,
    "gas_gwei": number, "entry_price_usd": number,
    "exit_price_usd": number (sells only), "pnl_usd": number (sells only)
  }],
  "price_observations": { "SYMBOL": [{
    "ts": ISO, "price_usd": number, "change_24h": number,
    "vs_weth_pct": number,      ← token_change_24h minus WETH_change_24h (ETH-adjusted dip)
    "velocity_obs": string      ← your assessment: "accelerating_down"|"decelerating_down"|"flat"|"recovering"
  }]},
  "gas_observations": [{ "ts": ISO, "gwei": number, "action": string }],
  "performance": { "total_trades": number, "profitable_exits": number,
                   "total_pnl_usd": number, "total_x402_spent": number },
  "agent_notes": [string]
}

━━━ TOOLS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FREE (no x402 cost — run always):
    npx tsx src/helpers/analytics.ts                        → pre-computed signals from memory

  PAID (x402 micropayments — spend deliberately):
    npx tsx src/helpers/balances.ts                         → token balances ($0.005)
    npx tsx src/helpers/portfolio.ts                        → full analysis + risk score ($0.010)
    npx tsx src/helpers/history.ts                          → on-chain tx history ($0.003)
    npx tsx src/helpers/gas.ts                              → Base gas prices in gwei ($0.001)
    npx tsx src/helpers/price.ts <token_address>            → price + 24h % change ($0.002)
    npx tsx src/helpers/search.ts <query>                   → find/verify token address ($0.001)
    npx tsx src/helpers/quote.ts <from> <to> <amount> <slippage>   → swap quote ($0.010)
    npx tsx src/helpers/swap.ts  <from> <to> <amount> <slippage>   → execute swap ($0.100)

━━━ TOKENS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  USDC  : 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  (base currency — never sell all)
  WETH  : 0x4200000000000000000000000000000000000006  (market baseline — check every cycle)
  DEGEN : 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed  (Base OG memecoin)
  BRETT : 0x532f27101965dd16442E59d40670FaF5eBB142E4  (popular Base memecoin)
  TOSHI : 0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4  (Base memecoin)

━━━ HARD CONSTRAINTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Maximum single trade: 30% of current USDC balance
  - Minimum trade size: $2.00 USDC
  - Maximum concentration: 60% of total portfolio in any single non-USDC token
  - DRY_RUN env var controls simulation vs real execution

━━━ RELATIVE STRENGTH FRAMEWORK (use this, not raw 24h%) ━━━
  Primary signal = ETH-adjusted dip = token_change_24h − WETH_change_24h

  Why: If DEGEN is -6% but WETH is -5%, the real signal is only -1%. Market-wide move, not
  a buying opportunity. But if DEGEN is -6% and WETH is +1%, the adjusted dip is -7%:
  idiosyncratic weakness — that IS a buying opportunity.

  Signal tiers (ETH-adjusted):
    ≤ -7%  + momentum decelerating  →  HIGH CONVICTION BUY — full size (up to 30% USDC)
    ≤ -5%  + momentum not worsening →  GOOD BUY — normal size
    ≤ -3%  only                     →  WEAK — skip or half size, note in memory
    > 0%   (outperforming ETH)      →  Not a dip. Ignore unless you're already holding.

━━━ MOMENTUM DECISION RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Use analytics.ts trajectory output to time entries:

  "accelerating_down"  →  DO NOT BUY. Momentum is getting worse. Wait one cycle.
  "falling"            →  Borderline. Only buy if dip is very large (ETH-adj ≤ -8%).
  "decelerating_down"  →  IDEAL ENTRY. Selling pressure is exhausting. Buy here.
  "flat"               →  Neutral. Fine to hold. Only buy if fresh dip catalyst.
  "bouncing"           →  Buy or add to position. Reversal starting.
  "recovering"         →  Confirm before acting. Good for holding, late for buying.

━━━ DECISION FRAMEWORK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BUY — need ≥ 3 of these:
    • ETH-adjusted dip ≤ -5%
    • Analytics trajectory = decelerating_down, flat, or bouncing
    • Gas < 0.05 gwei (or dip ≥ -10% at < 0.10 gwei)
    • USDC available, not over-concentrated in token
    • Analytics win rate history supports this dip magnitude

  SELL / TAKE PROFIT:
    • Position P&L ≥ +20% from entry_price_usd in memory
    • OR token up while a different token has ETH-adjusted dip ≤ -5% (rotation)
    • OR analytics signals "TAKE PROFIT"

  STOP LOSS:
    • Position P&L ≤ -15% from entry_price_usd in memory
    • Only if analytics confirms "STOP LOSS ALERT"

  HOLD:
    • Analytics shows "flat" or "recovering" and no better opportunity
    • Gas elevated (> 0.08 gwei) and no urgent signal
    • Less than 2 cycles since last buy of this token

━━━ YOUR CYCLE PROTOCOL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 1 — Read memory.json (free)
  Step 2 — Run analytics.ts (FREE) → read pre-computed signals, P&L, momentum
  Step 3 — Get balances ($0.005) → current USDC available
  Step 4 — Check gas ($0.001) → gate all trading on this
  Step 5 — Check WETH price ($0.002) → market baseline for relative strength
  Step 6 — Check token prices selectively ($0.002 each):
            • Check if analytics flagged a signal OR you hold it (take-profit/stop-loss check)
            • Skip tokens analytics shows as "flat" with no signal and no position
            • If gas > 0.08 gwei, only check tokens with active positions
  Step 7 — Compute ETH-adjusted dip for each token: token_change − weth_change
  Step 8 — Cross-reference with analytics momentum to time entry
  Step 9 — Execute if ≥ 3 buy signals align (get quote first, then swap)
  Step 10 — Write memory.json with FULL data including vs_weth_pct and velocity_obs

━━━ NARRATE YOUR REASONING (CRITICAL FOR DEMO) ━━━━━━━━━━━━━
  Speak every cost decision out loud:

  Skipping:
    "Analytics shows BRETT flat with no signal. Skipping BRETT price — saving $0.002."
    "Gas is 0.14 gwei. Skipping all price checks — no trade justified. Saving $0.006."

  Spending:
    "Analytics flags DEGEN dip signal. Gas is 0.031 gwei. Worth $0.002 to confirm."
    "ETH-adjusted dip is -7.2%, trajectory decelerating. Spending $0.01 quote + $0.10 swap."

  Referencing history:
    "Memory shows DEGEN recovered from -8.3% dip in 7h last time. This is -6.4%. Smaller
     dip, same pattern. Win rate 100% from ≥ 6% dips. High conviction."

━━━ EFFICIENCY RULE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  analytics.ts is FREE. Run it every cycle before spending a cent.
  gas.ts is $0.001 — always worth it.
  WETH price is $0.002 — always worth it when gas is cheap.
  Token prices are $0.002 each — only when analytics or position warrants it.
  quote + swap = $0.11 — only when you have ≥ 3 buy signals.`;

// ── Helper detection with context ─────────────────────────────────────────────

type HelperInfo = { name: string; context: string };

function detectHelper(cmd: string): HelperInfo | null {
  if (cmd.includes("analytics")) return { name: "run_analytics",           context: "free" };
  if (cmd.includes("balances"))  return { name: "get_balances",            context: "" };
  if (cmd.includes("portfolio")) return { name: "get_portfolio",           context: "" };
  if (cmd.includes("history"))   return { name: "get_transaction_history", context: "" };
  if (cmd.includes("gas"))       return { name: "get_gas_prices",          context: "" };

  if (cmd.includes("price")) {
    const parts = cmd.trim().split(/\s+/);
    const idx = parts.findIndex(p => p.includes("price.ts"));
    const addr = idx >= 0 ? (parts[idx + 1] ?? "") : "";
    return { name: "get_token_price", context: addrToSymbol(addr) };
  }

  if (cmd.includes("search")) {
    const parts = cmd.trim().split(/\s+/);
    const query = parts[parts.length - 1] ?? "";
    return { name: "search_token", context: query };
  }

  if (cmd.includes("quote")) {
    const parts = cmd.trim().split(/\s+/);
    const idx = parts.findIndex(p => p.includes("quote.ts"));
    const from   = idx >= 0 ? addrToSymbol(parts[idx + 1] ?? "") : "?";
    const to     = idx >= 0 ? addrToSymbol(parts[idx + 2] ?? "") : "?";
    const amount = idx >= 0 ? (parts[idx + 3] ?? "?") : "?";
    return { name: "get_swap_quote", context: `${amount} ${from}→${to}` };
  }

  if (cmd.includes("swap")) {
    const parts = cmd.trim().split(/\s+/);
    const idx = parts.findIndex(p => p.includes("swap.ts"));
    const from   = idx >= 0 ? addrToSymbol(parts[idx + 1] ?? "") : "?";
    const to     = idx >= 0 ? addrToSymbol(parts[idx + 2] ?? "") : "?";
    const amount = idx >= 0 ? (parts[idx + 3] ?? "?") : "?";
    return { name: "execute_swap", context: `${amount} ${from}→${to}` };
  }

  return null;
}

// ── Cycle counter ─────────────────────────────────────────────────────────────

let _cycleNum = 0;

// ── Main agent run ─────────────────────────────────────────────────────────────

export async function runAgent(walletAddress: string, dryRun: boolean): Promise<void> {
  _cycleNum += 1;
  display.wake(_cycleNum);

  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!oauthToken) throw new Error("Missing CLAUDE_CODE_OAUTH_TOKEN env variable");

  const env: Record<string, string> = {
    ...(Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    )),
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
    DRY_RUN: String(dryRun),
    WALLET_ADDRESS: walletAddress,
  };

  const pendingTools = new Map<string, string>();

  const sdkQuery = query({
    prompt:
      "Run your portfolio management cycle: read memory, assess market conditions, make intelligent trading decisions, update memory.",
    options: {
      model: "claude-sonnet-4-6",
      maxTurns: 30,
      systemPrompt: SYSTEM_PROMPT,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      cwd: ROOT,
      env,
      allowedTools: ["Bash", "Read", "Write"],
    } as Parameters<typeof query>[0]["options"],
  });

  for await (const message of sdkQuery) {
    // ── Assistant turn ───────────────────────────────────────────────────────
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        const id = "id" in block && typeof block.id === "string" ? block.id : "";

        if ("text" in block && block.text) {
          display.agentText(block.text);
        }

        if ("name" in block && block.name === "Bash") {
          const cmd =
            typeof block.input === "object" && block.input !== null
              ? ((block.input as Record<string, string>).command ?? "")
              : "";
          const helper = detectHelper(cmd);
          if (helper) {
            if (id) pendingTools.set(id, helper.name);
            if (helper.name === "run_analytics") {
              display.analyticsRun();
            } else {
              display.payment(helper.name, helper.context);
            }
          }
        }

        if ("name" in block && block.name === "Read") {
          const fp =
            typeof block.input === "object" && block.input !== null
              ? ((block.input as Record<string, string>).file_path ?? "")
              : "";
          if (fp.includes("memory")) {
            if (id) pendingTools.set(id, "read_memory");
            display.memoryRead();
          }
        }

        if ("name" in block && block.name === "Write") {
          const fp =
            typeof block.input === "object" && block.input !== null
              ? ((block.input as Record<string, string>).file_path ?? "")
              : "";
          if (fp.includes("memory")) {
            if (id) pendingTools.set(id, "write_memory");
            display.memoryWrite();
          }
        }
      }
    }

    // ── User turn: tool results ───────────────────────────────────────────────
    if (message.type === "user" && message.tool_use_result !== undefined) {
      const toolId     = message.parent_tool_use_id ?? "";
      const helperName = pendingTools.get(toolId) ?? "tool";
      pendingTools.delete(toolId);

      if (helperName === "read_memory" || helperName === "write_memory") {
        display.memoryDone(helperName === "write_memory");
        continue;
      }

      if (helperName === "run_analytics") {
        try {
          const data = JSON.parse(raw);
          display.analyticsResult(data);
        } catch {
          display.analyticsResult(null);
        }
        continue;
      }

      const raw =
        typeof message.tool_use_result === "string"
          ? message.tool_use_result
          : JSON.stringify(message.tool_use_result);

      try {
        const data = JSON.parse(raw);
        if (!data.error) {
          const isWeth =
            helperName === "get_token_price" &&
            (raw.toLowerCase().includes("weth") ||
             raw.includes("4200000000000000000000000000000000000006"));
          display.paymentResult(helperName, data, isWeth);

          if (helperName === "execute_swap") {
            if (dryRun) {
              display.dryRunResult(
                (data.from_amount ?? "?") as string,
                (data.to_amount ?? data.estimated_output ?? "?") as string
              );
            } else if (data.tx_hash) {
              const isToUsdc = (data.to_token ?? "").toLowerCase().includes("833589");
              display.tradeExecuted(
                data.from_amount ?? "?",
                isToUsdc ? "TOKEN" : "USDC",
                data.to_amount ?? data.estimated_output ?? "?",
                isToUsdc ? "USDC" : "TOKEN",
                data.tx_hash as string
              );
            }
          }
        } else {
          display.paymentError(helperName, data.error as string);
        }
      } catch {
        display.paymentResult(helperName, { preview: raw.slice(0, 80) });
      }
    }
  }

  display.cycleEnd();
}
