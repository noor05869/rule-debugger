import {
  buildSenderProfiles,
  joinRecords,
  parseDatasetText,
  validateFeatureVectors,
  validateRuleDefinitions,
  validateTransactions,
} from "./data";
import { buildSmallTransactionCounts, getContextKey } from "./rule-context";
import { DEFAULT_RULE_CONFIG, validateRuleConfig } from "./rule-config";
import { RULE_IDS } from "./types";
import { evaluateRules } from "./rules";
import { queryPage, summarizeRules } from "./query";
import type {
  DatasetSummary,
  EvaluatedRecord,
  JoinedRecord,
  RuleConfig,
  RuleComparison,
  RuleId,
  SenderProfile,
  WorkerRequest,
  WorkerResponse,
} from "./types";

type FetchText = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** One instance per worker. Browser APIs stay in the tiny worker entrypoint. */
export function createWorkerHandler(
  fetchText: FetchText,
  post: (response: WorkerResponse) => void,
) {
  let records: JoinedRecord[] | null = null;
  let byId = new Map<string, JoinedRecord>();
  let profiles = new Map<string, SenderProfile>();
  let cachedKey: string | null = null;
  let cachedRows: EvaluatedRecord[] = [];
  let cachedCounts = new Map<string, number>();
  let countsKey: string | null = null;
  let defaultsById: Map<string, EvaluatedRecord> | null = null;
  let defaultSummaries = summarizeRules([]);
  let comparisons: RuleComparison[] = [];
  let changedByRule = new Map<RuleId, Set<string>>();
  let loadVersion = 0;

  async function readDataset(name: string) {
    const response = await fetchText(`/data/${name}.json`);
    if (!response.ok)
      throw new Error(`Could not load ${name}.json (HTTP ${response.status}).`);
    return parseDatasetText(await response.text());
  }

  function ensureCounts(config: RuleConfig) {
    if (!records) throw new Error("Load the dataset before evaluating it.");
    const key = getContextKey(config);
    if (countsKey !== key) {
      cachedCounts = buildSmallTransactionCounts(records, config);
      countsKey = key;
    }
  }

  function evaluateRecord(
    record: JoinedRecord,
    config: RuleConfig,
  ): EvaluatedRecord {
    const context = {
      senderProfile:
        profiles.get(record.transaction.sender_account_id ?? "") ?? null,
      recentSmallTransactionCount:
        cachedCounts.get(record.transaction.transaction_id) ?? null,
      currencyMode: config.currencyMode,
    };
    return {
      record,
      context,
      contextKey: getContextKey(config),
      results: evaluateRules(record, config, context),
    };
  }

  function ensureDefaults() {
    if (defaultsById) return;
    ensureCounts(DEFAULT_RULE_CONFIG);
    const rows = records!.map((record) =>
      evaluateRecord(record, DEFAULT_RULE_CONFIG),
    );
    defaultsById = new Map(
      rows.map((row) => [row.record.transaction.transaction_id, row]),
    );
    defaultSummaries = summarizeRules(rows);
  }

  function evaluate(config: RuleConfig) {
    validateRuleConfig(config);
    const key = JSON.stringify(config);
    if (cachedKey === key) return;
    ensureDefaults();
    ensureCounts(config);
    const rows =
      key === JSON.stringify(DEFAULT_RULE_CONFIG)
        ? [...defaultsById!.values()]
        : records!.map((record) => evaluateRecord(record, config));
    const changes = new Map<RuleId, Set<string>>(
      RULE_IDS.map((ruleId) => [ruleId, new Set()]),
    );
    for (const row of rows) {
      const id = row.record.transaction.transaction_id;
      const baseline = defaultsById!.get(id)!;
      for (const result of row.results) {
        if (
          result.status !==
          baseline.results.find((value) => value.ruleId === result.ruleId)
            ?.status
        )
          changes.get(result.ruleId)!.add(id);
      }
    }
    const currentSummaries = summarizeRules(rows);
    comparisons = RULE_IDS.map((ruleId, index) => ({
      ruleId,
      defaultFired: defaultSummaries[index].fired,
      currentFired: currentSummaries[index].fired,
      changed: changes.get(ruleId)!.size,
      referenceCurrencyMode: "original",
      currentCurrencyMode: config.currencyMode,
    }));
    changedByRule = changes;
    cachedRows = rows;
    cachedKey = key;
  }

  function withDefaults(row: EvaluatedRecord): EvaluatedRecord {
    return {
      ...row,
      defaultResults: defaultsById!.get(row.record.transaction.transaction_id)!
        .results,
    };
  }

  return async function handle(request: WorkerRequest): Promise<void> {
    const version = request.type === "LOAD" ? ++loadVersion : loadVersion;
    try {
      switch (request.type) {
        case "LOAD": {
          records = null;
          cachedKey = null;
          cachedRows = [];
          countsKey = null;
          defaultsById = null;
          byId.clear();
          profiles.clear();
          const [transactionInput, featureInput, ruleInput] = await Promise.all(
            [
              readDataset("transactions"),
              readDataset("feature_vectors"),
              readDataset("example_rules"),
            ],
          );
          if (version !== loadVersion) return;
          const transactions = validateTransactions(transactionInput);
          const features = validateFeatureVectors(featureInput);
          const rules = validateRuleDefinitions(ruleInput);
          const joined = joinRecords(transactions, features);
          profiles = buildSenderProfiles(joined.records);
          byId = new Map(
            joined.records.map((record) => [
              record.transaction.transaction_id,
              record,
            ]),
          );
          records = joined.records;
          const distinct = (values: (string | null)[]) =>
            [
              ...new Set(
                values.filter((value): value is string => !!value?.trim()),
              ),
            ].sort();
          const summary: DatasetSummary = {
            transactionCount: transactions.length,
            featureVectorCount: features.length,
            senderCount: profiles.size,
            currencies: distinct(transactions.map((row) => row.currency)),
            countries: distinct(
              transactions.map((row) => row.merchant_country),
            ),
            transactionTypes: distinct(
              transactions.map((row) => row.transaction_type),
            ),
            rules,
            diagnostics: joined.diagnostics,
          };
          post({ type: "READY", requestId: request.requestId, summary });
          break;
        }
        case "QUERY": {
          evaluate(request.config);
          const page = queryPage(
            cachedRows,
            request.filters,
            request.page,
            request.config,
            changedByRule.get(request.selectedRuleId),
          );
          post({
            type: "RESULTS",
            requestId: request.requestId,
            ...page,
            rows: page.rows.map(withDefaults),
            ruleSummaries: summarizeRules(cachedRows),
            comparisons,
          });
          break;
        }
        case "GET_RECORD": {
          validateRuleConfig(request.config);
          ensureDefaults();
          ensureCounts(request.config);
          const record = byId.get(request.transactionId);
          post({
            type: "RECORD",
            requestId: request.requestId,
            value: record
              ? withDefaults(evaluateRecord(record, request.config))
              : null,
          });
          break;
        }
      }
    } catch (error) {
      if (version !== loadVersion) return;
      post({
        type: "ERROR",
        requestId: request.requestId,
        message:
          error instanceof Error ? error.message : "Dataset processing failed.",
      });
    }
  };
}
