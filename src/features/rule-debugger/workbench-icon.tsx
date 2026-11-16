import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// The pinned design uses these authored shapes, rather than Lucide's variants.
const iconShapes = {
  lens: <path d="M4 6h7l3 6-3 6H4l3-6zM15 6h5m-3 6h3m-5 6h5" />,
  reset: <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />,
  warning: <path d="m12 3 10 18H2zM12 9v5m0 3v.2" />,
  minus: <path d="M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h6m4 0h6M4 17h10m4 0h2" />
      <circle cx="12" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
};

type IconName = keyof typeof iconShapes;

export function WorkbenchIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 fill-none stroke-current align-middle [stroke-width:1.6] [stroke-linecap:round] [stroke-linejoin:round]",
        className,
      )}
    >
      {iconShapes[name]}
    </svg>
  );
}

type DisplayStatus = "fired" | "gap" | "clear";

const statusLabels = { fired: "Fired", gap: "Data gap", clear: "Clear" };

export function StatusLabel({
  status,
  children,
}: {
  status: DisplayStatus;
  children?: ReactNode;
}) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-[5px] text-[12px] font-medium whitespace-nowrap [&_svg]:size-[13px]",
        "data-[status=fired]:text-wb-fired data-[status=gap]:text-wb-gap data-[status=clear]:text-wb-muted",
      )}
    >
      <WorkbenchIcon name={status === "clear" ? "minus" : "warning"} />
      {children ?? statusLabels[status]}
    </span>
  );
}
