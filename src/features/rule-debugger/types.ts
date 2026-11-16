/** Source fields keep their original names so the inspector can show lineage. */
export interface Transaction {
  transaction_id: string;
  txn_date_time: string | null;
  sender_account_id: string | null;
  receiver_account_id: number | null;
  amount: number | null;
  currency: string | null;
  transaction_type: string | null;
  terminal_id: number | null;
  merchant_city: string | null;
  merchant_country: string | null;
  merchant_postcode: string | null;
  merchant_description_condensed: string | null;
}

export interface FeatureVector {
  transaction_id: string;
  sender_account_id: string | null;
  receiver_account_id: number | null;
  amount: number | null;
  currency: string | null;
  transaction_type: string | null;
  transaction_count: number | null;
  avg_transaction_amount: number | null;
  hour_of_day: number | null;
  day_of_week: number | null;
  merchant_avg_transaction_amount: number | null;
}

export const RULE_IDS = [
  "RULE_001",
  "RULE_002",
  "RULE_003",
  "RULE_004",
  "RULE_005",
  "RULE_006",
  "RULE_007",
] as const;

export type RuleId = (typeof RULE_IDS)[number];
export type RuleSeverity = "Critical" | "High" | "Medium" | "Low";
export type RuleAction = "Alert" | "Review" | "Investigate" | "Block";

export interface RuleDefinition {
  rule_id: RuleId;
  name: string;
  description: string;
  action: RuleAction;
  severity: RuleSeverity;
}

export type SharedField =
  | "sender_account_id"
  | "receiver_account_id"
  | "amount"
  | "currency"
  | "transaction_type";

export interface FieldConflict {
  transactionId: string;
  field: SharedField;
  transactionValue: string | number | null;
  featureValue: string | number | null;
}

export interface JoinedRecord {
  transaction: Transaction;
  features: FeatureVector | null;
  conflicts: FieldConflict[];
}

export interface DatasetDiagnostics {
  transactionCount: number;
  featureVectorCount: number;
  matchedCount: number;
  missingFeatureIds: string[];
  orphanFeatureIds: string[];
  conflicts: FieldConflict[];
}

export interface CurrencyAmounts {
  count: number;
  total: number;
  average: number;
}

export interface SenderProfile {
  senderAccountId: string;
  source: "dataset-snapshot";
  totalTransactions: number;
  homeCountry: string | null;
  countryCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  knownTypeCount: number;
  missingTypeCount: number;
  amountsByCurrency: Record<string, CurrencyAmounts>;
}

// Rule evaluation, configuration, and worker message contracts.
export type RuleStatus = "FIRED" | "CLEAR" | "DATA_GAP";
export type CurrencyMode = "original" | "usd";
export type ConditionValue = string | number | boolean | null;

export interface ConditionStep {
  label: string;
  source:
    "transaction" | "features" | "sender-profile" | "configuration" | "derived";
  actual: ConditionValue;
  operator: string;
  expected: ConditionValue;
  outcome: "MATCHED" | "NOT_MATCHED" | "MISSING";
}

export interface RuleResult {
  ruleId: RuleId;
  status: RuleStatus;
  reason: string;
  steps: ConditionStep[];
}

export interface RuleConfig {
  currencyMode: CurrencyMode;
  highValue: { threshold: number; compareSenderAverage: boolean };
  smallFrequent: { maxAmount: number; minCount: number; windowMinutes: number };
  unusualType: { rarityPercent: number };
  riskWatchlist: { merchants: string[]; countries: string[] };
  crossBorder: { minAmount: number };
  outsideHours: { startHour: number; endHour: number; flagWeekends: boolean };
  cashWithdrawal: { minAmount: number };
}

export interface RuleContext {
  senderProfile: SenderProfile | null;
  recentSmallTransactionCount: number | null;
  /** The currency mode used to calculate context-dependent values. */
  currencyMode: CurrencyMode;
}

export interface TransactionFilters {
  preset?: "all" | "currency-traps" | "missing-inputs" | "cross-border";
  search: string;
  verdict: RuleStatus | null;
  ruleId: RuleId | null;
  country: string | null;
  currency: string | null;
  transactionType: string | null;
  missingTypeOnly: boolean;
  senderId: string | null;
  changedOnly: boolean;
}

export interface EvaluatedRecord {
  contextKey?: string;
  defaultResults?: RuleResult[];
  record: JoinedRecord;
  context: RuleContext;
  results: RuleResult[];
}

export interface RuleSummary {
  ruleId: RuleId;
  fired: number;
  clear: number;
  dataGap: number;
}

export interface RuleComparison {
  ruleId: RuleId;
  defaultFired: number;
  currentFired: number;
  changed: number;
  referenceCurrencyMode: CurrencyMode;
  currentCurrencyMode: CurrencyMode;
}

export interface DatasetSummary {
  transactionCount: number;
  featureVectorCount: number;
  senderCount: number;
  currencies: string[];
  countries: string[];
  transactionTypes: string[];
  rules: RuleDefinition[];
  diagnostics: DatasetDiagnostics;
}

export type WorkerRequest =
  | { type: "LOAD"; requestId: number }
  | {
      type: "QUERY";
      requestId: number;
      config: RuleConfig;
      filters: TransactionFilters;
      page: number;
      selectedRuleId: RuleId;
    }
  | {
      type: "GET_RECORD";
      requestId: number;
      transactionId: string;
      config: RuleConfig;
    };

export type WorkerResponse =
  | { type: "READY"; requestId: number; summary: DatasetSummary }
  | {
      type: "RESULTS";
      requestId: number;
      page: number;
      totalMatches: number;
      rows: EvaluatedRecord[];
      ruleSummaries: RuleSummary[];
      comparisons: RuleComparison[];
    }
  | { type: "RECORD"; requestId: number; value: EvaluatedRecord | null }
  | { type: "ERROR"; requestId: number; message: string };
