"use client";

import { useTransition } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateSuggestions } from "../actions";

/** Roda agora a reposição por estoque mínimo e a previsão de materiais das OMs. */
export function SuggestionsButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await generateSuggestions();
          if (r.ok === false || r.error) toast.error(r.error ?? "Não foi possível gerar as sugestões.");
          else toast.success("Sugestões geradas", { description: r.message });
        })
      }
    >
      <Sparkles className={pending ? "animate-pulse" : undefined} />
      Gerar sugestões agora
    </Button>
  );
}
