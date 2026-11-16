import { comparableAmount } from "./fx";
import type { JoinedRecord, RuleConfig } from "./types";
export type { RuleContext } from "./types";

export function getContextKey(config: RuleConfig): string {
  return JSON.stringify([
    config.currencyMode,
    config.smallFrequent.maxAmount,
    config.smallFrequent.windowMinutes,
  ]);
}

/** UTC is only a stable arithmetic axis for source wall-clock strings, not a claimed timezone. */
export function parseSourceTimestamp(value: string | null): number | null {
  const match = value?.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  )
    return null;
  return date.getTime();
}

interface WindowPayment {
  id: string;
  time: number;
  small: boolean | null;
}

/** Sort once per sender. All same-time records share a count; future records are excluded. */
export function buildSmallTransactionCounts(
  records: readonly JoinedRecord[],
  config: RuleConfig,
): Map<string, number> {
  const groups = new Map<string, WindowPayment[]>();
  const invalidSenders = new Set<string>();
  const counts = new Map<string, number>();
  for (const { transaction } of records) {
    const sender = transaction.sender_account_id;
    if (!sender?.trim()) continue;
    const time = parseSourceTimestamp(transaction.txn_date_time);
    if (time === null) {
      // An undated payment might belong to any window for this sender.
      invalidSenders.add(sender);
      continue;
    }
    const amount = comparableAmount(
      transaction.amount,
      transaction.currency,
      config.currencyMode,
    );
    const group = groups.get(sender) ?? [];
    group.push({
      id: transaction.transaction_id,
      time,
      small: amount === null ? null : amount <= config.smallFrequent.maxAmount,
    });
    groups.set(sender, group);
  }
  const windowMs = config.smallFrequent.windowMinutes * 60_000;
  for (const [sender, payments] of groups) {
    if (invalidSenders.has(sender)) continue;
    payments.sort((a, b) => a.time - b.time);
    let left = 0;
    let smallCount = 0;
    let missingCount = 0;
    for (let start = 0; start < payments.length;) {
      const time = payments[start].time;
      let end = start;
      // Add the entire tied group before recording any of its counts.
      while (end < payments.length && payments[end].time === time) {
        if (payments[end].small === true) smallCount++;
        if (payments[end].small === null) missingCount++;
        end++;
      }
      while (left < end && payments[left].time < time - windowMs) {
        if (payments[left].small === true) smallCount--;
        if (payments[left].small === null) missingCount--;
        left++;
      }
      if (missingCount === 0) {
        for (let i = start; i < end; i++)
          counts.set(payments[i].id, smallCount);
      }
      start = end;
    }
  }
  return counts;
}
