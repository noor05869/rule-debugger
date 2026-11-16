import type { RuleConfig } from "./types";
export type { RuleConfig } from "./types";

/** Assessment interpretations, not thresholds supplied by example_rules.json. */
export const DEFAULT_RULE_CONFIG: RuleConfig = {
  currencyMode: "original",
  highValue: { threshold: 1000, compareSenderAverage: false },
  smallFrequent: { maxAmount: 50, minCount: 5, windowMinutes: 60 },
  unusualType: { rarityPercent: 10 },
  riskWatchlist: { merchants: [], countries: [] },
  crossBorder: { minAmount: 500 },
  outsideHours: { startHour: 8, endHour: 20, flagWeekends: false },
  cashWithdrawal: { minAmount: 1000 },
};

export function isDefaultConfig(config: RuleConfig): boolean {
  return JSON.stringify(config) === JSON.stringify(DEFAULT_RULE_CONFIG);
}

export function validateRuleConfig(config: RuleConfig): void {
  const amounts = [
    config.highValue.threshold,
    config.smallFrequent.maxAmount,
    config.crossBorder.minAmount,
    config.cashWithdrawal.minAmount,
  ];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Amounts must be finite and nonnegative.");
  if (
    [config.smallFrequent.minCount, config.smallFrequent.windowMinutes].some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    )
  )
    throw new Error("Count and window must be positive integers.");
  if (
    !Number.isFinite(config.unusualType.rarityPercent) ||
    config.unusualType.rarityPercent < 0 ||
    config.unusualType.rarityPercent > 100
  )
    throw new Error("Rarity must be between 0 and 100 percent.");
  const { startHour, endHour } = config.outsideHours;
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 0 ||
    endHour > 24 ||
    startHour >= endHour
  )
    throw new Error("Business hours require 0 <= start < end <= 24.");
}
