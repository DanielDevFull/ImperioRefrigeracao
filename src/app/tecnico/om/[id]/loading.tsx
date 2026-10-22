import { Skeleton } from "@/components/ui/skeleton";

export default function TechWorkOrderLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando OM">
      <div className="flex items-start gap-4 pt-10">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="size-16 rounded-full" />
      </div>
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}
