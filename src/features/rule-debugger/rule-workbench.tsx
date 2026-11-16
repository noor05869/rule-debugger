"use client";

import { cn } from "@/lib/utils";

import { useRef, useState, type KeyboardEvent } from "react";
import { WorkbenchToolbar } from "./workbench-toolbar";
import { RuleHealthStrip } from "./rule-health-strip";
import { RuleStudio } from "./rule-studio";
import { TransactionStream } from "./transaction-stream";
import { ForensicInspector } from "./forensic-inspector";
import {
  DEFAULT_RULE_CONFIG,
  isDefaultConfig,
  validateRuleConfig,
} from "./rule-config";
import { previewRecord } from "./rule-preview";
import { useRuleWorker } from "./hooks/use-rule-worker";
import {
  RULE_IDS,
  type TransactionFilters,
  type RuleConfig,
  type EvaluatedRecord,
} from "./types";
import { EMPTY_FILTERS, PAGE_SIZE } from "./query";

export function RuleWorkbench() {
  const [light, setLight] = useState(false);
  const [config, setConfig] = useState<RuleConfig>(() =>
    structuredClone(DEFAULT_RULE_CONFIG),
  );
  const [resetVersion, setResetVersion] = useState(0);
  const [selectionSnapshot, setSelectionSnapshot] =
    useState<EvaluatedRecord | null>(null);
  const usd = config.currencyMode === "usd";
  const [selectedRule, setSelectedRule] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pendingEdge, setPendingEdge] = useState<"first" | "last" | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const workbench = useRef<HTMLDivElement>(null);
  const worker = useRuleWorker({
    config,
    selectedRuleId: RULE_IDS[selectedRule],
    selectedId,
    filters,
    page,
    onResults(response) {
      const next =
        pendingEdge === "last" ? response.rows.at(-1) : response.rows[0];
      if (pendingEdge) {
        if (next) {
          setSelectionSnapshot(next);
          setSelectedId(next.record.transaction.transaction_id);
          focusRow(next.record.transaction.transaction_id);
        }
        setPendingEdge(null);
      } else if (selectedId === null && next) {
        setSelectionSnapshot(next);
        // Initialize once in the response event, never replace a chosen ID on filtering.
        setSelectedId(next.record.transaction.transaction_id);
      } else {
        const selected = response.rows.find(
          (row) => row.record.transaction.transaction_id === selectedId,
        );
        if (selected) setSelectionSnapshot(selected);
      }
    },
    onRecord(record) {
      if (record === null) {
        setSelectionSnapshot(null);
        return;
      }
      if (record?.record.transaction.transaction_id === selectedId)
        setSelectionSnapshot(record);
    },
  });
  const rows = worker.error ? [] : (worker.results?.rows ?? []);
  const activeId =
    selectedId ?? rows[0]?.record.transaction.transaction_id ?? null;
  const currentRecord =
    rows.find((row) => row.record.transaction.transaction_id === activeId) ??
    worker.selectedRecord;
  const snapshot =
    currentRecord ??
    (selectionSnapshot?.record.transaction.transaction_id === activeId
      ? selectionSnapshot
      : null);
  const preview = snapshot ? previewRecord(snapshot, config) : null;
  const transaction = preview?.value ?? null;

  function changeConfig(next: RuleConfig) {
    validateRuleConfig(next);
    setPendingEdge(null);
    setPage(0);
    setConfig(next);
    if (isDefaultConfig(next) && filters.changedOnly)
      setFilters({ ...filters, changedOnly: false });
  }

  function resetConfig() {
    changeConfig(structuredClone(DEFAULT_RULE_CONFIG));
    setResetVersion((revision) => revision + 1);
  }

  function focusRow(id: string) {
    requestAnimationFrame(() => {
      const row = [
        ...(workbench.current?.querySelectorAll<HTMLElement>(
          "[data-transaction-id]",
        ) ?? []),
      ].find((element) => element.dataset.transactionId === id);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView?.({ block: "nearest" });
    });
  }

  function changeFilters(next: TransactionFilters) {
    setPendingEdge(null);
    setPage(0);
    setFilters(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      )
    )
      return;
    if (event.key === "Escape") {
      if (studioOpen || inspectorOpen) {
        event.preventDefault();
        closePanels();
      }
      return;
    }
    if (target.closest('[role="tab"], [role="tablist"]')) return;
    if (event.key === "/") {
      event.preventDefault();
      workbench.current
        ?.querySelector<HTMLInputElement>("#transaction-search")
        ?.focus();
      return;
    }
    const row = target.closest<HTMLElement>("[data-transaction-id]");
    if (
      !row ||
      !worker.results ||
      (event.key !== "ArrowDown" && event.key !== "ArrowUp")
    )
      return;
    event.preventDefault();
    const index = rows.findIndex(
      (value) =>
        value.record.transaction.transaction_id === row.dataset.transactionId,
    );
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = rows[index + direction];
    if (next) {
      setSelectedId(next.record.transaction.transaction_id);
      focusRow(next.record.transaction.transaction_id);
    } else {
      const nextPage = worker.results.page + direction;
      if (nextPage < 0 || nextPage * PAGE_SIZE >= worker.results.totalMatches)
        return;
      setPendingEdge(direction > 0 ? "first" : "last");
      setPage(nextPage);
    }
  }

  function rememberFocus() {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  function closePanels() {
    setStudioOpen(false);
    setInspectorOpen(false);
    returnFocus.current?.focus({ preventScroll: true });
  }

  function focusPanelClose(panel: "studio" | "inspector", maxWidth: number) {
    if (!window.matchMedia(`(max-width: ${maxWidth}px)`).matches) return;
    requestAnimationFrame(() => {
      workbench.current
        ?.querySelector<HTMLButtonElement>(
          `${panel === "studio" ? "#rule-studio" : "#transaction-inspector"} [data-panel-close]`,
        )
        ?.focus();
    });
  }

  return (
    <div
      ref={workbench}
      data-workbench-theme={light ? "light" : "dark"}
      className={cn(
        "flex h-dvh flex-col overflow-hidden bg-wb-bg font-sans text-[13px] leading-[1.5] text-wb-text",
        "[color-scheme:dark] data-[workbench-theme=light]:[color-scheme:light] selection:bg-wb-selection",
        "selection:text-wb-text [&_*]:box-border [&_*]:[scrollbar-width:thin]",
        "[&_*]:[scrollbar-color:#59616d_transparent] [&_*:focus-visible]:outline-2 [&_*:focus-visible]:outline-wb-accent",
        "[&_*:focus-visible]:outline-offset-[3px] motion-reduce:[&_*]:scroll-auto motion-reduce:[&_*]:transition-none",
      )}
      onKeyDown={handleKeyDown}
    >
      <a
        className="fixed -top-[100px] left-3 z-50 bg-wb-panel px-3 py-2 text-wb-accent underline-offset-[3px] focus:top-2"
        href="#transactions"
      >
        Skip to transactions
      </a>
      <WorkbenchToolbar
        light={light}
        usd={usd}
        transactionCount={worker.summary?.transactionCount ?? null}
        senderCount={worker.summary?.senderCount ?? null}
        onThemeChange={() => setLight((current) => !current)}
        onCurrencyChange={(enabled) => {
          setPendingEdge(null);
          setPage(0);
          changeConfig({
            ...config,
            currencyMode: enabled ? "usd" : "original",
          });
        }}
        onReset={resetConfig}
      />
      <RuleHealthStrip
        loading={!worker.error && !worker.results}
        selected={selectedRule}
        summaries={
          worker.error ? null : (worker.results?.ruleSummaries ?? null)
        }
        onSelect={(index) => {
          rememberFocus();
          setSelectedRule(index);
          if (filters.ruleId || filters.changedOnly)
            changeFilters({
              ...filters,
              ruleId: filters.ruleId ? RULE_IDS[index] : null,
            });
          setStudioOpen(true);
          focusPanelClose("studio", 1040);
        }}
      />
      <main
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[268px_minmax(400px,1fr)_410px] grid-rows-[minmax(0,1fr)]",
          "wide:grid-cols-[290px_minmax(540px,1fr)_450px] compact:grid-cols-[245px_minmax(330px,1fr)_360px]",
          "tablet:grid-cols-[minmax(350px,1fr)_380px] mobile:flex",
        )}
      >
        <RuleStudio
          loading={!worker.error && !worker.results}
          selected={selectedRule}
          config={config}
          onConfigChange={changeConfig}
          resetVersion={resetVersion}
          onReset={resetConfig}
          comparison={
            worker.error
              ? null
              : (worker.results?.comparisons.find(
                  (row) => row.ruleId === RULE_IDS[selectedRule],
                ) ?? null)
          }
          changedOnly={filters.changedOnly}
          onChangedOnlyChange={(changedOnly) =>
            changeFilters({ ...filters, changedOnly })
          }
          open={studioOpen}
          onClose={closePanels}
          metadata={
            worker.summary?.rules.find(
              (rule) => rule.rule_id === RULE_IDS[selectedRule],
            ) ?? null
          }
          summary={
            worker.error
              ? null
              : (worker.results?.ruleSummaries[selectedRule] ?? null)
          }
          transactionCount={worker.summary?.transactionCount ?? null}
        />
        <TransactionStream
          selectedId={activeId}
          rows={rows}
          total={worker.results?.totalMatches ?? null}
          operation={worker.operation}
          error={worker.error}
          onRetry={() => {
            setSelectionSnapshot(null);
            worker.retry();
          }}
          filters={filters}
          onFiltersChange={changeFilters}
          onResetFilters={() => changeFilters(EMPTY_FILTERS)}
          selectedRuleId={RULE_IDS[selectedRule]}
          page={worker.results?.page ?? page}
          onPageChange={(nextPage) => {
            setPendingEdge(null);
            setPage(nextPage);
          }}
          pendingSelection={pendingEdge !== null}
          usd={usd}
          onSelect={(id) => {
            rememberFocus();
            const selected = rows.find(
              (row) => row.record.transaction.transaction_id === id,
            );
            if (selected) setSelectionSnapshot(selected);
            setSelectedId(id);
            setInspectorOpen(true);
            focusPanelClose("inspector", 720);
          }}
          onOpenStudio={() => {
            rememberFocus();
            setStudioOpen(true);
            focusPanelClose("studio", 1040);
          }}
          onInspectSelection={() => {
            rememberFocus();
            setInspectorOpen(true);
            focusPanelClose("inspector", 720);
          }}
        />
        <ForensicInspector
          value={worker.error ? null : transaction}
          pendingRuleIds={preview?.pendingRuleIds ?? []}
          loading={!worker.error && !transaction && worker.operation !== null}
          onFilterBySender={(senderId) => {
            changeFilters({ ...filters, senderId });
            if (window.matchMedia("(max-width: 720px)").matches) {
              closePanels();
              // Filtering can unmount the originating row while the query is pending.
              requestAnimationFrame(() =>
                workbench.current
                  ?.querySelector<HTMLElement>("#transactions")
                  ?.focus({ preventScroll: true }),
              );
            }
          }}
          outsideResults={
            !!worker.results &&
            !!activeId &&
            !rows.some(
              (row) => row.record.transaction.transaction_id === activeId,
            )
          }
          pendingSelection={pendingEdge !== null}
          rules={worker.summary?.rules ?? []}
          selectedRule={selectedRule}
          usd={usd}
          open={inspectorOpen}
          onClose={closePanels}
        />
      </main>
      <footer
        className={cn(
          "flex min-h-[29px] shrink-0 items-center justify-between gap-3 border-t border-wb-line bg-wb-panel px-[18px]",
          "py-1 text-[12px] text-wb-muted mobile:px-3 mobile:whitespace-nowrap mobile:[&>span:last-child]:hidden",
        )}
      >
        <span>
          {worker.error
            ? "Dataset unavailable"
            : (worker.operation ??
              `${worker.summary?.diagnostics.matchedCount.toLocaleString("en-US")} matched records · Worker ready`)}
        </span>
        <span>
          Amount comparison:{" "}
          {usd ? "USD · Illustrative FX" : "original currencies"}
        </span>
      </footer>
    </div>
  );
}
