"use client";

import { useActionState } from "react";
import { Field, SubmitButton, useActionToast } from "@/components/system/form";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { saveNotesAction } from "../../actions";

export function NotesForm({
  id,
  values,
}: {
  id: string;
  values: { description: string | null; diagnosis: string | null; solution: string | null; technicianNotes: string | null };
}) {
  const [state, action] = useActionState(saveNotesAction.bind(null, id), initialActionState);
  useActionToast(state);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Problema relatado" htmlFor="description" error={fe.description} className="sm:col-span-2">
        <Textarea id="description" name="description" rows={3} maxLength={4000} defaultValue={values.description ?? ""} placeholder="O que o cliente relatou ou o serviço pedido." />
      </Field>
      <Field label="Diagnóstico" htmlFor="diagnosis" error={fe.diagnosis}>
        <Textarea id="diagnosis" name="diagnosis" rows={4} maxLength={4000} defaultValue={values.diagnosis ?? ""} placeholder="Causa encontrada pelo técnico." />
      </Field>
      <Field label="Solução aplicada" htmlFor="solution" error={fe.solution}>
        <Textarea id="solution" name="solution" rows={4} maxLength={4000} defaultValue={values.solution ?? ""} placeholder="O que foi feito para resolver." />
      </Field>
      <Field label="Observações do técnico" htmlFor="technicianNotes" error={fe.technicianNotes} className="sm:col-span-2" hint="Aparecem no relatório de atendimento entregue ao cliente.">
        <Textarea id="technicianNotes" name="technicianNotes" rows={2} maxLength={4000} defaultValue={values.technicianNotes ?? ""} placeholder="Recomendações, peças a trocar na próxima visita, acesso ao local." />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton variant="outline">Salvar anotações</SubmitButton>
      </div>
    </form>
  );
}
