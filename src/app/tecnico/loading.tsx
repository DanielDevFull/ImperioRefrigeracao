import { Skeleton } from "@/components/ui/skeleton";

export default function TechLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}
