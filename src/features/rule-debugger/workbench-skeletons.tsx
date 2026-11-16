import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-3 w-16 animate-pulse rounded bg-wb-line motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function TransactionSkeletonRows() {
  return Array.from({ length: 8 }, (_, index) => (
    <tr key={index} aria-hidden="true">
      <td className="h-[58px] border-b border-wb-line px-4 mobile:h-[62px] mobile:px-3">
        <Skeleton className="block w-28" />
        <Skeleton className="mt-2 block h-2.5 w-24" />
      </td>
      <td className="border-b border-wb-line px-3 text-right">
        <Skeleton className="w-20" />
      </td>
      <td className="border-b border-wb-line px-3 mobile:hidden">
        <Skeleton className="w-16" />
      </td>
      <td className="border-b border-wb-line px-3 compact:hidden">
        <Skeleton className="w-8" />
      </td>
      <td className="border-b border-wb-line px-3">
        <Skeleton className="w-16" />
        <Skeleton className="mt-2 block h-2.5 w-20" />
      </td>
    </tr>
  ));
}

export function InspectorSkeleton() {
  return (
    <div
      className="space-y-5 p-[18px]"
      aria-label="Loading transaction evidence"
    >
      <p className="sr-only">Loading transaction evidence…</p>
      <Skeleton className="block h-4 w-36" />
      <Skeleton className="block w-48 max-w-full" />
      <Skeleton className="block h-8 w-40" />
      <Skeleton className="block w-32" />
      <div className="flex gap-3 border-b border-wb-line pb-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-6 w-20" />
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-3 border-b border-wb-line pb-4">
          <Skeleton className="block w-3/4" />
          <Skeleton className="block h-12 w-full" />
          <Skeleton className="block w-1/2" />
        </div>
      ))}
    </div>
  );
}
