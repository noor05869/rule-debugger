import type {
  EvaluatedRecord,
  RuleId,
  RuleSummary,
  TransactionFilters,
  RuleConfig,
} from "./types";
import { RULE_IDS } from "./types";
import { DEFAULT_RULE_CONFIG } from "./rule-config";
import { comparableAmount } from "./fx";
import { parseSourceTimestamp } from "./rule-context";

export const PAGE_SIZE = 50;
export const EMPTY_FILTERS: TransactionFilters = {
  preset: "all",
  search: "",
  verdict: null,
  ruleId: null,
  country: null,
  currency: null,
  transactionType: null,
  missingTypeOnly: false,
  senderId: null,
  changedOnly: false,
};

export function summarizeRules(
  rows: readonly EvaluatedRecord[],
): RuleSummary[] {
  const summaries = new Map<RuleId, RuleSummary>(
    RULE_IDS.map((ruleId) => [
      ruleId,
      { ruleId, fired: 0, clear: 0, dataGap: 0 },
    ]),
  );
  for (const row of rows)
    for (const result of row.results) {
      const summary = summaries.get(result.ruleId) ?? {
        ruleId: result.ruleId,
        fired: 0,
        clear: 0,
        dataGap: 0,
      };
      if (result.status === "FIRED") summary.fired++;
      else if (result.status === "CLEAR") summary.clear++;
      else summary.dataGap++;
      summaries.set(result.ruleId, summary);
    }
  return [...summaries.values()];
}

export function queryPage(
  rows: readonly EvaluatedRecord[],
  filters: TransactionFilters,
  requestedPage: number,
  config: RuleConfig = DEFAULT_RULE_CONFIG,
  changedIds: ReadonlySet<string> = new Set(),
) {
  const search = filters.search.trim().toLowerCase();
  const matches = rows.filter(({ record, results }) => {
    const transaction = record.transaction;
    if (filters.changedOnly && !changedIds.has(transaction.transaction_id))
      return false;
    if (
      search &&
      ![
        transaction.transaction_id,
        transaction.sender_account_id,
        transaction.merchant_description_condensed,
      ].some((value) => value?.toLowerCase().includes(search))
    )
      return false;
    if (
      filters.country !== null &&
      transaction.merchant_country !== filters.country
    )
      return false;
    if (filters.currency !== null && transaction.currency !== filters.currency)
      return false;
    if (
      filters.transactionType !== null &&
      transaction.transaction_type !== filters.transactionType
    )
      return false;
    if (
      filters.senderId !== null &&
      transaction.sender_account_id !== filters.senderId
    )
      return false;
    if (filters.missingTypeOnly && transaction.transaction_type?.trim())
      return false;
    const scopedResults = filters.ruleId
      ? results.filter((result) => result.ruleId === filters.ruleId)
      : results;
    // Exclusive verdict groups: a match takes priority over missing evidence.
    const verdict = scopedResults.some((result) => result.status === "FIRED")
      ? "FIRED"
      : scopedResults.some((result) => result.status === "DATA_GAP")
        ? "DATA_GAP"
        : scopedResults.length > 0
          ? "CLEAR"
          : null;
    if (filters.verdict && verdict !== filters.verdict) return false;
    if (
      filters.preset === "missing-inputs" &&
      !results.some((result) => result.status === "DATA_GAP")
    )
      return false;
    if (
      filters.preset === "cross-border" &&
      !results.some(
        (result) => result.ruleId === "RULE_005" && result.status === "FIRED",
      )
    )
      return false;
    if (filters.preset === "currency-traps") {
      const raw = comparableAmount(
        transaction.amount,
        transaction.currency,
        "original",
      );
      const usd = comparableAmount(
        transaction.amount,
        transaction.currency,
        "usd",
      );
      if (
        raw === null ||
        usd === null ||
        raw <= config.highValue.threshold ||
        usd > config.highValue.threshold
      )
        return false;
    }
    return true;
  });
  const lastPage = Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1);
  const page = Math.min(
    lastPage,
    Math.max(0, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0),
  );
  const ordered = matches.map((row) => ({
    row,
    time: parseSourceTimestamp(row.record.transaction.txn_date_time),
  }));
  ordered.sort((a, b) => {
    const timeOrder = (a.time ?? Infinity) - (b.time ?? Infinity);
    if (timeOrder && !Number.isNaN(timeOrder)) return timeOrder;
    const first = a.row.record.transaction.transaction_id;
    const second = b.row.record.transaction.transaction_id;
    return first < second ? -1 : first > second ? 1 : 0;
  });
  return {
    page,
    totalMatches: matches.length,
    rows: ordered
      .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      .map(({ row }) => row),
  };
}
