// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  parseDatasetText,
  validateTransactions,
  validateFeatureVectors,
  validateRuleDefinitions,
  joinRecords,
  buildSenderProfiles,
} from "../data";

const rawTransaction = {
  transaction_id: "TXN_1",
  txn_date_time: "2024-10-01 04:37:46",
  sender_account_id: "sender-1",
  receiver_account_id: 8699314052554,
  amount: 12.39,
  currency: "PAB",
  transaction_type: "online",
  terminal_id: 0,
  merchant_city: "Pacora",
  merchant_country: "PAN",
  merchant_postcode: null,
  merchant_description_condensed: "Río Bar",
};

const rawFeature = {
  transaction_id: "TXN_1",
  sender_account_id: "sender-1",
  receiver_account_id: 8699314052554,
  amount: 12.39,
  currency: "PAB",
  transaction_type: "online",
  transaction_count: 1,
  avg_transaction_amount: 12.39,
  hour_of_day: 4,
  day_of_week: 1,
  merchant_avg_transaction_amount: 12.39,
};

function transactions(...changes: Partial<typeof rawTransaction>[]) {
  return validateTransactions(
    changes.map((change) => ({ ...rawTransaction, ...change })),
  );
}

function features(...changes: Partial<typeof rawFeature>[]) {
  return validateFeatureVectors(
    changes.map((change) => ({ ...rawFeature, ...change })),
  );
}

describe("parseDatasetText", () => {
  it("replaces bare NaN but preserves quoted and escaped text", () => {
    const text = String.raw`[{"amount":NaN,"merchant":"NaN Services","note":"quote: \"NaN\", slash: \\"}]`;
    expect(parseDatasetText(text)).toEqual([
      {
        amount: null,
        merchant: "NaN Services",
        note: 'quote: "NaN", slash: \\',
      },
    ]);
  });

  it("accepts strict JSON without changing legitimate zero, false, or null", () => {
    expect(parseDatasetText('[0,false,null,"NaN",{"NaN":0}]')).toEqual([
      0,
      false,
      null,
      "NaN",
      { NaN: 0 },
    ]);
  });

  it("accepts missing-number tokens at array, nested-object, and root value boundaries", () => {
    expect(parseDatasetText('[NaN,{"amount":NaN,"values":[NaN]}]')).toEqual([
      null,
      { amount: null, values: [null] },
    ]);
    expect(parseDatasetText("NaN")).toBeNull();
  });

  it.each(['[{"amount":oops}]', "[NaN123]", "{NaN:1}", "[Infinity]", "[1,]"])(
    "rejects malformed input instead of repairing other syntax: %s",
    (text) =>
      expect(() => parseDatasetText(text)).toThrow(/Invalid dataset JSON/),
  );
});

describe("validation", () => {
  it("preserves known values, including zero and a safe numeric receiver ID", () => {
    expect(transactions({})[0]).toEqual(rawTransaction);
    expect(features({})[0]).toEqual(rawFeature);
  });

  it("represents missing business inputs explicitly without inventing defaults", () => {
    const record = validateTransactions([{ transaction_id: "TXN_missing" }])[0];
    expect(record.amount).toBeNull();
    expect(record.sender_account_id).toBeNull();
    expect(record.transaction_type).toBeNull();
    expect(record.terminal_id).toBeNull();
    const feature = validateFeatureVectors([
      { transaction_id: "TXN_missing" },
    ])[0];
    expect(feature.hour_of_day).toBeNull();
    expect(feature.transaction_count).toBeNull();
  });

  it.each([null, {}, "[]", [null], [[]]])(
    "rejects invalid container/row shapes",
    (value) => {
      expect(() => validateTransactions(value)).toThrow(/transactions/);
    },
  );

  it.each([undefined, null, "", "   ", 12])(
    "requires a nonblank string transaction identity",
    (id) => {
      expect(() =>
        validateTransactions([{ ...rawTransaction, transaction_id: id }]),
      ).toThrow(/transactions\[0\]\.transaction_id/);
    },
  );

  it.each(["12.39", false, {}, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not coerce an invalid amount",
    (amount) => {
      expect(() =>
        validateTransactions([{ ...rawTransaction, amount }]),
      ).toThrow(/transactions\[0\]\.amount/);
    },
  );

  it("rejects unsafe account IDs and fractional counts with field locations", () => {
    expect(() =>
      transactions({ receiver_account_id: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/receiver_account_id/);
    expect(() => features({ transaction_count: 1.5 })).toThrow(
      /transaction_count/,
    );
    expect(() => features({ hour_of_day: 24 })).toThrow(/hour_of_day/);
    expect(() => features({ day_of_week: 7 })).toThrow(/day_of_week/);
    expect(() =>
      validateTransactions([{ ...rawTransaction, transaction_type: 7 }]),
    ).toThrow(/transaction_type/);
  });

  it("preserves metadata and rejects unsupported or duplicate rule identities", () => {
    const rule = {
      rule_id: "RULE_001",
      name: "High value",
      description: "Amount above threshold",
      action: "Alert",
      severity: "High",
    };
    expect(validateRuleDefinitions([rule])).toEqual([rule]);
    expect(() =>
      validateRuleDefinitions([{ ...rule, rule_id: "RULE_999" }]),
    ).toThrow(/rule_id/);
    expect(() =>
      validateRuleDefinitions([{ ...rule, severity: "urgent" }]),
    ).toThrow(/severity/);
    expect(() =>
      validateRuleDefinitions([{ ...rule, action: "Approve" }]),
    ).toThrow(/action/);
    expect(() => validateRuleDefinitions([rule, rule])).toThrow(
      /Duplicate.*RULE_001/,
    );
  });
});

describe("joinRecords", () => {
  it("joins by ID, retaining transaction order and both source objects", () => {
    const raw = transactions({ transaction_id: "B" }, { transaction_id: "A" });
    const vectors = features({ transaction_id: "A" }, { transaction_id: "B" });
    const { records, diagnostics } = joinRecords(raw, vectors);
    expect(records.map((row) => row.transaction.transaction_id)).toEqual([
      "B",
      "A",
    ]);
    expect(records[0].transaction).toBe(raw[0]);
    expect(records[0].features).toBe(vectors[1]);
    expect(diagnostics.matchedCount).toBe(2);
    expect(diagnostics.conflicts).toEqual([]);
  });

  it("retains missing matches and reports orphan features", () => {
    const { records, diagnostics } = joinRecords(
      transactions({ transaction_id: "A" }),
      features({ transaction_id: "B" }),
    );
    expect(records[0].features).toBeNull();
    expect(diagnostics.missingFeatureIds).toEqual(["A"]);
    expect(diagnostics.orphanFeatureIds).toEqual(["B"]);
    expect(diagnostics.matchedCount).toBe(0);
  });

  it("rejects ambiguous duplicates rather than silently keeping the last row", () => {
    expect(() => joinRecords(transactions({}, {}), features({}))).toThrow(
      /Duplicate.*TXN_1.*transactions/,
    );
    expect(() => joinRecords(transactions({}), features({}, {}))).toThrow(
      /Duplicate.*TXN_1.*feature_vectors/,
    );
  });

  it("reports every conflicting shared field without overwriting source values", () => {
    const { records, diagnostics } = joinRecords(
      transactions({}),
      features({
        sender_account_id: "other",
        receiver_account_id: 7,
        amount: 20,
        currency: "USD",
        transaction_type: "refund",
      }),
    );
    expect(diagnostics.conflicts.map((conflict) => conflict.field)).toEqual([
      "sender_account_id",
      "receiver_account_id",
      "amount",
      "currency",
      "transaction_type",
    ]);
    expect(records[0].conflicts).toEqual(diagnostics.conflicts);
    expect(diagnostics.conflicts.find((c) => c.field === "amount")).toEqual({
      transactionId: "TXN_1",
      field: "amount",
      transactionValue: 12.39,
      featureValue: 20,
    });
    expect(records[0].transaction.amount).toBe(12.39);
    expect(records[0].features?.amount).toBe(20);
  });

  it("compares a missing value and zero as different inputs", () => {
    const raw = validateTransactions([{ ...rawTransaction, amount: null }]);
    expect(
      joinRecords(raw, features({ amount: 0 })).diagnostics.conflicts,
    ).toHaveLength(1);
  });

  it("supports empty inputs", () => {
    expect(joinRecords([], [])).toEqual({
      records: [],
      diagnostics: {
        transactionCount: 0,
        featureVectorCount: 0,
        matchedCount: 0,
        missingFeatureIds: [],
        orphanFeatureIds: [],
        conflicts: [],
      },
    });
  });

  it("does not mutate frozen input arrays or rows while joining and profiling", () => {
    const raw = Object.freeze(
      transactions({}).map((row) => Object.freeze(row)),
    );
    const vectors = Object.freeze(
      features({}).map((row) => Object.freeze(row)),
    );
    const joined = joinRecords(raw, vectors);
    expect(
      buildSenderProfiles(Object.freeze(joined.records)).get("sender-1")
        ?.totalTransactions,
    ).toBe(1);
    expect(raw[0]).toEqual(rawTransaction);
    expect(vectors[0]).toEqual(rawFeature);
  });
});

describe("buildSenderProfiles", () => {
  it("derives deterministic snapshot baselines and separates currencies", () => {
    const raw = validateTransactions([
      {
        ...rawTransaction,
        transaction_id: "1",
        merchant_country: "USA",
        amount: 10,
      },
      {
        ...rawTransaction,
        transaction_id: "2",
        merchant_country: "PAN",
        amount: 20,
      },
      {
        ...rawTransaction,
        transaction_id: "3",
        merchant_country: null,
        transaction_type: null,
        currency: "COP",
        amount: 42000,
      },
      { ...rawTransaction, transaction_id: "4", sender_account_id: null },
    ]);
    const records = joinRecords(raw, []).records;
    const profile = buildSenderProfiles(records).get("sender-1");
    expect(profile).toMatchObject({
      senderAccountId: "sender-1",
      source: "dataset-snapshot",
      totalTransactions: 3,
      homeCountry: "PAN",
      knownTypeCount: 2,
      missingTypeCount: 1,
      typeCounts: { online: 2 },
      countryCounts: { PAN: 1, USA: 1 },
      amountsByCurrency: {
        PAB: { count: 2, total: 30, average: 15 },
        COP: { count: 1, total: 42000, average: 42000 },
      },
    });
    expect(buildSenderProfiles([...records].reverse()).get("sender-1")).toEqual(
      profile,
    );
    expect(buildSenderProfiles(records).size).toBe(1);
  });

  it("keeps an all-missing profile meaningful and ignores missing currency amounts", () => {
    const raw = validateTransactions([
      { transaction_id: "M", sender_account_id: "sender-1", amount: 12 },
    ]);
    const profile = buildSenderProfiles(joinRecords(raw, []).records).get(
      "sender-1",
    );
    expect(profile).toMatchObject({
      homeCountry: null,
      knownTypeCount: 0,
      missingTypeCount: 1,
      amountsByCurrency: {},
    });
    expect(buildSenderProfiles([]).size).toBe(0);
  });

  it("does not mistake object-prototype names for existing counts", () => {
    const raw = transactions({
      transaction_type: "constructor",
      merchant_country: "__proto__",
    });
    const profile = buildSenderProfiles(joinRecords(raw, []).records).get(
      "sender-1",
    );
    expect(profile?.typeCounts.constructor).toBe(1);
    expect(profile?.countryCounts["__proto__"]).toBe(1);
  });

  it("fails explicitly if a derived amount total overflows", () => {
    const raw = transactions(
      { transaction_id: "A", amount: Number.MAX_VALUE },
      { transaction_id: "B", amount: Number.MAX_VALUE },
    );
    expect(() => buildSenderProfiles(joinRecords(raw, []).records)).toThrow(
      /sender-1.*PAB.*finite numeric range/,
    );
  });

  it("treats blank sender and type values as unavailable without rewriting the source", () => {
    const raw = transactions(
      { transaction_id: "A", sender_account_id: " " },
      { transaction_id: "B", transaction_type: " " },
    );
    const profiles = buildSenderProfiles(joinRecords(raw, []).records);
    expect(profiles.size).toBe(1);
    expect(profiles.get("sender-1")).toMatchObject({
      knownTypeCount: 0,
      missingTypeCount: 1,
    });
    expect(raw[1].transaction_type).toBe(" ");
  });
});
