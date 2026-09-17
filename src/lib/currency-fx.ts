/** Units of each currency per 1 USD — used when live rates are unavailable. */
export const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  INR: 94.95,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.6725,
  AUD: 1.52,
  CAD: 1.36,
  SGD: 1.34,
  JPY: 149,
  CHF: 0.88,
  NZD: 1.64,
  SAR: 3.75,
  QAR: 3.64,
  HKD: 7.81,
};

export type FxRateTable = {
  base: string;
  /** 1 unit of `currency` = rates[currency] units of `base`. */
  rates: Record<string, number>;
  fetchedAt: string;
  source: "live" | "fallback";
};

export function normalizeCurrency(code?: string | null): string {
  const value = String(code || "INR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "INR";
}

export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function convertViaUsdFallback(
  amount: number,
  from: string,
  to: string,
): number {
  const fromRate = FALLBACK_USD_RATES[from];
  const toRate = FALLBACK_USD_RATES[to];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

/**
 * Convert `amount` from `fromCurrency` into `toCurrency`.
 * When `rates` is provided it must be quoted into `toCurrency` (portal base).
 */
export function convertAmount(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  rates?: FxRateTable | Record<string, number> | null,
): number {
  if (!Number.isFinite(amount)) return 0;
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return roundMoney(amount);

  const table = rates && "rates" in rates ? rates : null;
  const map = table ? table.rates : (rates as Record<string, number> | null | undefined);
  const tableBase = table ? normalizeCurrency(table.base) : to;

  if (map && tableBase === to) {
    const live = map[from];
    if (typeof live === "number" && live > 0) {
      return roundMoney(amount * live);
    }
  }

  return roundMoney(convertViaUsdFallback(amount, from, to));
}

export function fallbackRateTable(baseCurrency: string): FxRateTable {
  const base = normalizeCurrency(baseCurrency);
  const rates: Record<string, number> = { [base]: 1 };
  for (const code of Object.keys(FALLBACK_USD_RATES)) {
    if (code === base) continue;
    rates[code] = convertViaUsdFallback(1, code, base);
  }
  return {
    base,
    rates,
    fetchedAt: new Date().toISOString(),
    source: "fallback",
  };
}
