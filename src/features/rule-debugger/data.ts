import {
  RULE_IDS,
  type Transaction,
  type FeatureVector,
  type RuleDefinition,
  type JoinedRecord,
  type DatasetDiagnostics,
  type SenderProfile,
  type CurrencyAmounts,
  type SharedField,
  type FieldConflict,
} from "./types";

/** Accept the source files' bare NaN values without changing quoted strings. */
export function parseDatasetText(text: string): unknown {
  const chunks: string[] = [];
  let insideString = false;
  let escaped = false;
  let copiedThrough = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (insideString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') insideString = false;
      continue;
    }
    if (character === '"') {
      insideString = true;
      continue;
    }

    if (character !== "N" || !text.startsWith("NaN", index)) continue;
    const before = index === 0 ? "" : text[index - 1];
    const after = index + 3 === text.length ? "" : text[index + 3];
    const startsValue = before === "" || /[\s[:,]/.test(before);
    const endsValue = after === "" || /[\s\]},]/.test(after);
    if (!startsValue || !endsValue) continue;

    chunks.push(text.slice(copiedThrough, index), "null");
    index += 2;
    copiedThrough = index + 1;
  }

  chunks.push(text.slice(copiedThrough));
  try {
    return JSON.parse(chunks.join("")) as unknown;
  } catch (cause) {
    throw new Error(
      "Invalid dataset JSON. Check the file syntax; only unquoted NaN values are converted to null.",
      { cause },
    );
  }
}

function readRows(value: unknown, dataset: string): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new Error(`${dataset}: expected an array of objects.`);
  return value.map((row: unknown, index) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error(`${dataset}[${index}]: expected an object.`);
    }
    return row as Record<string, unknown>;
  });
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path}: expected a nonblank string.`);
  }
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string")
    throw new Error(`${path}: expected a string or null.`);
  return value;
}

function nullableNumber(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite number or null.`);
  }
  return value;
}

function nullableInteger(
  value: unknown,
  path: string,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  const number = nullableNumber(value, path);
  if (
    number !== null &&
    (!Number.isSafeInteger(number) || number < 0 || number > max)
  ) {
    throw new Error(
      `${path}: expected a safe integer between 0 and ${max}, or null.`,
    );
  }
  return number;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined)
    throw new Error(`${path}: expected one of ${allowed.join(", ")}.`);
  return match;
}

export function validateTransactions(value: unknown): Transaction[] {
  return readRows(value, "transactions").map((row, index) => {
    const path = `transactions[${index}]`;
    return {
      transaction_id: requiredString(
        row.transaction_id,
        `${path}.transaction_id`,
      ),
      txn_date_time: nullableString(row.txn_date_time, `${path}.txn_date_time`),
      sender_account_id: nullableString(
        row.sender_account_id,
        `${path}.sender_account_id`,
      ),
      receiver_account_id: nullableInteger(
        row.receiver_account_id,
        `${path}.receiver_account_id`,
      ),
      amount: nullableNumber(row.amount, `${path}.amount`),
      currency: nullableString(row.currency, `${path}.currency`),
      transaction_type: nullableString(
        row.transaction_type,
        `${path}.transaction_type`,
      ),
      terminal_id: nullableInteger(row.terminal_id, `${path}.terminal_id`),
      merchant_city: nullableString(row.merchant_city, `${path}.merchant_city`),
      merchant_country: nullableString(
        row.merchant_country,
        `${path}.merchant_country`,
      ),
      merchant_postcode: nullableString(
        row.merchant_postcode,
        `${path}.merchant_postcode`,
      ),
      merchant_description_condensed: nullableString(
        row.merchant_description_condensed,
        `${path}.merchant_description_condensed`,
      ),
    };
  });
}

export function validateFeatureVectors(value: unknown): FeatureVector[] {
  return readRows(value, "feature_vectors").map((row, index) => {
    const path = `feature_vectors[${index}]`;
    return {
      transaction_id: requiredString(
        row.transaction_id,
        `${path}.transaction_id`,
      ),
      sender_account_id: nullableString(
        row.sender_account_id,
        `${path}.sender_account_id`,
      ),
      receiver_account_id: nullableInteger(
        row.receiver_account_id,
        `${path}.receiver_account_id`,
      ),
      amount: nullableNumber(row.amount, `${path}.amount`),
      currency: nullableString(row.currency, `${path}.currency`),
      transaction_type: nullableString(
        row.transaction_type,
        `${path}.transaction_type`,
      ),
      transaction_count: nullableInteger(
        row.transaction_count,
        `${path}.transaction_count`,
      ),
      avg_transaction_amount: nullableNumber(
        row.avg_transaction_amount,
        `${path}.avg_transaction_amount`,
      ),
      hour_of_day: nullableInteger(row.hour_of_day, `${path}.hour_of_day`, 23),
      day_of_week: nullableInteger(row.day_of_week, `${path}.day_of_week`, 6),
      merchant_avg_transaction_amount: nullableNumber(
        row.merchant_avg_transaction_amount,
        `${path}.merchant_avg_transaction_amount`,
      ),
    };
  });
}

export function validateRuleDefinitions(value: unknown): RuleDefinition[] {
  const seenIds = new Set<string>();
  return readRows(value, "example_rules").map((row, index) => {
    const path = `example_rules[${index}]`;
    const ruleId = enumValue(row.rule_id, RULE_IDS, `${path}.rule_id`);
    if (seenIds.has(ruleId))
      throw new Error(`Duplicate rule_id "${ruleId}" in example_rules.`);
    seenIds.add(ruleId);
    return {
      rule_id: ruleId,
      name: requiredString(row.name, `${path}.name`),
      description: requiredString(row.description, `${path}.description`),
      action: enumValue(
        row.action,
        ["Alert", "Review", "Investigate", "Block"],
        `${path}.action`,
      ),
      severity: enumValue(
        row.severity,
        ["Critical", "High", "Medium", "Low"],
        `${path}.severity`,
      ),
    };
  });
}

function indexByTransactionId<T extends { transaction_id: string }>(
  rows: readonly T[],
  dataset: string,
): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows) {
    if (index.has(row.transaction_id)) {
      throw new Error(
        `Duplicate transaction_id "${row.transaction_id}" in ${dataset}; an unambiguous join is required.`,
      );
    }
    index.set(row.transaction_id, row);
  }
  return index;
}

const sharedFields: SharedField[] = [
  "sender_account_id",
  "receiver_account_id",
  "amount",
  "currency",
  "transaction_type",
];

export function joinRecords(
  transactions: readonly Transaction[],
  features: readonly FeatureVector[],
): { records: JoinedRecord[]; diagnostics: DatasetDiagnostics } {
  const transactionsById = indexByTransactionId(transactions, "transactions");
  const featuresById = indexByTransactionId(features, "feature_vectors");
  const diagnostics: DatasetDiagnostics = {
    transactionCount: transactions.length,
    featureVectorCount: features.length,
    matchedCount: 0,
    missingFeatureIds: [],
    orphanFeatureIds: [],
    conflicts: [],
  };

  const records = transactions.map((transaction) => {
    const feature = featuresById.get(transaction.transaction_id) ?? null;
    const conflicts: FieldConflict[] = [];
    if (feature === null)
      diagnostics.missingFeatureIds.push(transaction.transaction_id);
    else {
      diagnostics.matchedCount++;
      for (const field of sharedFields) {
        if (transaction[field] === feature[field]) continue;
        conflicts.push({
          transactionId: transaction.transaction_id,
          field,
          transactionValue: transaction[field],
          featureValue: feature[field],
        });
      }
    }
    diagnostics.conflicts.push(...conflicts);
    return { transaction, features: feature, conflicts };
  });

  for (const feature of features) {
    if (!transactionsById.has(feature.transaction_id))
      diagnostics.orphanFeatureIds.push(feature.transaction_id);
  }
  return { records, diagnostics };
}

interface SenderAccumulator {
  total: number;
  missingTypes: number;
  countries: Map<string, number>;
  types: Map<string, number>;
  amounts: Map<string, { count: number; total: number }>;
}

/** Dataset-wide descriptive summaries, not historical/as-of risk profiles. */
export function buildSenderProfiles(
  records: readonly JoinedRecord[],
): Map<string, SenderProfile> {
  const senders = new Map<string, SenderAccumulator>();
  for (const { transaction } of records) {
    const senderId = transaction.sender_account_id;
    if (senderId === null || senderId.trim() === "") continue;
    let sender = senders.get(senderId);
    if (sender === undefined) {
      sender = {
        total: 0,
        missingTypes: 0,
        countries: new Map(),
        types: new Map(),
        amounts: new Map(),
      };
      senders.set(senderId, sender);
    }
    sender.total++;
    const country = transaction.merchant_country;
    if (country !== null && country.trim() !== "")
      sender.countries.set(country, (sender.countries.get(country) ?? 0) + 1);
    const type = transaction.transaction_type;
    if (type === null || type.trim() === "") sender.missingTypes++;
    else sender.types.set(type, (sender.types.get(type) ?? 0) + 1);

    const { amount, currency } = transaction;
    if (amount === null || currency === null || currency.trim() === "")
      continue;
    const totals = sender.amounts.get(currency) ?? { count: 0, total: 0 };
    const nextTotal = totals.total + amount;
    if (!Number.isFinite(nextTotal))
      throw new Error(
        `Sender ${senderId}: ${currency} amount total exceeds the finite numeric range.`,
      );
    sender.amounts.set(currency, { count: totals.count + 1, total: nextTotal });
  }

  const profiles = new Map<string, SenderProfile>();
  for (const [senderId, sender] of senders) {
    const rankedCountries = [...sender.countries].sort(
      ([a, countA], [b, countB]) => {
        if (countA !== countB) return countB - countA;
        return a < b ? -1 : a > b ? 1 : 0;
      },
    );
    const amountsByCurrency: Record<string, CurrencyAmounts> =
      Object.fromEntries(
        [...sender.amounts].map(([currency, totals]) => [
          currency,
          { ...totals, average: totals.total / totals.count },
        ]),
      );
    profiles.set(senderId, {
      senderAccountId: senderId,
      source: "dataset-snapshot",
      totalTransactions: sender.total,
      homeCountry: rankedCountries[0]?.[0] ?? null,
      countryCounts: Object.fromEntries(sender.countries),
      typeCounts: Object.fromEntries(sender.types),
      knownTypeCount: sender.total - sender.missingTypes,
      missingTypeCount: sender.missingTypes,
      amountsByCurrency,
    });
  }
  return profiles;
}
