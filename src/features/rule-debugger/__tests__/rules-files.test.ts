// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  buildSenderProfiles,
  joinRecords,
  parseDatasetText,
  validateFeatureVectors,
  validateTransactions,
} from "../data";
import { DEFAULT_RULE_CONFIG } from "../rule-config";
import { buildSmallTransactionCounts } from "../rule-context";
import { evaluateRules } from "../rules";
import { RULE_IDS, type CurrencyMode } from "../types";

it("evaluates the supplied corpus in both amount modes with honest cash/watchlist gaps", async () => {
  const [transactionText, featureText] = await Promise.all([
    readFile(
      new URL("../../../../public/data/transactions.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../../public/data/feature_vectors.json", import.meta.url),
      "utf8",
    ),
  ]);
  const { records } = joinRecords(
    validateTransactions(parseDatasetText(transactionText)),
    validateFeatureVectors(parseDatasetText(featureText)),
  );
  const profiles = buildSenderProfiles(records);
  for (const currencyMode of ["original", "usd"] satisfies CurrencyMode[]) {
    const config = { ...DEFAULT_RULE_CONFIG, currencyMode };
    const counts = buildSmallTransactionCounts(records, config);
    const summaries = RULE_IDS.map((ruleId) => ({
      ruleId,
      FIRED: 0,
      CLEAR: 0,
      DATA_GAP: 0,
    }));
    for (const record of records) {
      const results = evaluateRules(record, config, {
        senderProfile:
          profiles.get(record.transaction.sender_account_id ?? "") ?? null,
        recentSmallTransactionCount:
          counts.get(record.transaction.transaction_id) ?? null,
        currencyMode,
      });
      results.forEach((result, index) => {
        summaries[index][result.status]++;
      });
    }
    expect(counts.size).toBe(records.length);
    summaries.forEach((summary) =>
      expect(summary.FIRED + summary.CLEAR + summary.DATA_GAP).toBe(
        records.length,
      ),
    );
    expect(summaries[3].DATA_GAP).toBe(records.length);
    expect(summaries[6].DATA_GAP).toBe(records.length);
    expect(summaries[5].DATA_GAP).toBe(0);
    console.info(currencyMode, JSON.stringify(summaries));
  }
}, 20_000);
