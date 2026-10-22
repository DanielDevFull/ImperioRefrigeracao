"use client";

import { useActionState, useState } from "react";
import { ActionForm, Field, FormSubmit, useActionToast } from "@/components/system/form";
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
  const [state, action, pending] = useActionState(saveNotesAction.bind(null, id), initialActionState);
  useActionToast(state);
  const fe = state.fieldErrors ?? {};
  const [v, setV] = useState({
    description: values.description ?? "",
    diagnosis: values.diagnosis ?? "",
    solution: values.solution ?? "",
    technicianNotes: values.technicianNotes ?? "",
  });
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setV((o) => ({ ...o, [k]: e.target.value })) });
  return (
    <ActionForm action={action} pending={pending} className="grid gap-4 sm:grid-cols-2">
      <Field label="Problema relatado" htmlFor="description" error={fe.description} className="sm:col-span-2">
        <Textarea id="description" name="description" rows={3} maxLength={4000} {...bind("description")} placeholder="O que o cliente relatou ou o serviço pedido." />
      </Field>
      <Field label="Diagnóstico" htmlFor="diagnosis" error={fe.diagnosis}>
        <Textarea id="diagnosis" name="diagnosis" rows={4} maxLength={4000} {...bind("diagnosis")} placeholder="Causa encontrada pelo técnico." />
      </Field>
      <Field label="Solução aplicada" htmlFor="solution" error={fe.solution}>
        <Textarea id="solution" name="solution" rows={4} maxLength={4000} {...bind("solution")} placeholder="O que foi feito para resolver." />
      </Field>
      <Field label="Observações do técnico" htmlFor="technicianNotes" error={fe.technicianNotes} className="sm:col-span-2" hint="Aparecem no relatório de atendimento entregue ao cliente.">
        <Textarea id="technicianNotes" name="technicianNotes" rows={2} maxLength={4000} {...bind("technicianNotes")} placeholder="Recomendações, peças a trocar na próxima visita, acesso ao local." />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <FormSubmit variant="outline">Salvar anotações</FormSubmit>
      </div>
    </ActionForm>
  );
}
