import {
  convertAmount,
  fallbackRateTable,
  normalizeCurrency,
  type FxRateTable,
} from "@/lib/currency-fx";
import { isAuthDisabled } from "./dev-mode";
import { hasMongoConfigured } from "../queries/connection";
import { findOrganizationById } from "./tenant";

const CACHE_MS = 15 * 60 * 1000;
const cache = new Map<string, { table: FxRateTable; expiresAt: number }>();

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timer),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const timeout = withTimeout(8000);
  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    timeout.dispose();
  }
}

/** Quotes as 1 USD = X units of each currency. Avoids inverting tiny INR→USD decimals. */
type UsdQuotes = Record<string, number>;

function parseUsdQuotes(rates: Record<string, unknown> | null | undefined): UsdQuotes | null {
  if (!rates) return null;
  const quotes: UsdQuotes = { USD: 1 };
  for (const [code, value] of Object.entries(rates)) {
    const currency = normalizeCurrency(code);
    const usdToCurrency = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(usdToCurrency) || usdToCurrency <= 0) continue;
    quotes[currency] = usdToCurrency;
  }
  return Object.keys(quotes).length > 1 ? quotes : null;
}

function usdQuotesToBaseRates(base: string, usdQuotes: UsdQuotes): Record<string, number> | null {
  const usdToBase = usdQuotes[base];
  if (!usdToBase || usdToBase <= 0) return null;
  const rates: Record<string, number> = { [base]: 1 };
  for (const [code, usdToCurrency] of Object.entries(usdQuotes)) {
    if (!usdToCurrency || usdToCurrency <= 0) continue;
    rates[normalizeCurrency(code)] = usdToBase / usdToCurrency;
  }
  return rates;
}

async function fetchOpenErApiUsdQuotes(): Promise<UsdQuotes | null> {
  const data = await fetchJson("https://open.er-api.com/v6/latest/USD");
  if (!data || typeof data !== "object") return null;
  const payload = data as { result?: string; rates?: Record<string, unknown> };
  if (payload.result !== "success") return null;
  return parseUsdQuotes(payload.rates);
}

async function fetchFrankfurterUsdQuotes(): Promise<UsdQuotes | null> {
  const data = await fetchJson("https://api.frankfurter.app/latest?from=USD");
  if (!data || typeof data !== "object") return null;
  const payload = data as { rates?: Record<string, unknown> };
  return parseUsdQuotes(payload.rates);
}

async function fetchCurrencyApiUsdQuotes(): Promise<UsdQuotes | null> {
  const data = await fetchJson(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
  );
  if (!data || typeof data !== "object") return null;
  const payload = data as { usd?: Record<string, unknown> };
  return parseUsdQuotes(payload.usd);
}

export async function getFxRateTable(baseCurrency: string): Promise<FxRateTable> {
  const base = normalizeCurrency(baseCurrency);
  const cached = cache.get(base);
  if (cached && cached.expiresAt > Date.now()) return cached.table;

  const usdQuotes =
    (await fetchOpenErApiUsdQuotes()) ??
    (await fetchFrankfurterUsdQuotes()) ??
    (await fetchCurrencyApiUsdQuotes());
  const live = usdQuotes ? usdQuotesToBaseRates(base, usdQuotes) : null;
  const table: FxRateTable = live
    ? {
        base,
        rates: { ...live, [base]: 1 },
        fetchedAt: new Date().toISOString(),
        source: "live",
      }
    : fallbackRateTable(base);

  cache.set(base, { table, expiresAt: Date.now() + CACHE_MS });
  return table;
}

const mockOrgBaseCurrency = new Map<number, string>();

/** Keep mock/local portal currency in sync with organization billing writes. */
export function rememberMockOrgBaseCurrency(organizationId: number, currency: string) {
  mockOrgBaseCurrency.set(organizationId, normalizeCurrency(currency));
}

export async function resolveOrgBaseCurrency(organizationId: number): Promise<string> {
  const remembered = mockOrgBaseCurrency.get(organizationId);
  if (isAuthDisabled() || !hasMongoConfigured()) {
    return remembered ?? "INR";
  }
  try {
    const org = await findOrganizationById(organizationId);
    return normalizeCurrency(org?.billingProfile?.baseCurrency);
  } catch {
    return remembered ?? "INR";
  }
}

export type FxConverter = {
  baseCurrency: string;
  rates: FxRateTable;
  toBase: (amount: number, fromCurrency?: string | null) => number;
};

export async function createFxConverter(organizationId: number): Promise<FxConverter> {
  const baseCurrency = await resolveOrgBaseCurrency(organizationId);
  const rates = await getFxRateTable(baseCurrency);
  return {
    baseCurrency,
    rates,
    toBase: (amount, fromCurrency) =>
      convertAmount(amount, fromCurrency, baseCurrency, rates),
  };
}
