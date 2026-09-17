import { useCallback } from "react";
import { trpc } from "@/providers/trpc";
import { useOrganizationBillingProfile } from "@/hooks/useOrganizationBillingProfile";
import { convertAmount, normalizeCurrency } from "@/lib/currency-fx";

export function useFxConvert() {
  const { profile } = useOrganizationBillingProfile();
  const baseCurrency = normalizeCurrency(profile?.baseCurrency);
  const { data } = trpc.finance.fx.rates.useQuery(
    { baseCurrency },
    {
      staleTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );

  const toBase = useCallback(
    (amount: number, fromCurrency?: string | null) =>
      convertAmount(amount, fromCurrency, baseCurrency, data ?? undefined),
    [baseCurrency, data],
  );

  return {
    baseCurrency,
    toBase,
    rates: data,
  };
}
