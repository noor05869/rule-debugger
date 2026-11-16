// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE_CONFIG,
  validateRuleConfig,
  isDefaultConfig,
} from "../rule-config";
import { getContextKey } from "../rule-context";
import { previewRecord } from "../rule-preview";
import { evaluateRules } from "../rules";
import { createWorkerHandler } from "../worker-runtime";
import { EMPTY_FILTERS } from "../query";
import { record, context } from "./rule-fixtures";
import type { EvaluatedRecord, WorkerResponse } from "../types";

describe("configuration and immediate preview", () => {
  it("validates finite amounts, positive integer counts/windows, percent bounds and ordered hours", () => {
    expect(() => validateRuleConfig(DEFAULT_RULE_CONFIG)).not.toThrow();
    expect(isDefaultConfig(structuredClone(DEFAULT_RULE_CONFIG))).toBe(true);
    for (const change of [
      { highValue: { threshold: NaN, compareSenderAverage: false } },
      { smallFrequent: { maxAmount: 50, minCount: 0, windowMinutes: 60 } },
      { smallFrequent: { maxAmount: 50, minCount: 2.5, windowMinutes: 0 } },
      { outsideHours: { startHour: 20, endHour: 8, flagWeekends: false } },
      { unusualType: { rarityPercent: 101 } },
    ])
      expect(() =>
        validateRuleConfig({ ...DEFAULT_RULE_CONFIG, ...change }),
      ).toThrow();
  });
  it("updates ordinary conditions immediately and marks only stale rolling context pending", () => {
    const input = record({ amount: 42000, currency: "COP" });
    const snapshot: EvaluatedRecord = {
      record: input,
      context: context({ recentSmallTransactionCount: 1 }),
      contextKey: getContextKey(DEFAULT_RULE_CONFIG),
      results: evaluateRules(input, DEFAULT_RULE_CONFIG, context()),
    };
    const threshold = previewRecord(snapshot, {
      ...DEFAULT_RULE_CONFIG,
      highValue: { threshold: 50000, compareSenderAverage: false },
    });
    expect(threshold.value.results[0].status).toBe("CLEAR");
    expect(threshold.pendingRuleIds).toEqual([]);
    const usd = previewRecord(snapshot, {
      ...DEFAULT_RULE_CONFIG,
      currencyMode: "usd",
    });
    expect(usd.value.results[0].status).toBe("CLEAR");
    expect(usd.pendingRuleIds).toEqual(["RULE_002"]);
    expect(usd.value.context.recentSmallTransactionCount).toBeNull();
    expect(
      previewRecord(snapshot, {
        ...DEFAULT_RULE_CONFIG,
        smallFrequent: { ...DEFAULT_RULE_CONFIG.smallFrequent, minCount: 10 },
      }).pendingRuleIds,
    ).toEqual([]);
    expect(
      previewRecord(snapshot, {
        ...DEFAULT_RULE_CONFIG,
        smallFrequent: {
          ...DEFAULT_RULE_CONFIG.smallFrequent,
          windowMinutes: 30,
        },
      }).pendingRuleIds,
    ).toEqual(["RULE_002"]);
  });
});

describe("worker default/current impact", () => {
  it("compares against original-currency defaults and filters changed verdicts for the selected rule", async () => {
    const responses: WorkerResponse[] = [];
    const transactions = [
      record({ transaction_id: "COP", amount: 42000, currency: "COP" })
        .transaction,
      record({ transaction_id: "USD", amount: 2000 }).transaction,
    ];
    const handle = createWorkerHandler(
      async (url) => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify(url.includes("transactions") ? transactions : []),
      }),
      (value) => responses.push(value),
    );
    await handle({ type: "LOAD", requestId: 1 });
    await handle({
      type: "QUERY",
      requestId: 2,
      config: { ...DEFAULT_RULE_CONFIG, currencyMode: "usd" },
      filters: { ...EMPTY_FILTERS, changedOnly: true },
      page: 0,
      selectedRuleId: "RULE_001",
    });
    const result = responses[1];
    expect(result.type).toBe("RESULTS");
    if (result.type !== "RESULTS") throw new Error("Expected results");
    expect(result.totalMatches).toBe(1);
    expect(result.rows[0].record.transaction.transaction_id).toBe("COP");
    expect(result.rows[0].defaultResults?.[0].status).toBe("FIRED");
    expect(result.rows[0].results[0].status).toBe("CLEAR");
    expect(result.comparisons[0]).toMatchObject({
      ruleId: "RULE_001",
      defaultFired: 2,
      currentFired: 1,
      changed: 1,
      referenceCurrencyMode: "original",
      currentCurrencyMode: "usd",
    });
    await handle({
      type: "QUERY",
      requestId: 3,
      config: DEFAULT_RULE_CONFIG,
      filters: { ...EMPTY_FILTERS, changedOnly: true },
      page: 0,
      selectedRuleId: "RULE_001",
    });
    expect(responses[2]).toMatchObject({ type: "RESULTS", totalMatches: 0 });
    await handle({
      type: "QUERY",
      requestId: 4,
      config: {
        ...DEFAULT_RULE_CONFIG,
        riskWatchlist: { merchants: ["No matching merchant"], countries: [] },
      },
      filters: { ...EMPTY_FILTERS, changedOnly: true },
      page: 0,
      selectedRuleId: "RULE_004",
    });
    const configured = responses[3];
    expect(configured).toMatchObject({ type: "RESULTS", totalMatches: 2 });
    if (configured.type !== "RESULTS") throw new Error("Expected results");
    expect(configured.comparisons[3]).toMatchObject({
      defaultFired: 0,
      currentFired: 0,
      changed: 2,
    });
  });
});
