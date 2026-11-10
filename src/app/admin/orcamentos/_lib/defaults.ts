/** Condições sugeridas quando a empresa ainda não definiu as suas em Configurações. */
export const DEFAULT_QUOTE_TERMS = [
  "Pagamento na conclusão do serviço, por Pix, cartão ou dinheiro.",
  "Garantia de 90 dias para a mão de obra; peças conforme a garantia do fabricante.",
  "A data do atendimento é combinada depois da aprovação.",
].join("\n");

/** Unidades dos itens de serviço (material usa a unidade do produto). */
export const QUOTE_UNITS = ["un", "serv", "h", "m", "kg", "pç", "cx", "vb"] as const;

const OM_TYPE_PHRASE: Record<string, string> = {
  corretiva: "OM corretiva",
  preventiva: "OM preventiva",
  instalacao: "OM de instalação",
  visita_tecnica: "OM de visita técnica",
  pmoc: "OM de PMOC",
};

/** "OM de instalação", "OM corretiva"… para as frases sobre a OM gerada na aprovação. */
export const omTypePhrase = (workType: string) => OM_TYPE_PHRASE[workType] ?? "OM";
