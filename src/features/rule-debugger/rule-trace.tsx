import { cn } from "@/lib/utils";
import { StatusLabel, WorkbenchIcon } from "./workbench-icon";
import { Skeleton } from "./workbench-skeletons";
import type {
  ConditionStep,
  ConditionValue,
  RuleDefinition,
  RuleResult,
} from "./types";

const sourceLabels: Record<ConditionStep["source"], string> = {
  transaction: "transactions.json",
  features: "feature_vectors.json",
  "sender-profile": "Sender dataset snapshot",
  configuration: "Rule configuration",
  derived: "Derived value",
};
const outcomeLabels = {
  MATCHED: "Matched",
  NOT_MATCHED: "Not matched",
  MISSING: "Missing",
};

export function formatEvidenceValue(value: ConditionValue): string {
  if (value === null) return "null";
  if (value === "") return '"" (empty string)';
  return String(value);
}

/** Render the evaluator's evidence verbatim; do not calculate predicates here. */
export function RuleTrace({
  result,
  metadata,
  selected,
  pending = false,
}: {
  result: RuleResult;
  metadata?: RuleDefinition;
  selected: boolean;
  pending?: boolean;
}) {
  return (
    <details
      open={selected}
      data-rule-id={result.ruleId}
      className="group/trace border-b border-wb-line"
    >
      <summary className="flex min-h-10 scroll-mt-12 cursor-pointer list-none items-center gap-2 py-[11px] text-[12px] [&::-webkit-details-marker]:hidden mobile:min-h-11">
        <WorkbenchIcon
          name="chevron"
          className="size-3 text-wb-muted group-open/trace:rotate-90"
        />
        <span
          className={cn(
            "font-mono",
            selected ? "text-wb-accent" : "text-wb-muted",
          )}
        >
          {result.ruleId.replace("RULE_00", "R")}
        </span>
        <span className="min-w-0 flex-1">
          {metadata?.name ?? result.ruleId}
        </span>
        {pending ? (
          <span className="text-wb-muted">Pending context</span>
        ) : (
          <StatusLabel
            status={
              result.status === "FIRED"
                ? "fired"
                : result.status === "DATA_GAP"
                  ? "gap"
                  : "clear"
            }
          />
        )}
      </summary>
      <div
        role="group"
        aria-label={`${result.ruleId} evidence`}
        className="pb-4 pl-5"
      >
        {pending ? (
          <div className="space-y-3">
            <p className="text-[12px] leading-[1.7] text-wb-muted">
              Recalculating the trailing window for the current settings. No
              verdict is shown until matching context arrives.
            </p>
            <Skeleton className="block h-12 w-full" />
            <Skeleton className="block w-2/3" />
          </div>
        ) : (
          <>
            <p className="mb-[11px] text-[12px] leading-[1.7] text-wb-muted">
              {result.reason}
            </p>
            {metadata ? (
              <p className="mb-[11px] text-[12px] text-wb-muted">
                {metadata.severity} severity · {metadata.action}
              </p>
            ) : null}
            <dl className="text-[12px]">
              {result.steps.map((step, index) => (
                <div
                  key={`${index}-${step.label}`}
                  className="border-t border-wb-line py-2.5 first:border-0 first:pt-0"
                >
                  <dt className="flex items-start justify-between gap-2 text-wb-soft">
                    <span>{step.label}</span>
                    <span
                      className={cn(
                        "shrink-0 text-[12px]",
                        step.outcome === "MISSING"
                          ? "text-wb-gap"
                          : step.outcome === "MATCHED"
                            ? "text-wb-soft"
                            : "text-wb-muted",
                      )}
                    >
                      {outcomeLabels[step.outcome]}
                    </span>
                  </dt>
                  <dd className="mt-[5px] rounded-[3px] bg-wb-input px-2.5 py-[9px] font-mono leading-[1.7] [overflow-wrap:anywhere]">
                    {formatEvidenceValue(step.actual)}{" "}
                    <span className="text-wb-muted">{step.operator}</span>{" "}
                    {formatEvidenceValue(step.expected)}
                  </dd>
                  <dd className="mt-1 text-[12px] text-wb-muted">
                    Source: {sourceLabels[step.source]}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </details>
  );
}
