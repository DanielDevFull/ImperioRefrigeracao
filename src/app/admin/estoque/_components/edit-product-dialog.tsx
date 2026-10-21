"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "./form-dialog";
import { ProductForm, type ProductFormValues } from "./product-form";

export function EditProductDialog({
  product,
  suppliers,
}: {
  product: ProductFormValues;
  suppliers: { id: string; name: string; active: boolean }[];
}) {
  return (
    <FormDialog
      title="Editar produto"
      className="sm:max-w-2xl"
      trigger={
        <Button variant="outline">
          <Pencil />
          Editar produto
        </Button>
      }
    >
      {(close) => <ProductForm product={product} suppliers={suppliers} onDone={close} />}
    </FormDialog>
  );
}
