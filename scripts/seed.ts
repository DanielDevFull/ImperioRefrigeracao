/**
 * Dados de demonstração da Imperium Tec Refrigeração.
 * Uso: pnpm db:seed   (apaga e recria os dados de negócio; mantém o esquema)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";

async function main() {
  const { db } = await import("@/db");
  const s = await import("@/db/schema");
  const { auth } = await import("@/lib/auth");
  const { addDays, addMonths, todayISO, competenceOf, dueDateFor, addCompetence } = await import("@/lib/dates");
  const { txidFor } = await import("@/lib/pix");
  const { runDaily } = await import("@/server/daily");
  const { moveStock } = await import("@/server/stock");
  const { pickRule, computeCommission } = await import("@/server/core/commission");

  const today = todayISO();
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const int = (min: number, max: number) => Math.floor(min + rnd() * (max - min + 1));

  console.log("→ limpando dados…");
  await db.execute(sql`
    TRUNCATE TABLE
      notifications, job_runs, pmoc_documents,
      commission_entries, commission_payouts, commission_rules,
      work_order_events, work_order_materials, work_order_photos, work_order_tasks, work_orders,
      receivables, payables, bank_accounts, finance_categories,
      purchase_requests, purchase_order_items, purchase_orders,
      stock_movements, stock_levels, stock_locations,
      maintenance_plan_materials, contract_equipment, contracts, maintenance_plan_tasks, maintenance_plans,
      equipment, equipment_types, customer_sites, customers,
      technician_absences, technicians, suppliers, products, settings,
      session, account, verification, "user"
    RESTART IDENTITY CASCADE
  `);

  console.log("→ empresa…");
  await db.insert(s.settings).values({
    id: 1,
    companyName: "Imperium Tec Refrigeração",
    document: "48211903000170",
    phone: "11999990000",
    whatsapp: "11999990000",
    email: "contato@imperiumtec.com.br",
    address: "Rua das Geleiras, 1200 — Vila Mariana",
    city: "São Paulo",
    state: "SP",
    pixKey: "contato@imperiumtec.com.br",
    pixMerchantName: "Imperium Tec Refrigeracao",
    pixMerchantCity: "Sao Paulo",
    pmocResponsibleName: "Eng. Marcos Vinícius Prado",
    pmocResponsibleRegistry: "CREA-SP 5069876543",
    pmocResponsibleArt: "28027230241234567",
    workOrderHorizonDays: 30,
    invoiceLeadDays: 15,
    blockOverdueDays: 0,
  });

  console.log("→ usuários…");
  async function createUser(name: string, email: string, password: string, role: string) {
    const res = await auth.api.createUser({ body: { name, email, password, role: role as "admin" } });
    return res.user.id;
  }
  await createUser("Daniel Alves", "admin@imperiumtec.com.br", "imperium123", "admin");
  await createUser("Patrícia Moura", "financeiro@imperiumtec.com.br", "imperium123", "gestor");

  console.log("→ técnicos…");
  const techData = [
    { name: "Rafael Nogueira", email: "rafael@imperiumtec.com.br", color: "#38a8ff", skills: ["Split", "Cassete", "VRF"], plate: "FRZ-2B19" },
    { name: "Bruno Takahashi", email: "bruno@imperiumtec.com.br", color: "#3ee0b5", skills: ["Câmara fria", "Refrigeração comercial"], plate: "GLC-7A41" },
    { name: "Lucas Ferreira", email: "lucas@imperiumtec.com.br", color: "#e8b04b", skills: ["Split", "Piso-teto", "Instalação"], plate: "NVE-3C08" },
  ];
  const techs: (typeof s.technicians.$inferSelect)[] = [];
  for (const t of techData) {
    const userId = await createUser(t.name, t.email, "tecnico123", "tecnico");
    const [row] = await db
      .insert(s.technicians)
      .values({ userId, name: t.name, email: t.email, phone: `119${int(10000000, 99999999)}`, color: t.color, skills: t.skills, vehiclePlate: t.plate, admissionDate: "2024-03-01" })
      .returning();
    techs.push(row);
  }
  await db.insert(s.technicianAbsences).values({ technicianId: techs[2].id, startDate: addDays(today, 9), endDate: addDays(today, 13), reason: "Férias" });

  console.log("→ estoque…");
  const [almox] = await db.insert(s.stockLocations).values({ name: "Almoxarifado central", type: "almoxarifado" }).returning();
  const vehicles = [];
  for (const t of techs) {
    const [v] = await db.insert(s.stockLocations).values({ name: `Veículo ${t.vehiclePlate} — ${t.name.split(" ")[0]}`, type: "veiculo", technicianId: t.id }).returning();
    vehicles.push(v);
  }
  const suppliers = await db
    .insert(s.suppliers)
    .values([
      { name: "Frigelar Distribuidora", document: "12345678000190", contactName: "Sandra", phone: "1133334444", email: "vendas@frigelar.example" },
      { name: "Polo Ar Peças", document: "98765432000110", contactName: "Jorge", phone: "1155556666", email: "pedidos@poloar.example" },
      { name: "Dufrio Refrigeração", document: "45678912000133", contactName: "Aline", phone: "1177778888", email: "comercial@dufrio.example" },
    ])
    .returning();
  const productData: [string, string, string, string, number, number, number, number][] = [
    // sku, nome, categoria, unidade, custo, venda, mínimo, reposição
    ["GAS-410A", "Gás R-410A (cilindro 11,3 kg)", "gas", "kg", 58, 120, 10, 22.6],
    ["GAS-R32", "Gás R-32 (cilindro 7 kg)", "gas", "kg", 62, 130, 6, 14],
    ["GAS-R22", "Gás R-22 (cilindro 13,6 kg)", "gas", "kg", 95, 190, 4, 13.6],
    ["GAS-404A", "Gás R-404A (cilindro 10,9 kg)", "gas", "kg", 88, 175, 5, 10.9],
    ["LIMP-SERP", "Limpador de serpentina alcalino 5 L", "consumivel", "L", 14, 0, 10, 20],
    ["BACT-HIG", "Bactericida para higienização 1 L", "consumivel", "L", 22, 0, 12, 24],
    ["FILT-UNIV", "Filtro de ar universal (manta G4)", "peca", "un", 9.5, 35, 30, 60],
    ["CAP-35", "Capacitor 35+5 µF 440 V", "eletrico", "un", 28, 85, 8, 20],
    ["CAP-45", "Capacitor 45+5 µF 440 V", "eletrico", "un", 32, 95, 6, 15],
    ["CONT-30A", "Contator 30 A bobina 220 V", "eletrico", "un", 48, 140, 4, 10],
    ["SENS-TEMP", "Sensor de temperatura 10K", "peca", "un", 12, 60, 10, 20],
    ["TUBO-14", "Tubo de cobre 1/4\" (rolo 15 m)", "tubulacao", "m", 11, 28, 30, 45],
    ["TUBO-38", "Tubo de cobre 3/8\" (rolo 15 m)", "tubulacao", "m", 16, 38, 30, 45],
    ["ISOL-38", "Isolante térmico 3/8\" (barra 2 m)", "tubulacao", "un", 4.5, 12, 40, 80],
    ["FITA-PVC", "Fita PVC branca para acabamento", "consumivel", "un", 3.2, 0, 20, 40],
    ["DRENO-B", "Bomba de dreno compacta", "peca", "un", 145, 320, 2, 5],
    ["MANG-DR", "Mangueira de dreno cristal 3/4\"", "consumivel", "m", 2.8, 8, 30, 50],
    ["VALV-SCH", "Válvula Schrader 1/4\"", "peca", "un", 6, 25, 15, 30],
    ["FILT-SEC", "Filtro secador 1/4\"", "peca", "un", 18, 55, 8, 15],
    ["VENT-MOT", "Motor ventilador condensadora 1/6 cv", "peca", "un", 210, 450, 2, 4],
    ["NITRO", "Nitrogênio (recarga cilindro)", "gas", "un", 140, 0, 1, 2],
    ["SUPORTE-C", "Suporte para condensadora 500 mm", "peca", "un", 38, 95, 6, 12],
  ];
  const prods: (typeof s.products.$inferSelect)[] = [];
  for (const [sku, name, category, unit, cost, sale, min, reorder] of productData) {
    const [p] = await db
      .insert(s.products)
      .values({ sku, name, category, unit, costPrice: cost, salePrice: sale, minStock: min, reorderQty: reorder, preferredSupplierId: pick(suppliers).id })
      .returning();
    prods.push(p);
    const initial = Math.round((min * (0.6 + rnd() * 1.6)) * 10) / 10;
    await moveStock(db, { productId: p.id, locationId: almox.id, type: "entrada", quantity: initial, unitCost: cost, notes: "Saldo inicial" });
    if (["gas", "consumivel", "peca"].includes(category) && rnd() > 0.4) {
      for (const v of vehicles) {
        await moveStock(db, { productId: p.id, locationId: v.id, type: "entrada", quantity: Math.max(1, Math.round(min / 4)), unitCost: cost, notes: "Kit do veículo" });
      }
    }
  }
  const P = (sku: string) => prods.find((p) => p.sku === sku)!;

  console.log("→ tipos de equipamento e planos…");
  const typeRows = await db
    .insert(s.equipmentTypes)
    .values([
      { name: "Split hi-wall", category: "climatizacao", icon: "air-vent" },
      { name: "Cassete", category: "climatizacao", icon: "square-dashed" },
      { name: "Piso-teto", category: "climatizacao", icon: "panel-top" },
      { name: "Janela", category: "climatizacao", icon: "app-window" },
      { name: "Multi-split", category: "climatizacao", icon: "network" },
      { name: "VRF / VRV", category: "climatizacao", icon: "server" },
      { name: "Self-contained", category: "climatizacao", icon: "box" },
      { name: "Câmara fria", category: "refrigeracao_comercial", icon: "warehouse" },
      { name: "Balcão refrigerado", category: "refrigeracao_comercial", icon: "refrigerator" },
      { name: "Bebedouro", category: "refrigeracao_comercial", icon: "glass-water" },
      { name: "Freezer comercial", category: "refrigeracao_comercial", icon: "snowflake" },
    ])
    .returning();
  const T = (name: string) => typeRows.find((t) => t.name === name)!;

  async function plan(
    name: string,
    opts: { description: string; type?: string; isPmoc?: boolean; minutes: number; ref: number },
    tasks: [string, number, string | null, boolean, string?][],
    materials: [string, number][],
  ) {
    const [p] = await db
      .insert(s.maintenancePlans)
      .values({ name, description: opts.description, equipmentTypeId: opts.type ? T(opts.type).id : null, isPmoc: opts.isPmoc ?? false, estimatedMinutes: opts.minutes, visitReferenceValue: opts.ref })
      .returning();
    await db.insert(s.maintenancePlanTasks).values(
      tasks.map(([title, freq, unit, photo, instructions], i) => ({ planId: p.id, position: i, title, frequencyMonths: freq, measurementUnit: unit, requiresPhoto: photo, instructions: instructions ?? null })),
    );
    if (materials.length) {
      await db.insert(s.maintenancePlanMaterials).values(materials.map(([sku, q]) => ({ planId: p.id, productId: P(sku).id, quantity: q })));
    }
    return p;
  }

  const planSplitRes = await plan(
    "Preventiva split residencial",
    { description: "Visita trimestral com limpeza completa semestral.", type: "Split hi-wall", minutes: 60, ref: 120 },
    [
      ["Limpeza dos filtros de ar", 3, null, true, "Lavar com água corrente e secar à sombra."],
      ["Verificação do dreno e bandeja", 3, null, false],
      ["Medição da corrente do compressor", 3, "A", false],
      ["Temperatura de insuflamento", 3, "°C", false],
      ["Limpeza da serpentina evaporadora", 6, null, true, "Aplicar limpador alcalino e enxaguar."],
      ["Higienização com bactericida", 6, null, false],
      ["Limpeza da condensadora e verificação de vibração", 6, null, true],
      ["Pressão de sucção", 12, "psi", false],
    ],
    [["LIMP-SERP", 0.3], ["BACT-HIG", 0.2]],
  );
  const planPmoc = await plan(
    "PMOC — climatização comercial",
    { description: "Rotina mensal conforme Portaria MS 3.523/98 e NBR 13971.", type: "Split hi-wall", isPmoc: true, minutes: 90, ref: 160 },
    [
      ["Limpeza e inspeção dos filtros", 1, null, true],
      ["Verificação de dreno, bandeja e sifão", 1, null, false],
      ["Corrente elétrica do compressor", 1, "A", false],
      ["Temperatura de insuflamento", 1, "°C", false],
      ["Temperatura de retorno", 1, "°C", false],
      ["Limpeza da serpentina evaporadora", 3, null, true],
      ["Higienização com bactericida", 3, null, false],
      ["Pressão de sucção e descarga", 3, "psi", false],
      ["Limpeza da condensadora", 6, null, true],
      ["Reaperto de bornes e conexões elétricas", 6, null, false],
      ["Análise da qualidade do ar (relatório anual)", 12, null, false],
    ],
    [["FILT-UNIV", 1], ["LIMP-SERP", 0.2], ["BACT-HIG", 0.15]],
  );
  const planCold = await plan(
    "Câmara fria — preventiva mensal",
    { description: "Rotina mensal para câmaras de resfriados e congelados.", type: "Câmara fria", minutes: 120, ref: 220 },
    [
      ["Temperatura interna da câmara", 1, "°C", false],
      ["Inspeção de vedação e gaxetas da porta", 1, null, true],
      ["Verificação do degelo e resistências", 1, null, false],
      ["Pressão de sucção", 1, "psi", false],
      ["Corrente do compressor", 1, "A", false],
      ["Limpeza do condensador", 2, null, true],
      ["Limpeza do evaporador e bandeja", 3, null, true],
      ["Teste de alarme e termostato", 3, null, false],
    ],
    [["LIMP-SERP", 0.5]],
  );
  const planCassette = await plan(
    "Preventiva cassete / piso-teto",
    { description: "Visita bimestral para equipamentos de teto.", type: "Cassete", minutes: 75, ref: 150 },
    [
      ["Limpeza dos filtros", 2, null, true],
      ["Teste da bomba de dreno", 2, null, false],
      ["Corrente do compressor", 2, "A", false],
      ["Higienização da serpentina e bandeja", 4, null, true],
      ["Limpeza da condensadora", 6, null, false],
    ],
    [["LIMP-SERP", 0.3], ["BACT-HIG", 0.2]],
  );

  console.log("→ clientes, locais e equipamentos…");
  const brands = ["Daikin", "LG", "Samsung", "Midea", "Fujitsu", "Gree", "Carrier", "Elgin", "Springer"];
  const districts = [
    ["Vila Mariana", "04101-000"], ["Moema", "04077-000"], ["Pinheiros", "05422-000"], ["Tatuapé", "03310-000"],
    ["Santana", "02012-000"], ["Itaim Bibi", "04532-000"], ["Lapa", "05065-000"], ["Ipiranga", "04210-000"],
  ];
  const streets = ["Rua Domingos de Morais", "Av. Ibirapuera", "Rua dos Pinheiros", "Rua Tuiuti", "Rua Voluntários da Pátria", "Rua Joaquim Floriano", "Rua Clélia", "Rua Bom Pastor"];

  type Cust = { name: string; trade?: string; pj: boolean; plan: string; units: [string, number][]; amount: number; billingDay: number; tech: number; months: number; portal?: string };
  const customerData: Cust[] = [
    { name: "Clínica Odontológica Sorriso Pleno Ltda", trade: "Sorriso Pleno", pj: true, plan: "pmoc", units: [["Split hi-wall", 4], ["Cassete", 1]], amount: 690, billingDay: 10, tech: 0, months: 14, portal: "clinica@sorrisopleno.example" },
    { name: "Restaurante Fogo de Chão Paulista Ltda", trade: "Brasa Paulista", pj: true, plan: "cold", units: [["Câmara fria", 2], ["Split hi-wall", 2]], amount: 980, billingDay: 5, tech: 1, months: 9 },
    { name: "Escritório Andrade & Lima Advogados", trade: "Andrade & Lima", pj: true, plan: "pmoc", units: [["Split hi-wall", 6]], amount: 760, billingDay: 15, tech: 0, months: 20 },
    { name: "Mercado Bom Preço Tatuapé Ltda", trade: "Mercado Bom Preço", pj: true, plan: "cold", units: [["Câmara fria", 1], ["Balcão refrigerado", 3]], amount: 1150, billingDay: 10, tech: 1, months: 6 },
    { name: "Academia Pulso Fitness", trade: "Pulso Fitness", pj: true, plan: "cassette", units: [["Cassete", 3], ["Piso-teto", 2]], amount: 720, billingDay: 20, tech: 2, months: 11 },
    { name: "Juliana Castro Mendes", pj: false, plan: "split", units: [["Split hi-wall", 3]], amount: 149.9, billingDay: 10, tech: 2, months: 8, portal: "cliente@imperiumtec.com.br" },
    { name: "Fernando Albuquerque", pj: false, plan: "split", units: [["Split hi-wall", 2]], amount: 119.9, billingDay: 5, tech: 0, months: 15 },
    { name: "Hotel Estação Lapa Ltda", trade: "Hotel Estação", pj: true, plan: "pmoc", units: [["Split hi-wall", 8], ["VRF / VRV", 1]], amount: 1890, billingDay: 1, tech: 0, months: 26 },
    { name: "Padaria Pão Dourado ME", trade: "Pão Dourado", pj: true, plan: "cold", units: [["Câmara fria", 1], ["Freezer comercial", 2]], amount: 640, billingDay: 15, tech: 1, months: 4 },
    { name: "Renata e Paulo Siqueira", pj: false, plan: "split", units: [["Split hi-wall", 4]], amount: 179.9, billingDay: 20, tech: 2, months: 3 },
    { name: "Coworking Órbita Pinheiros", trade: "Órbita", pj: true, plan: "cassette", units: [["Cassete", 4]], amount: 610, billingDay: 25, tech: 0, months: 7 },
    { name: "Laboratório Vida Análises Clínicas", trade: "Vida Análises", pj: true, plan: "pmoc", units: [["Split hi-wall", 5], ["Self-contained", 1]], amount: 1240, billingDay: 10, tech: 0, months: 18 },
  ];
  const planBy: Record<string, typeof planSplitRes> = { pmoc: planPmoc, cold: planCold, split: planSplitRes, cassette: planCassette };
  const rooms = ["Recepção", "Sala 1", "Sala 2", "Diretoria", "Sala de reunião", "Consultório A", "Consultório B", "Salão", "Cozinha", "Estoque", "Quarto casal", "Sala de estar", "Escritório", "Quarto 1", "Laboratório", "Copa"];

  const createdContracts: { id: string; customerId: string; startDate: string; billingDay: number; amount: number; name: string }[] = [];
  let ci = 0;
  for (const c of customerData) {
    ci++;
    const [d, cep] = districts[ci % districts.length];
    const [cust] = await db
      .insert(s.customers)
      .values({
        personType: c.pj ? "pj" : "pf",
        name: c.name,
        tradeName: c.trade ?? null,
        document: c.pj ? `${int(10, 99)}${int(100, 999)}${int(100, 999)}0001${int(10, 99)}` : `${int(100, 999)}${int(100, 999)}${int(100, 999)}${int(10, 99)}`,
        email: c.portal ?? `contato${ci}@cliente.example`,
        phone: `119${int(10000000, 99999999)}`,
        whatsapp: `119${int(10000000, 99999999)}`,
        defaultTechnicianId: techs[c.tech].id,
      })
      .returning();
    if (c.portal) {
      const userId = await createUser(c.trade ?? c.name, c.portal, "cliente123", "cliente");
      await db.update(s.customers).set({ userId }).where(sql`${s.customers.id} = ${cust.id}`);
    }
    const [site] = await db
      .insert(s.customerSites)
      .values({
        customerId: cust.id,
        name: c.pj ? "Matriz" : "Residência",
        zip: cep,
        street: streets[ci % streets.length],
        number: String(int(80, 2400)),
        district: d,
        city: "São Paulo",
        state: "SP",
        isPrimary: true,
        areaM2: c.pj ? int(120, 900) : null,
        occupants: c.pj ? int(8, 80) : null,
        accessNotes: c.pj ? "Procurar a recepção; acesso à cobertura pela escada de serviço." : null,
      })
      .returning();

    const startDate = addMonths(today, -c.months, 1).slice(0, 8) + String(int(1, 26)).padStart(2, "0");
    const p = planBy[c.plan];
    const [contract] = await db
      .insert(s.contracts)
      .values({
        customerId: cust.id,
        name: `${c.plan === "pmoc" ? "Plano Imperial PMOC" : c.plan === "cold" ? "Plano Glacial Comercial" : c.plan === "cassette" ? "Plano Aurora" : "Plano Neve"} — ${c.units.reduce((n, u) => n + u[1], 0)} aparelhos`,
        monthlyAmount: c.amount,
        billingDay: c.billingDay,
        startDate,
      })
      .returning();
    createdContracts.push({ id: contract.id, customerId: cust.id, startDate, billingDay: c.billingDay, amount: c.amount, name: contract.name });

    let r = 0;
    for (const [typeName, count] of c.units) {
      for (let k = 0; k < count; k++) {
        const isCold = ["Câmara fria", "Balcão refrigerado", "Freezer comercial"].includes(typeName);
        const [eqp] = await db
          .insert(s.equipment)
          .values({
            customerId: cust.id,
            siteId: site.id,
            typeId: T(typeName).id,
            brand: isCold ? pick(["Elgin", "Bitzer", "Danfoss", "Gelopar", "Metalfrio"]) : pick(brands),
            model: isCold ? `UC-${int(100, 900)}` : `${pick(["Inverter", "Eco", "Ultra", "Smart"])} ${pick([9, 12, 18, 24, 30])}K`,
            serialNumber: `SN${int(100000, 999999)}${String.fromCharCode(65 + int(0, 25))}`,
            capacityBtu: isCold ? null : pick([9000, 12000, 12000, 18000, 24000, 30000, 36000]),
            refrigerant: isCold ? pick(["R-404A", "R-134a", "R-290"]) : pick(["R-410A", "R-410A", "R-32", "R-22"]),
            voltage: pick(["220 V", "220 V", "380 V"]),
            location: isCold ? `${typeName} ${k + 1}` : rooms[(r + ci) % rooms.length],
            installDate: addMonths(startDate, -int(6, 48)),
            warrantyUntil: rnd() > 0.7 ? addMonths(today, int(1, 18)) : null,
            qrToken: nanoid(12),
          })
          .returning();
        r++;
        const planForEq = typeName === "Cassete" || typeName === "Piso-teto" ? planCassette : isCold ? planCold : p;
        // âncora: dia do contrato, deslocada para espalhar as visitas no mês
        const anchor = addDays(startDate, int(0, 20));
        await db.insert(s.contractEquipment).values({
          contractId: contract.id,
          equipmentId: eqp.id,
          maintenancePlanId: planForEq.id,
          anchorDate: anchor,
          preferredTechnicianId: techs[c.tech].id,
          // simula que o histórico até ontem já foi gerado
          lastGeneratedDueDate: addDays(today, -1),
        });
      }
    }
  }

  // Um cliente avulso (sem contrato) com chamado corretivo
  const [avulso] = await db
    .insert(s.customers)
    .values({ personType: "pf", name: "Marcelo Antunes", email: "marcelo@cliente.example", phone: "11988887777", whatsapp: "11988887777" })
    .returning();
  const [avSite] = await db.insert(s.customerSites).values({ customerId: avulso.id, name: "Apartamento", street: "Rua Afonso Celso", number: "540", complement: "ap. 82", district: "Vila Mariana", city: "São Paulo", state: "SP", zip: "04119-000", isPrimary: true }).returning();
  const [avEq] = await db.insert(s.equipment).values({ customerId: avulso.id, siteId: avSite.id, typeId: T("Split hi-wall").id, brand: "LG", model: "Dual Inverter 12K", capacityBtu: 12000, refrigerant: "R-410A", voltage: "220 V", location: "Quarto casal", installDate: "2022-11-10", qrToken: nanoid(12) }).returning();

  console.log("→ financeiro…");
  const cats = await db
    .insert(s.financeCategories)
    .values([
      { name: "Mensalidades", type: "receita", color: "#38a8ff" },
      { name: "Serviços avulsos", type: "receita", color: "#3ee0b5" },
      { name: "Instalações", type: "receita", color: "#9b8cff" },
      { name: "Fornecedores / peças", type: "despesa", color: "#e8b04b" },
      { name: "Combustível", type: "despesa", color: "#ff5a6e" },
      { name: "Salários", type: "despesa", color: "#8da2bf" },
      { name: "Comissões", type: "despesa", color: "#9b8cff" },
      { name: "Aluguel", type: "despesa", color: "#b8e3ff" },
      { name: "Impostos", type: "despesa", color: "#e8b04b" },
      { name: "Ferramentas e EPI", type: "despesa", color: "#3ee0b5" },
    ])
    .returning();
  const C = (n: string) => cats.find((c) => c.name === n)!.id;
  const [bank] = await db.insert(s.bankAccounts).values([{ name: "Conta PJ — Banco Inter", initialBalance: 26000 }, { name: "Caixa", initialBalance: 600 }]).returning();

  // Mensalidades dos últimos 6 meses (a maioria paga; algumas em atraso)
  for (const ct of createdContracts) {
    for (let m = 6; m >= 1; m--) {
      const comp = addCompetence(competenceOf(today), -m);
      const due = dueDateFor(comp, ct.billingDay);
      if (due < ct.startDate) continue;
      const late = m === 1 && rnd() < 0.25;
      const [rec] = await db
        .insert(s.receivables)
        .values({
          customerId: ct.customerId,
          contractId: ct.id,
          categoryId: C("Mensalidades"),
          kind: "mensalidade",
          description: `Mensalidade ${ct.name} — ${comp}`,
          competence: comp,
          dueDate: due,
          amount: ct.amount,
          status: late ? "aberto" : "pago",
          paidAmount: late ? null : ct.amount,
          paidAt: late ? null : new Date(`${addDays(due, int(-3, 2))}T14:00:00-03:00`),
          paymentMethod: late ? null : pick(["pix", "pix", "pix", "boleto", "transferencia"] as const),
          bankAccountId: late ? null : bank.id,
        })
        .returning();
      await db.update(s.receivables).set({ pixTxid: txidFor(rec.id), description: `Mensalidade ${ct.name} — ${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${comp}-15T12:00:00Z`))}` }).where(sql`${s.receivables.id} = ${rec.id}`);
    }
  }

  // Despesas recorrentes dos últimos 6 meses + próximas
  for (let m = 5; m >= -1; m--) {
    const comp = addCompetence(competenceOf(today), -m);
    const paid = m >= 1;
    const rows = [
      { description: `Aluguel do galpão — ${comp}`, categoryId: C("Aluguel"), dueDate: dueDateFor(comp, 5), amount: 1800 },
      { description: `Folha de pagamento — ${comp}`, categoryId: C("Salários"), dueDate: dueDateFor(comp, 5), amount: 6900 },
      { description: `Combustível frota — ${comp}`, categoryId: C("Combustível"), dueDate: dueDateFor(comp, 20), amount: 1150 + int(-150, 250) },
      { description: `DAS Simples Nacional — ${comp}`, categoryId: C("Impostos"), dueDate: dueDateFor(comp, 20), amount: 880 + int(-100, 150) },
      { description: `Compra de peças — ${comp}`, categoryId: C("Fornecedores / peças"), dueDate: dueDateFor(comp, 12), amount: 1300 + int(-300, 500), supplierId: pick(suppliers).id },
    ];
    for (const r of rows) {
      await db.insert(s.payables).values({
        ...r,
        status: paid || r.dueDate < today ? "pago" : "aberto",
        paidAmount: paid || r.dueDate < today ? r.amount : null,
        paidAt: paid || r.dueDate < today ? new Date(`${r.dueDate}T10:00:00-03:00`) : null,
        paymentMethod: paid || r.dueDate < today ? "transferencia" : null,
        bankAccountId: paid || r.dueDate < today ? bank.id : null,
      });
    }
  }

  console.log("→ pedidos de compra…");
  {
    const [po1] = await db
      .insert(s.purchaseOrders)
      .values({ supplierId: suppliers[0].id, status: "recebido", orderDate: addDays(today, -24), expectedDate: addDays(today, -20), receivedAt: new Date(`${addDays(today, -19)}T15:00:00-03:00`), locationId: almox.id, freight: 45, notes: "Reposição mensal de gás e filtros." })
      .returning();
    const items1: [string, number][] = [["GAS-410A", 11.3], ["FILT-UNIV", 40], ["LIMP-SERP", 20]];
    let total1 = 0;
    for (const [sku, q] of items1) {
      const p = P(sku);
      await db.insert(s.purchaseOrderItems).values({ purchaseOrderId: po1.id, productId: p.id, quantity: q, unitCost: p.costPrice, receivedQuantity: q });
      await moveStock(db, { productId: p.id, locationId: almox.id, type: "entrada", quantity: q, unitCost: p.costPrice, purchaseOrderId: po1.id, notes: "PC-00001" });
      total1 += q * p.costPrice;
    }
    const [pay1] = await db
      .insert(s.payables)
      .values({ supplierId: suppliers[0].id, categoryId: C("Fornecedores / peças"), description: "Pedido PC-00001 — Frigelar Distribuidora", documentNumber: "NF 41.552", dueDate: addDays(today, 9), amount: Math.round((total1 + 45) * 100) / 100, purchaseOrderId: po1.id })
      .returning();
    await db.update(s.purchaseOrders).set({ total: Math.round(total1 * 100) / 100, payableId: pay1.id }).where(sql`${s.purchaseOrders.id} = ${po1.id}`);

    const [po2] = await db
      .insert(s.purchaseOrders)
      .values({ supplierId: suppliers[1].id, status: "enviado", orderDate: addDays(today, -2), expectedDate: addDays(today, 3), locationId: almox.id, notes: "Capacitores e contatores para corretivas." })
      .returning();
    let total2 = 0;
    for (const [sku, q] of [["CAP-35", 12], ["CAP-45", 8], ["CONT-30A", 6]] as [string, number][]) {
      const p = P(sku);
      await db.insert(s.purchaseOrderItems).values({ purchaseOrderId: po2.id, productId: p.id, quantity: q, unitCost: p.costPrice });
      total2 += q * p.costPrice;
    }
    await db.update(s.purchaseOrders).set({ total: Math.round(total2 * 100) / 100 }).where(sql`${s.purchaseOrders.id} = ${po2.id}`);
  }

  console.log("→ comissões e histórico de OMs…");
  await db.insert(s.commissionRules).values([
    { name: "Padrão — 8% da mão de obra", basis: "percentual_mao_de_obra", rate: 8 },
    { name: "Corretivas — 12% do total", workOrderType: "corretiva", basis: "percentual_total", rate: 12 },
    { name: "Instalações — R$ 90 por OM", workOrderType: "instalacao", basis: "fixo_por_om", rate: 90 },
    { name: "Bruno — câmaras frias 10%", technicianId: techs[1].id, basis: "percentual_mao_de_obra", rate: 10, priority: 1 },
  ]);
  const rules = await db.query.commissionRules.findMany();

  // OMs concluídas nos últimos 6 meses (histórico para painéis)
  const ces = await db.query.contractEquipment.findMany({ with: { equipment: true, plan: { with: { tasks: true } }, contract: true } });
  for (let m = 6; m >= 0; m--) {
    const monthStart = `${addCompetence(competenceOf(today), -m)}-01`;
    const sample = ces.filter(() => rnd() < 0.55);
    for (const ce of sample) {
      const day = addDays(monthStart, int(0, 26));
      if (day >= addDays(today, -1) || day < ce.contract.startDate) continue;
      const tech = techs.find((t) => t.id === ce.preferredTechnicianId) ?? techs[0];
      const startedAt = new Date(`${day}T${String(int(8, 15)).padStart(2, "0")}:${String(int(0, 59)).padStart(2, "0")}:00-03:00`);
      const finishedAt = new Date(startedAt.getTime() + int(40, 140) * 60000);
      const [wo] = await db
        .insert(s.workOrders)
        .values({
          type: ce.plan.isPmoc ? "pmoc" : "preventiva",
          origin: "automatica",
          status: "concluida",
          customerId: ce.contract.customerId,
          siteId: ce.equipment.siteId,
          equipmentId: ce.equipmentId,
          contractEquipmentId: ce.id,
          maintenancePlanId: ce.maintenancePlanId,
          technicianId: tech.id,
          dueDate: day,
          scheduledDate: day,
          title: `${ce.plan.name} · ${ce.equipment.location ?? "equipamento"}`,
          startedAt,
          finishedAt,
          travelStartedAt: new Date(startedAt.getTime() - int(15, 40) * 60000),
          laborAmount: ce.plan.visitReferenceValue,
          signedByName: "Responsável no local",
          solution: "Rotina preventiva executada conforme plano. Equipamento operando normalmente.",
          rating: rnd() > 0.3 ? pick([5, 5, 5, 4, 4, 3]) : null,
        })
        .onConflictDoNothing()
        .returning();
      if (!wo) continue;
      await db.insert(s.workOrderTasks).values(
        ce.plan.tasks.slice(0, 5).map((t, i) => ({ workOrderId: wo.id, planTaskId: t.id, position: i, title: t.title, measurementUnit: t.measurementUnit, measurementValue: t.measurementUnit === "A" ? String(int(4, 12)) : t.measurementUnit === "°C" ? String(int(8, 14)) : t.measurementUnit === "psi" ? String(int(110, 140)) : null, done: true, doneAt: finishedAt })),
      );
      await db.insert(s.workOrderEvents).values([
        { workOrderId: wo.id, kind: "created", toStatus: "agendada", message: "Gerada automaticamente pelo plano de manutenção.", createdAt: new Date(startedAt.getTime() - 86400000 * 10) },
        { workOrderId: wo.id, kind: "status", fromStatus: "em_execucao", toStatus: "concluida", message: "OM concluída.", createdAt: finishedAt },
      ]);
      const rule = pickRule(rules, tech.id, wo.type);
      if (rule) {
        const { base, amount } = computeCommission(rule, { labor: wo.laborAmount, materialsCharged: 0 });
        const period = competenceOf(day);
        await db.insert(s.commissionEntries).values({ technicianId: tech.id, workOrderId: wo.id, ruleId: rule.id, basis: rule.basis, baseAmount: base, rate: rule.rate, amount, period, status: m >= 2 ? "paga" : "aprovada" });
      }
    }
  }

  // Corretivas e instalações avulsas concluídas e cobradas (fora da cobertura dos contratos)
  const allCustomers = await db.query.customers.findMany({ with: { equipment: true } });
  const withEquipment = allCustomers.filter((c) => c.equipment.length > 0);
  for (let i = 0; i < 34; i++) {
    const day = addDays(today, -int(3, 175));
    const tech = pick(techs);
    const labor = pick([180, 220, 250, 320, 450, 650, 890]);
    const cust = i < 8 ? { id: avulso.id, equipment: [avEq] } : pick(withEquipment);
    const eqp = pick(cust.equipment);
    const [wo] = await db
      .insert(s.workOrders)
      .values({
        type: pick(["corretiva", "corretiva", "instalacao"] as const),
        origin: "manual",
        status: "concluida",
        customerId: cust.id,
        siteId: eqp.siteId,
        equipmentId: eqp.id,
        technicianId: tech.id,
        scheduledDate: day,
        title: pick(["Aparelho não gela", "Vazamento de água na evaporadora", "Ruído na condensadora", "Instalação de split 12.000 BTU/h"]),
        startedAt: new Date(`${day}T10:00:00-03:00`),
        finishedAt: new Date(`${day}T12:10:00-03:00`),
        laborAmount: labor,
        totalAmount: labor,
        billable: true,
        solution: "Diagnóstico e correção realizados; teste de funcionamento aprovado.",
      })
      .returning();
    const [rec] = await db.insert(s.receivables).values({ customerId: cust.id, workOrderId: wo.id, categoryId: C("Serviços avulsos"), kind: "servico", description: `OM-${String(wo.number).padStart(6, "0")} — ${wo.title}`, dueDate: addDays(day, 5), amount: labor, status: "pago", paidAmount: labor, paidAt: new Date(`${addDays(day, 2)}T10:00:00-03:00`), paymentMethod: "pix", bankAccountId: bank.id }).returning();
    await db.update(s.workOrders).set({ receivableId: rec.id }).where(sql`${s.workOrders.id} = ${wo.id}`);
    const rule = pickRule(rules, tech.id, wo.type);
    if (rule) {
      const { base, amount } = computeCommission(rule, { labor, materialsCharged: 0 });
      await db.insert(s.commissionEntries).values({ technicianId: tech.id, workOrderId: wo.id, ruleId: rule.id, basis: rule.basis, baseAmount: base, rate: rule.rate, amount, period: competenceOf(day), status: "aprovada" });
    }
  }

  // Chamado aberto pelo portal (aguardando triagem)
  await db.insert(s.workOrders).values({
    type: "corretiva",
    origin: "portal_cliente",
    status: "aberta",
    priority: "alta",
    customerId: avulso.id,
    siteId: avSite.id,
    equipmentId: avEq.id,
    title: "Ar-condicionado pingando na parede",
    description: "Desde ontem o aparelho do quarto está pingando água na parede quando liga no frio.",
  });

  // PMOC vigente para clientes com plano PMOC
  const pmocCustomers = await db.query.customers.findMany({ with: { sites: true, contracts: true } });
  for (const c of pmocCustomers) {
    if (!c.contracts.some((ct) => ct.name.includes("PMOC"))) continue;
    await db.insert(s.pmocDocuments).values({
      customerId: c.id,
      siteId: c.sites[0]?.id ?? null,
      responsibleName: "Eng. Marcos Vinícius Prado",
      responsibleRegistry: "CREA-SP 5069876543",
      artNumber: `2802723024${int(1000000, 9999999)}`,
      validFrom: addMonths(today, -int(1, 10)),
      validUntil: addMonths(today, int(1, 11)),
    });
  }

  console.log("→ rodando a rotina diária (OMs e mensalidades)…");
  const summary = await runDaily("seed");
  console.log(summary);

  // Mensalidades já vencidas: a maioria foi paga em dia; algumas ficam em atraso (e a da cliente do portal, para a demonstração do Pix)
  const portalCustomer = await db.query.customers.findFirst({ where: sql`${s.customers.email} = 'cliente@imperiumtec.com.br'` });
  const dueNow = await db.query.receivables.findMany({
    where: sql`${s.receivables.kind} = 'mensalidade' and ${s.receivables.status} = 'aberto' and ${s.receivables.dueDate} < ${today}`,
    orderBy: (r, { asc }) => [asc(r.dueDate)],
  });
  for (const [i, r] of dueNow.entries()) {
    if (r.customerId === portalCustomer?.id || i % 6 === 5) continue;
    await db
      .update(s.receivables)
      .set({ status: "pago", paidAmount: r.amount, paidAt: new Date(`${addDays(r.dueDate, -int(0, 3))}T11:00:00-03:00`), paymentMethod: pick(["pix", "pix", "boleto", "transferencia"] as const), bankAccountId: bank.id })
      .where(sql`${s.receivables.id} = ${r.id}`);
  }

  // Algumas OMs de hoje já em andamento para o app do técnico ficar vivo
  const todays = await db.query.workOrders.findMany({ where: sql`${s.workOrders.status} = 'agendada' and ${s.workOrders.scheduledDate} <= ${addDays(today, 2)}` , limit: 6 });
  for (const [i, wo] of todays.entries()) {
    await db.update(s.workOrders).set({ scheduledDate: today, scheduledTime: `${String(8 + i * 2).padStart(2, "0")}:00` }).where(sql`${s.workOrders.id} = ${wo.id}`);
  }

  console.log("\n✓ Pronto. Acessos de demonstração:");
  console.log("  Admin ........ admin@imperiumtec.com.br / imperium123");
  console.log("  Financeiro ... financeiro@imperiumtec.com.br / imperium123");
  console.log("  Técnico ...... rafael@imperiumtec.com.br / tecnico123");
  console.log("  Cliente ...... cliente@imperiumtec.com.br / cliente123");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
