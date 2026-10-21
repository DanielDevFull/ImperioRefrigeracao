"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { FrostBurst } from "@/components/brand/frost-burst";
import { WorkOrderStatusBadge } from "@/components/system/status";

/** Status da OM; quando ela é concluída nesta tela, o selo responde com a explosão de gelo. */
export function StatusLive({ status }: { status: string }) {
  const [prev, setPrev] = useState(status);
  const [burst, setBurst] = useState(0);
  const [changed, setChanged] = useState(false);
  if (status !== prev) {
    setPrev(status);
    setChanged(true);
    if (status === "concluida") setBurst((b) => b + 1);
  }
  return (
    <span className="relative inline-flex">
      <motion.span key={status} initial={changed ? { scale: 0.8, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 28 }}>
        <WorkOrderStatusBadge status={status} />
      </motion.span>
      <FrostBurst burstKey={burst} size={180} />
    </span>
  );
}

/** Mostra o toast "OM criada" depois do redirecionamento e limpa o parâmetro da URL. */
export function CreatedToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const created = params.get("criada") === "1";
  useEffect(() => {
    if (!created) return;
    toast.success("OM criada");
    router.replace(pathname, { scroll: false });
  }, [created, pathname, router]);
  return null;
}
