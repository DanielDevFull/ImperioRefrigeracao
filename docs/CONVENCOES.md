# Convenções do código — Imperium Tec Refrigeração

Leia antes de criar telas ou regras. Vale para pessoas e agentes.

## Stack

- **Next.js 16.4 (App Router)** com React 19.3. `cacheComponents` está **desligado**: páginas que leem
  sessão/banco são dinâmicas automaticamente. `params` e `searchParams` são **Promises** (`await params`).
  Tipos globais `PageProps<"/rota/[id]">` e `LayoutProps<"/rota">` são gerados por `next typegen`.
  Middleware agora se chama **proxy** (`src/proxy.ts`). Documentação da versão: `node_modules/next/dist/docs/`.
- **Drizzle ORM 0.45** + Postgres (Neon em produção, Postgres local em desenvolvimento).
  Cliente: `import { db } from "@/db"`; tabelas: `import { customers, … } from "@/db/schema"`.
  Consultas relacionais: `db.query.workOrders.findMany({ where, with: { customer: true } })`.
  Valores `money()`/`qty()` chegam como `number`. Datas de calendário (`date`) chegam como string `"YYYY-MM-DD"`.
- **Better Auth 1.7** (e-mail/senha, plugin admin). Perfis em `user.role`: `admin`, `gestor`, `tecnico`, `cliente`.
- **Tailwind v4** + componentes **shadcn/ui** (Radix) em `src/components/ui`. Ícones `lucide-react`.
- **Motion 14** (`import { motion } from "motion/react"`), **Recharts 3**, **sonner** (toasts), **qrcode**, **jsqr**.
- Testes: **Vitest** (`pnpm test`) para regras puras em `src/server/core`.

## Pastas

```
src/app/(auth)/login         login
src/app/admin/<módulo>/      back-office (equipe interna)
src/app/tecnico/             app do técnico (PWA, celular)
src/app/portal/              portal do cliente
src/app/e/[token]            página pública do QR do equipamento
src/server/                  serviços de negócio (usar SEMPRE em vez de reescrever regras)
src/server/core/             regras puras testadas (agenda, cobrança, comissão, fluxo da OM)
src/components/brand         Emblem, Wordmark, SnowField, FrostBurst, AnimatedNumber
src/components/system        PageHeader, Panel, DetailList, EmptyState, ToneBadge, *StatusBadge,
                             ReadoutBand, SearchInput, FilterTabs, Pager, SubmitButton, Field,
                             ConfirmAction, QrCode, MaskedInput
src/components/charts        TrendChart, BarChart, BarList, Sparkline (paleta validada em theme.ts)
src/lib                      format.ts, dates.ts, labels.ts, pix.ts, storage.ts, action.ts, params.ts
```

Arquivos privados de uma rota ficam em pastas com `_` (não viram rota): `_components/`, `_lib/queries.ts`.
Server Actions de um módulo ficam em `actions.ts` na pasta da rota (com `"use server"` no topo).

## Segurança (obrigatório)

- Layouts já exigem login: `/admin` → admin/gestor, `/tecnico` → técnico, `/portal` → cliente.
- **Toda Server Action** começa com `await assertRole([...])` (de `@/lib/auth/session`) — o layout não protege ações.
- No **app do técnico**, use `requireTechnician()` e filtre tudo por `technician.id`
  (um técnico nunca vê nem altera OM de outro). Ações do técnico verificam que a OM é dele.
- No **portal**, use `requireCustomer()` e filtre tudo por `customer.id`. Nunca confie em ids vindos do formulário
  sem checar que pertencem ao cliente logado.
- Uploads: `storeFile()` de `@/lib/storage`; limite `MAX_UPLOAD_BYTES`; aceitar só imagens/PDF.

## Regras de negócio — use os serviços

| Preciso… | Use |
|---|---|
| criar OM manual / chamado do portal | `createWorkOrder(tx, input, actor)` — `src/server/work-orders.ts` |
| mudar status da OM | `changeWorkOrderStatus(tx, id, to, actor, nota?)` (valida o fluxo) |
| concluir OM | `completeWorkOrder(tx, id, input, actor)` (checklist, cobrança avulsa, comissão) |
| reabrir / atribuir / reagendar | `reopenWorkOrder`, `assignWorkOrder` |
| lançar/remover material na OM | `addWorkOrderMaterial`, `removeWorkOrderMaterial` (baixa no estoque) |
| marcar item do checklist | `setTaskDone(tx, taskId, { done, measurementValue, notes })` |
| movimentar estoque | `moveStock`, `transferStock`, `ensureReorderRequests`, `materialForecast` — `src/server/stock.ts` |
| gerar OMs preventivas | `generateWorkOrders({ contractEquipmentIds? })` — `src/server/scheduler.ts` |
| gerar mensalidades | `generateInvoices({ contractIds? })` — `src/server/billing.ts` |
| dar baixa em conta a receber | `confirmReceivable(tx, id, {...})` (calcula multa/juros) |
| comprovante do cliente | `submitProof`, `rejectProof` |
| pagar conta a pagar | `payPayable(tx, id, {...})` (fecha comissão se for o caso) |
| fechar comissão do técnico | `closeCommissionPayout(tx, { technicianId, period })` |
| valor atualizado de conta vencida | `amountDueToday(rec)` |
| Pix copia e cola | `buildPixPayload({...})`, `txidFor(id)` — `src/lib/pix.ts` |
| previsão das próximas visitas | `upcomingVisits(anchor, intervalo, hoje, n)` e `visitIntervalMonths(tasks)` — `src/server/core/schedule.ts` |
| configurações da empresa | `getSettings()` — `src/server/settings.ts` |
| notificar usuário | `notifyUser`, `notifyTechnician`, `notifyCustomer`, `notifyStaff` |
| rótulos/cores de status | `src/lib/labels.ts` + badges de `src/components/system/status.tsx` |
| "vencido" | não é salvo: `effectiveFinanceStatus(status, dueDate, todayISO())` |

Mutação que envolve mais de uma tabela: `await db.transaction(async (tx) => { … })` e passe `tx` aos serviços.
Depois de mudar dados, `revalidatePath(...)` das telas afetadas.

Datas: sempre `todayISO()` (fuso de São Paulo) e funções de `@/lib/dates`. Exibição: `formatDate`, `formatBRL`,
`formatOM`, `formatDocument`, `formatPhone`… de `@/lib/format`.

## Formulários

Padrão: componente cliente com `useActionState(acao, initialActionState)` + Server Action que recebe `FormData`,
valida com **zod** e devolve `ActionState` (`{ ok, error, fieldErrors, message, id }`). Use `runAction(async () => …)`
para transformar erros de regra em mensagem. Helpers: `formValues(fd)` (lê string/número/dinheiro "1.234,56"),
`zodFieldErrors`, `SubmitButton`, `Field`, `FieldError`, `useActionToast`, `nativeSelectClass`, `MaskedInput`
(cpfcnpj, phone, cep, money). Ação sem formulário com confirmação: `ConfirmAction` (passe `acao.bind(null, id)`).

## Design — "gelo em movimento", com contenção

Tokens (`globals.css`): fundo `abyss`, superfícies `night`/`glacier`, primária `ice` (#38a8ff), destaque `frost`,
texto `silver`, secundário `steel`, bordas `rime`. Estados: `mint` (ok), `brass` (atenção), `gauge-red` (problema),
`violet` (agendado). Classes: `.panel` (painéis sólidos), `.glass` (vidro só em destaques, nunca em listas),
`.frost-edge`, `.text-silver-brushed` (títulos), `.readout` (números tabulares).

Tipografia: **Cinzel** (`font-display`) só para títulos de página/seção ≥ 20px e marca; **IBM Plex Sans** no resto.
Números com `tabular-nums`.

Regras:
- Movimento só para explicar mudança de estado ou responder a uma ação (abrir, confirmar, concluir).
  Telas densas (tabelas, financeiro, estoque) **não** têm efeito ambiente. `SnowField` só em telas de marca
  (login, topo do portal, estados vazios grandes). `FrostBurst` só em momentos de conclusão (OM concluída,
  pagamento confirmado). Nada de fade-in em cada seção.
- Não repetir o "kit de cards": hierarquia vem de tamanho, peso e espaço, não de caixas iguais.
  KPIs principais usam `ReadoutBand` (faixa única), não 4 cards idênticos.
- Sem rótulos em CAIXA ALTA acima de títulos, sem "→" em botões, sem strings "A · B · C".
- Textos em português do Brasil, frase com inicial maiúscula, verbos claros nos botões
  ("Salvar cliente", "Gerar OMs agora", "Confirmar pagamento"); o toast repete o verbo ("Cliente salvo").
  Erros dizem o que aconteceu e como resolver. Estado vazio convida à ação.
- Responsivo até 360px; foco visível; `prefers-reduced-motion` respeitado (já global).
- Gráficos: use `src/components/charts` (paleta categórica fixa, nunca ciclar, sem eixo duplo; legenda só com ≥ 2 séries).

## Verificação antes de terminar uma tarefa

```bash
pnpm typecheck 2>&1 | grep -E "<suas pastas>"   # zero erros nos seus arquivos
npx eslint <suas pastas>
node scripts/dev/screenshot.mjs /admin/clientes /tmp/x.png --as admin   # e --mobile; olhe a imagem
```

Acessos de demonstração (`pnpm db:seed`): admin@imperiumtec.com.br / imperium123 · financeiro@imperiumtec.com.br /
imperium123 · rafael@imperiumtec.com.br / tecnico123 · cliente@imperiumtec.com.br / cliente123.
