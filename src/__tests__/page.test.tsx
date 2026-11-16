import {
  act,
  cleanup,
  render,
  screen,
  within,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { MockWorker } from "@/features/rule-debugger/__tests__/mock-worker";
import { record } from "@/features/rule-debugger/__tests__/rule-fixtures";
import { evaluateRules } from "@/features/rule-debugger/rules";
import { getContextKey } from "@/features/rule-debugger/rule-context";
import { DEFAULT_RULE_CONFIG } from "@/features/rule-debugger/rule-config";
import { RULE_IDS, type DatasetSummary } from "@/features/rule-debugger/types";

const summary: DatasetSummary = {
  transactionCount: 53,
  featureVectorCount: 53,
  senderCount: 1,
  currencies: ["USD"],
  countries: ["PAN"],
  transactionTypes: ["online"],
  rules: RULE_IDS.map((rule_id) => ({
    rule_id,
    name: `Source ${rule_id}`,
    description: "Source description",
    severity: "High",
    action: "Alert",
  })),
  diagnostics: {
    transactionCount: 53,
    featureVectorCount: 53,
    matchedCount: 53,
    missingFeatureIds: [],
    orphanFeatureIds: [],
    conflicts: [],
  },
};
const rows = [
  record({
    transaction_id: "REAL_1",
    merchant_description_condensed: "Actual merchant",
  }),
  record({
    transaction_id: "REAL_2",
    merchant_description_condensed: "Second merchant",
  }),
].map((record) => {
  const context = {
    senderProfile: null,
    recentSmallTransactionCount: 1,
    currencyMode: "original" as const,
  };
  return {
    record,
    context,
    contextKey: getContextKey(DEFAULT_RULE_CONFIG),
    defaultResults: evaluateRules(record, DEFAULT_RULE_CONFIG, context),
    results: evaluateRules(record, DEFAULT_RULE_CONFIG, context),
  };
});
function load() {
  const worker = MockWorker.instances.at(-1)!;
  act(() =>
    worker.respond({
      type: "READY",
      requestId: worker.latest("LOAD").requestId,
      summary,
    }),
  );
  act(() =>
    worker.respond({
      type: "RESULTS",
      comparisons: [],
      requestId: worker.latest("QUERY").requestId,
      page: 0,
      rows,
      totalMatches: 53,
      ruleSummaries: RULE_IDS.map((ruleId) => ({
        ruleId,
        fired: 2,
        clear: 1,
        dataGap: 50,
      })),
    }),
  );
  return worker;
}
beforeEach(() => {
  MockWorker.instances = [];
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("real-data workbench connection", () => {
  it("keeps all regions visible with a deterministic loading shell", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { name: "Rule debugger", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Rule configuration" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Transactions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Transaction inspector" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Loading.*dataset/i);
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("complementary", { name: "Transaction inspector" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByText(/sample transactions|Visual fixtures/i),
    ).not.toBeInTheDocument();
  });
  it("shows worker rows, real totals, and fired/gap counts", () => {
    render(<Home />);
    load();
    expect(
      screen.getByRole("table", { name: "Transactions" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("1–2 of 53 transactions")).toBeInTheDocument();
    expect(screen.getAllByText(/50 gaps/)).toHaveLength(7);
    expect(screen.getByText(/53 transactions.*1 sender/)).toBeInTheDocument();
  });
  it("connects real row selection to inspector and preserves theme controls", async () => {
    const user = userEvent.setup();
    render(<Home />);
    load();
    await user.click(screen.getByRole("row", { name: /REAL_2/ }));
    const inspector = screen.getByRole("complementary", {
      name: "Transaction inspector",
    });
    expect(within(inspector).getByText("REAL_2")).toBeInTheDocument();
    expect(within(inspector).getByText("Second merchant")).toBeInTheDocument();
    expect(inspector).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await user.click(
      screen.getByRole("button", { name: "Switch to light theme" }),
    );
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });
  it("shows retryable worker errors without sample fallback", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = MockWorker.instances[0];
    act(() =>
      worker.respond({
        type: "ERROR",
        requestId: worker.latest("LOAD").requestId,
        message: "Could not load transactions.json",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load transactions.json",
    );
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Retry loading" }));
    expect(MockWorker.instances).toHaveLength(2);
    load();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("hides old counts and rows while USD evaluations are pending", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    await user.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(worker.latest("QUERY")).toMatchObject({
        config: { currencyMode: "usd" },
      }),
    );
    expect(
      screen.queryByRole("row", { name: /REAL_1/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Evaluating rules/);
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});

describe("transaction investigation controls", () => {
  it("can reopen a retained mobile selection after filters hide every row", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    act(() =>
      worker.respond({
        type: "RECORD",
        requestId: worker.latest("GET_RECORD").requestId,
        value: rows[0],
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /Search transactions/ }),
      "absent",
    );
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    act(() =>
      worker.respond({
        type: "RESULTS",
        comparisons: [],
        requestId: worker.latest("QUERY").requestId,
        page: 0,
        rows: [],
        totalMatches: 0,
        ruleSummaries: [],
      }),
    );
    const reopen = screen.getByRole("button", {
      name: "Inspect selected transaction",
    });
    await user.click(reopen);
    const inspector = screen.getByRole("complementary", {
      name: "Transaction inspector",
    });
    expect(inspector).toHaveAttribute("data-open", "true");
    expect(within(inspector).getByText("REAL_1")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Close transaction inspector" }),
    );
    expect(inspector).toHaveAttribute("data-open", "false");
    expect(reopen).toHaveFocus();
  });
  it("updates the selected trace before bulk delivery, and resets config without clearing search", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    const oldQuery = worker.latest("QUERY").requestId;
    fireEvent.change(screen.getByLabelText("Amount threshold"), {
      target: { value: "2000" },
    });
    const evidence = screen.getByRole("group", { name: "RULE_001 evidence" });
    expect(evidence).toHaveTextContent("1001 > 2000");
    expect(evidence).toHaveTextContent("Not matched");
    expect(worker.latest("QUERY").requestId).toBe(oldQuery);
    await waitFor(() =>
      expect(worker.latest("QUERY")).toMatchObject({
        config: { highValue: { threshold: 2000 } },
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /Search transactions/ }),
      "merchant",
    );
    await user.click(screen.getByLabelText("Changed verdicts only"));
    expect(worker.latest("QUERY")).toMatchObject({
      filters: { changedOnly: true },
    });
    await user.click(screen.getByRole("button", { name: "Reset rules" }));
    expect(screen.getByLabelText("Amount threshold")).toHaveValue(1000);
    await waitFor(() =>
      expect(worker.latest("QUERY")).toMatchObject({
        config: { highValue: { threshold: 1000 }, currencyMode: "original" },
        filters: { changedOnly: false, search: "merchant" },
      }),
    );
  });
  it("marks R2 pending for changed window inputs without presenting an artificial data gap", async () => {
    const user = userEvent.setup();
    render(<Home />);
    load();
    await user.click(
      screen.getByRole("button", { name: "Configure Small & frequent" }),
    );
    fireEvent.change(screen.getByLabelText("Window (minutes)"), {
      target: { value: "30" },
    });
    const evidence = screen.getByRole("group", { name: "RULE_002 evidence" });
    expect(evidence).toHaveTextContent("Recalculating the trailing window");
    expect(evidence).not.toHaveTextContent("Required evidence is missing");
    expect(screen.getByText("1 rule pending")).toBeInTheDocument();
  });
  it("returns mobile sender-filter actions to the transaction list while its query is pending", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const user = userEvent.setup();
    render(<Home />);
    load();
    const row = screen.getByRole("row", { name: /REAL_2/ });
    row.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("tab", { name: "Sender" }));
    await user.click(
      screen.getByRole("button", {
        name: "Filter transactions by this sender",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Transactions" }),
      ).toHaveFocus(),
    );
    expect(
      screen.getByRole("complementary", { name: "Transaction inspector" }),
    ).toHaveAttribute("data-open", "false");
  });
  it("filters by the selected sender and exposes a removable sender filter", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    await user.click(screen.getByRole("tab", { name: "Sender" }));
    await user.click(
      screen.getByRole("button", {
        name: "Filter transactions by this sender",
      }),
    );
    expect(worker.latest("QUERY")).toMatchObject({
      page: 0,
      filters: { senderId: "sender-1" },
    });
    expect(screen.getByText("Sender: sender-1")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove sender filter" }),
    );
    expect(worker.latest("QUERY")).toMatchObject({
      page: 0,
      filters: { senderId: null },
    });
  });
  it("closes the mobile inspector from its tabs with Escape and restores row focus", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const user = userEvent.setup();
    render(<Home />);
    load();
    const row = screen.getByRole("row", { name: /REAL_2/ });
    row.focus();
    await user.keyboard("{Enter}");
    const inspector = screen.getByRole("complementary", {
      name: "Transaction inspector",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close transaction inspector" }),
      ).toHaveFocus(),
    );
    await user.click(screen.getByRole("tab", { name: "Data lineage" }));
    await user.keyboard("{Escape}");
    expect(inspector).toHaveAttribute("data-open", "false");
    expect(row).toHaveFocus();
  });
  it("resets pagination on search/filter changes without changing currency configuration", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(worker.latest("QUERY")).toMatchObject({ page: 1 });
    const requestId = worker.latest("QUERY").requestId;
    act(() =>
      worker.respond({
        type: "RESULTS",
        comparisons: [],
        requestId,
        page: 1,
        rows,
        totalMatches: 53,
        ruleSummaries: [],
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /Search transactions/ }),
      "merchant",
    );
    expect(worker.latest("QUERY")).toMatchObject({
      page: 0,
      filters: { search: "merchant" },
    });
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() =>
      expect(worker.latest("QUERY")).toMatchObject({
        page: 0,
        config: { currencyMode: "usd" },
        filters: { search: "", verdict: null, ruleId: null, preset: "all" },
      }),
    );
  });
  it("connects verdicts, selected-rule filtering, and investigation presets", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    for (const name of ["Fired", "Clear", "Data gap"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter verdict" }),
      "DATA_GAP",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Selected rule only" }),
    );
    expect(worker.latest("QUERY")).toMatchObject({
      filters: { verdict: "DATA_GAP", ruleId: "RULE_001" },
    });
    await user.click(
      screen.getByRole("button", { name: "Configure Small & frequent" }),
    );
    expect(worker.latest("QUERY")).toMatchObject({
      filters: { ruleId: "RULE_002" },
    });
    await user.click(screen.getByRole("button", { name: "Currency traps" }));
    expect(worker.latest("QUERY")).toMatchObject({
      filters: { preset: "currency-traps" },
    });
  });
  it("retains the selected ID when filters hide it, with an explicit outside-results label", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    await user.click(screen.getByRole("row", { name: /REAL_2/ }));
    act(() =>
      worker.respond({
        type: "RECORD",
        requestId: worker.latest("GET_RECORD").requestId,
        value: rows[1],
      }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /Search transactions/ }),
      "absent",
    );
    act(() =>
      worker.respond({
        type: "RESULTS",
        comparisons: [],
        requestId: worker.latest("QUERY").requestId,
        page: 0,
        totalMatches: 0,
        rows: [],
        ruleSummaries: [],
      }),
    );
    const inspector = screen.getByRole("complementary", {
      name: "Transaction inspector",
    });
    expect(within(inspector).getByText("REAL_2")).toBeInTheDocument();
    expect(
      within(inspector).getByText(/outside the visible results/i),
    ).toBeInTheDocument();
    expect(screen.getByText("No transactions found.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Transactions" })).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(worker.latest("QUERY")).toMatchObject({ filters: { search: "" } });
  });
  it("scopes shortcuts away from inputs/selects/tabs and moves between loaded rows", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    const first = screen.getByRole("row", { name: /REAL_1/ });
    first.focus();
    await user.keyboard("/");
    const search = screen.getByRole("textbox", { name: /Search transactions/ });
    expect(search).toHaveFocus();
    await user.keyboard("/a{ArrowDown}");
    expect(search).toHaveValue("/a");
    expect(worker.latest("QUERY")).toMatchObject({ filters: { search: "/a" } });
  });
  it("supports arrow navigation across pages with a pending selection", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    const last = screen.getByRole("row", { name: /REAL_2/ });
    last.focus();
    await user.keyboard("{Enter}{ArrowDown}");
    expect(worker.latest("QUERY")).toMatchObject({ page: 1 });
    expect(
      screen.getByText("Loading adjacent page selection…"),
    ).toBeInTheDocument();
    const next = {
      ...rows[0],
      record: {
        ...rows[0].record,
        transaction: {
          ...rows[0].record.transaction,
          transaction_id: "REAL_51",
        },
      },
    };
    act(() =>
      worker.respond({
        type: "RESULTS",
        comparisons: [],
        requestId: worker.latest("QUERY").requestId,
        page: 1,
        totalMatches: 53,
        rows: [next],
        ruleSummaries: [],
      }),
    );
    expect(screen.getByRole("row", { name: /REAL_51/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("51–51 of 53 transactions")).toBeInTheDocument();
  });
  it("leaves select/tab shortcuts native and supports local up/down selection", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const worker = load();
    const first = screen.getByRole("row", { name: /REAL_1/ });
    const second = screen.getByRole("row", { name: /REAL_2/ });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(second).toHaveAttribute("aria-selected", "true");
    second.focus();
    await user.keyboard("{ArrowUp}");
    expect(first).toHaveAttribute("aria-selected", "true");
    // Finish the row's animation-frame focus before moving to the select.
    await waitFor(() => expect(first).toHaveFocus());
    const select = screen.getByRole("combobox", { name: "Filter verdict" });
    select.focus();
    const count = worker.requests.length;
    await user.keyboard("{ArrowDown}{Escape}");
    expect(worker.requests).toHaveLength(count);
    expect(select).toHaveFocus();
    const tab = screen.getByRole("tab", { name: "Rule trace" });
    tab.focus();
    await user.keyboard("/");
    expect(tab).toHaveFocus();
    first.focus();
    await user.keyboard("{Control>}/{/Control}");
    expect(first).toHaveFocus();
  });
});
