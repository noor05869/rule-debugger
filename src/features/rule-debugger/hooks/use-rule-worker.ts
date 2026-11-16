"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { EMPTY_FILTERS } from "../query";
import type {
  DatasetSummary,
  EvaluatedRecord,
  RuleConfig,
  RuleId,
  TransactionFilters,
  WorkerRequest,
  WorkerResponse,
} from "../types";

type Results = Extract<WorkerResponse, { type: "RESULTS" }>;
type Pending = {
  requestId: number;
  key: string;
  timer: ReturnType<typeof setTimeout>;
};
type Inputs = {
  config: RuleConfig;
  selectedRuleId: RuleId;
  selectedId: string | null;
  filters?: TransactionFilters;
  page?: number;
  onResults?: (response: Results) => void;
  onRecord?: (record: EvaluatedRecord | null) => void;
};

export function useRuleWorker({
  config,
  selectedRuleId,
  selectedId,
  filters = EMPTY_FILTERS,
  page = 0,
  onResults,
  onRecord,
}: Inputs) {
  const notifyResults = useEffectEvent((response: Results) =>
    onResults?.(response),
  );
  const notifyRecord = useEffectEvent((record: EvaluatedRecord | null) =>
    onRecord?.(record),
  );
  const [attempt, setAttempt] = useState(0);
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [resultState, setResultState] = useState<{
    key: string;
    value: Results;
  } | null>(null);
  const [recordState, setRecordState] = useState<{
    key: string;
    value: EvaluatedRecord | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const lastSentConfigKey = useRef<string | null>(null);
  const configKey = JSON.stringify(config);
  const send = useRef<
    ((request: WorkerRequest, key: string) => () => void) | null
  >(null);
  const queryKey = JSON.stringify([config, filters, page, selectedRuleId]);
  const recordKey = JSON.stringify([config, selectedId]);

  useEffect(() => {
    lastSentConfigKey.current = null;
    let worker: Worker | null = null;
    let stopped = false;
    const pending = new Map<WorkerRequest["type"], Pending>();

    function stop() {
      if (stopped) return;
      stopped = true;
      pending.forEach(({ timer }) => clearTimeout(timer));
      pending.clear();
      worker?.removeEventListener("message", onMessage);
      worker?.removeEventListener("error", onError);
      worker?.removeEventListener("messageerror", onMessageError);
      worker?.terminate();
      send.current = null;
    }
    function fail(message: string) {
      if (stopped) return;
      setError(message);
      stop();
    }
    function onError(event: ErrorEvent) {
      event.preventDefault();
      fail(
        event.message ||
          "The data worker could not start or stopped unexpectedly.",
      );
    }
    function onMessageError() {
      fail("Could not read a message from the data worker.");
    }
    function onMessage(event: MessageEvent<WorkerResponse>) {
      if (stopped) return;
      const response = event.data;
      const kind =
        response.type === "READY"
          ? "LOAD"
          : response.type === "RESULTS"
            ? "QUERY"
            : "GET_RECORD";
      const current =
        response.type === "ERROR"
          ? [...pending.values()].find(
              (request) => request.requestId === response.requestId,
            )
          : pending.get(kind);
      if (!current || response.requestId !== current.requestId) return;
      clearTimeout(current.timer);
      if (response.type === "ERROR") {
        fail(response.message);
        return;
      }
      if (response.type === "READY") setSummary(response.summary);
      if (response.type === "RESULTS") {
        setResultState({ key: current.key, value: response });
        notifyResults(response);
      }
      if (response.type === "RECORD") {
        setRecordState({ key: current.key, value: response.value });
        notifyRecord(response.value);
      }
    }

    try {
      worker = new Worker(new URL("../data.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.addEventListener("messageerror", onMessageError);
      send.current = (request, key) => {
        if (stopped) return () => {};
        const previous = pending.get(request.type);
        if (previous) clearTimeout(previous.timer);
        pending.set(request.type, {
          requestId: request.requestId,
          key,
          timer: setTimeout(
            () => fail(`${request.type} timed out. Retry loading the dataset.`),
            30_000,
          ),
        });
        try {
          worker!.postMessage(request);
        } catch (cause) {
          fail(
            cause instanceof Error
              ? cause.message
              : "Could not send a request to the data worker.",
          );
        }
        return () => {
          const current = pending.get(request.type);
          if (current?.requestId !== request.requestId) return;
          clearTimeout(current.timer);
          pending.delete(request.type);
        };
      };
      send.current({ type: "LOAD", requestId: ++sequence.current }, "load");
    } catch (cause) {
      fail(
        cause instanceof Error
          ? cause.message
          : "Web Workers are unavailable in this browser.",
      );
    }
    return stop;
  }, [attempt]);

  useEffect(() => {
    if (!summary || error) return;
    let cancel: (() => void) | undefined;
    const deliver = () => {
      lastSentConfigKey.current = configKey;
      cancel = send.current?.(
        {
          type: "QUERY",
          requestId: ++sequence.current,
          config,
          filters,
          page,
          selectedRuleId,
        },
        queryKey,
      );
    };
    const timer =
      lastSentConfigKey.current !== null &&
      lastSentConfigKey.current !== configKey
        ? setTimeout(deliver, 120)
        : null;
    if (timer === null) deliver();
    return () => {
      if (timer !== null) clearTimeout(timer);
      cancel?.();
    };
  }, [
    summary,
    error,
    config,
    configKey,
    filters,
    page,
    selectedRuleId,
    queryKey,
  ]);

  useEffect(() => {
    if (!summary || error || !selectedId) return;
    let cancel: (() => void) | undefined;
    const deliver = () => {
      cancel = send.current?.(
        {
          type: "GET_RECORD",
          requestId: ++sequence.current,
          transactionId: selectedId,
          config,
        },
        recordKey,
      );
    };
    const timer =
      lastSentConfigKey.current !== configKey ? setTimeout(deliver, 120) : null;
    if (timer === null) deliver();
    return () => {
      if (timer !== null) clearTimeout(timer);
      cancel?.();
    };
  }, [summary, error, selectedId, config, configKey, recordKey]);

  // Keys hide previous-configuration data during the render before the new response arrives.
  const results = resultState?.key === queryKey ? resultState.value : null;
  const selectedRecord =
    recordState?.key === recordKey ? recordState.value : null;
  const operation = error
    ? null
    : !summary
      ? "Loading and validating dataset…"
      : !results
        ? "Evaluating rules…"
        : selectedId && recordState?.key !== recordKey
          ? "Loading selected transaction…"
          : null;

  function retry() {
    setSummary(null);
    setResultState(null);
    setRecordState(null);
    setError(null);
    setAttempt((current) => current + 1);
  }
  return { summary, results, selectedRecord, operation, error, retry };
}
