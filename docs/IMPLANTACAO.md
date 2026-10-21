# Implantação

O sistema roda na **Vercel** (aplicação, rotina diária e arquivos) com banco **Neon** (PostgreSQL, região São Paulo).

## 1. Banco (Neon)

Projeto criado: `imperium-tec-refrigeracao` (região `aws-sa-east-1`), banco `imperium`.

- Use a URL **pooled** (host com `-pooler`) em `DATABASE_URL` na Vercel. O código desativa prepared
  statements automaticamente quando detecta o pooler.
- Aplicar migrações a partir da sua máquina: `DATABASE_URL=<url direta> pnpm db:migrate`.
  Em redes que bloqueiam a porta 5432: `NODE_USE_ENV_PROXY=1 pnpm tsx scripts/neon-http.ts migrate`
  (usa o endpoint HTTPS do Neon e lê `.env.production.local`).
- Sempre que mudar o esquema (`src/db/schema`): `pnpm db:generate` → revise o SQL em `drizzle/` → migre.

## 2. Aplicação (Vercel)

Projeto ligado ao repositório GitHub: cada push no branch de produção publica uma nova versão.

Variáveis de ambiente (Production e Preview):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | URL pooled do Neon |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | URL pública (ex.: `https://imperium-tec.vercel.app`) |
| `NEXT_PUBLIC_APP_URL` | mesma URL pública (usada nos QR codes e links) |
| `CRON_SECRET` | segredo aleatório; a Vercel envia no cabeçalho da rotina diária |
| `BLOB_READ_WRITE_TOKEN` | criado ao conectar um Blob store ao projeto (fotos, assinaturas, comprovantes) |

`vercel.json` define a região das funções (`gru1`, São Paulo) e a rotina diária `0 9 * * *` (06:00 BRT).

## 3. Primeiro uso

1. Entre com o acesso de administrador e troque a senha em **Acessos**.
2. **Configurações**: dados da empresa, chave Pix (para o QR das mensalidades), multa/juros,
   horizonte de geração de OMs e responsável técnico do PMOC.
3. Se o banco foi populado com a demonstração, limpe antes de operar:
   `CONFIRMAR=sim DATABASE_URL=<url> pnpm db:clean-demo` (mantém configurações, planos, produtos e a equipe).
4. Cadastre técnicos (com acesso ao app e estoque do veículo), clientes, equipamentos e contratos.
   Ao salvar um contrato, as primeiras mensalidades e OMs já são geradas.

## 4. App do técnico

No celular, abra a URL do sistema, entre com o acesso do técnico e instale:
Android/Chrome → "Instalar app"; iPhone/Safari → Compartilhar → "Adicionar à Tela de Início".

## 5. Evoluções previstas

- **Gateway de pagamento** (Asaas recomendado; Efí como alternativa): assinaturas com Pix Automático,
  boleto com Pix e cartão, baixa automática por webhook. O modelo já tem `gateway_provider` / `gateway_id`
  em `receivables`; a baixa manual continua disponível.
- **NFS-e** por API (Focus NFe / PlugNotas) a partir da OM concluída ou da mensalidade paga.
- **Avisos por WhatsApp/e-mail** (lembrete de vencimento, técnico a caminho, OM concluída).
