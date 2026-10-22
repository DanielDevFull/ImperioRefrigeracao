import { notFound } from "next/navigation";

/** Endereço inexistente dentro da área: mostra o 404 com o menu da área. */
export default function NotFoundInArea() {
  notFound();
}
