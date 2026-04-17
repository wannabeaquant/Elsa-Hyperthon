// ── Token registry for Base mainnet ──────────────────────────────────────────
// Elsa supports any ERC-20 on Base via Permit2.
// These are well-known, high-liquidity Base tokens suitable for dip-buying.
// Use `npx tsx src/helpers/search.ts <name>` to discover or verify addresses.

export const TOKENS = {
  USDC: {
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    role: "base_currency", // never sell all USDC
  },
  WETH: {
    address: "0x4200000000000000000000000000000000000006",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    role: "watchlist",
  },
  DEGEN: {
    address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
    symbol: "DEGEN",
    name: "Degen",
    decimals: 18,
    role: "primary_target", // Base OG memecoin — high volatility, good dips
  },
  BRETT: {
    address: "0x532f27101965dd16442E59d40670FaF5eBB142E4",
    symbol: "BRETT",
    name: "Brett",
    decimals: 18,
    role: "target",
  },
  TOSHI: {
    address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
    symbol: "TOSHI",
    name: "Toshi",
    decimals: 18,
    role: "target",
  },
} as const;

export type TokenSymbol = keyof typeof TOKENS;

// Tokens the agent actively monitors for buy/sell opportunities
export const WATCHLIST = [TOKENS.DEGEN, TOKENS.BRETT, TOKENS.TOSHI] as const;
