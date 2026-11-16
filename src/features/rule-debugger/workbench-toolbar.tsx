import { cn } from "@/lib/utils";
import { buttonClassName } from "./workbench-styles";
import { WorkbenchIcon } from "./workbench-icon";

type Props = {
  light: boolean;
  usd: boolean;
  transactionCount: number | null;
  senderCount: number | null;
  onThemeChange: () => void;
  onCurrencyChange: (enabled: boolean) => void;
  onReset: () => void;
};

export function WorkbenchToolbar({
  light,
  usd,
  transactionCount,
  senderCount,
  onThemeChange,
  onCurrencyChange,
  onReset,
}: Props) {
  return (
    <>
      <header className="flex min-h-[53px] shrink-0 items-center justify-between gap-4 border-b border-wb-line bg-wb-panel px-5 py-0 mobile:min-h-[51px] mobile:px-3.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-[9px] text-[17px] font-semibold tracking-[-0.25px] [&_svg]:size-[22px] [&_svg]:text-wb-accent">
            <WorkbenchIcon name="lens" />
            RuleLens
          </div>
          <div className="ml-3 border-l border-wb-line pl-5 text-wb-muted tablet:hidden">
            Fraud operations{" "}
            <span className="px-2.5 py-0" aria-hidden="true">
              /
            </span>{" "}
            Rule debugger
          </div>
        </div>
        <div className="flex items-center gap-[18px] text-[12px] text-wb-muted compact:[&>span:first-child]:hidden mobile:gap-2">
          <span>Changes stay in this browser</span>
          <span className="rounded-[3px] border border-[#69543b] px-[7px] py-0.5 text-[12px] text-wb-gap">
            Sandbox
          </span>
        </div>
      </header>
      <div className="flex min-h-[67px] shrink-0 items-center justify-between gap-4 px-5 py-3 mobile:min-h-[85px] mobile:gap-2.5 mobile:px-3.5 mobile:py-[13px]">
        <div>
          <h1 className="text-[20px] font-medium tracking-[-0.3px] mobile:text-[19px]">
            Rule debugger
          </h1>
          <div className="mt-px flex items-center gap-2.5 text-[12px] text-wb-muted mobile:block mobile:[&>span]:hidden">
            {transactionCount === null
              ? "Dataset loading"
              : `${transactionCount.toLocaleString("en-US")} transactions · ${senderCount} sender baselines`}
            <span aria-hidden="true">/</span>
            <span>Dataset snapshot</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mobile:max-w-[135px] mobile:flex-wrap mobile:justify-end mobile:gap-[5px]">
          <label
            className="flex cursor-pointer items-center gap-2 text-[12px]"
            title="Re-evaluate using indicative static USD rates"
          >
            <input
              className={cn(
                "relative m-0 h-4 w-7 cursor-pointer appearance-none rounded-[10px] border border-[#667182] bg-[#39404a]",
                "before:absolute before:top-0.5 before:left-0.5 before:size-2.5 before:rounded-full before:bg-[#d6dce5]",
                "before:content-[''] checked:border-wb-accent checked:bg-wb-accent checked:before:left-3.5",
                "checked:before:bg-[#1d2b45]",
              )}
              type="checkbox"
              role="switch"
              checked={usd}
              onChange={(event) => onCurrencyChange(event.target.checked)}
            />
            Compare in USD
          </label>
          <button
            className={cn(
              buttonClassName,
              "w-8 shrink-0 p-1.5 mobile:min-h-9 mobile:min-w-9",
            )}
            aria-label={
              light ? "Switch to dark theme" : "Switch to light theme"
            }
            onClick={onThemeChange}
          >
            <WorkbenchIcon name="sun" />
          </button>
          <button
            className={cn(buttonClassName, "mobile:hidden")}
            onClick={onReset}
            title="Restore all documented rule defaults and original currency mode"
          >
            <WorkbenchIcon name="reset" />
            Reset rules
          </button>
        </div>
      </div>
    </>
  );
}
