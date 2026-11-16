import { cn } from "@/lib/utils";
import { buttonClassName } from "./workbench-styles";
import { RULE_PRESENTATION } from "./rule-presentation";
import type { RuleSummary } from "./types";
import { Skeleton } from "./workbench-skeletons";
export function RuleHealthStrip({
  selected,
  summaries,
  onSelect,
  loading = false,
}: {
  selected: number;
  summaries: RuleSummary[] | null;
  onSelect: (index: number) => void;
  loading?: boolean;
}) {
  return (
    <nav
      className="grid shrink-0 grid-cols-7 border-b border-wb-line px-5 py-0 tablet:grid-cols-[repeat(7,165px)] tablet:overflow-x-auto mobile:grid-cols-[repeat(7,160px)] mobile:px-2"
      aria-label="Select rule to tune"
      aria-busy={loading}
    >
      {RULE_PRESENTATION.map((rule, index) => (
        <button
          key={rule.name}
          className={cn(
            buttonClassName,
            "relative flex min-w-0 flex-col items-stretch gap-1 rounded-none border-0 border-b-2 border-transparent px-3 pt-[11px] pb-3 text-left aria-pressed:border-wb-accent aria-pressed:bg-wb-selection [&+button]:before:absolute [&+button]:before:inset-y-[13px] [&+button]:before:bottom-[15px] [&+button]:before:left-0 [&+button]:before:w-px [&+button]:before:bg-wb-line [&+button]:before:content-[''] compact:px-[7px] compact:py-2.5 tablet:px-3 tablet:py-2.5",
          )}
          aria-label={`Configure ${rule.name}`}
          aria-pressed={selected === index}
          onClick={() => onSelect(index)}
        >
          <span className="flex gap-[7px] text-[12px] whitespace-nowrap wide:text-[13px] compact:gap-[5px]">
            <span className="font-mono text-[12px] font-normal leading-[normal] text-wb-muted group-data-[active=true]/trace:text-wb-accent">
              R{index + 1}
            </span>
            {rule.name}
          </span>
          <span
            className={cn(
              "flex items-center gap-2 text-[12px] text-wb-muted [&_strong]:font-mono [&_strong]:text-[15px]",
              "[&_strong]:font-medium [&_strong]:leading-[normal] [&_strong]:text-wb-text compact:gap-1",
            )}
          >
            <strong>
              {loading ? (
                <Skeleton className="h-3.5 w-8" />
              ) : (
                (summaries?.[index]?.fired.toLocaleString("en-US") ?? "—")
              )}
            </strong>{" "}
            fired
            <span className="text-[12px] text-wb-gap">
              /{" "}
              {loading ? (
                <Skeleton className="h-3 w-5" />
              ) : (
                (summaries?.[index]?.dataGap.toLocaleString("en-US") ?? "—")
              )}{" "}
              gaps
            </span>
          </span>
        </button>
      ))}
    </nav>
  );
}
