import { StrictMode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRuleWorker } from "../hooks/use-rule-worker";
import { DEFAULT_RULE_CONFIG } from "../rule-config";
import type { DatasetSummary, RuleConfig } from "../types";
import { MockWorker } from "./mock-worker";

const summary: DatasetSummary = {
  transactionCount: 53,
  featureVectorCount: 53,
  senderCount: 1,
  currencies: ["USD"],
  countries: ["PAN"],
  transactionTypes: ["online"],
  rules: [],
  diagnostics: {
    transactionCount: 53,
    featureVectorCount: 53,
    matchedCount: 53,
    missingFeatureIds: [],
    orphanFeatureIds: [],
    conflicts: [],
  },
};
beforeEach(() => {
  MockWorker.instances = [];
  vi.stubGlobal("Worker", MockWorker);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function ready(worker: MockWorker) {
  act(() =>
    worker.respond({
      type: "READY",
      requestId: worker.latest("LOAD").requestId,
      summary,
    }),
  );
}
function results(worker: MockWorker, requestId: number) {
  act(() =>
    worker.respond({
      type: "RESULTS",
      comparisons: [],
      requestId,
      page: 0,
      totalMatches: 53,
      rows: [],
      ruleSummaries: [],
    }),
  );
}
const inputs = {
  config: DEFAULT_RULE_CONFIG,
  selectedRuleId: "RULE_001" as const,
  selectedId: null as string | null,
};

describe("worker lifecycle hook", () => {
  it("debounces rapid config changes for 120ms, retires old responses immediately, and cleans delayed sends", () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(
      (props) => useRuleWorker(props),
      { initialProps: inputs },
    );
    const worker = MockWorker.instances[0];
    ready(worker);
    const oldId = worker.latest("QUERY").requestId;
    rerender({
      ...inputs,
      config: {
        ...DEFAULT_RULE_CONFIG,
        highValue: { ...DEFAULT_RULE_CONFIG.highValue, threshold: 2000 },
      },
    });
    rerender({
      ...inputs,
      config: {
        ...DEFAULT_RULE_CONFIG,
        highValue: { ...DEFAULT_RULE_CONFIG.highValue, threshold: 3000 },
      },
    });
    expect(worker.latest("QUERY").requestId).toBe(oldId);
    results(worker, oldId);
    expect(result.current.results).toBeNull();
    act(() => vi.advanceTimersByTime(119));
    expect(worker.latest("QUERY").requestId).toBe(oldId);
    act(() => vi.advanceTimersByTime(1));
    expect(worker.latest("QUERY")).toMatchObject({
      config: { highValue: { threshold: 3000 } },
    });
    rerender({
      ...inputs,
      config: { ...DEFAULT_RULE_CONFIG, currencyMode: "usd" },
    });
    const count = worker.requests.length;
    unmount();
    act(() => vi.advanceTimersByTime(120));
    expect(worker.requests).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retires a record lookup when selection is cleared", () => {
    const { result, rerender } = renderHook((props) => useRuleWorker(props), {
      initialProps: { ...inputs, selectedId: "one" as string | null },
    });
    const worker = MockWorker.instances[0];
    ready(worker);
    const oldRecordId = worker.latest("GET_RECORD").requestId;
    rerender({ ...inputs, selectedId: null });
    act(() =>
      worker.respond({
        type: "ERROR",
        requestId: oldRecordId,
        message: "Retired lookup failed",
      }),
    );
    expect(result.current.error).toBeNull();
  });
  it("loads, queries, and keeps query freshness independent of record requests", async () => {
    const { result, rerender } = renderHook((props) => useRuleWorker(props), {
      initialProps: inputs,
    });
    const worker = MockWorker.instances[0];
    expect(result.current.operation).toMatch(/Loading/);
    ready(worker);
    await waitFor(() => expect(worker.latest("QUERY")).toBeDefined());
    const queryId = worker.latest("QUERY").requestId;
    rerender({ ...inputs, selectedId: "outside-page" });
    const recordId = worker.latest("GET_RECORD").requestId;
    expect(recordId).toBeGreaterThan(queryId);
    results(worker, queryId);
    expect(result.current.results?.totalMatches).toBe(53);
    act(() =>
      worker.respond({ type: "RECORD", requestId: recordId, value: null }),
    );
    expect(result.current.operation).toBeNull();
  });
  it("hides old config data immediately and rejects stale query/record responses", async () => {
    const { result, rerender } = renderHook(
      (props: typeof inputs & { config: RuleConfig }) => useRuleWorker(props),
      { initialProps: { ...inputs, selectedId: "one" } },
    );
    const worker = MockWorker.instances[0];
    ready(worker);
    const oldQuery = worker.latest("QUERY").requestId;
    const oldRecord = worker.latest("GET_RECORD").requestId;
    results(worker, oldQuery);
    rerender({
      ...inputs,
      selectedId: "two",
      config: { ...DEFAULT_RULE_CONFIG, currencyMode: "usd" },
    });
    expect(result.current.results).toBeNull();
    results(worker, oldQuery);
    act(() =>
      worker.respond({ type: "RECORD", requestId: oldRecord, value: null }),
    );
    expect(result.current.results).toBeNull();
    expect(result.current.selectedRecord).toBeNull();
    await waitFor(() =>
      expect(worker.latest("QUERY")).toMatchObject({
        config: { currencyMode: "usd" },
      }),
    );
    results(worker, worker.latest("QUERY").requestId);
    expect(result.current.results?.totalMatches).toBe(53);
  });
  it.each(["error", "messageerror"])(
    "handles %s, terminates, and retries with a fresh worker",
    (eventType) => {
      const { result } = renderHook(() => useRuleWorker(inputs));
      const worker = MockWorker.instances[0];
      act(() => worker.dispatchEvent(new Event(eventType)));
      expect(result.current.error).toBeTruthy();
      expect(worker.terminate).toHaveBeenCalledOnce();
      act(() => result.current.retry());
      expect(MockWorker.instances).toHaveLength(2);
      expect(result.current.error).toBeNull();
      ready(MockWorker.instances[1]);
      expect(result.current.summary?.transactionCount).toBe(53);
    },
  );
  it("shows request errors and ignores errors from superseded requests", async () => {
    const { result, rerender } = renderHook((props) => useRuleWorker(props), {
      initialProps: inputs,
    });
    const worker = MockWorker.instances[0];
    ready(worker);
    const old = worker.latest("QUERY").requestId;
    rerender({
      ...inputs,
      config: { ...DEFAULT_RULE_CONFIG, currencyMode: "usd" },
    });
    act(() =>
      worker.respond({ type: "ERROR", requestId: old, message: "old failure" }),
    );
    expect(result.current.error).toBeNull();
    await waitFor(() =>
      expect(worker.latest("QUERY")).toMatchObject({
        config: { currencyMode: "usd" },
      }),
    );
    act(() =>
      worker.respond({
        type: "ERROR",
        requestId: worker.latest("QUERY").requestId,
        message: "Evaluation failed",
      }),
    );
    expect(result.current.error).toBe("Evaluation failed");
  });
  it("cleans up Strict Mode workers, listeners and timeouts", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useRuleWorker(inputs), {
      wrapper: StrictMode,
    });
    const first = MockWorker.instances[0];
    expect(first.terminate).toHaveBeenCalledOnce();
    ready(first); // Removed listener cannot publish stale state.
    expect(result.current.summary).toBeNull();
    unmount();
    expect(MockWorker.instances.at(-1)!.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("times out a nonresponding worker with a retryable error", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRuleWorker(inputs));
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.error).toMatch(/timed out/i);
  });
});
