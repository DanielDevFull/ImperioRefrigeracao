import type { Metadata } from "next";
import { PageHeader } from "@/components/system/page-header";
import { Panel } from "@/components/system/panel";
import { ProductForm } from "../_components/product-form";
import { listActiveLocations, listSupplierOptions } from "../_lib/queries";
import { requireStaff } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  await requireStaff();
  const [suppliers, locations] = await Promise.all([listSupplierOptions(), listActiveLocations()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo produto"
        description="Gás, peça, tubulação ou consumível. Com o estoque mínimo preenchido, a reposição passa a ser automática."
        back={{ href: "/admin/estoque", label: "Estoque" }}
      />
      <Panel>
        <ProductForm suppliers={suppliers} locations={locations} cancelHref="/admin/estoque" />
      </Panel>
    </div>
  );
}
