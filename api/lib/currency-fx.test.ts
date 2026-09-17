import { describe, expect, it } from "vitest";
import { convertAmount, fallbackRateTable, roundMoney } from "@/lib/currency-fx";

describe("convertAmount", () => {
  it("returns the same amount when currencies match", () => {
    expect(convertAmount(120, "USD", "USD")).toBe(120);
  });

  it("converts USD into INR using the direct USD quote, not an inverted INR quote", () => {
    const rates = {
      base: "INR",
      rates: { USD: 94.9459, INR: 1 },
      fetchedAt: new Date().toISOString(),
      source: "live" as const,
    };
    expect(convertAmount(500, "USD", "INR", rates)).toBe(47472.95);
  });

  it("keeps invoice totals accurate to paise after mixing currencies", () => {
    const rates = {
      base: "INR",
      rates: { USD: 94.9459, INR: 1 },
      fetchedAt: new Date().toISOString(),
      source: "live" as const,
    };
    const usdInInr = convertAmount(500, "USD", "INR", rates);
    const inrInvoice = convertAmount(498200.63, "INR", "INR", rates);
    expect(roundMoney(usdInInr + inrInvoice)).toBe(545673.58);
  });

  it("falls back to USD pivot when a rate is missing", () => {
    const converted = convertAmount(100, "USD", "INR");
    expect(converted).toBeCloseTo(9495, 0);
  });

  it("does not inflate USD→INR by inverting a rounded INR→USD quote", () => {
    // Old bug: 1 INR = 0.010526 USD → 1/0.010526 ≈ 95.00, so $500 became ~₹47,501
    const inverted = roundMoney(500 / 0.010526);
    const correct = convertAmount(500, "USD", "INR", {
      base: "INR",
      rates: { USD: 94.9459, INR: 1 },
      fetchedAt: new Date().toISOString(),
      source: "live",
    });
    expect(inverted).toBeGreaterThan(47500);
    expect(correct).toBe(47472.95);
    expect(correct).toBeLessThan(inverted);
  });
});
