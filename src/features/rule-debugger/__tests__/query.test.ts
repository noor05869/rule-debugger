// @vitest-environment node
import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, queryPage } from "../query";
import { DEFAULT_RULE_CONFIG } from "../rule-config";
import type { EvaluatedRecord, TransactionFilters } from "../types";
import { record, context } from "./rule-fixtures";

function row(
  id: string,
  changes: Parameters<typeof record>[0] = {},
): EvaluatedRecord {
  return {
    record: record({ transaction_id: id, ...changes }),
    context: context(),
    results: [
      { ruleId: "RULE_001", status: "FIRED", reason: "threshold", steps: [] },
      { ruleId: "RULE_002", status: "CLEAR", reason: "count", steps: [] },
      { ruleId: "RULE_007", status: "DATA_GAP", reason: "cash", steps: [] },
    ],
  };
}
const rows = [
  row("ID_B", {
    merchant_description_condensed: "Coffee Shop",
    sender_account_id: "Sender-A",
    currency: "COP",
    amount: 42000,
  }),
  row("ID_A", {
    transaction_type: null,
    merchant_country: "COL",
    txn_date_time: "2024-10-01 11:00:00",
  }),
];
function query(
  changes: Partial<TransactionFilters> = {},
  input = rows,
  page = 0,
) {
  return queryPage(
    input,
    { ...EMPTY_FILTERS, ...changes },
    page,
    DEFAULT_RULE_CONFIG,
  );
}
describe("transaction queries", () => {
  it.each(["id_b", "COFFEE", "sender-a"])(
    "searches IDs, merchants and sender IDs: %s",
    (search) => {
      expect(
        query({ search }).rows.map(
          (row) => row.record.transaction.transaction_id,
        ),
      ).toEqual(["ID_B"]);
    },
  );
  it("combines facets and handles a null channel explicitly", () => {
    expect(
      query({ country: "COL", currency: "USD", missingTypeOnly: true }).rows,
    ).toHaveLength(1);
    expect(
      query({ transactionType: "online", senderId: "Sender-A" }).rows,
    ).toHaveLength(1);
    expect(
      query({ country: "COL", transactionType: "online" }).totalMatches,
    ).toBe(0);
  });
  it("groups transactions exclusively: fired first, then gaps, then all clear", () => {
    const mixed = row("mixed");
    const clear = row("clear");
    clear.results = clear.results.map((result) => ({
      ...result,
      status: "CLEAR",
    }));
    const gap = row("gap");
    gap.results = gap.results.map((result) => ({
      ...result,
      status: result.ruleId === "RULE_007" ? "DATA_GAP" : "CLEAR",
    }));
    const input = [mixed, clear, gap];
    for (const [verdict, expectedId] of [
      ["FIRED", "mixed"],
      ["DATA_GAP", "gap"],
      ["CLEAR", "clear"],
    ] as const) {
      expect(
        query({ verdict }, input).rows.map(
          (value) => value.record.transaction.transaction_id,
        ),
      ).toEqual([expectedId]);
    }
    expect(query({}, input).totalMatches).toBe(3);
  });
  it("scopes verdicts to the selected rule without secretly requiring it to fire", () => {
    expect(
      query({ verdict: "DATA_GAP", ruleId: "RULE_007" }).totalMatches,
    ).toBe(2);
    expect(query({ verdict: "CLEAR", ruleId: "RULE_001" }).totalMatches).toBe(
      0,
    );
    expect(query({ ruleId: "RULE_002" }).totalMatches).toBe(2);
    expect(query({ verdict: "CLEAR", ruleId: "RULE_002" }).totalMatches).toBe(2);
    expect(query({ verdict: "FIRED", ruleId: "RULE_002" }).totalMatches).toBe(0);
    expect(query({ verdict: "CLEAR", ruleId: "RULE_007" }).totalMatches).toBe(0);
  });
  it("sorts chronologically with a deterministic ID tie-breaker and undated rows last", () => {
    const input = [
      row("Z"),
      row("A"),
      row("old", { txn_date_time: "2024-09-30 23:00:00" }),
      row("missing", { txn_date_time: null }),
    ];
    const before = structuredClone(input);
    expect(
      query({}, input).rows.map((row) => row.record.transaction.transaction_id),
    ).toEqual(["old", "A", "Z", "missing"]);
    expect(input).toEqual(before);
  });
  it("bounds every page to 50 and clamps negative, nonfinite and oversized pages", () => {
    const input = Array.from({ length: 103 }, (_, i) =>
      row(String(i).padStart(3, "0")),
    );
    expect(query({}, input, 1).rows).toHaveLength(50);
    expect(query({}, input, 99)).toMatchObject({ page: 2, totalMatches: 103 });
    expect(query({}, input, 99).rows).toHaveLength(3);
    expect(query({}, input, -1).page).toBe(0);
    expect(query({}, input, NaN).page).toBe(0);
    expect(query({ search: "absent" }, input, 99)).toMatchObject({
      page: 0,
      totalMatches: 0,
      rows: [],
    });
  });
  it("supports the existing investigation presets without fabricated FX or verdicts", () => {
    expect(
      query({ preset: "currency-traps" }).rows.map(
        (row) => row.record.transaction.transaction_id,
      ),
    ).toEqual(["ID_B"]);
    expect(query({ preset: "missing-inputs" }).totalMatches).toBe(2);
    const cross = row("cross");
    cross.results.push({
      ruleId: "RULE_005",
      status: "FIRED",
      reason: "cross",
      steps: [],
    });
    expect(
      query({ preset: "cross-border" }, [cross, ...rows]).totalMatches,
    ).toBe(1);
    expect(
      query({ preset: "currency-traps" }, [row("unknown", { currency: "XYZ" })])
        .totalMatches,
    ).toBe(0);
  });
});
