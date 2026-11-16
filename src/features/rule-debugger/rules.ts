import { comparableAmount } from "./fx";
import { parseSourceTimestamp } from "./rule-context";
import type {
  ConditionStep,
  JoinedRecord,
  RuleConfig,
  RuleContext,
  RuleId,
  RuleResult,
} from "./types";

const currencyNote = (config: RuleConfig) =>
  config.currencyMode === "usd"
    ? "Indicative static USD rates; not live FX."
    : "Thresholds use local units; unlike currencies are not normalized.";

function numericStep(
  label: string,
  source: ConditionStep["source"],
  actual: number | null,
  operator: string,
  expected: number,
  matches: boolean,
): ConditionStep {
  const valid = actual !== null && Number.isFinite(actual);
  return {
    label,
    source,
    actual: valid ? actual : null,
    operator,
    expected,
    outcome: !valid ? "MISSING" : matches ? "MATCHED" : "NOT_MATCHED",
  };
}

function amountSteps(
  record: JoinedRecord,
  config: RuleConfig,
  operator: string,
  threshold: number,
  matches: (amount: number) => boolean,
): ConditionStep[] {
  const { amount, currency } = record.transaction;
  const comparable = comparableAmount(amount, currency, config.currencyMode);
  const steps: ConditionStep[] = [
    {
      label: "Raw amount",
      source: "transaction",
      actual: amount !== null && Number.isFinite(amount) ? amount : null,
      operator: "present",
      expected: true,
      outcome:
        amount !== null && Number.isFinite(amount) ? "MATCHED" : "MISSING",
    },
  ];
  if (config.currencyMode === "usd")
    steps.push({
      label: "Source currency (indicative USD conversion)",
      source: "transaction",
      actual: currency,
      operator: "supported FX rate",
      expected: true,
      outcome: comparable === null ? "MISSING" : "MATCHED",
    });
  steps.push(
    numericStep(
      config.currencyMode === "usd"
        ? "Comparable amount (USD)"
        : "Comparable amount (local units)",
      "derived",
      comparable,
      operator,
      threshold,
      comparable !== null && matches(comparable),
    ),
  );
  return steps;
}

/** Conservative AND: incomplete evidence remains a gap even when another step fails. */
function result(
  ruleId: RuleId,
  steps: ConditionStep[],
  reason: string,
  matched?: boolean,
): RuleResult {
  const status = steps.some((step) => step.outcome === "MISSING")
    ? "DATA_GAP"
    : (matched ?? steps.every((step) => step.outcome === "MATCHED"))
      ? "FIRED"
      : "CLEAR";
  return {
    ruleId,
    status,
    reason: `${status === "DATA_GAP" ? "Required evidence is missing. " : ""}${reason}`,
    steps,
  };
}

export function evaluateHighValue(
  record: JoinedRecord,
  config: RuleConfig,
  context: RuleContext,
): RuleResult {
  const steps = amountSteps(
    record,
    config,
    ">",
    config.highValue.threshold,
    (amount) => amount > config.highValue.threshold,
  );
  if (config.highValue.compareSenderAverage) {
    const currency = record.transaction.currency;
    const profile = context.senderProfile;
    const sameSender =
      profile?.senderAccountId === record.transaction.sender_account_id;
    const baseline =
      sameSender &&
      currency &&
      Object.hasOwn(profile.amountsByCurrency, currency)
        ? profile.amountsByCurrency[currency].average
        : null;
    const average = comparableAmount(baseline, currency, config.currencyMode);
    const amount = comparableAmount(
      record.transaction.amount,
      currency,
      config.currencyMode,
    );
    steps.push(
      numericStep(
        "Same-currency sender average (dataset snapshot)",
        "sender-profile",
        average,
        "available",
        0,
        average !== null,
      ),
    );
    steps.push({
      label: "Amount above sender average",
      source: "derived",
      actual: amount,
      operator: ">",
      expected: average,
      outcome:
        amount === null || average === null
          ? "MISSING"
          : amount > average
            ? "MATCHED"
            : "NOT_MATCHED",
    });
  }
  return result(
    "RULE_001",
    steps,
    `Amount must exceed the threshold${config.highValue.compareSenderAverage ? " and the same-currency dataset snapshot average" : ""}. ${currencyNote(config)}`,
  );
}

export function evaluateSmallFrequent(
  record: JoinedRecord,
  config: RuleConfig,
  context: RuleContext,
): RuleResult {
  const steps = amountSteps(
    record,
    config,
    "<=",
    config.smallFrequent.maxAmount,
    (amount) => amount <= config.smallFrequent.maxAmount,
  );
  const sender = record.transaction.sender_account_id;
  steps.push({
    label: "Sender",
    source: "transaction",
    actual: sender,
    operator: "present",
    expected: true,
    outcome: sender?.trim() ? "MATCHED" : "MISSING",
  });
  const timestamp = record.transaction.txn_date_time;
  steps.push({
    label: "Source timestamp",
    source: "transaction",
    actual: timestamp,
    operator: "valid source wall-clock timestamp",
    expected: true,
    outcome: parseSourceTimestamp(timestamp) !== null ? "MATCHED" : "MISSING",
  });
  const count =
    context.currencyMode === config.currencyMode
      ? context.recentSmallTransactionCount
      : null;
  steps.push(
    numericStep(
      `Small payments in trailing ${config.smallFrequent.windowMinutes} minutes (including current-time ties)`,
      "derived",
      count,
      ">=",
      config.smallFrequent.minCount,
      count !== null && count >= config.smallFrequent.minCount,
    ),
  );
  return result(
    "RULE_002",
    steps,
    `Uses an actual trailing window, not cumulative feature transaction_count. ${currencyNote(config)}`,
  );
}

export function evaluateUnusualType(
  record: JoinedRecord,
  config: RuleConfig,
  context: RuleContext,
): RuleResult {
  const type = record.transaction.transaction_type;
  const profile = context.senderProfile;
  const usable =
    profile !== null &&
    profile.senderAccountId === record.transaction.sender_account_id &&
    profile.knownTypeCount > 0;
  const count =
    usable && type && Object.hasOwn(profile.typeCounts, type)
      ? profile.typeCounts[type]
      : 0;
  const share =
    usable && type?.trim() ? (count / profile.knownTypeCount) * 100 : null;
  const steps: ConditionStep[] = [
    {
      label: "Transaction type",
      source: "transaction",
      actual: type,
      operator: "present",
      expected: true,
      outcome: type?.trim() ? "MATCHED" : "MISSING",
    },
    numericStep(
      "Known-type share (%) in dataset snapshot",
      "sender-profile",
      share,
      "<",
      config.unusualType.rarityPercent,
      share !== null && share < config.unusualType.rarityPercent,
    ),
  ];
  return result(
    "RULE_003",
    steps,
    "Uses a dataset snapshot baseline, not prior historical knowledge. Missing types are excluded from the denominator.",
  );
}

const normalizeEntry = (value: string) => value.trim().toLowerCase();

export function evaluateRiskWatchlist(
  record: JoinedRecord,
  config: RuleConfig,
): RuleResult {
  const merchants = config.riskWatchlist.merchants
    .map(normalizeEntry)
    .filter(Boolean);
  const countries = config.riskWatchlist.countries
    .map(normalizeEntry)
    .filter(Boolean);
  const steps: ConditionStep[] = [];
  function watchlistStep(
    label: string,
    value: string | null,
    entries: string[],
  ): ConditionStep {
    return {
      label,
      source: "transaction",
      actual: value,
      operator: "trimmed case-insensitive exact match",
      expected: JSON.stringify(entries),
      outcome: !value?.trim()
        ? "MISSING"
        : entries.includes(normalizeEntry(value))
          ? "MATCHED"
          : "NOT_MATCHED",
    };
  }
  if (merchants.length)
    steps.push(
      watchlistStep(
        "Configured merchant list",
        record.transaction.merchant_description_condensed,
        merchants,
      ),
    );
  if (countries.length)
    steps.push(
      watchlistStep(
        "Configured country list",
        record.transaction.merchant_country,
        countries,
      ),
    );
  if (!steps.length)
    steps.push({
      label: "Watchlist configuration",
      source: "configuration",
      actual: null,
      operator: "at least one nonempty entry",
      expected: true,
      outcome: "MISSING",
    });
  return result(
    "RULE_004",
    steps,
    "Merchant OR country match. Only configured branches are evaluated; missing configured evidence remains a gap.",
    steps.some((step) => step.outcome === "MATCHED"),
  );
}

export function evaluateCrossBorder(
  record: JoinedRecord,
  config: RuleConfig,
  context: RuleContext,
): RuleResult {
  const country = record.transaction.merchant_country;
  const profile = context.senderProfile;
  const home =
    profile?.senderAccountId === record.transaction.sender_account_id
      ? profile.homeCountry
      : null;
  const steps = amountSteps(
    record,
    config,
    ">=",
    config.crossBorder.minAmount,
    (amount) => amount >= config.crossBorder.minAmount,
  );
  steps.push({
    label: "Merchant country versus modal sender country (dataset snapshot)",
    source: "transaction",
    actual: country,
    operator: "!=",
    expected: home,
    outcome:
      !country?.trim() || !home?.trim()
        ? "MISSING"
        : country !== home
          ? "MATCHED"
          : "NOT_MATCHED",
  });
  return result(
    "RULE_005",
    steps,
    `Home country is a dataset snapshot mode, not verified residence or prior historical knowledge. ${currencyNote(config)}`,
  );
}

export function evaluateOutsideHours(
  record: JoinedRecord,
  config: RuleConfig,
): RuleResult {
  const hour = record.features?.hour_of_day ?? null;
  const day = record.features?.day_of_week ?? null;
  const validHour =
    hour !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23;
  const outside =
    validHour &&
    (hour < config.outsideHours.startHour ||
      hour >= config.outsideHours.endHour);
  const steps: ConditionStep[] = [
    {
      label: "Source hour outside business hours",
      source: "features",
      actual: validHour ? hour : null,
      operator: `< ${config.outsideHours.startHour} OR >=`,
      expected: config.outsideHours.endHour,
      outcome: !validHour ? "MISSING" : outside ? "MATCHED" : "NOT_MATCHED",
    },
  ];
  let weekend = false;
  if (config.outsideHours.flagWeekends) {
    const validDay =
      day !== null && Number.isInteger(day) && day >= 0 && day <= 6;
    weekend = validDay && day >= 5;
    steps.push({
      label: "Weekend (Python weekday: Monday=0, Sunday=6)",
      source: "features",
      actual: validDay ? day : null,
      operator: ">=",
      expected: 5,
      outcome: !validDay ? "MISSING" : weekend ? "MATCHED" : "NOT_MATCHED",
    });
  }
  return result(
    "RULE_006",
    steps,
    "Source timezone is unknown. Uses supplied source-hour features without converting to the viewer's timezone.",
    outside || weekend,
  );
}

export function evaluateCashWithdrawal(
  record: JoinedRecord,
  config: RuleConfig,
): RuleResult {
  const steps = amountSteps(
    record,
    config,
    ">=",
    config.cashWithdrawal.minAmount,
    (amount) => amount >= config.cashWithdrawal.minAmount,
  );
  steps.push({
    label: "Established cash/ATM channel",
    source: "transaction",
    actual: null,
    operator: "established cash evidence",
    expected: true,
    outcome: "MISSING",
  });
  return result(
    "RULE_007",
    steps,
    "The supplied schema has no established cash/ATM signal. Terminal ID 0 and a guessed transaction-type string do not establish a cash withdrawal.",
  );
}

export function evaluateRules(
  record: JoinedRecord,
  config: RuleConfig,
  context: RuleContext,
): RuleResult[] {
  return [
    evaluateHighValue(record, config, context),
    evaluateSmallFrequent(record, config, context),
    evaluateUnusualType(record, config, context),
    evaluateRiskWatchlist(record, config),
    evaluateCrossBorder(record, config, context),
    evaluateOutsideHours(record, config),
    evaluateCashWithdrawal(record, config),
  ];
}
