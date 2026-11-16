// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateHighValue } from "../rules";
import { DEFAULT_RULE_CONFIG } from "../rule-config";
import { record, context } from "./rule-fixtures";

describe("R1 high value", () => {
  it.each([
    [999, "CLEAR"],
    [1000, "CLEAR"],
    [1001, "FIRED"],
  ] as const)(
    "amount %s gives %s at the strict threshold",
    (amount, status) => {
      const result = evaluateHighValue(
        record({ amount }),
        DEFAULT_RULE_CONFIG,
        context(),
      );
      expect(result.status).toBe(status);
      expect(result.steps).toContainEqual(
        expect.objectContaining({
          actual: amount,
          operator: ">",
          expected: 1000,
        }),
      );
    },
  );
  it.each([null, NaN, Infinity, -Infinity])(
    "missing/nonfinite amount %s is a gap",
    (amount) => {
      const result = evaluateHighValue(
        record({ amount }),
        DEFAULT_RULE_CONFIG,
        context(),
      );
      expect(result.status).toBe("DATA_GAP");
      expect(result.steps[0]).toMatchObject({
        actual: null,
        outcome: "MISSING",
      });
      expect(JSON.stringify(result)).not.toContain("NaN");
    },
  );
  it("keeps raw COP and derived USD evidence separate", () => {
    const input = record({ amount: 42000, currency: "COP" });
    expect(
      evaluateHighValue(input, DEFAULT_RULE_CONFIG, context()).status,
    ).toBe("FIRED");
    const result = evaluateHighValue(
      input,
      { ...DEFAULT_RULE_CONFIG, currencyMode: "usd" },
      context({ currencyMode: "usd" }),
    );
    expect(result.status).toBe("CLEAR");
    expect(result.steps).toContainEqual(
      expect.objectContaining({ source: "transaction", actual: 42000 }),
    );
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        source: "derived",
        actual: 10,
        expected: 1000,
      }),
    );
    expect(result.reason).toMatch(/indicative/i);
    expect(input.transaction.amount).toBe(42000);
  });
  it("unknown FX is a gap only in USD mode", () => {
    const input = record({ currency: "XYZ" });
    expect(
      evaluateHighValue(input, DEFAULT_RULE_CONFIG, context()).status,
    ).toBe("FIRED");
    expect(
      evaluateHighValue(
        input,
        { ...DEFAULT_RULE_CONFIG, currencyMode: "usd" },
        context(),
      ).status,
    ).toBe("DATA_GAP");
  });
});
