import { cn } from "@/lib/utils";
import { IceCrystalIcon } from "@/components/brand/frost-burst";

/** Estado vazio: diz o que falta e oferece a próxima ação. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="relative mb-4 grid size-14 place-items-center rounded-full bg-ice/8 ring-1 ring-ice/20">
        <span aria-hidden className="absolute inset-0 rounded-full animate-breathe shadow-[0_0_30px_rgb(56_168_255/0.25)]" />
        {icon ?? <IceCrystalIcon className="size-6 text-frost" />}
      </div>
      <p className="text-sm font-medium text-silver">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-steel">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
