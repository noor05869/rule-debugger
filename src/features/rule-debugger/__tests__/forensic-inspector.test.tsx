import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForensicInspector } from "../forensic-inspector";
import { buildSenderProfiles } from "../data";
import { DEFAULT_RULE_CONFIG } from "../rule-config";
import { evaluateRules } from "../rules";
import { RULE_IDS, type EvaluatedRecord } from "../types";
import { record } from "./rule-fixtures";

function example(): EvaluatedRecord {
  const input = record({
    amount: 42000,
    currency: "COP",
    transaction_type: null,
    receiver_account_id: null,
  });
  input.features = {
    transaction_id: "TXN_1",
    sender_account_id: "sender-1",
    receiver_account_id: null,
    amount: 43000,
    currency: "COP",
    transaction_type: null,
    transaction_count: 25,
    avg_transaction_amount: 100,
    hour_of_day: 12,
    day_of_week: 1,
    merchant_avg_transaction_amount: 50,
  };
  input.conflicts = [
    {
      transactionId: "TXN_1",
      field: "amount",
      transactionValue: 42000,
      featureValue: 43000,
    },
  ];
  const profile = buildSenderProfiles([
    input,
    record({ transaction_id: "TXN_2", amount: 100, currency: "USD" }),
  ]).get("sender-1")!;
  const context = {
    senderProfile: profile,
    recentSmallTransactionCount: 1,
    currencyMode: "original" as const,
  };
  return {
    record: input,
    context,
    results: evaluateRules(input, DEFAULT_RULE_CONFIG, context),
  };
}
const rules = RULE_IDS.map((rule_id) => ({
  rule_id,
  name: `Source ${rule_id}`,
  description: "Source description",
  severity: "High" as const,
  action: "Alert" as const,
}));
const baseProps = {
  rules,
  selectedRule: 0,
  usd: false,
  open: true,
  onClose: vi.fn(),
  outsideResults: false,
  pendingSelection: false,
  loading: false,
  onFilterBySender: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("forensic inspector", () => {
  it.each(["Critical", "High", "Medium", "Low"] as const)(
    "highlights %s when it is the highest fired severity, ignoring other verdicts",
    (severity) => {
      const value = example();
      value.results = value.results.map((result) => ({
        ...result,
        status:
          result.ruleId === "RULE_001"
            ? "FIRED"
            : result.status === "FIRED"
              ? "CLEAR"
              : result.status,
      }));
      render(
        <ForensicInspector
          {...baseProps}
          value={value}
          rules={rules.map((rule) => ({
            ...rule,
            severity: rule.rule_id === "RULE_001" ? severity : "Critical",
          }))}
        />,
      );
      expect(screen.getByLabelText("Highest fired severity")).toHaveTextContent(
        `${severity} · R1 fired`,
      );
    },
  );
  it("shows only the count at the highest fired severity and updates when results change", () => {
    const value = example();
    value.results = value.results.map((result) => ({
      ...result,
      status: "FIRED",
    }));
    const metadata = rules.map((rule) => ({
      ...rule,
      severity:
        rule.rule_id === "RULE_004" || rule.rule_id === "RULE_005"
          ? ("Critical" as const)
          : ("High" as const),
    }));
    const { rerender } = render(
      <ForensicInspector {...baseProps} value={value} rules={metadata} />,
    );
    expect(screen.getByLabelText("Highest fired severity")).toHaveTextContent(
      "Critical · 2 rules fired",
    );
    rerender(
      <ForensicInspector
        {...baseProps}
        value={value}
        rules={metadata}
        pendingRuleIds={["RULE_004", "RULE_005"]}
      />,
    );
    expect(screen.getByLabelText("Highest fired severity")).toHaveTextContent(
      "High · 5 rules fired",
    );
    rerender(
      <ForensicInspector
        {...baseProps}
        rules={metadata}
        value={{
          ...value,
          results: value.results.map((result) => ({
            ...result,
            status: "CLEAR",
          })),
        }}
      />,
    );
    expect(
      screen.queryByLabelText("Highest fired severity"),
    ).not.toBeInTheDocument();
  });
  it("does not invent severity without rule metadata or for a pending-only result", () => {
    const value = example();
    const { rerender } = render(
      <ForensicInspector {...baseProps} value={value} rules={[]} />,
    );
    expect(
      screen.queryByLabelText("Highest fired severity"),
    ).not.toBeInTheDocument();
    rerender(
      <ForensicInspector
        {...baseProps}
        value={value}
        pendingRuleIds={["RULE_001"]}
      />,
    );
    expect(
      screen.queryByLabelText("Highest fired severity"),
    ).not.toBeInTheDocument();
  });
  it("renders structured evidence with actual/operator/expected, outcome, and provenance", () => {
    render(<ForensicInspector {...baseProps} value={example()} />);
    const trace = screen.getByRole("group", { name: "RULE_001 evidence" });
    expect(trace).toHaveTextContent("Raw amount");
    expect(trace).toHaveTextContent("42000");
    expect(trace).toHaveTextContent("> 1000");
    expect(trace).toHaveTextContent("Matched");
    expect(trace).toHaveTextContent("transactions.json");
    expect(trace).toHaveTextContent("Derived value");
    expect(screen.getByText("1 fired")).toBeInTheDocument();
    expect(screen.getByText("3 data gaps")).toBeInTheDocument();
  });
  it("keeps the selected rule first, then fired/gap/clear, with missing evidence explained", async () => {
    const user = userEvent.setup();
    render(
      <ForensicInspector {...baseProps} selectedRule={5} value={example()} />,
    );
    const details = [
      ...document.querySelectorAll<HTMLDetailsElement>("details[data-rule-id]"),
    ];
    expect(details.map((node) => node.dataset.ruleId)).toEqual([
      "RULE_006",
      "RULE_001",
      "RULE_003",
      "RULE_004",
      "RULE_007",
      "RULE_002",
      "RULE_005",
    ]);
    expect(details[0]).toHaveAttribute("open");
    await user.click(screen.getByText("Source RULE_004"));
    const watch = screen.getByRole("group", { name: "RULE_004 evidence" });
    expect(watch).toHaveTextContent("Required evidence is missing");
    expect(watch).toHaveTextContent("Missing");
    expect(watch).toHaveTextContent("null");
    expect(watch).toHaveTextContent("Rule configuration");
  });
  it("exposes separate raw/features, real conflicts, null receiver, and zero terminal", async () => {
    const user = userEvent.setup();
    render(
      <ForensicInspector {...baseProps} value={example()} outsideResults />,
    );
    expect(screen.getByText(/outside the visible results/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Data lineage" }));
    const raw = screen.getByRole("region", { name: "Transaction input" });
    const feature = screen.getByRole("region", { name: "Feature vector" });
    expect(raw).toHaveTextContent("42000");
    expect(feature).toHaveTextContent("43000");
    expect(
      within(raw).getByText("receiver_account_id").closest("div"),
    ).toHaveTextContent("null · missing");
    expect(
      within(raw).getByText("terminal_id").closest("div"),
    ).toHaveTextContent("0");
    const conflicts = screen.getByRole("region", { name: "Join conflicts" });
    expect(conflicts).toHaveTextContent("amount");
    expect(conflicts).toHaveTextContent("42000");
    expect(conflicts).toHaveTextContent("43000");
    expect(conflicts).toHaveTextContent("Neither source was overwritten");
  });
  it("does not manufacture missing features or sender baselines", async () => {
    const user = userEvent.setup();
    const value = example();
    value.record.features = null;
    value.record.conflicts = [];
    value.context.senderProfile = null;
    render(<ForensicInspector {...baseProps} value={value} />);
    await user.click(screen.getByRole("tab", { name: "Data lineage" }));
    expect(
      screen.getByText("No feature vector joined to this transaction."),
    ).toBeInTheDocument();
    expect(screen.queryByText("transaction_count")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Sender" }));
    expect(
      screen.getByText("Sender baseline unavailable."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Filter transactions by this sender",
      }),
    ).toBeEnabled();
  });
  it("shows snapshot type/country counts and per-currency baselines and filters the actual ID", async () => {
    const user = userEvent.setup();
    const onFilterBySender = vi.fn();
    render(
      <ForensicInspector
        {...baseProps}
        value={example()}
        onFilterBySender={onFilterBySender}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Sender" }));
    const panel = screen.getByRole("tabpanel", { name: "Sender" });
    expect(panel).toHaveTextContent("Dataset snapshot baseline");
    expect(panel).toHaveTextContent("not historical knowledge");
    expect(panel).toHaveTextContent("sender-1");
    expect(panel).toHaveTextContent("Known types: 1 · Missing types: 1");
    expect(panel).toHaveTextContent("online");
    expect(panel).toHaveTextContent("100.00%");
    expect(panel).toHaveTextContent("PAN");
    expect(panel).toHaveTextContent("COP");
    expect(panel).toHaveTextContent("USD");
    await user.click(
      screen.getByRole("button", {
        name: "Filter transactions by this sender",
      }),
    );
    expect(onFilterBySender).toHaveBeenCalledExactlyOnceWith("sender-1");
  });
  it("disables sender filtering for a missing sender, and exposes loading instead of old evidence", async () => {
    const user = userEvent.setup();
    const value = example();
    value.record.transaction.sender_account_id = null;
    const { rerender } = render(
      <ForensicInspector {...baseProps} value={value} />,
    );
    await user.click(screen.getByRole("tab", { name: "Sender" }));
    expect(
      screen.getByRole("button", {
        name: "Filter transactions by this sender",
      }),
    ).toBeDisabled();
    rerender(<ForensicInspector {...baseProps} value={null} loading />);
    expect(
      screen.getByText("Loading transaction evidence…"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  it("uses accessible tabs and copies the selected transaction ID with honest feedback", async () => {
    const user = userEvent.setup();
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal("navigator", { clipboard });
    render(<ForensicInspector {...baseProps} value={example()} />);
    screen.getByRole("tab", { name: "Rule trace" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Data lineage" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(
      screen.getByRole("button", { name: "Copy transaction ID" }),
    );
    expect(clipboard.writeText).toHaveBeenCalledExactlyOnceWith("TXN_1");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Transaction ID copied",
    );
  });
  it("reports clipboard failure instead of claiming the ID was copied", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    render(<ForensicInspector {...baseProps} value={example()} />);
    await user.click(
      screen.getByRole("button", { name: "Copy transaction ID" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Copy unavailable");
    expect(screen.queryByText("Transaction ID copied")).not.toBeInTheDocument();
  });
});
