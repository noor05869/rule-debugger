// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  parseDatasetText,
  validateTransactions,
  validateFeatureVectors,
  validateRuleDefinitions,
  joinRecords,
  buildSenderProfiles,
} from "../data";

const sourceFiles = [
  {
    name: "transactions.json",
    hash: "c87443775e398c90d2e4601eb5897afe649953079843d777ef4e68d90f90a765",
  },
  {
    name: "feature_vectors.json",
    hash: "f38c57ac40b0be9047c42b3036c252a3752eccff4fd0dc6239a7dd55dd48f98e",
  },
  {
    name: "example_rules.json",
    hash: "13eb43b06a7d48f7143e9a15f4e48e52bf26e6558d64208ed1729645d4323a89",
  },
];

describe("supplied assessment files", () => {
  it("validates and joins the full corpus without modifying the source files", async () => {
    const buffers = await Promise.all(
      sourceFiles.map((file) =>
        readFile(
          new URL(`../../../../public/data/${file.name}`, import.meta.url),
        ),
      ),
    );
    const transactions = validateTransactions(
      parseDatasetText(buffers[0].toString("utf8")),
    );
    const features = validateFeatureVectors(
      parseDatasetText(buffers[1].toString("utf8")),
    );
    const rules = validateRuleDefinitions(
      parseDatasetText(buffers[2].toString("utf8")),
    );
    const { records, diagnostics } = joinRecords(transactions, features);
    const profiles = buildSenderProfiles(records);

    expect(diagnostics).toMatchObject({
      transactionCount: 38903,
      featureVectorCount: 38903,
      matchedCount: 38903,
      missingFeatureIds: [],
      orphanFeatureIds: [],
    });
    expect(
      records.every(
        (row) =>
          row.features?.transaction_id === row.transaction.transaction_id,
      ),
    ).toBe(true);
    expect(diagnostics.conflicts).toEqual([]);
    expect(rules.map((rule) => rule.rule_id)).toEqual([
      "RULE_001",
      "RULE_002",
      "RULE_003",
      "RULE_004",
      "RULE_005",
      "RULE_006",
      "RULE_007",
    ]);
    expect(profiles.size).toBe(108);
    expect(
      [...profiles.values()].reduce(
        (sum, profile) => sum + profile.totalTransactions,
        0,
      ),
    ).toBe(38903);
    expect(
      [...profiles.values()].reduce(
        (sum, profile) => sum + profile.missingTypeCount,
        0,
      ),
    ).toBe(616);
    expect(
      transactions.filter((row) => row.receiver_account_id === null),
    ).toHaveLength(13);
    expect(transactions.every((row) => row.terminal_id === 0)).toBe(true);
    expect(transactions.every((row) => row.merchant_postcode === null)).toBe(
      true,
    );
    expect(records[0].transaction.amount).toBe(12.39);
    expect(records[0].features?.day_of_week).toBe(0);

    for (const [index, file] of sourceFiles.entries()) {
      const unchanged = await readFile(
        new URL(`../../../../public/data/${file.name}`, import.meta.url),
      );
      expect(unchanged.equals(buffers[index])).toBe(true);
      expect(createHash("sha256").update(unchanged).digest("hex")).toBe(
        file.hash,
      );
    }
  });
});
