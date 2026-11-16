import { buttonClassName } from "./workbench-styles";
import { cn } from "@/lib/utils";
import { StatusLabel, WorkbenchIcon } from "./workbench-icon";
import { comparableAmount } from "./fx";
import type { EvaluatedRecord, RuleId, TransactionFilters } from "./types";
import { PAGE_SIZE } from "./query";
import { TransactionSkeletonRows } from "./workbench-skeletons";

type Props = {
  selectedId: string | null;
  rows: EvaluatedRecord[];
  total: number | null;
  operation: string | null;
  error: string | null;
  onRetry: () => void;
  usd: boolean;
  onSelect: (id: string) => void;
  onOpenStudio: () => void;
  onInspectSelection: () => void;
  filters: TransactionFilters;
  selectedRuleId: RuleId;
  onFiltersChange: (next: TransactionFilters) => void;
  onResetFilters: () => void;
  page: number;
  onPageChange: (page: number) => void;
  pendingSelection: boolean;
};

export function TransactionStream({
  selectedId,
  usd,
  onSelect,
  onOpenStudio,
  onInspectSelection,
  rows,
  total,
  operation,
  error,
  onRetry,
  filters,
  selectedRuleId,
  onFiltersChange,
  onResetFilters,
  page,
  onPageChange,
  pendingSelection,
}: Props) {
  const loadingRows = !error && total === null;
  const presets = [
    {
      name: "All",
      value: "all",
      hint: "All transactions matching the other filters",
    },
    {
      name: "Currency traps",
      value: "currency-traps",
      hint: "Amount exceeds the high-value threshold in local units but not indicative USD",
    },
    {
      name: "Missing inputs",
      value: "missing-inputs",
      hint: "Any rule data gap; the unconfigured watchlist and missing cash signal affect all supplied records",
    },
    {
      name: "Cross-border",
      value: "cross-border",
      hint: "Cross-border rule fired in the current amount mode",
    },
  ] as const;
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col [&>div:first-child]:pr-3.5 [&>div:first-child_h2]:flex",
        "[&>div:first-child_h2]:items-center [&>div:first-child_h2]:gap-2 [&>div:first-child_small]:text-[12px]",
        "[&>div:first-child_small]:font-normal [&>div:first-child_small]:text-wb-muted mobile:w-full",
        "mobile:[&>div:first-child]:px-3",
      )}
      id="transactions"
      aria-label="Transactions"
      tabIndex={-1}
    >
      <div className="flex h-[49px] items-center justify-between gap-2 border-b border-wb-line px-[18px] py-2 [&_h2]:text-[13px] [&_h2]:font-medium mobile:px-3">
        <h2>
          Transactions <small>{total?.toLocaleString("en-US") ?? "—"}</small>
        </h2>
        <div className="flex items-center gap-2">
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2 text-[12px] text-wb-soft [&_input]:text-[12px] [&_input]:mt-[3px]",
              "[&_input]:size-3.5 [&_input]:shrink-0 [&_small]:mt-1 [&_small]:block [&_small]:text-[12px]",
              "[&_small]:leading-[1.6] [&_small]:text-wb-muted m-0",
            )}
          >
            <input
              className={cn(
                "rounded border border-wb-line bg-wb-input font-sans text-[13px] font-normal leading-[inherit] text-wb-text",
                "accent-wb-accent caret-wb-accent placeholder:text-wb-muted placeholder:opacity-100 disabled:cursor-not-allowed",
              )}
              type="checkbox"
              checked={filters.ruleId !== null}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  ruleId: event.target.checked ? selectedRuleId : null,
                })
              }
            />
            Selected rule only
          </label>
          <button
            className={cn(
              buttonClassName,
              "w-8 shrink-0 p-1.5 mobile:min-h-9 mobile:min-w-9 hidden tablet:inline-flex",
            )}
            aria-label="Open rule configuration"
            aria-controls="rule-studio"
            onClick={onOpenStudio}
          >
            <WorkbenchIcon name="sliders" />
          </button>
        </div>
      </div>
      <div className="border-b border-wb-line px-3.5 pt-3 pb-0 mobile:px-2.5 mobile:pt-[11px]">
        <div
          className={cn(
            "flex items-center gap-2 [&_select]:h-9 [&_select]:max-w-[130px] [&_select]:px-[7px] [&_select]:py-[5px]",
            "[&_select]:text-[12px] mobile:gap-1.5 mobile:[&_select]:h-10 mobile:[&_select]:w-[105px]",
          )}
        >
          <label
            className={cn(
              "relative min-w-0 flex-1 [&_svg]:absolute [&_svg]:top-2.5 [&_svg]:left-2.5 [&_svg]:text-wb-muted [&_input]:h-9",
              "[&_input]:w-full [&_input]:py-2 [&_input]:pr-[30px] [&_input]:pl-[33px] [&_input]:text-[12px] [&_kbd]:absolute",
              "[&_kbd]:top-[9px] [&_kbd]:right-2.5 [&_kbd]:text-wb-muted mobile:[&_input]:h-10 mobile:[&_input]:pr-3",
              "mobile:[&_input]:text-[13px] mobile:[&_kbd]:hidden",
            )}
          >
            <WorkbenchIcon name="search" />
            <input
              className={cn(
                "rounded border border-wb-line bg-wb-input font-sans text-[13px] font-normal leading-[inherit] text-wb-text",
                "accent-wb-accent caret-wb-accent placeholder:text-wb-muted placeholder:opacity-100 disabled:cursor-not-allowed",
              )}
              aria-label="Search transactions by ID, sender or merchant"
              id="transaction-search"
              placeholder="Search ID, sender or merchant"
              value={filters.search}
              onChange={(event) =>
                onFiltersChange({ ...filters, search: event.target.value })
              }
            />
            <kbd
              className="font-mono text-[12px] font-normal leading-[normal]"
              aria-hidden="true"
            >
              /
            </kbd>
          </label>
          <select
            className={cn(
              "rounded border border-wb-line bg-wb-input font-sans text-[13px] font-normal leading-[inherit] text-wb-text",
              "accent-wb-accent caret-wb-accent placeholder:text-wb-muted placeholder:opacity-100 disabled:cursor-not-allowed",
              "cursor-pointer",
            )}
            aria-label="Filter verdict"
            aria-describedby="verdict-filter-hint"
            value={filters.verdict ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                verdict: event.target.value
                  ? (event.target.value as TransactionFilters["verdict"])
                  : null,
              })
            }
          >
            <option value="">All verdicts</option>
            <option value="FIRED">Fired</option>
            <option value="DATA_GAP">Data gap</option>
            <option value="CLEAR">Clear</option>
          </select>
          <button
            className={cn(
              buttonClassName,
              "w-8 shrink-0 p-1.5 mobile:min-h-9 mobile:min-w-9",
            )}
            aria-label="Reset filters"
            onClick={onResetFilters}
          >
            <WorkbenchIcon name="reset" />
          </button>
        </div>
        <p
          id="verdict-filter-hint"
          className="mt-2 text-[12px] leading-[1.5] text-wb-muted"
        >
          {filters.ruleId
            ? `Verdict for ${filters.ruleId.replace("RULE_00", "R")} only. Row counts summarize all rules.`
            : "Fired takes priority over data gaps. Clear requires all rules clear."}
        </p>
        <div
          className={cn(
            "mt-[7px] flex flex-wrap items-center gap-[13px] [&_button]:rounded-none [&_button]:border-0",
            "[&_button]:border-b-2 [&_button]:border-transparent [&_button]:px-0 [&_button]:pt-2 [&_button]:pb-[9px]",
            "[&_button]:text-[12px] [&_button]:text-wb-muted [&_button[aria-pressed=true]]:border-wb-accent",
            "[&_button[aria-pressed=true]]:text-wb-text [&_button:hover]:bg-transparent [&_button:hover]:text-wb-text",
            "mobile:mt-1.5 mobile:gap-3.5 mobile:[&_button]:min-h-10",
          )}
          aria-label="Transaction filters"
        >
          {presets.map(({ name, value, hint }, index) => (
            <button
              key={name}
              aria-pressed={(filters.preset ?? "all") === value}
              className={cn(buttonClassName, index === 3 && "mobile:hidden")}
              title={hint}
              onClick={() => onFiltersChange({ ...filters, preset: value })}
            >
              {name}
            </button>
          ))}
        </div>
        {filters.senderId ? (
          <div className="flex items-center justify-between gap-2 border-t border-wb-line py-2 text-[12px]">
            <span className="min-w-0 font-mono text-wb-muted [overflow-wrap:anywhere]">
              Sender: {filters.senderId}
            </span>
            <button
              className={cn(
                buttonClassName,
                "size-8 shrink-0 p-1.5 mobile:size-11",
              )}
              aria-label="Remove sender filter"
              onClick={() => onFiltersChange({ ...filters, senderId: null })}
            >
              <WorkbenchIcon name="close" />
            </button>
          </div>
        ) : null}
      </div>
      {selectedId &&
      total !== null &&
      !operation &&
      !error &&
      !rows.some(
        (row) => row.record.transaction.transaction_id === selectedId,
      ) ? (
        <div className="hidden items-center justify-between gap-2 border-b border-wb-line px-3 py-2 text-[12px] mobile:flex">
          <span className="text-wb-muted">
            Selection outside visible results
          </span>
          <button
            className={cn(buttonClassName, "min-h-11 shrink-0 px-2")}
            aria-label="Inspect selected transaction"
            onClick={onInspectSelection}
          >
            Inspect selection
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div role="alert" className="p-[18px] text-wb-gap">
            <p>{error}</p>
            <button className={cn(buttonClassName, "mt-3")} onClick={onRetry}>
              Retry loading
            </button>
          </div>
        ) : pendingSelection || operation ? (
          <p role="status" className="sr-only">
            {pendingSelection ? "Loading adjacent page selection…" : operation}
          </p>
        ) : null}
        {!error && !operation && total === 0 ? (
          <div className="p-[18px] text-wb-muted">
            <p>No transactions found.</p>
            <button
              className={cn(buttonClassName, "mt-3")}
              onClick={onResetFilters}
            >
              Clear filters
            </button>
          </div>
        ) : null}
        <table
          className="w-full border-collapse text-[12px] whitespace-nowrap"
          aria-label="Transactions"
          aria-busy={loadingRows}
        >
          <thead>
            <tr>
              <th
                className="sticky top-0 z-1 h-[35px] border-b border-wb-line bg-wb-panel px-3 py-0 text-left text-[12px] font-normal text-wb-muted first:pl-4 compact:px-2 mobile:first:pl-3"
                scope="col"
              >
                Transaction / merchant
              </th>
              <th
                scope="col"
                className="sticky top-0 z-1 h-[35px] border-b border-wb-line bg-wb-panel px-3 py-0 text-[12px] font-normal text-wb-muted first:pl-4 compact:px-2 mobile:first:pl-3 text-right"
              >
                Amount
              </th>
              <th
                scope="col"
                className="sticky top-0 z-1 h-[35px] border-b border-wb-line bg-wb-panel px-3 py-0 text-left text-[12px] font-normal text-wb-muted first:pl-4 compact:px-2 mobile:first:pl-3 mobile:hidden"
              >
                Channel
              </th>
              <th
                scope="col"
                className="sticky top-0 z-1 h-[35px] border-b border-wb-line bg-wb-panel px-3 py-0 text-left text-[12px] font-normal text-wb-muted first:pl-4 compact:px-2 mobile:first:pl-3 compact:hidden"
              >
                Country
              </th>
              <th
                className="sticky top-0 z-1 h-[35px] border-b border-wb-line bg-wb-panel px-3 py-0 text-left text-[12px] font-normal text-wb-muted first:pl-4 compact:px-2 mobile:first:pl-3"
                scope="col"
              >
                Rule outcome
              </th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? <TransactionSkeletonRows /> : null}
            {rows.map(({ record, results }) => {
              const source = record.transaction;
              const converted = comparableAmount(
                source.amount,
                source.currency,
                "usd",
              );
              const transaction = {
                id: source.transaction_id,
                merchant:
                  source.merchant_description_condensed ?? "Missing merchant",
                amount:
                  source.amount?.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  }) ?? "Missing",
                currency: source.currency ?? "Unknown",
                usd:
                  converted?.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  }) ?? "Unavailable",
                channel: source.transaction_type,
                country: source.merchant_country ?? "Unknown",
                gaps: results.filter((result) => result.status === "DATA_GAP")
                  .length,
              };
              const fired = results.filter(
                (result) => result.status === "FIRED",
              ).length;
              return (
                <tr
                  className="cursor-pointer hover:bg-wb-hover aria-selected:bg-wb-selection aria-selected:[&>td:first-child]:text-wb-accent"
                  key={transaction.id}
                  data-transaction-id={transaction.id}
                  tabIndex={
                    selectedId === transaction.id ||
                    (!rows.some(
                      (row) =>
                        row.record.transaction.transaction_id === selectedId,
                    ) &&
                      rows[0].record.transaction.transaction_id ===
                        transaction.id)
                      ? 0
                      : -1
                  }
                  aria-selected={selectedId === transaction.id}
                  aria-label={`${transaction.id}, ${transaction.merchant}`}
                  onClick={() => onSelect(transaction.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(transaction.id);
                    }
                  }}
                >
                  <td className="h-[58px] border-b border-wb-line px-3 py-0 first:pl-4 compact:px-2 mobile:h-[62px] mobile:first:pl-3">
                    <span className="font-mono tabular-nums tracking-normal">
                      {transaction.id}
                    </span>
                    <div className="mt-[3px] font-sans text-[12px] font-normal leading-[normal] text-wb-muted mobile:max-w-[132px] mobile:overflow-hidden mobile:text-ellipsis">
                      {transaction.merchant}
                    </div>
                    <div className="mt-[3px] text-[11px] text-wb-muted">
                      {source.txn_date_time ?? "Missing timestamp"}
                    </div>
                  </td>
                  <td className="h-[58px] border-b border-wb-line px-3 py-0 first:pl-4 compact:px-2 mobile:h-[62px] mobile:first:pl-3 text-right font-mono text-[12px] font-normal leading-[normal]">
                    {transaction.amount}{" "}
                    <span className="text-[12px] text-wb-muted">
                      {transaction.currency}
                    </span>
                    {usd ? (
                      <div className="mt-[3px] font-sans text-[12px] font-normal leading-[normal] text-wb-muted mobile:max-w-[132px] mobile:overflow-hidden mobile:text-ellipsis">
                        {transaction.usd} USD
                      </div>
                    ) : null}
                  </td>
                  <td className="h-[58px] border-b border-wb-line px-3 py-0 first:pl-4 compact:px-2 mobile:h-[62px] mobile:first:pl-3 mobile:hidden">
                    {transaction.channel === null ? (
                      <span className="rounded-[3px] bg-wb-gap-bg px-[5px] py-0.5 font-mono text-[12px] font-normal leading-[normal] text-wb-gap">
                        null
                      </span>
                    ) : (
                      <span className="text-wb-muted">
                        {transaction.channel}
                      </span>
                    )}
                  </td>
                  <td className="h-[58px] border-b border-wb-line px-3 py-0 first:pl-4 compact:px-2 mobile:h-[62px] mobile:first:pl-3 compact:hidden font-mono tabular-nums tracking-normal text-wb-muted">
                    {transaction.country}
                  </td>
                  <td className="h-[58px] border-b border-wb-line px-3 py-0 first:pl-4 compact:px-2 mobile:h-[62px] mobile:first:pl-3 min-w-[110px] [&_div]:text-[12px] [&_div]:text-wb-gap mobile:min-w-[86px]">
                    <StatusLabel
                      status={
                        fired ? "fired" : transaction.gaps ? "gap" : "clear"
                      }
                    >
                      {fired
                        ? `${fired} fired`
                        : transaction.gaps
                          ? "Data gap"
                          : "Clear"}
                    </StatusLabel>
                    {fired || transaction.gaps ? (
                      <div className="mt-[3px] font-sans text-[12px] font-normal leading-[normal] text-wb-muted mobile:max-w-[132px] mobile:overflow-hidden mobile:text-ellipsis">
                        {transaction.gaps} data gaps
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex shrink-0 justify-between gap-2.5 border-t border-wb-line px-3.5 py-2.5 text-[12px] text-wb-muted mobile:px-3 mobile:py-[9px]">
        <span>
          {total === null
            ? "Loading transactions"
            : `${rows.length ? page * PAGE_SIZE + 1 : 0}–${rows.length ? page * PAGE_SIZE + rows.length : 0} of ${total.toLocaleString("en-US")} transactions`}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              buttonClassName,
              "px-2 py-0.5 mobile:min-h-9 mobile:min-w-9",
            )}
            aria-label="Previous page"
            disabled={page === 0 || !total || !!error}
            onClick={() => onPageChange(page - 1)}
          >
            ‹
          </button>
          <span>
            Page {page + 1} of{" "}
            {total === null ? "—" : Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            className={cn(
              buttonClassName,
              "px-2 py-0.5 mobile:min-h-9 mobile:min-w-9",
            )}
            aria-label="Next page"
            disabled={
              total === null || (page + 1) * PAGE_SIZE >= total || !!error
            }
            onClick={() => onPageChange(page + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
