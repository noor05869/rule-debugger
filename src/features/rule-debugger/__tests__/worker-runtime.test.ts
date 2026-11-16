// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createWorkerHandler } from "../worker-runtime";
import { DEFAULT_RULE_CONFIG } from "../rule-config";
import { EMPTY_FILTERS } from "../query";
import type { WorkerResponse } from "../types";
import { record } from "./rule-fixtures";

function setup() {
  const responses: WorkerResponse[] = [];
  const transactions = Array.from(
    { length: 53 },
    (_, i) => record({ transaction_id: `TXN_${i}`, amount: i }).transaction,
  );
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify(url.includes("transactions") ? transactions : []),
  }));
  const handle = createWorkerHandler(fetcher, (response) =>
    responses.push(response),
  );
  return { handle, responses, fetcher };
}
const query = {
  type: "QUERY",
  requestId: 2,
  config: DEFAULT_RULE_CONFIG,
  filters: EMPTY_FILTERS,
  page: 0,
  selectedRuleId: "RULE_001",
} as const;

describe("worker message processing", () => {
  it("returns zero counts for every rule on an empty dataset", async () => {
    const responses: WorkerResponse[] = [];
    const handle = createWorkerHandler(
      async () => ({ ok: true, status: 200, text: async () => "[]" }),
      (response) => responses.push(response),
    );
    await handle({ type: "LOAD", requestId: 1 });
    await handle(query);
    const response = responses[1];
    expect(response).toMatchObject({
      type: "RESULTS",
      totalMatches: 0,
      rows: [],
    });
    if (response.type !== "RESULTS") throw new Error("Expected results");
    expect(response.ruleSummaries).toHaveLength(7);
    expect(
      response.ruleSummaries.every(
        (summary) =>
          summary.fired === 0 && summary.clear === 0 && summary.dataGap === 0,
      ),
    ).toBe(true);
  });
  it("loads all three assets as text and returns bounded real results and off-page lookups", async () => {
    const { handle, responses, fetcher } = setup();
    await handle({ type: "LOAD", requestId: 1 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(responses[0]).toMatchObject({
      type: "READY",
      requestId: 1,
      summary: { transactionCount: 53, senderCount: 1 },
    });
    await handle(query);
    expect(responses[1]).toMatchObject({
      type: "RESULTS",
      totalMatches: 53,
      page: 0,
    });
    if (responses[1].type !== "RESULTS") throw new Error("Expected results");
    expect(responses[1].rows).toHaveLength(50);
    expect(responses[1].ruleSummaries[0]).toMatchObject({
      fired: 0,
      clear: 53,
      dataGap: 0,
    });
    await handle({ ...query, requestId: 3, page: 1 });
    expect(responses[2].type === "RESULTS" && responses[2].rows).toHaveLength(
      3,
    );
    await handle({
      type: "GET_RECORD",
      requestId: 4,
      transactionId: "TXN_52",
      config: DEFAULT_RULE_CONFIG,
    });
    expect(responses[3]).toMatchObject({
      type: "RECORD",
      requestId: 4,
      value: { record: { transaction: { transaction_id: "TXN_52" } } },
    });
    await handle({
      type: "GET_RECORD",
      requestId: 5,
      transactionId: "absent",
      config: DEFAULT_RULE_CONFIG,
    });
    expect(responses[4]).toMatchObject({ type: "RECORD", value: null });
  });
  it("starts fetches concurrently and parses bare NaN through the shared parser", async () => {
    const responses: WorkerResponse[] = [];
    const releases: (() => void)[] = [];
    const fetcher = vi.fn(
      (url: string) =>
        new Promise<{
          ok: boolean;
          status: number;
          text: () => Promise<string>;
        }>((resolve) => {
          releases.push(() =>
            resolve({
              ok: true,
              status: 200,
              text: async () =>
                url.includes("transactions")
                  ? JSON.stringify([record().transaction]).replace(
                      '"amount":1001',
                      '"amount":NaN',
                    )
                  : "[]",
            }),
          );
        }),
    );
    const handle = createWorkerHandler(fetcher, (response) =>
      responses.push(response),
    );
    const load = handle({ type: "LOAD", requestId: 1 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    releases.forEach((release) => release());
    await load;
    await handle(query);
    expect(responses[1]).toMatchObject({
      type: "RESULTS",
      rows: [{ record: { transaction: { amount: null } } }],
    });
  });
  it("reports fetch, parse and evaluation failures with request IDs, and permits retry", async () => {
    const { handle, responses, fetcher } = setup();
    fetcher.mockRejectedValueOnce(new Error("Network unavailable"));
    await handle({ type: "LOAD", requestId: 1 });
    expect(responses[0]).toMatchObject({
      type: "ERROR",
      requestId: 1,
      message: expect.stringContaining("Network unavailable"),
    });
    fetcher.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "invalid JSON",
    });
    await handle({ type: "LOAD", requestId: 2 });
    expect(responses[1]).toMatchObject({ type: "ERROR", requestId: 2 });
    await handle({ type: "LOAD", requestId: 3 });
    expect(responses[2].type).toBe("READY");
    await handle({
      ...query,
      config: { ...DEFAULT_RULE_CONFIG, riskWatchlist: null },
    } as never);
    expect(responses[3]).toMatchObject({ type: "ERROR", requestId: 2 });
  });
  it("filters case-insensitively and clamps out-of-range pages", async () => {
    const { handle, responses } = setup();
    await handle({ type: "LOAD", requestId: 1 });
    await handle({
      ...query,
      page: 999,
      filters: { ...EMPTY_FILTERS, search: "txn_52" },
    });
    expect(responses[1]).toMatchObject({
      type: "RESULTS",
      totalMatches: 1,
      page: 0,
      rows: [{ record: { transaction: { transaction_id: "TXN_52" } } }],
    });
  });
});
