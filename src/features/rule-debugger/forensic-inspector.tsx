import { cn } from "@/lib/utils";
import { Tabs } from "radix-ui";
import { useState, type ReactNode } from "react";
import { comparableAmount } from "./fx";
import { buttonClassName } from "./workbench-styles";
import { StatusLabel, WorkbenchIcon } from "./workbench-icon";
import type { EvaluatedRecord, RuleDefinition, RuleId } from "./types";
import { RULE_IDS } from "./types";
import { RuleTrace, formatEvidenceValue } from "./rule-trace";
import { InspectorSkeleton } from "./workbench-skeletons";

type Props = {
  value: EvaluatedRecord | null;
  rules: RuleDefinition[];
  selectedRule: number;
  usd: boolean;
  open: boolean;
  onClose: () => void;
  outsideResults: boolean;
  pendingSelection: boolean;
  loading: boolean;
  onFilterBySender: (senderId: string) => void;
  pendingRuleIds?: RuleId[];
};

function DataValue({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 border-b border-wb-line py-[9px] font-mono text-[12px] leading-[1.6] [overflow-wrap:anywhere]">
      <dt className="text-wb-muted">{name}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const tabClassName =
  "border-b-2 border-transparent py-2.5 text-wb-muted data-[state=active]:border-wb-accent data-[state=active]:text-wb-text mobile:min-h-11";

const severityOrder = ["Critical", "High", "Medium", "Low"] as const;

export function ForensicInspector({
  value,
  rules,
  selectedRule,
  usd,
  open,
  onClose,
  outsideResults,
  pendingSelection,
  loading,
  onFilterBySender,
  pendingRuleIds = [],
}: Props) {
  const [copyFeedback, setCopyFeedback] = useState<{
    id: string;
    copied: boolean;
  } | null>(null);
  const transaction = value?.record.transaction;
  const senderId = transaction?.sender_account_id;
  const baseline = value?.context.senderProfile ?? null;
  const profile = baseline?.senderAccountId === senderId ? baseline : null;
  const converted = transaction
    ? comparableAmount(transaction.amount, transaction.currency, "usd")
    : null;
  const selectedRuleId = RULE_IDS[selectedRule];
  const baselineResult = value?.defaultResults?.find(
    (result) => result.ruleId === selectedRuleId,
  );
  const currentResult = value?.results.find(
    (result) => result.ruleId === selectedRuleId,
  );
  const firedRules = rules.filter((rule) =>
    value?.results.some(
      (result) =>
        result.ruleId === rule.rule_id &&
        result.status === "FIRED" &&
        !pendingRuleIds.includes(result.ruleId),
    ),
  );
  const highestSeverity = severityOrder.find((severity) =>
    firedRules.some((rule) => rule.severity === severity),
  );
  const highestSeverityRules = firedRules.filter(
    (rule) => rule.severity === highestSeverity,
  );
  const priority = { FIRED: 0, DATA_GAP: 1, CLEAR: 2 };
  const order = value
    ? [...value.results].sort((a, b) => {
        if (a.ruleId === selectedRuleId) return -1;
        if (b.ruleId === selectedRuleId) return 1;
        return priority[a.status] - priority[b.status];
      })
    : [];

  async function copyTransactionId() {
    if (!transaction) return;
    const id = transaction.transaction_id;
    try {
      await navigator.clipboard.writeText(id);
      setCopyFeedback({ id, copied: true });
    } catch {
      setCopyFeedback({ id, copied: false });
    }
  }
  return (
    <aside
      data-open={open}
      className={cn(
        "min-h-0 min-w-0 overflow-auto border-l border-wb-line bg-wb-panel mobile:fixed mobile:top-[51px] mobile:right-0",
        "mobile:bottom-[29px] mobile:z-15 mobile:hidden mobile:w-[min(430px,100%)] mobile:shadow-[-15px_0_40px_#0006] mobile:data-[open=true]:block",
      )}
      aria-label="Transaction inspector"
      aria-busy={loading || pendingSelection || pendingRuleIds.length > 0}
      id="transaction-inspector"
    >
      <div className="sticky top-0 z-10 flex h-[49px] items-center justify-between gap-2 border-b border-wb-line bg-wb-input px-[18px] py-2 shadow-[0_2px_6px_#0000000d] mobile:px-3">
        <h2 className="text-[13px] font-semibold">Transaction inspector</h2>
        <button
          className={cn(buttonClassName, "hidden size-11 mobile:inline-flex")}
          data-panel-close
          aria-label="Close transaction inspector"
          onClick={onClose}
        >
          <WorkbenchIcon name="close" />
        </button>
      </div>
      {pendingSelection ? (
        <p className="px-[18px] pt-3 text-[12px] text-wb-muted">
          Loading a transaction from the adjacent page. The current selection is
          retained until it arrives.
        </p>
      ) : outsideResults ? (
        <p className="px-[18px] pt-3 text-[12px] text-wb-gap">
          Selected transaction is outside the visible results.
        </p>
      ) : null}
      {!transaction || !value ? (
        loading ? (
          <InspectorSkeleton />
        ) : (
          <p className="p-[18px] text-wb-muted">
            Select a loaded transaction to inspect.
          </p>
        )
      ) : (
        <>
          <div className="px-[18px] pt-[17px] pb-4">
            <div className="flex items-center justify-between gap-2 font-mono text-[15px] font-medium">
              <span className="[overflow-wrap:anywhere]">
                {transaction.transaction_id}
              </span>
              <button
                className={cn(
                  buttonClassName,
                  "size-8 shrink-0 p-1.5 mobile:size-11",
                )}
                aria-label="Copy transaction ID"
                onClick={copyTransactionId}
              >
                <WorkbenchIcon name="copy" />
              </button>
            </div>
            {copyFeedback?.id === transaction.transaction_id ? (
              <p role="status" className="mt-1 text-[12px] text-wb-muted">
                {copyFeedback.copied
                  ? "Transaction ID copied"
                  : "Copy unavailable. Select the transaction ID to copy it manually."}
              </p>
            ) : null}
            <p className="mt-px text-[12px] text-wb-muted">
              {transaction.txn_date_time ?? "Missing timestamp"} · Source
              timezone unknown
            </p>
            <div className="mt-[17px] font-mono text-[26px] font-medium tracking-[-0.5px]">
              {transaction.amount?.toLocaleString("en-US", {
                maximumFractionDigits: 2,
              }) ?? "Missing"}{" "}
              <span className="text-[13px] text-wb-muted">
                {transaction.currency ?? "Unknown currency"}
              </span>
            </div>
            {usd ? (
              <p className="font-mono text-[12px] text-wb-muted">
                {converted?.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                }) ?? "Unavailable"}{" "}
                USD · Indicative static FX
              </p>
            ) : null}
            <p className="mt-1">
              {transaction.merchant_description_condensed ?? "Missing merchant"}
            </p>
            <p className="text-[12px] text-wb-muted">
              {transaction.merchant_city ?? "Missing city"},{" "}
              {transaction.merchant_country ?? "Missing country"}
            </p>
            <div className="mt-[15px] flex flex-wrap items-center gap-x-3.5 gap-y-2">
              {highestSeverity ? (
                <div
                  role="group"
                  aria-label="Highest fired severity"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded border border-current/30 px-2 py-1 text-[12px] font-medium",
                    highestSeverity === "Critical" || highestSeverity === "High"
                      ? "bg-wb-fired/10 text-wb-fired"
                      : highestSeverity === "Medium"
                        ? "bg-wb-gap-bg text-wb-gap"
                        : "bg-wb-input text-wb-muted",
                  )}
                >
                  <WorkbenchIcon name="warning" />
                  {highestSeverity} ·{" "}
                  {highestSeverityRules.length === 1
                    ? `${highestSeverityRules[0].rule_id.replace("RULE_00", "R")} fired`
                    : `${highestSeverityRules.length} rules fired`}
                </div>
              ) : null}
              <StatusLabel status="fired">
                {
                  value.results.filter(
                    (result) =>
                      result.status === "FIRED" &&
                      !pendingRuleIds.includes(result.ruleId),
                  ).length
                }{" "}
                fired
              </StatusLabel>
              <StatusLabel status="gap">
                {
                  value.results.filter(
                    (result) =>
                      result.status === "DATA_GAP" &&
                      !pendingRuleIds.includes(result.ruleId),
                  ).length
                }{" "}
                data gaps
              </StatusLabel>
            </div>
          </div>
          {pendingRuleIds.length ? (
            <p className="px-[18px] pb-3 text-[12px] text-wb-muted">
              {pendingRuleIds.length} rule pending
            </p>
          ) : null}
          <Tabs.Root defaultValue="trace">
            <Tabs.List
              aria-label="Inspector views"
              className="sticky top-[49px] z-2 flex gap-[22px] border-b border-wb-line bg-wb-panel px-[18px] text-[12px]"
            >
              <Tabs.Trigger value="trace" className={tabClassName}>
                Rule trace
              </Tabs.Trigger>
              <Tabs.Trigger value="lineage" className={tabClassName}>
                Data lineage
              </Tabs.Trigger>
              <Tabs.Trigger value="sender" className={tabClassName}>
                Sender
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="trace" className="px-[18px] pt-4 pb-[25px]">
              {baselineResult && currentResult ? (
                <div
                  className="mb-[15px] border-b border-wb-line pb-[15px] text-[12px]"
                  aria-label="Selected rule comparison"
                >
                  <p className="mb-2 text-wb-muted">
                    R{selectedRule + 1} · Default (original currencies) /
                    current ({usd ? "USD" : "original currencies"})
                  </p>
                  <div className="flex items-center gap-[9px]">
                    <StatusLabel
                      status={
                        baselineResult.status === "FIRED"
                          ? "fired"
                          : baselineResult.status === "DATA_GAP"
                            ? "gap"
                            : "clear"
                      }
                    />
                    <WorkbenchIcon name="arrow" />
                    {pendingRuleIds.includes(selectedRuleId) ? (
                      <span className="text-wb-muted">Pending context</span>
                    ) : (
                      <StatusLabel
                        status={
                          currentResult.status === "FIRED"
                            ? "fired"
                            : currentResult.status === "DATA_GAP"
                              ? "gap"
                              : "clear"
                        }
                      />
                    )}
                  </div>
                </div>
              ) : null}
              {order.map((result) => (
                <RuleTrace
                  key={`${transaction.transaction_id}-${result.ruleId}`}
                  result={result}
                  metadata={rules.find(
                    (rule) => rule.rule_id === result.ruleId,
                  )}
                  selected={result.ruleId === selectedRuleId}
                  pending={pendingRuleIds.includes(result.ruleId)}
                />
              ))}
            </Tabs.Content>
            <Tabs.Content value="lineage" className="px-[18px] pt-4 pb-[25px]">
              <section aria-label="Join conflicts" className="mb-6">
                <h3 className="mb-2.5 text-[13px] font-medium">
                  Join conflicts
                </h3>
                {value.record.conflicts.length ? (
                  <>
                    <p className="mb-2 text-[12px] text-wb-gap">
                      {value.record.conflicts.length} shared-field conflict(s).
                      Neither source was overwritten.
                    </p>
                    <dl>
                      {value.record.conflicts.map((conflict) => (
                        <DataValue key={conflict.field} name={conflict.field}>
                          <span className="block">
                            {formatEvidenceValue(conflict.transactionValue)} ·
                            transaction
                          </span>
                          <span className="block text-wb-gap">
                            {formatEvidenceValue(conflict.featureValue)} ·
                            features
                          </span>
                        </DataValue>
                      ))}
                    </dl>
                  </>
                ) : (
                  <p className="text-[12px] text-wb-muted">
                    {value.record.features
                      ? "No shared-field conflicts for this join."
                      : "No feature vector joined to this transaction."}
                  </p>
                )}
              </section>
              <section aria-label="Transaction input" className="mb-6">
                <h3 className="mb-1 text-[13px] font-medium">
                  Transaction input
                </h3>
                <p className="mb-2 text-[12px] text-wb-muted">
                  transactions.json · {transaction.transaction_id}
                </p>
                <dl>
                  {Object.entries(transaction).map(([field, rawValue]) => (
                    <DataValue key={field} name={field}>
                      {rawValue === null ? (
                        <span className="text-wb-gap">null · missing</span>
                      ) : (
                        formatEvidenceValue(rawValue)
                      )}
                    </DataValue>
                  ))}
                </dl>
                <p className="mt-2 text-[12px] leading-[1.7] text-wb-muted">
                  The terminal ID is shown as supplied; it does not establish
                  cash/ATM evidence.
                </p>
              </section>
              <section aria-label="Feature vector" className="mb-6">
                <h3 className="mb-1 text-[13px] font-medium">Feature vector</h3>
                {value.record.features ? (
                  <>
                    <p className="mb-2 text-[12px] text-wb-muted">
                      feature_vectors.json · joined by transaction_id
                    </p>
                    <dl>
                      {Object.entries(value.record.features).map(
                        ([field, featureValue]) => (
                          <DataValue key={field} name={field}>
                            {featureValue === null ? (
                              <span className="text-wb-gap">
                                null · missing
                              </span>
                            ) : (
                              formatEvidenceValue(featureValue)
                            )}
                          </DataValue>
                        ),
                      )}
                    </dl>
                    <p className="mt-2 text-[12px] leading-[1.7] text-wb-muted">
                      transaction_count is cumulative. R2 uses a calculated
                      trailing-window count instead.
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-wb-muted">
                    Feature input unavailable; no values have been substituted.
                  </p>
                )}
              </section>
              <section aria-label="Derived context">
                <h3 className="mb-2.5 text-[13px] font-medium">
                  Derived context
                </h3>
                <dl>
                  <DataValue name="recent_small_transaction_count">
                    {pendingRuleIds.includes("RULE_002")
                      ? "Pending current window"
                      : (value.context.recentSmallTransactionCount ??
                        "null · unavailable")}
                  </DataValue>
                  <DataValue name="currency_mode">
                    {value.context.currencyMode}
                  </DataValue>
                </dl>
                <p className="mt-2 text-[12px] text-wb-muted">
                  Source timezone is unknown. Raw and derived amounts remain
                  separate in the rule trace.
                </p>
              </section>
            </Tabs.Content>
            <Tabs.Content value="sender" className="px-[18px] pt-4 pb-[25px]">
              <h3 className="mb-2.5 text-[13px] font-medium">
                Dataset snapshot baseline
              </h3>
              <p className="mb-3 font-mono text-[12px] text-wb-muted [overflow-wrap:anywhere]">
                {senderId ?? "Missing sender ID"}
              </p>
              {profile ? (
                <>
                  <dl>
                    <DataValue name="total_transactions">
                      {profile.totalTransactions}
                    </DataValue>
                    <DataValue name="modal_country">
                      {profile.homeCountry ?? "null · missing"}
                    </DataValue>
                  </dl>
                  <p className="mt-3 text-[12px] leading-[1.7] text-wb-muted">
                    Computed from the complete supplied dataset snapshot, not
                    historical knowledge available before this transaction.
                    Modal country is an observed baseline, not verified
                    residence.
                  </p>
                  <section aria-label="Country counts" className="mt-[21px]">
                    <h3 className="mb-2.5 text-[13px] font-medium">
                      Country counts
                    </h3>
                    <dl>
                      {Object.entries(profile.countryCounts).map(
                        ([country, count]) => (
                          <DataValue key={country} name={country}>
                            {count}
                          </DataValue>
                        ),
                      )}
                    </dl>
                  </section>
                  <section aria-label="Channel shares" className="mt-[21px]">
                    <h3 className="mb-2.5 text-[13px] font-medium">
                      Channel shares
                    </h3>
                    <p className="text-[12px] text-wb-muted">
                      Known types: {profile.knownTypeCount} · Missing types:{" "}
                      {profile.missingTypeCount}
                    </p>
                    <dl>
                      {Object.entries(profile.typeCounts).map(
                        ([type, count]) => (
                          <DataValue key={type} name={type}>
                            {count} ·{" "}
                            {profile.knownTypeCount > 0
                              ? `${((count / profile.knownTypeCount) * 100).toFixed(2)}%`
                              : "Share unavailable"}
                          </DataValue>
                        ),
                      )}
                    </dl>
                    <p className="mt-2 text-[12px] text-wb-muted">
                      Missing transaction types are excluded from the share
                      denominator.
                    </p>
                  </section>
                  <section
                    aria-label="Amounts by currency"
                    className="mt-[21px]"
                  >
                    <h3 className="mb-2.5 text-[13px] font-medium">
                      Amounts by currency
                    </h3>
                    {Object.entries(profile.amountsByCurrency).map(
                      ([currency, amounts]) => (
                        <dl key={currency} className="mb-3">
                          <DataValue name={currency}>
                            {amounts.count} amounts
                          </DataValue>
                          <DataValue name="total">
                            {amounts.total.toLocaleString("en-US", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {currency}
                          </DataValue>
                          <DataValue name="average">
                            {amounts.average.toLocaleString("en-US", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            {currency}
                          </DataValue>
                        </dl>
                      ),
                    )}
                    <p className="text-[12px] text-wb-muted">
                      Original currencies are aggregated separately; there is no
                      mixed-currency average.
                    </p>
                  </section>
                </>
              ) : (
                <p className="text-[12px] text-wb-gap">
                  Sender baseline unavailable.
                </p>
              )}
              <button
                className={cn(
                  buttonClassName,
                  "mt-4 w-full text-[12px] mobile:min-h-11",
                )}
                disabled={!senderId?.trim()}
                onClick={() => {
                  if (senderId) onFilterBySender(senderId);
                }}
              >
                Filter transactions by this sender{" "}
                <WorkbenchIcon name="arrow" />
              </button>
            </Tabs.Content>
          </Tabs.Root>
        </>
      )}
    </aside>
  );
}
