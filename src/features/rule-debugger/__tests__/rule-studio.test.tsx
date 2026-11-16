import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuleStudio } from "../rule-studio";
import { DEFAULT_RULE_CONFIG } from "../rule-config";

afterEach(cleanup);
function Studio({ selected = 0 }: { selected?: number }) {
  const [config, setConfig] = useState(structuredClone(DEFAULT_RULE_CONFIG));
  const [revision, setRevision] = useState(0);
  return (
    <>
      <RuleStudio
        selected={selected}
        config={config}
        onConfigChange={setConfig}
        resetVersion={revision}
        open
        onClose={vi.fn()}
        metadata={null}
        summary={null}
        comparison={null}
        transactionCount={2}
        changedOnly={false}
        onChangedOnlyChange={vi.fn()}
        onReset={() => {
          setConfig(structuredClone(DEFAULT_RULE_CONFIG));
          setRevision((value) => value + 1);
        }}
      />
      <output aria-label="Committed configuration">
        {JSON.stringify(config)}
      </output>
    </>
  );
}
const committed = () =>
  JSON.parse(screen.getByLabelText("Committed configuration").textContent!);

describe("rule tuning controls", () => {
  it("preserves empty/invalid number drafts and synchronizes valid numbers, slider and presets", async () => {
    const user = userEvent.setup();
    render(<Studio />);
    const input = screen.getByRole("spinbutton", { name: "Amount threshold" });
    await user.clear(input);
    expect(input).toHaveDisplayValue("");
    expect(committed().highValue.threshold).toBe(1000);
    fireEvent.change(input, { target: { value: "-1" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(committed().highValue.threshold).toBe(1000);
    fireEvent.change(input, { target: { value: "2000" } });
    expect(committed().highValue.threshold).toBe(2000);
    expect(
      screen.getByRole("slider", { name: "Amount threshold slider" }),
    ).toHaveValue("2000");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3000" } });
    expect(input).toHaveValue(3000);
    await user.click(screen.getByRole("button", { name: "5k" }));
    expect(input).toHaveValue(5000);
    await user.click(screen.getByRole("button", { name: "Reset all rules" }));
    expect(
      screen.getByRole("spinbutton", { name: "Amount threshold" }),
    ).toHaveValue(1000);
  });
  it("commits positive integer R2 count/window and rejects invalid values", () => {
    render(<Studio selected={1} />);
    fireEvent.change(screen.getByLabelText("Minimum small-payment count"), {
      target: { value: "0" },
    });
    expect(committed().smallFrequent.minCount).toBe(5);
    fireEvent.change(screen.getByLabelText("Minimum small-payment count"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Window (minutes)"), {
      target: { value: "30" },
    });
    expect(committed().smallFrequent).toMatchObject({
      minCount: 8,
      windowMinutes: 30,
    });
  });
  it("edits actual watchlists without losing the newline draft", async () => {
    const user = userEvent.setup();
    render(<Studio selected={3} />);
    await user.type(
      screen.getByLabelText("Merchant watchlist"),
      "Shop{Enter}Other Shop",
    );
    await user.type(
      screen.getByLabelText("Country watchlist"),
      "PAN{Enter}COL",
    );
    expect(committed().riskWatchlist).toEqual({
      merchants: ["Shop", "Other Shop"],
      countries: ["PAN", "COL"],
    });
    expect(screen.queryByText(/load demo/i)).not.toBeInTheDocument();
  });
  it("validates start < end and supports weekend changes", async () => {
    const user = userEvent.setup();
    render(<Studio selected={5} />);
    await user.click(screen.getByLabelText("Business hours start"));
    fireEvent.change(screen.getByLabelText("Business hours start"), {
      target: { value: "21" },
    });
    expect(committed().outsideHours.startHour).toBe(8);
    await user.click(screen.getByLabelText("Business hours end"));
    fireEvent.change(screen.getByLabelText("Business hours end"), {
      target: { value: "24" },
    });
    await user.click(screen.getByLabelText("Business hours start"));
    fireEvent.change(screen.getByLabelText("Business hours start"), {
      target: { value: "21" },
    });
    await user.click(screen.getByLabelText("Include weekends"));
    expect(committed().outsideHours).toEqual({
      startHour: 21,
      endHour: 24,
      flagWeekends: true,
    });
  });
  it.each([
    [2, "Channel rarity cutoff", "unusualType", "rarityPercent", 20],
    [4, "Significant amount", "crossBorder", "minAmount", 700],
    [6, "Withdrawal threshold", "cashWithdrawal", "minAmount", 2000],
  ] as const)("edits rule %s", (selected, label, section, field, value) => {
    render(<Studio selected={selected} />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: String(value) },
    });
    expect(committed()[section][field]).toBe(value);
  });
});
