import type { JoinedRecord, RuleContext } from "../types";

export function record(
  changes: Partial<JoinedRecord["transaction"]> = {},
): JoinedRecord {
  return {
    transaction: {
      transaction_id: "TXN_1",
      txn_date_time: "2024-10-01 12:00:00",
      sender_account_id: "sender-1",
      receiver_account_id: 1,
      amount: 1001,
      currency: "USD",
      transaction_type: "online",
      terminal_id: 0,
      merchant_city: "Panama",
      merchant_country: "PAN",
      merchant_postcode: null,
      merchant_description_condensed: "Shop",
      ...changes,
    },
    features: null,
    conflicts: [],
  };
}

export function context(changes: Partial<RuleContext> = {}): RuleContext {
  return {
    senderProfile: null,
    recentSmallTransactionCount: null,
    currencyMode: "original",
    ...changes,
  };
}
