export type ExecTask = {
  id: string;
  title: string;
  instructions: string | null;
  measurementUnit: string | null;
  measurementValue: string | null;
  requiresPhoto: boolean;
  done: boolean;
  notes: string | null;
};

export type ExecPhoto = { id: string; url: string; kind: string; taskId: string | null };

export type ExecMaterial = {
  id: string;
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  chargeCustomer: boolean;
  unitPrice: number;
};

export type CatalogItem = {
  id: string;
  name: string;
  unit: string;
  category: string;
  salePrice: number;
  sku: string | null;
  /** saldo no veículo do técnico (null = produto não está no veículo) */
  available: number | null;
};

export type ExecutionData = {
  id: string;
  number: number;
  title: string;
  status: string;
  type: string;
  priority: string;
  customerName: string;
  customerPhone: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  endTime: string | null;
  today: string;
  tasks: ExecTask[];
  photos: ExecPhoto[];
  materials: ExecMaterial[];
  catalog: CatalogItem[];
  locationName: string;
  solution: string | null;
  diagnosis: string | null;
  technicianNotes: string | null;
  signatureUrl: string | null;
  signedByName: string | null;
  finishedAt: string | null;
  commission: { amount: number; status: string } | null;
  nextId: string | null;
  /** já há outra OM minha em andamento/concluída hoje no mesmo endereço: estou no local */
  atSite: boolean;
  isPlanVisit: boolean;
};
