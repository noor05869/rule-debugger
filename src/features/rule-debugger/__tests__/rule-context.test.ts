// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildSmallTransactionCounts,
  parseSourceTimestamp,
} from "../rule-context";
import { DEFAULT_RULE_CONFIG as config } from "../rule-config";
import { record } from "./rule-fixtures";

describe("source timestamps", () => {
  it("uses source wall-clock components independently of the host timezone", () => {
    expect(parseSourceTimestamp("2024-10-01 12:00:00")).toBe(
      Date.UTC(2024, 9, 1, 12),
    );
    expect(parseSourceTimestamp("2024-02-29 00:00:00")).not.toBeNull();
  });
  it.each([
    null,
    "",
    "2024-02-30 12:00:00",
    "2024-10-01 24:00:00",
    "2024-10-01T12:00:00Z",
    "bad",
  ])("rejects unsupported date %s", (value) => {
    expect(parseSourceTimestamp(value)).toBeNull();
  });
});

describe("small transaction sliding window", () => {
  const payment = (
    id: string,
    time: string,
    amount: number | null = 50,
    sender = "sender-1",
  ) =>
    record({
      transaction_id: id,
      txn_date_time: `2024-10-01 ${time}`,
      amount,
      sender_account_id: sender,
    });
  it("includes the exact lower boundary and all current-time ties, never later payments", () => {
    const input = [
      payment("later", "12:00:01"),
      payment("nowB", "12:00:00"),
      payment("old", "10:59:59"),
      payment("boundary", "11:00:00"),
      payment("nowA", "12:00:00"),
      payment("large", "11:30:00", 51),
      payment("other", "12:00:00", 50, "other"),
    ];
    const before = structuredClone(input);
    expect(
      Object.fromEntries(buildSmallTransactionCounts(input, config)),
    ).toMatchObject({ nowA: 3, nowB: 3, boundary: 2, later: 3, other: 1 });
    expect(input).toEqual(before);
  });
  it("uses the selected amount mode and window configuration", () => {
    const input = [
      payment("one", "11:00:00", 100),
      payment("two", "12:00:00", 100),
    ];
    input.forEach((item) => {
      item.transaction.currency = "COP";
    });
    expect(buildSmallTransactionCounts(input, config).get("two")).toBe(0);
    expect(
      buildSmallTransactionCounts(input, {
        ...config,
        currencyMode: "usd",
      }).get("two"),
    ).toBe(2);
    expect(
      buildSmallTransactionCounts(input, {
        ...config,
        currencyMode: "usd",
        smallFrequent: { ...config.smallFrequent, windowMinutes: 30 },
      }).get("two"),
    ).toBe(1);
  });
  it("omits counts when historical evidence cannot establish a reliable total", () => {
    const input = [
      payment("unknown", "11:30:00", null),
      payment("now", "12:00:00"),
      payment("after", "13:00:01"),
    ];
    const counts = buildSmallTransactionCounts(input, config);
    expect(counts.has("now")).toBe(false);
    expect(counts.get("after")).toBe(1);
    input.push(record({ txn_date_time: "bad" }));
    expect(buildSmallTransactionCounts(input, config).size).toBe(0);
  });
  it("handles missing senders, no records, and a large tied group", () => {
    expect(buildSmallTransactionCounts([], config).size).toBe(0);
    expect(
      buildSmallTransactionCounts([record({ sender_account_id: null })], config)
        .size,
    ).toBe(0);
    const input = Array.from({ length: 10000 }, (_, i) =>
      payment(String(i), "12:00:00"),
    );
    expect(buildSmallTransactionCounts(input, config).get("9999")).toBe(10000);
  });
});
