import type { CurrencyMode } from "./types";

/** Illustrative USD/unit constants from Spec 03. Never live market quotes. */
export const INDICATIVE_USD_RATES: Readonly<Record<string, number>> =
  Object.freeze({
    PAB: 1,
    USD: 1,
    MXN: 1 / 20,
    BRL: 1 / 5.7,
    COP: 1 / 4200,
    CRC: 1 / 510,
    GTQ: 1 / 7.7,
  });

export function comparableAmount(
  amount: number | null,
  currency: string | null,
  mode: CurrencyMode,
): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  if (mode === "original") return amount;
  const rate =
    currency && Object.hasOwn(INDICATIVE_USD_RATES, currency)
      ? INDICATIVE_USD_RATES[currency]
      : null;
  if (rate === null) return null;
  const converted = amount * rate;
  return Number.isFinite(converted) ? converted : null;
}
