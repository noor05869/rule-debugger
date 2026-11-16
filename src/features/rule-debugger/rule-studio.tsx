import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonClassName } from "./workbench-styles";
import { RULE_PRESENTATION } from "./rule-presentation";
import { isDefaultConfig } from "./rule-config";
import { INDICATIVE_USD_RATES } from "./fx";
import type {
  RuleComparison,
  RuleConfig,
  RuleDefinition,
  RuleSummary,
} from "./types";
import { WorkbenchIcon } from "./workbench-icon";
import { Skeleton } from "./workbench-skeletons";

const inputClass =
  "w-full min-w-0 rounded border border-wb-line bg-wb-input px-2.5 py-2 font-mono text-wb-text accent-wb-accent aria-invalid:border-wb-gap";

function NumberControl({
  label,
  value,
  onCommit,
  units = "",
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  integer = false,
  sliderMax,
  presets,
  validate = () => true,
  validationHint,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  units?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  sliderMax?: number;
  presets?: readonly number[];
  validate?: (value: number) => boolean;
  validationHint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const number = Number(text);
  const valid =
    text.trim() !== "" &&
    Number.isFinite(number) &&
    number >= min &&
    number <= max &&
    (!integer || Number.isSafeInteger(number)) &&
    validate(number);
  const rangeMax = sliderMax === undefined ? null : Math.max(sliderMax, value);
  return (
    <div className="mb-4 last:mb-0">
      <label htmlFor={id} className="mb-2 block text-[12px] text-wb-soft">
        {label}
      </label>
      <div className="flex items-center rounded border border-wb-line bg-wb-input focus-within:border-wb-accent">
        <input
          id={id}
          type="number"
          inputMode={integer ? "numeric" : "decimal"}
          min={min}
          max={max}
          step={integer ? 1 : "any"}
          value={text}
          className={cn(
            inputClass,
            "border-0 text-[18px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
          )}
          aria-invalid={!valid}
          aria-describedby={!valid ? `${id}-error` : undefined}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            const next = Number(raw);
            if (
              raw.trim() !== "" &&
              Number.isFinite(next) &&
              next >= min &&
              next <= max &&
              (!integer || Number.isSafeInteger(next)) &&
              validate(next)
            )
              onCommit(next);
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="shrink-0 pr-2.5 text-[12px] text-wb-muted">
          {units}
        </span>
      </div>
      {!valid ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[12px] text-wb-gap"
        >
          Enter a valid {integer ? "whole " : ""}number from {min} to{" "}
          {max === Number.MAX_SAFE_INTEGER ? "the safe numeric limit" : max}.{" "}
          {validationHint}
        </p>
      ) : null}
      {rangeMax !== null ? (
        <>
          <input
            type="range"
            min={min}
            max={rangeMax}
            step={integer ? 1 : "any"}
            value={value}
            aria-label={`${label} slider`}
            className="mt-[22px] mb-3 block h-1 w-full cursor-pointer accent-wb-accent"
            onChange={(event) => {
              setDraft(null);
              onCommit(Number(event.target.value));
            }}
          />
          <div className="flex justify-between font-mono text-[12px] text-wb-muted">
            <span>
              {min}
              {units === "%" ? "%" : ""}
            </span>
            <span>
              {rangeMax.toLocaleString("en-US")}
              {units === "%" ? "%" : ""}
            </span>
          </div>
        </>
      ) : null}
      {presets ? (
        <div className="mt-[13px] flex gap-[5px]">
          {presets.map((amount) => (
            <button
              key={amount}
              className={cn(
                buttonClassName,
                "flex-1 px-[3px] py-[5px] font-mono text-[12px] aria-pressed:border-wb-accent aria-pressed:bg-wb-selection aria-pressed:text-wb-accent",
              )}
              aria-pressed={value === amount}
              onClick={() => {
                setDraft(null);
                onCommit(amount);
              }}
            >
              {amount >= 1000 ? `${amount / 1000}k` : amount}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WatchlistInput({
  label,
  values,
  onCommit,
}: {
  label: string;
  values: string[];
  onCommit: (entries: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(values.join("\n"));
  return (
    <label className="mb-4 block text-[12px] text-wb-soft" htmlFor={id}>
      {label}
      <textarea
        id={id}
        className={cn(inputClass, "mt-2 min-h-20 resize-y text-[12px]")}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onCommit([
            ...new Set(
              event.target.value
                .split(/\r?\n/)
                .map((entry) => entry.trim())
                .filter(Boolean),
            ),
          ]);
        }}
      />
    </label>
  );
}

type Props = {
  loading?: boolean;
  selected: number;
  config: RuleConfig;
  onConfigChange: (config: RuleConfig) => void;
  resetVersion: number;
  open: boolean;
  onClose: () => void;
  metadata: RuleDefinition | null;
  summary: RuleSummary | null;
  comparison: RuleComparison | null;
  transactionCount: number | null;
  changedOnly: boolean;
  onChangedOnlyChange: (enabled: boolean) => void;
  onReset: () => void;
};

export function RuleStudio({
  loading = false,
  selected,
  config,
  onConfigChange,
  resetVersion,
  open,
  onClose,
  metadata,
  summary,
  comparison,
  transactionCount,
  changedOnly,
  onChangedOnlyChange,
  onReset,
}: Props) {
  const rule = RULE_PRESENTATION[selected];
  const usd = config.currencyMode === "usd";
  const units =
    selected === 2
      ? "%"
      : selected === 5
        ? "hour"
        : usd
          ? "USD"
          : "local units";
  const primaryValues = [
    config.highValue.threshold,
    config.smallFrequent.maxAmount,
    config.unusualType.rarityPercent,
    0,
    config.crossBorder.minAmount,
    config.outsideHours.startHour,
    config.cashWithdrawal.minAmount,
  ];
  function changePrimary(value: number) {
    switch (selected) {
      case 0:
        onConfigChange({
          ...config,
          highValue: { ...config.highValue, threshold: value },
        });
        break;
      case 1:
        onConfigChange({
          ...config,
          smallFrequent: { ...config.smallFrequent, maxAmount: value },
        });
        break;
      case 2:
        onConfigChange({ ...config, unusualType: { rarityPercent: value } });
        break;
      case 4:
        onConfigChange({ ...config, crossBorder: { minAmount: value } });
        break;
      case 5:
        onConfigChange({
          ...config,
          outsideHours: { ...config.outsideHours, startHour: value },
        });
        break;
      case 6:
        onConfigChange({ ...config, cashWithdrawal: { minAmount: value } });
        break;
    }
  }
  const descriptions = [
    "Fire when the comparable amount exceeds the threshold. Optional sender comparison uses only a same-currency snapshot average.",
    `At most ${config.smallFrequent.maxAmount} ${units}, at least ${config.smallFrequent.minCount} small payments in the trailing ${config.smallFrequent.windowMinutes} minutes. Current-time ties and the lower boundary are included.`,
    "Compare channel share against the cutoff using the sender's dataset snapshot. Missing types are excluded from the denominator.",
    "Trimmed, case-insensitive exact merchant OR country matches. Configure one entry per line. Empty lists produce a data gap.",
    "Merchant country differs from the sender's modal snapshot country and amount meets the minimum.",
    "Inclusive start and exclusive end. Source timezone is unknown; weekdays use Monday=0 through Sunday=6.",
    "The dataset has no established cash/ATM signal. The amount condition is evaluated, but the overall rule remains a data gap.",
  ];
  const predicates = [
    `amount > ${config.highValue.threshold}${config.highValue.compareSenderAverage ? "\nAND amount > same-currency sender average" : ""}`,
    `amount <= ${config.smallFrequent.maxAmount}\nAND small_payments_in_${config.smallFrequent.windowMinutes}_minutes >= ${config.smallFrequent.minCount}`,
    `sender.type_share < ${config.unusualType.rarityPercent}%\nMissing type → data gap`,
    `merchant IN configured merchants\nOR country IN configured countries`,
    `merchant.country != sender.modal_country\nAND amount >= ${config.crossBorder.minAmount}`,
    `hour < ${config.outsideHours.startHour} OR hour >= ${config.outsideHours.endHour}${config.outsideHours.flagWeekends ? "\nOR weekday >= 5" : ""}`,
    `established_cash_signal\nAND amount >= ${config.cashWithdrawal.minAmount}`,
  ];
  return (
    <aside
      data-open={open}
      className={cn(
        "min-h-0 min-w-0 overflow-auto border-r border-wb-line bg-wb-panel tablet:hidden tablet:data-[open=true]:fixed",
        "tablet:data-[open=true]:top-[53px] tablet:data-[open=true]:bottom-[29px] tablet:data-[open=true]:left-0",
        "tablet:data-[open=true]:z-20 tablet:data-[open=true]:block tablet:data-[open=true]:w-[290px]",
        "tablet:data-[open=true]:shadow-[10px_0_30px_#0005] mobile:data-[open=true]:top-[51px]",
      )}
      aria-label="Rule configuration"
      id="rule-studio"
    >
      <div className="sticky top-0 z-10 flex h-[49px] items-center justify-between gap-2 border-b border-wb-line bg-wb-input px-[18px] py-2 shadow-[0_2px_6px_#0000000d] mobile:px-3">
        <h2 className="text-[13px] font-semibold">Rule configuration</h2>
        <span className="text-[12px] text-wb-muted">Preview</span>
        <button
          className={cn(buttonClassName, "hidden size-9 tablet:inline-flex")}
          data-panel-close
          aria-label="Close rule configuration"
          onClick={onClose}
        >
          <WorkbenchIcon name="close" />
        </button>
      </div>
      <section className="border-b border-wb-line px-[18px] py-[19px]">
        <h3 className="mb-2 text-[17px] font-medium leading-[1.35]">
          {metadata?.name ?? rule.name}
        </h3>
        <div className="flex gap-[9px] text-[12px] text-wb-muted">
          <span className="font-mono">RULE_00{selected + 1}</span>
          <span>
            {metadata
              ? `${metadata.severity} severity · ${metadata.action}`
              : "Loading rule metadata"}
          </span>
        </div>
        <p className="mt-2.5 text-[12px] leading-[1.7] text-wb-muted">
          {descriptions[selected]}
        </p>
      </section>
      <section
        key={`${selected}-${resetVersion}`}
        className="border-b border-wb-line px-[18px] py-[19px]"
      >
        {selected === 3 ? (
          <>
            <WatchlistInput
              label="Merchant watchlist"
              values={config.riskWatchlist.merchants}
              onCommit={(merchants) =>
                onConfigChange({
                  ...config,
                  riskWatchlist: { ...config.riskWatchlist, merchants },
                })
              }
            />
            <WatchlistInput
              label="Country watchlist"
              values={config.riskWatchlist.countries}
              onCommit={(countries) =>
                onConfigChange({
                  ...config,
                  riskWatchlist: { ...config.riskWatchlist, countries },
                })
              }
            />
            <p className="text-[12px] text-wb-muted">
              Country entries match source codes such as PAN. No list is
              supplied by the assessment.
            </p>
          </>
        ) : (
          <>
            <NumberControl
              label={rule.label}
              value={primaryValues[selected]}
              onCommit={changePrimary}
              units={units}
              max={selected === 2 ? 100 : selected === 5 ? 23 : undefined}
              integer={selected === 5}
              validationHint={
                selected === 5
                  ? "Start must be earlier than the end hour."
                  : undefined
              }
              validate={
                selected === 5
                  ? (value) => value < config.outsideHours.endHour
                  : undefined
              }
              sliderMax={
                selected === 2
                  ? 30
                  : selected === 5
                    ? config.outsideHours.endHour - 1
                    : 25000
              }
              presets={
                selected === 2 || selected === 5
                  ? undefined
                  : selected === 1
                    ? [10, 25, 50, 100]
                    : [500, 1000, 5000, 10000]
              }
            />
            {selected === 0 ? (
              <label className="mt-[18px] flex items-start gap-2 text-[12px] text-wb-soft">
                <input
                  type="checkbox"
                  className="mt-1 accent-wb-accent"
                  checked={config.highValue.compareSenderAverage}
                  onChange={(event) =>
                    onConfigChange({
                      ...config,
                      highValue: {
                        ...config.highValue,
                        compareSenderAverage: event.target.checked,
                      },
                    })
                  }
                />
                <span>
                  Also exceed sender average
                  <small className="mt-1 block text-[12px] text-wb-muted">
                    Same original currency, converted consistently in USD mode.
                  </small>
                </span>
              </label>
            ) : null}
            {selected === 1 ? (
              <>
                <NumberControl
                  label="Minimum small-payment count"
                  value={config.smallFrequent.minCount}
                  min={1}
                  integer
                  onCommit={(minCount) =>
                    onConfigChange({
                      ...config,
                      smallFrequent: { ...config.smallFrequent, minCount },
                    })
                  }
                />
                <NumberControl
                  label="Window (minutes)"
                  value={config.smallFrequent.windowMinutes}
                  min={1}
                  integer
                  onCommit={(windowMinutes) =>
                    onConfigChange({
                      ...config,
                      smallFrequent: { ...config.smallFrequent, windowMinutes },
                    })
                  }
                />
              </>
            ) : null}
            {selected === 5 ? (
              <>
                <NumberControl
                  label="Business hours end"
                  value={config.outsideHours.endHour}
                  min={1}
                  max={24}
                  integer
                  validate={(value) => value > config.outsideHours.startHour}
                  validationHint="End must be later than the start hour."
                  onCommit={(endHour) =>
                    onConfigChange({
                      ...config,
                      outsideHours: { ...config.outsideHours, endHour },
                    })
                  }
                />
                <label className="flex gap-2 text-[12px] text-wb-soft">
                  <input
                    type="checkbox"
                    className="accent-wb-accent"
                    checked={config.outsideHours.flagWeekends}
                    onChange={(event) =>
                      onConfigChange({
                        ...config,
                        outsideHours: {
                          ...config.outsideHours,
                          flagWeekends: event.target.checked,
                        },
                      })
                    }
                  />
                  Include weekends
                </label>
              </>
            ) : null}
          </>
        )}
        {usd ? (
          <details className="mt-4 text-[12px] text-wb-muted">
            <summary className="cursor-pointer">
              Indicative FX assumptions
            </summary>
            <p className="mt-2">
              Static illustrative rates, not live market quotes.
            </p>
            <ul className="mt-2 space-y-1 font-mono">
              {Object.entries(INDICATIVE_USD_RATES).map(([currency, rate]) => (
                <li key={currency}>
                  1 USD ={" "}
                  {(1 / rate).toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  {currency}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="mt-4 text-[12px] text-wb-muted">
            Thresholds use local units; unlike currencies are not normalized.
          </p>
        )}
      </section>
      <section
        className="border-b border-wb-line px-[18px] py-[19px]"
        aria-label="Preview impact"
        aria-busy={loading}
      >
        <div className="mb-3 flex justify-between gap-2 text-[12px]">
          <h3 className="font-medium">Preview impact</h3>
          <span className="text-wb-muted">
            {transactionCount?.toLocaleString("en-US") ?? "—"} rows
          </span>
        </div>
        <div className="grid grid-cols-[1fr_22px_1fr] items-start gap-2 [&_strong]:font-mono [&_strong]:text-[25px] [&_strong]:font-medium [&_small]:mt-1 [&_small]:block [&_small]:text-[12px] [&_small]:text-wb-muted">
          <div>
            <strong>
              {loading ? (
                <Skeleton className="h-6 w-16" />
              ) : (
                (comparison?.defaultFired.toLocaleString("en-US") ?? "—")
              )}
            </strong>
            <small>Default · local units</small>
          </div>
          <WorkbenchIcon name="arrow" className="mt-2 text-wb-muted" />
          <div>
            <strong>
              {loading ? (
                <Skeleton className="h-6 w-16" />
              ) : (
                (summary?.fired.toLocaleString("en-US") ?? "—")
              )}
            </strong>
            <small>Current · {usd ? "USD" : "local units"}</small>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-wb-muted">
          {comparison
            ? `${comparison.changed.toLocaleString("en-US")} verdicts changed from original-currency defaults.`
            : "Updating corpus comparison…"}
        </p>
        <label className="mt-3 flex items-start gap-2 text-[12px] text-wb-soft">
          <input
            type="checkbox"
            className="mt-1 accent-wb-accent"
            checked={changedOnly}
            disabled={isDefaultConfig(config)}
            onChange={(event) => onChangedOnlyChange(event.target.checked)}
          />
          Changed verdicts only
        </label>
      </section>
      <section className="border-b border-wb-line px-[18px] py-[19px]">
        <h3 className="mb-2.5 text-[13px] font-medium">Predicate</h3>
        <p className="font-mono text-[12px] leading-[1.9] whitespace-pre-line text-wb-soft [overflow-wrap:anywhere]">
          {predicates[selected]}
          {[0, 1, 4, 6].includes(selected)
            ? ` ${usd ? "USD" : "local units"}`
            : ""}
        </p>
      </section>
      <div className="px-[18px] py-3.5">
        <button
          className={cn(
            buttonClassName,
            "justify-start border-0 px-0 text-[12px] text-wb-accent",
          )}
          onClick={onReset}
        >
          <WorkbenchIcon name="reset" />
          Reset all rules
        </button>
      </div>
    </aside>
  );
}
