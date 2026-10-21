"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type TabDef = { value: string; label: string; count?: number; alert?: boolean };

/**
 * Abas cujo estado fica em ?tab= (sem nova ida ao servidor: o conteúdo de todas as abas
 * já veio renderizado). Os filhos devem ser <TabsContent value="…">.
 */
export function UrlTabs({
  tabs,
  defaultValue,
  children,
  className,
}: {
  tabs: TabDef[];
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <Tabs
      value={value}
      onValueChange={(v) => {
        setValue(v);
        const url = new URL(window.location.href);
        if (v === tabs[0]?.value) url.searchParams.delete("tab");
        else url.searchParams.set("tab", v);
        window.history.replaceState(null, "", url.pathname + url.search);
      }}
      className={cn("gap-5", className)}
    >
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <TabsList
          variant="line"
          className="h-auto w-full min-w-max justify-start gap-0 rounded-none border-b border-rime p-0"
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="h-10 flex-none rounded-none border-0 px-3.5 text-steel group-data-horizontal/tabs:after:bottom-0 after:h-0.5 after:rounded-full after:bg-ice hover:text-silver data-[state=active]:text-silver data-[state=active]:after:opacity-100"
            >
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 text-[0.7rem] tabular-nums",
                    t.alert ? "bg-gauge-red/15 text-gauge-red" : "bg-ice/10 text-frost/80",
                  )}
                >
                  {t.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
