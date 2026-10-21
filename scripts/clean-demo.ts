/**
 * Remove os dados de demonstração antes de começar a usar o sistema de verdade.
 * Mantém: configurações da empresa, tipos de equipamento, planos de manutenção, produtos (com saldo zerado),
 * categorias financeiras, contas bancárias e os acessos da equipe (admin/gestor).
 * Remove: clientes, equipamentos, contratos, OMs, contas a pagar/receber, estoque, compras, fornecedores,
 * técnicos e os acessos de técnicos e clientes.
 *
 * Uso: CONFIRMAR=sim pnpm db:clean-demo
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import postgres from "postgres";

async function main() {
  if (process.env.CONFIRMAR !== "sim") {
    console.error("Isto apaga clientes, OMs e lançamentos. Rode com CONFIRMAR=sim para continuar.");
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {} });
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      TRUNCATE TABLE
        notifications, job_runs, pmoc_documents,
        commission_entries, commission_payouts,
        work_order_events, work_order_materials, work_order_photos, work_order_tasks, work_orders,
        receivables, payables,
        purchase_requests, purchase_order_items, purchase_orders,
        stock_movements, stock_levels,
        contract_equipment, contracts,
        equipment, customer_sites, customers,
        technician_absences
      RESTART IDENTITY CASCADE
    `);
    await tx.unsafe(`DELETE FROM commission_rules WHERE technician_id IS NOT NULL`);
    await tx.unsafe(`DELETE FROM stock_locations WHERE type = 'veiculo'`);
    await tx.unsafe(`UPDATE products SET preferred_supplier_id = NULL`);
    await tx.unsafe(`DELETE FROM suppliers`);
    await tx.unsafe(`DELETE FROM technicians`);
    await tx.unsafe(`DELETE FROM "user" WHERE role IN ('tecnico', 'cliente')`);
  });
  await sql.end();
  console.log("✓ Dados de demonstração removidos. Cadastre seus técnicos, clientes e contratos.");
}
main();
