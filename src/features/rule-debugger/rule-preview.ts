import { getContextKey } from "./rule-context";
import { evaluateRules } from "./rules";
import type { EvaluatedRecord, RuleConfig, RuleId } from "./types";

/** Seven evaluations for one selected row; never rebuild corpus context in React. */
export function previewRecord(snapshot: EvaluatedRecord, config: RuleConfig) {
  const contextPending = snapshot.contextKey !== getContextKey(config);
  const context = {
    ...snapshot.context,
    currencyMode: config.currencyMode,
    recentSmallTransactionCount: contextPending
      ? null
      : snapshot.context.recentSmallTransactionCount,
  };
  return {
    value: {
      ...snapshot,
      context,
      results: evaluateRules(snapshot.record, config, context),
    },
    pendingRuleIds: contextPending ? ["RULE_002" as RuleId] : [],
  };
}
