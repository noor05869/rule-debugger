// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSenderProfiles } from "../data";
import { comparableAmount } from "../fx";
import { DEFAULT_RULE_CONFIG as defaults } from "../rule-config";
import { evaluateRules } from "../rules";
import type { RuleConfig, RuleContext } from "../types";
import { record, context } from "./rule-fixtures";

const profile = buildSenderProfiles([
  ...Array.from({ length: 9 }, (_, i) =>
    record({
      transaction_id: `a${i}`,
      transaction_type: "online",
      amount: 100,
    }),
  ),
  record({ transaction_id: "b", transaction_type: "refund", amount: 100 }),
]).get("sender-1")!;

function evaluate(
  id: number,
  input = record(),
  config: RuleConfig = structuredClone(defaults),
  ctx: RuleContext = context({
    senderProfile: profile,
    recentSmallTransactionCount: 5,
  }),
) {
  return evaluateRules(input, config, ctx)[id - 1];
}

describe("rule boundaries and missing evidence", () => {
  it.each([
    [49, 5, "FIRED"],
    [50, 5, "FIRED"],
    [51, 5, "CLEAR"],
    [50, 4, "CLEAR"],
  ] as const)("R2 amount %s, count %s => %s", (amount, count, status) => {
    const output = evaluate(
      2,
      record({ amount }),
      defaults,
      context({ recentSmallTransactionCount: count }),
    );
    expect(output.status).toBe(status);
    expect(output.steps).toContainEqual(
      expect.objectContaining({ actual: count, expected: 5, operator: ">=" }),
    );
  });
  it("R2 does not use the cumulative feature count or stale context", () => {
    const input = record({ amount: 10 });
    expect(evaluate(2, input, defaults, context()).status).toBe("DATA_GAP");
    expect(
      evaluate(
        2,
        input,
        { ...defaults, currencyMode: "usd" },
        context({ recentSmallTransactionCount: 5 }),
      ).status,
    ).toBe("DATA_GAP");
  });
  it.each([
    { sender_account_id: null },
    { txn_date_time: "2024-02-30 12:00:00" },
    { amount: NaN },
  ])("R2 required input remains a gap: %j", (change) => {
    expect(evaluate(2, record(change)).status).toBe("DATA_GAP");
  });
  it("R3 uses a strict cutoff and the known-type denominator", () => {
    const input = record({ transaction_type: "refund" });
    expect(evaluate(3, input).status).toBe("CLEAR"); // 1/10 = 10%, not <10%
    const output = evaluate(3, input, {
      ...defaults,
      unusualType: { rarityPercent: 11 },
    });
    expect(output.status).toBe("FIRED");
    expect(output.steps).toContainEqual(
      expect.objectContaining({ actual: 10, expected: 11, operator: "<" }),
    );
    expect(output.reason).toMatch(/snapshot/i);
    expect(
      evaluate(3, record({ transaction_type: "chip_and_pin" })).status,
    ).toBe("FIRED");
    expect(evaluate(3, record({ transaction_type: null })).status).toBe(
      "DATA_GAP",
    );
    expect(evaluate(3, input, defaults, context()).status).toBe("DATA_GAP");
  });
  it("R4 is unconfigured until a list has an entry", () => {
    expect(evaluate(4).status).toBe("DATA_GAP");
    expect(
      evaluate(4, record(), {
        ...defaults,
        riskWatchlist: { merchants: ["  "], countries: [] },
      }).status,
    ).toBe("DATA_GAP");
  });
  it("R4 matches trimmed case-insensitive exact entries", () => {
    const config = {
      ...defaults,
      riskWatchlist: { merchants: [" SHOP "], countries: [] },
    };
    expect(evaluate(4, record(), config).status).toBe("FIRED");
    expect(
      evaluate(
        4,
        record({ merchant_description_condensed: "Shopkeeper" }),
        config,
      ).status,
    ).toBe("CLEAR");
  });
  it("R4 evaluates only configured branches; missing configured evidence is a gap", () => {
    const input = record({ merchant_description_condensed: null });
    const countryOnly = {
      ...defaults,
      riskWatchlist: { merchants: [], countries: [" pan "] },
    };
    expect(evaluate(4, input, countryOnly).status).toBe("FIRED");
    expect(
      evaluate(4, input, {
        ...countryOnly,
        riskWatchlist: { ...countryOnly.riskWatchlist, merchants: ["Shop"] },
      }).status,
    ).toBe("DATA_GAP");
    expect(
      evaluate(4, record({ merchant_country: null }), countryOnly).status,
    ).toBe("DATA_GAP");
  });
  it.each([
    [499, "CLEAR"],
    [500, "FIRED"],
    [501, "FIRED"],
  ] as const)("R5 amount %s => %s", (amount, status) => {
    expect(
      evaluate(5, record({ merchant_country: "COL", amount })).status,
    ).toBe(status);
  });
  it("R5 exposes incomplete evidence even for a domestic transaction", () => {
    expect(evaluate(5, record({ amount: null })).status).toBe("DATA_GAP");
    expect(
      evaluate(5, record({ merchant_country: null, amount: 1 })).status,
    ).toBe("DATA_GAP");
    expect(evaluate(5, record()).status).toBe("CLEAR");
    expect(evaluate(5, record(), defaults, context()).status).toBe("DATA_GAP");
  });
  it.each([
    [7, "FIRED"],
    [8, "CLEAR"],
    [19, "CLEAR"],
    [20, "FIRED"],
  ] as const)("R6 source hour %s => %s", (hour, status) => {
    const input = record();
    input.features = {
      transaction_id: "TXN_1",
      sender_account_id: "sender-1",
      receiver_account_id: 1,
      amount: 1001,
      currency: "USD",
      transaction_type: "online",
      transaction_count: 1,
      avg_transaction_amount: 1001,
      hour_of_day: hour,
      day_of_week: 5,
      merchant_avg_transaction_amount: 1001,
    };
    const output = evaluate(6, input);
    expect(output.status).toBe(status);
    expect(output.reason).toMatch(/timezone.*unknown/i);
    expect(output.steps[0]).toMatchObject({ source: "features", actual: hour });
    expect(
      evaluate(6, input, {
        ...defaults,
        outsideHours: { ...defaults.outsideHours, flagWeekends: true },
      }).status,
    ).toBe("FIRED");
    input.features.day_of_week = 0; // Python Monday, not JS Sunday.
    expect(
      evaluate(6, input, {
        ...defaults,
        outsideHours: { ...defaults.outsideHours, flagWeekends: true },
      }).status,
    ).toBe(status);
    input.features.day_of_week = null;
    expect(
      evaluate(6, input, {
        ...defaults,
        outsideHours: { ...defaults.outsideHours, flagWeekends: true },
      }).status,
    ).toBe("DATA_GAP");
  });
  it("R6 missing features is a gap, not an inferred local browser hour", () => {
    expect(evaluate(6).status).toBe("DATA_GAP");
  });
  it.each([999, 1000, 1001])(
    "R7 at %s remains a gap without established cash evidence",
    (amount) => {
      const output = evaluate(7, record({ amount }));
      expect(output.status).toBe("DATA_GAP");
      expect(output.steps).toContainEqual(
        expect.objectContaining({
          actual: amount,
          expected: 1000,
          operator: ">=",
          outcome: amount >= 1000 ? "MATCHED" : "NOT_MATCHED",
        }),
      );
      expect(output.steps).toContainEqual(
        expect.objectContaining({ outcome: "MISSING" }),
      );
    },
  );
  it("R1 optional average uses only the matching sender and currency snapshot", () => {
    const config = {
      ...defaults,
      highValue: { threshold: 10, compareSenderAverage: true },
    };
    expect(evaluate(1, record({ amount: 101 }), config).status).toBe("FIRED");
    expect(evaluate(1, record({ amount: 100 }), config).status).toBe("CLEAR");
    expect(evaluate(1, record({ currency: "COP" }), config).status).toBe(
      "DATA_GAP",
    );
    expect(
      evaluate(1, record({ currency: "COP" }), config).steps.at(-1),
    ).toMatchObject({ expected: null, outcome: "MISSING" });
    expect(
      evaluate(1, record({ sender_account_id: "other" }), config).status,
    ).toBe("DATA_GAP");
  });
  it("is deterministic, serializable and leaves frozen inputs unchanged", () => {
    const input = record();
    Object.freeze(input.transaction);
    Object.freeze(input);
    const config = structuredClone(defaults);
    Object.values(config).forEach((value) => {
      if (typeof value === "object") Object.freeze(value);
    });
    Object.freeze(config);
    const first = evaluateRules(input, config, context());
    expect(evaluateRules(input, config, context())).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.map((item) => item.ruleId)).toEqual(
      Array.from({ length: 7 }, (_, i) => `RULE_00${i + 1}`),
    );
  });
});

describe("illustrative FX", () => {
  it.each([
    ["PAB", 1],
    ["USD", 1],
    ["MXN", 20],
    ["BRL", 5.7],
    ["COP", 4200],
    ["CRC", 510],
    ["GTQ", 7.7],
  ])("%s converts %s units to one USD", (currency, amount) =>
    expect(
      comparableAmount(Number(amount), String(currency), "usd"),
    ).toBeCloseTo(1),
  );
  it("rejects unsupported currencies and overflowing conversions", () => {
    expect(comparableAmount(1, "toString", "usd")).toBeNull();
    expect(comparableAmount(1, null, "usd")).toBeNull();
    expect(comparableAmount(Infinity, "USD", "original")).toBeNull();
  });
});
