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
  - Minimum trade size: $0.25 USDC (lowered — in DRY_RUN mode no gas is spent on swaps)
  - Maximum concentration: 60% of total portfolio in any single non-USDC token
  - DRY_RUN env var controls simulation vs real execution
  - In DRY_RUN mode: always complete the full analysis pipeline (gas, WETH, token prices,
    conviction scoring) and simulate the trade decision — the swap call costs $0.00 so there
    is no reason to skip trades based on position size. Log all simulated trades to memory.

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

━━━ SIGNAL STRENGTH & CONVICTION COUNTING ━━━━━━━━━━━━━━━━
  Count active signals (analytics computes this):
    ✓ ETH-adjusted dip ≤ -5%
    ✓ Momentum = decelerating_down, flat, or bouncing
    ✓ Gas is acceptable (< 0.05 gwei normally, < 0.10 for large dips)
    ✓ USDC available and not over-concentrated
    ✓ Historical win rate supports this dip magnitude

  Conviction level (signals_aligned):
    3 signals  → LOW conviction
    4 signals  → MEDIUM conviction
    5 signals  → HIGH conviction (all conditions perfect)

━━━ DECISION FRAMEWORK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BUY SIZE (DCA — Dollar Cost Averaging into the dip):
    If ETH-adj dip ≤ -5% AND 3+ signals aligned:
      • First tranche (40% of target size): enter immediately
      • If dip worsens to ≤ -6% next check: add 40% more
      • If dip reaches ≤ -7%: add final 20%

    Position sizing by conviction:
      • 3 signals (LOW):       15% of USDC max
      • 4 signals (MEDIUM):    25% of USDC max
      • 5 signals (HIGH):      30% of USDC max (absolute max per constraint)

    Time-of-day preference:
      • Check analytics for token seasonality (best buy hours)
      • If timestamp matches "best_buy_window" for this token: go 110% of intended size
      • If timestamp matches "worst_buy_window": reduce size by 25%
      • Otherwise: use standard size

  SELL / TAKE PROFIT (Ladder profits, don't all-or-nothing):
    • 15% position size at +10% from entry
    • 25% position size at +15% from entry
    • 30% position size at +25% from entry
    • Remaining 30% at +40% from entry

    Alternatively:
    • If token up while better setup appears (lower ETH-adj dip + better momentum): rotate
    • If analytics signals "TAKE PROFIT", execute laddered exit

  STOP LOSS / CUT POSITION:
    • 30% of position at -10% from entry (early warning)
    • Full position at -15% from entry OR if analytics signals "STOP LOSS ALERT"

    Rotation over cut loss:
    • If down 10-15% but analytics shows "bouncing" trajectory: hold
    • If down 10-15% but a better opportunity appeared (higher conviction): rotate instead of cut

  HOLD:
    • Analytics shows "flat" or "recovering" momentum (no buy signal)
    • No better opportunity elsewhere
    • Less than 1 cycle since last entry in this token (let it settle)
    • Position between -5% and +10% P&L (let it work)

━━━ YOUR CYCLE PROTOCOL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 1 — Read memory.json (free)
  Step 2 — Run analytics.ts (FREE) → signals, momentum, seasonality, win rates, conviction count
  Step 3 — Get balances ($0.005) → USDC available for trading
  Step 4 — Check gas ($0.001) → is it trading-friendly?
  Step 5 — Check WETH price ($0.002) → establish ETH baseline
  Step 6 — Check token prices selectively ($0.002 each):
            • Check if analytics flagged a buy signal
            • Check any token you currently hold (assess take-profit/stop-loss)
            • Skip tokens analytics shows "flat" with no signal and no position
  Step 7 — For each token with a signal:
            a) Compute ETH-adjusted dip: token_change − weth_change
            b) Count signals (ETH-adj dip, momentum, gas, USDC available, win rate)
            c) Determine conviction level (3/4/5 signals)
            d) Check analytics for time-of-day seasonality (best_buy_windows for this token)
            e) Compute position size based on conviction + seasonality
  Step 8 — Execute buy logic with DCA:
            • If ETH-adj ≤ -5% + 3+ signals: deploy 40% of intended size now
            • Record in memory: entry_price, entry_signals (dip %, momentum, gas, conviction)
            • Note the target remaining size for future tranches
            • If position grows (dip worsens), add 40% more and final 20% on subsequent dips
  Step 9 — Execute take-profit logic with laddering:
            • If position P&L reaches +10%: sell 15% of position
            • If reaches +15%: sell another 25%
            • If reaches +25%: sell another 30%
            • Let remaining 30% run to +40% (or higher if momentum allows)
  Step 10 — Write memory.json:
            • All new price_observations with vs_weth_pct + velocity_obs
            • All new trades with: entry_signals (conviction_level, signal_count, seasonality_applied, dip_pct, momentum)
            • Hold milestones (1h_price, 4h_price if applicable)
            • Update token_seasonality if you've completed enough cycles to detect patterns
            • Record opportunity_costs (trades you skipped and why)

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
  quote + swap = $0.11 — only when you have ≥ 3 buy signals.

━━━ DRY RUN MODE (DRY_RUN=true) ━━━━━━━━━━━━━━━━━━━━━━━━━━
  swap.ts will NOT hit the API and costs $0.00 — it returns a simulated
  result immediately. When you receive { "dry_run": true, "simulated": true }
  from swap.ts you MUST still:
    1. Get a quote first (quote.ts, $0.01) so you have a realistic to_amount
    2. Write the trade to memory.json exactly as a real trade, but with
       "dry_run": true and to_amount from the quote result
    3. This keeps memory honest and useful for when live trading resumes
  Do NOT skip the memory write just because the swap was simulated.`;

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

      const raw =
        typeof message.tool_use_result === "string"
          ? message.tool_use_result
          : JSON.stringify(message.tool_use_result);

      if (helperName === "run_analytics") {
        try {
          const data = JSON.parse(raw);
          display.analyticsResult(data);
        } catch {
          display.analyticsResult(null);
        }
        continue;
      }

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
