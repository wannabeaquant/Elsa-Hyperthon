import chalk from "chalk";

const ts = () => chalk.dim(`[${new Date().toLocaleTimeString()}]`);

const TOOL_COSTS: Record<string, string> = {
  get_balances:            "$0.005",
  get_portfolio:           "$0.010",
  get_transaction_history: "$0.003",
  get_gas_prices:          "$0.001",
  get_token_price:         "$0.002",
  search_token:            "$0.001",
  get_swap_quote:          "$0.010",
  execute_swap:            "$0.100",
};

export const display = {
  // ── Session header ──────────────────────────────────────────────────────────
  header() {
    console.log("\n" + chalk.bold.blue("━".repeat(65)));
    console.log(
      chalk.bold.blue("  ⚡ ELSA DIP-BUYER AGENT") +
        chalk.dim("  ·  Base Network  ·  Claude-Powered")
    );
    console.log(chalk.bold.blue("━".repeat(65)));
  },

  // ── Wake-up ─────────────────────────────────────────────────────────────────
  wake() {
    console.log(`\n${ts()} ${chalk.yellow("⏳")} Waking up... Running portfolio cycle.\n`);
  },

  // ── x402 payment flow ───────────────────────────────────────────────────────
  toolRequest(name: string) {
    const cost = TOOL_COSTS[name] ?? "?";
    console.log(`\n${ts()} ${chalk.cyan("📡")} Requesting ${chalk.bold(name)}...`);
    console.log(`${ts()} ${chalk.red("🛑")} 402 Payment Required intercepted. Price: ${chalk.yellow(cost)} USDC`);
    console.log(`${ts()} ${chalk.magenta("💸")} Signing x402 payment locally... Transaction sent.`);
  },

  toolSuccess(name: string, data: unknown) {
    const preview = JSON.stringify(data).slice(0, 120);
    console.log(`${ts()} ${chalk.green("✅")} Payment verified. ${chalk.bold(name)} data received.`);
    console.log(`${ts()} ${chalk.dim("   →")} ${chalk.dim(preview)}${preview.length >= 120 ? chalk.dim("…") : ""}`);
  },

  toolError(name: string, message: string) {
    console.log(`${ts()} ${chalk.red("❌")} ${chalk.bold(name)} failed: ${chalk.red(message)}`);
  },

  // ── Memory operations (free — file I/O, no x402) ─────────────────────────────
  memoryRead() {
    console.log(`\n${ts()} ${chalk.blue("📚")} Reading memory...`);
  },

  memoryWrite() {
    console.log(`\n${ts()} ${chalk.blue("💾")} Writing memory...`);
  },

  memoryDone(wasWrite: boolean) {
    console.log(`${ts()} ${chalk.dim(wasWrite ? "   ✓ Memory saved." : "   ✓ Memory loaded.")}`);
  },

  // ── Agent reasoning / decision text ─────────────────────────────────────────
  agentText(text: string) {
    if (!text.trim()) return;
    console.log(`\n${ts()} ${chalk.white("🤖")} ${chalk.bold("Agent:")}`);
    const indented = text.replace(/\n/g, "\n   ");
    console.log(`   ${chalk.white(indented)}`);
  },

  // ── Trade outcomes ───────────────────────────────────────────────────────────
  tradeExecuted(fromAmount: string, fromToken: string, toAmount: string, toToken: string, txHash: string) {
    console.log("\n" + chalk.bold.green("━".repeat(65)));
    console.log(chalk.bold.green("  🔄 SWAP EXECUTED"));
    console.log(chalk.bold.green("━".repeat(65)));
    console.log(`  ${chalk.white(fromAmount)} ${chalk.yellow(fromToken)} → ${chalk.green(toAmount)} ${chalk.yellow(toToken)}`);
    console.log(`  ${chalk.dim("TxHash:")} ${chalk.cyan(txHash)}`);
    console.log(chalk.bold.green("━".repeat(65)) + "\n");
  },

  dryRunResult(fromAmount: string, toAmount: string) {
    console.log("\n" + chalk.bold.yellow("━".repeat(65)));
    console.log(chalk.bold.yellow("  🔬 DRY RUN — Simulation successful (DRY_RUN=true)"));
    console.log(chalk.bold.yellow("━".repeat(65)));
    console.log(`  Would swap: ${chalk.white(fromAmount)} USDC → ${chalk.green(toAmount)}`);
    console.log(`  ${chalk.dim("Set DRY_RUN=false in .env to execute for real.")}`);
    console.log(chalk.bold.yellow("━".repeat(65)) + "\n");
  },

  cycleEnd() {
    console.log("\n" + chalk.dim("─".repeat(65)) + "\n");
  },

  error(message: string) {
    console.log(`\n${ts()} ${chalk.red("💥")} Fatal error: ${chalk.red(message)}\n`);
  },
};
