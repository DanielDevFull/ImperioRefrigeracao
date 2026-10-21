# Imperium Tec Refrigeração — sistema de gestão

Sistema completo para a operação de uma empresa de refrigeração e climatização: clientes e seus
equipamentos, planos de manutenção com **geração automática de OMs**, mensalidades, estoque e compras,
contas a pagar e a receber, técnicos com **app de campo** (PWA) e **comissões**, e **portal do cliente**
para acompanhar equipamentos, atendimentos e pagar mensalidades.

## Módulos

| Área | O que faz |
|---|---|
| **Painel** | Receita recorrente, OMs de hoje e atrasadas, inadimplência, técnicos em campo e o que precisa de atenção. |
| **Clientes e equipamentos** | Cadastro PF/PJ, locais de atendimento, ficha técnica de cada aparelho (BTU, gás, série, garantia), histórico e etiqueta com QR code. |
| **Planos de manutenção** | Modelos por tipo de equipamento com tarefas de frequências diferentes (mensal, trimestral, semestral, anual), medições obrigatórias, fotos e materiais por visita. |
| **Contratos** | Plano comercial do cliente: valor da mensalidade, dia de vencimento e quais equipamentos estão cobertos, cada um com seu plano e técnico preferencial. |
| **OMs automáticas** | Todo dia às 6h a rotina gera as OMs preventivas dos próximos 30 dias, já com o checklist das tarefas que vencem naquela visita, atribuídas ao técnico (respeitando férias/folgas). Idempotente: nunca duplica. |
| **Agenda** | Quadro de despacho por técnico e dia, com arrastar e soltar para atribuir e reagendar. |
| **App do técnico** | OMs do dia, um botão que conduz o atendimento (a caminho → no local → concluir), checklist com medições, fotos antes/depois, materiais do estoque do veículo, assinatura do cliente, funcionamento offline e "Meus ganhos". |
| **Estoque e compras** | Almoxarifado e estoque por veículo, baixa automática dos materiais usados nas OMs, ponto de reposição, previsão de materiais pelas OMs agendadas, pedidos de compra com recebimento parcial. |
| **Financeiro** | Contas a receber (mensalidades e serviços) e a pagar, multa e juros automáticos, comprovantes enviados pelos clientes, fluxo de caixa e DRE simplificado. |
| **Comissões** | Regras por técnico e tipo de serviço (% da mão de obra, % do total, % dos materiais ou valor fixo), liberação na conclusão ou no recebimento, fechamento mensal que gera a conta a pagar. |
| **Portal do cliente** | Equipamentos do plano, próximas visitas, histórico com fotos e relatório, mensalidades com Pix copia e cola + envio de comprovante, abertura de chamados e avaliação do atendimento. |
| **PMOC** | Documento do Plano de Manutenção, Operação e Controle (Lei 13.589/2018, Portaria 3.523/98) com cronograma anual, registros de execução e responsável técnico. |
| **QR code** | Cada aparelho tem uma etiqueta; o técnico escaneia e abre o equipamento; qualquer pessoa vê a última manutenção e pode pedir atendimento. |

## Tecnologia

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Motion · Recharts ·
Drizzle ORM · PostgreSQL (Neon) · Better Auth · Vercel (hospedagem, Cron e Blob) · Vitest · Playwright.

## Rodando localmente

Pré-requisitos: Node 22+, pnpm 10 e um PostgreSQL (local ou Neon).

```bash
pnpm install
cp .env.example .env.local      # preencha DATABASE_URL e BETTER_AUTH_SECRET
pnpm db:migrate                 # cria as tabelas
pnpm db:seed                    # dados de demonstração (apaga os dados de negócio!)
pnpm dev                        # http://localhost:3000
```

Acessos de demonstração criados pelo `db:seed` (apenas para ambiente local):

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@imperiumtec.com.br | imperium123 |
| Gestor/financeiro | financeiro@imperiumtec.com.br | imperium123 |
| Técnico | rafael@imperiumtec.com.br | tecnico123 |
| Cliente (portal) | cliente@imperiumtec.com.br | cliente123 |

Outros comandos: `pnpm test` (regras de negócio), `pnpm typecheck`, `pnpm lint`, `pnpm db:studio`.

## Como a automação funciona

`src/server/daily.ts` roda diariamente (Vercel Cron → `/api/cron/diario`, 06:00 de Brasília) e também
pelo botão **Gerar OMs e mensalidades** no topo do painel:

1. **Mensalidades** — para cada contrato ativo, cria a conta a receber da competência quando faltam
   N dias (configurável) para o vencimento. Uma por contrato por mês, nunca duplicada.
2. **OMs preventivas** — para cada equipamento coberto, calcula as datas de visita a partir da
   data-âncora e da menor frequência das tarefas do plano; cada OM leva só as tarefas daquele ciclo
   (ex.: limpeza de filtro todo mês, higienização a cada 6). Domingos (e sábados, se configurado) vão
   para o dia útil anterior. Clientes inadimplentes podem ser bloqueados (configurável).
3. **Reposição** — produtos abaixo do mínimo e faltas previstas pelas OMs agendadas viram
   solicitações de compra.

As regras puras estão em `src/server/core` com testes em `__tests__`.

## Implantação

Veja [`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md). Convenções de código e design: [`docs/CONVENCOES.md`](docs/CONVENCOES.md).
