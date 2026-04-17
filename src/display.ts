import chalk from "chalk";
import { eventBus } from "./eventBus.js";

const ts = () => chalk.dim(`[${new Date().toLocaleTimeString()}]`);

export const TOOL_COSTS: Record<string, number> = {
  get_balances:            0.005,
  get_portfolio:           0.010,
  get_transaction_history: 0.003,
  get_gas_prices:          0.001,
  get_token_price:         0.002,
  search_token:            0.001,
  get_swap_quote:          0.010,
  execute_swap:            0.100,
};

// Session-level tracking
let _cycleNum   = 0;
let _cyclePaid  = 0;
let _sessionPaid = 0;
let _startPortfolio  = 0;
let _currentPortfolio = 0;
let _lastWethChange: number | null = null;  // for ETH-adjusted dip computation

// ── Smart result formatters per tool ─────────────────────────────────────────

function formatResult(name: string, data: Record<string, unknown>): string {
  switch (name) {
    case "get_gas_prices": {
      const gwei =
        (data.base_fee ?? data.gas_price ?? data.baseFee ?? data.gwei) as number | undefined;
      if (gwei == null) break;
      const level =
        gwei < 0.05 ? chalk.bold.green("✓ green-light to trade") :
        gwei < 0.15 ? chalk.bold.yellow("⚠ borderline") :
                      chalk.bold.red("✗ too expensive — skip trades");
      return `Gas: ${chalk.bold.white(String(gwei))} gwei  ${level}`;
    }
    case "get_token_price": {
      const price  = (data.price_usd ?? data.price) as number | undefined;
      const change = (data.change_24h ?? data.price_change_24h) as number | undefined;
      if (price == null) break;
      const changeStr = change != null
        ? (change >= 0
          ? chalk.green(`+${change.toFixed(2)}% 24h ↑`)
          : chalk.red(`${change.toFixed(2)}% 24h ↓`))
        : "";
      // Compute ETH-adjusted dip if we have a stored WETH baseline
      let adjStr = "";
      if (change != null && _lastWethChange !== null) {
        const adj = change - _lastWethChange;
        adjStr = adj >= 0
          ? chalk.dim(`  ETH-adj: ${adj >= 0 ? "+" : ""}${adj.toFixed(1)}%`)
          : chalk.yellow(`  ETH-adj: ${adj.toFixed(1)}%`) + (adj <= -5 ? chalk.bold.yellow(" ← REAL DIP") : "");
      }
      const dipTag = change != null && change <= -5 && _lastWethChange === null
        ? chalk.bold.yellow("  ← DIP ALERT")
        : change != null && change >= 10
          ? chalk.bold.green("  ← RALLY")
          : "";
      return `Price: ${chalk.bold.white(`$${price}`)}  ${changeStr}${adjStr}${dipTag}`;
    }
    case "get_balances": {
      const usdc  = (data.usdc ?? data.USDC) as number | undefined;
      const total = (data.total_usd ?? data.total_value_usd) as number | undefined;
      if (total != null) {
        if (_startPortfolio === 0) _startPortfolio = total;
        _currentPortfolio = total;
      }
      const parts: string[] = [];
      if (usdc  != null) parts.push(`USDC: ${chalk.bold.white(`$${Number(usdc).toFixed(2)}`)}`);
      if (total != null) parts.push(`Total: ${chalk.bold.white(`$${Number(total).toFixed(2)}`)}`);
      return parts.join("  ") || JSON.stringify(data).slice(0, 100);
    }
    case "get_portfolio": {
      const total = (data.total_usd ?? data.total_value_usd) as number | undefined;
      const risk  = (data.risk_score ?? data.risk) as string | number | undefined;
      if (total != null) {
        if (_startPortfolio === 0) _startPortfolio = total;
        _currentPortfolio = total;
      }
      const parts: string[] = [];
      if (total != null) parts.push(`Portfolio: ${chalk.bold.white(`$${Number(total).toFixed(2)}`)}`);
      if (risk  != null) parts.push(`Risk: ${chalk.yellow(String(risk))}`);
      return parts.join("  ") || JSON.stringify(data).slice(0, 100);
    }
    case "get_swap_quote": {
      const out = (data.to_amount ?? data.estimated_output ?? data.output_amount) as string | number | undefined;
      const impact = (data.price_impact ?? data.priceImpact) as string | number | undefined;
      if (out == null) break;
      const impactStr = impact != null ? `  Impact: ${chalk.dim(String(impact) + "%")}` : "";
      return `Expected output: ${chalk.bold.green(String(out))}${impactStr}`;
    }
    case "execute_swap": {
      const txHash = (data.tx_hash ?? data.txHash) as string | undefined;
      return txHash
        ? `Confirmed on-chain: ${chalk.cyan(txHash.slice(0, 20) + "...")}`
        : "Swap complete";
    }
    default:
      break;
  }
  return JSON.stringify(data).slice(0, 110);
}

// ── Display API ───────────────────────────────────────────────────────────────

export const display = {
  header() {
    console.log("\n" + chalk.bold.cyan("━".repeat(65)));
    console.log(
      chalk.bold.cyan("  ⚡ ELSA") +
      chalk.bold.white(" DIP-BUYER AGENT") +
      chalk.dim("  ·  Base Network  ·  Claude-Powered")
    );
    console.log(chalk.bold.cyan("━".repeat(65)));
    eventBus.emit("header", {});
  },

  wake(cycleNum: number) {
    _cycleNum  = cycleNum;
    _cyclePaid = 0;
    _startPortfolio  = 0;
    _currentPortfolio = 0;
    _lastWethChange   = null;
    console.log(
      `\n${ts()} ${chalk.yellow("⏳")} ` +
      chalk.bold(`Cycle #${cycleNum}`) +
      chalk.dim(" — waking up, running portfolio cycle.\n")
    );
    eventBus.emit("wake", { cycleNum });
  },

  // ── x402 payment flow ──────────────────────────────────────────────────────

  payment(name: string, context = "") {
    const cost = TOOL_COSTS[name] ?? 0;
    _cyclePaid   += cost;
    _sessionPaid += cost;

    const costTag  = chalk.bold.yellow(`$${cost.toFixed(3)}`);
    const ctxTag   = context ? chalk.dim(` [${context}]`) : "";
    const totalTag = chalk.dim(`  (session: $${_sessionPaid.toFixed(3)})`);

    console.log(
      `\n${ts()} ${chalk.magenta("💸")} Agent spending ${costTag} ` +
      `→ ${chalk.bold(name)}${ctxTag}${totalTag}`
    );
    console.log(
      `${ts()} ${chalk.dim("   402 intercepted · signing USDC micropayment · verifying...")}`
    );
    eventBus.emit("payment", { name, context, cost, sessionTotal: _sessionPaid, cycleTotal: _cyclePaid });
  },

  paymentResult(name: string, data: unknown, isWeth = false) {
    const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;

    // Capture WETH baseline for relative strength display on subsequent token price calls
    if (name === "get_token_price" && isWeth) {
      const wethChange = (d.change_24h ?? d.price_change_24h) as number | undefined;
      if (wethChange != null) _lastWethChange = wethChange;
    }

    const summary = formatResult(name, d);
    const label = isWeth ? chalk.dim("WETH baseline") : "";
    console.log(`${ts()} ${chalk.green("✅")} Paid & verified  →  ${summary}${label ? "  " + label : ""}`);
    eventBus.emit("paymentResult", { name, data: d, isWeth });
  },

  paymentError(name: string, message: string) {
    console.log(`${ts()} ${chalk.red("❌")} ${chalk.bold(name)} failed: ${chalk.red(message)}`);
    eventBus.emit("paymentError", { name, message });
  },

  // ── Free analytics ────────────────────────────────────────────────────────

  analyticsRun() {
    console.log(`\n${ts()} ${chalk.bold.blue("🧮")} Running analytics... ${chalk.dim("(free — local computation, no x402)")}`);
    eventBus.emit("analyticsRun", {});
  },

  analyticsResult(data: unknown) {
    if (!data || typeof data !== "object") {
      console.log(`${ts()} ${chalk.dim("   ✓ Analytics complete.")}`);
      return;
    }
    const d = data as Record<string, unknown>;

    // Conviction strength header (if available from signal analysis)
    const convictionLevels = (d.conviction_levels as Record<string, string> | undefined) ?? {};
    if (Object.keys(convictionLevels).length > 0) {
      console.log(`${ts()} ${chalk.bold.blue("🎯 Conviction Levels:")}`);
      for (const [token, level] of Object.entries(convictionLevels)) {
        const levelColor =
          level === "high" ? chalk.bold.green(level) :
          level === "medium" ? chalk.bold.yellow(level) :
          chalk.dim(level);
        console.log(`${ts()} ${chalk.dim("   " + token + ":")} ${levelColor}`);
      }
    }

    // Signals — the most important output
    const signals = (d.signals as string[] | undefined) ?? [];
    if (signals.length) {
      console.log(`${ts()} ${chalk.bold.blue("⚡ Signals:")}`);
      for (const s of signals) {
        const icon =
          s.includes("STRONG BUY") || s.includes("🔥") ? chalk.bold.green("  ▶") :
          s.includes("HIGH CONVICTION") ? chalk.bold.green("  ▶") :
          s.includes("BUY SIGNAL") || s.includes("✅") ? chalk.green("  ▶") :
          s.includes("TAKE PROFIT") || s.includes("💰") ? chalk.bold.yellow("  ▶") :
          s.includes("STOP LOSS") || s.includes("🛑")  ? chalk.bold.red("  ▶") :
          s.includes("WAIT") || s.includes("⏳")       ? chalk.yellow("  ▷") :
          s.includes("⚠")                              ? chalk.red("  ▷") :
                                                          chalk.dim("  ·");
        console.log(`${icon} ${chalk.white(s)}`);
      }
    }

    // Open positions summary
    const pos = (d.open_positions as Record<string, unknown> | undefined) ?? {};
    for (const [token, p] of Object.entries(pos)) {
      const pp = p as Record<string, unknown>;
      const pnl = pp.pnl_pct as number;
      const pnlStr = pnl >= 0 ? chalk.green(`+${pnl}%`) : chalk.red(`${pnl}%`);
      console.log(
        `${ts()} ${chalk.dim("   " + token + ":")} ` +
        `${pnlStr} P&L  ·  ` +
        `${chalk.dim(String(pp.days_held) + "d held")}  ·  ` +
        `${chalk.dim("trajectory: " + pp.trajectory)}`
      );
    }

    // Performance summary
    const perf = d.performance_summary as Record<string, unknown> | undefined;
    if (perf) {
      const net = perf.net_pnl_after_costs as number;
      const netStr = net >= 0 ? chalk.green(`+$${net}`) : chalk.red(`-$${Math.abs(net)}`);
      console.log(
        `${ts()} ${chalk.dim("   Net P&L (after API costs):")} ${netStr}`
      );
    }
    eventBus.emit("analyticsResult", data);
  },

  // ── Memory ops ─────────────────────────────────────────────────────────────

  memoryRead() {
    console.log(`\n${ts()} ${chalk.blue("📚")} Reading memory...`);
    eventBus.emit("memoryRead", {});
  },

  memoryWrite() {
    console.log(`\n${ts()} ${chalk.blue("💾")} Writing memory...`);
    eventBus.emit("memoryWrite", {});
  },

  memoryDone(wasWrite: boolean) {
    console.log(
      `${ts()} ${chalk.dim(wasWrite ? "   ✓ Memory saved — cycle recorded." : "   ✓ Memory loaded — history ready.")}`
    );
    eventBus.emit("memoryDone", { wasWrite });
  },

  // ── Agent reasoning ────────────────────────────────────────────────────────

  agentText(text: string) {
    if (!text.trim()) return;
    console.log(`\n${ts()} ${chalk.white("🤖")} ${chalk.bold("Claude:")}`);
    const lines = text.split("\n").map(line => {
      // Highlight lines with cost/budget reasoning
      if (/\$[0-9]|gwei|skip.*save|saving|too expensive|not worth|preserve capital/i.test(line)) {
        return chalk.yellow(line);
      }
      // Highlight decisive action lines
      if (/buying|selling|executing|rotating|rebalancing|taking profit|cutting loss/i.test(line)) {
        return chalk.bold.white(line);
      }
      return chalk.white(line);
    });
    const indented = lines.join("\n").replace(/\n/g, "\n   ");
    console.log(`   ${indented}`);
    eventBus.emit("agentText", { text });
  },

  // ── Trade outcomes ─────────────────────────────────────────────────────────

  tradeExecuted(fromAmount: string, fromToken: string, toAmount: string, toToken: string, txHash: string) {
    console.log("\n" + chalk.bold.green("━".repeat(65)));
    console.log(chalk.bold.green("  🔄 SWAP EXECUTED ON BASE"));
    console.log(chalk.bold.green("━".repeat(65)));
    console.log(
      `  ${chalk.white(fromAmount)} ${chalk.yellow(fromToken)}` +
      `  →  ${chalk.bold.green(toAmount)} ${chalk.yellow(toToken)}`
    );
    console.log(`  ${chalk.dim("TxHash:")} ${chalk.cyan(txHash)}`);
    console.log(`  ${chalk.dim("View on BaseScan →")} ${chalk.underline.cyan(`https://basescan.org/tx/${txHash}`)}`);
    console.log(chalk.bold.green("━".repeat(65)) + "\n");
    eventBus.emit("tradeExecuted", { fromAmount, fromToken, toAmount, toToken, txHash });
  },

  dryRunResult(fromAmount: string, toAmount: string) {
    console.log("\n" + chalk.bold.yellow("━".repeat(65)));
    console.log(chalk.bold.yellow("  🔬 DRY RUN — Would have executed"));
    console.log(chalk.bold.yellow("━".repeat(65)));
    console.log(`  ${chalk.white(fromAmount)} USDC  →  ${chalk.bold.green(toAmount)}`);
    console.log(`  ${chalk.dim("Set DRY_RUN=false to execute for real.")}`);
    console.log(chalk.bold.yellow("━".repeat(65)) + "\n");
    eventBus.emit("dryRunResult", { fromAmount, toAmount });
  },

  // ── Cycle summary ──────────────────────────────────────────────────────────

  cycleEnd() {
    console.log("\n" + chalk.bold.cyan("━".repeat(65)));
    console.log(chalk.bold(`  📊 CYCLE #${_cycleNum} COMPLETE`));

    // x402 spend line
    const callsStr = chalk.dim(`($${_cyclePaid.toFixed(3)} this cycle · $${_sessionPaid.toFixed(3)} session total)`);
    console.log(`  x402 micropayments:   ${callsStr}`);

    // Portfolio delta line
    if (_currentPortfolio > 0 && _startPortfolio > 0) {
      const delta    = _currentPortfolio - _startPortfolio;
      const deltaStr = delta >= 0
        ? chalk.bold.green(`+$${delta.toFixed(2)}`)
        : chalk.bold.red(`-$${Math.abs(delta).toFixed(2)}`);
      const net = _currentPortfolio - _startPortfolio - _cyclePaid;
      const netStr = net >= 0
        ? chalk.green(`net +$${net.toFixed(2)} after API costs`)
        : chalk.red(`net -$${Math.abs(net).toFixed(2)} after API costs`);
      console.log(
        `  Portfolio:            ` +
        `${chalk.white(`$${_startPortfolio.toFixed(2)}`)} → ` +
        `${chalk.white(`$${_currentPortfolio.toFixed(2)}`)}  ` +
        `(${deltaStr}  ·  ${netStr})`
      );
    } else {
      console.log(`  Portfolio:            ${chalk.dim("no balance data this cycle")}`);
    }

    console.log(chalk.bold.cyan("━".repeat(65)) + "\n");
    eventBus.emit("cycleEnd", {
      cycleNum: _cycleNum,
      cyclePaid: _cyclePaid,
      sessionPaid: _sessionPaid,
      startPortfolio: _startPortfolio,
      currentPortfolio: _currentPortfolio,
    });
  },

  error(message: string) {
    console.log(`\n${ts()} ${chalk.red("💥")} Fatal: ${chalk.red(message)}\n`);
    eventBus.emit("error", { message });
  },
};
