export type PickerProduct = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  costPrice: number;
};

export type PickerLocation = {
  id: string;
  name: string;
  type: "almoxarifado" | "veiculo";
  technicianName: string | null;
};

/** productId → locationId → saldo */
export type LevelsMap = Record<string, Record<string, number>>;

export type MovementData = {
  products: PickerProduct[];
  locations: PickerLocation[];
  levels: LevelsMap;
};
