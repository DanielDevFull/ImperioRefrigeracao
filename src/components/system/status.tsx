import {
  commissionStatus,
  contractStatus,
  equipmentStatus,
  labelOf,
  payableStatus,
  priority,
  purchaseOrderStatus,
  purchaseRequestStatus,
  receivableStatus,
  workOrderStatus,
  workOrderType,
} from "@/lib/labels";
import { ToneBadge } from "./tone-badge";

const LIVE = new Set(["em_deslocamento", "em_execucao"]);

export function WorkOrderStatusBadge({ status }: { status: string }) {
  const l = labelOf(workOrderStatus, status);
  return (
    <ToneBadge tone={l.tone} live={LIVE.has(status)}>
      {l.label}
    </ToneBadge>
  );
}

export function WorkOrderTypeBadge({ type }: { type: string }) {
  const l = labelOf(workOrderType, type);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function PriorityBadge({ value }: { value: string }) {
  const l = labelOf(priority, value);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function EquipmentStatusBadge({ status }: { status: string }) {
  const l = labelOf(equipmentStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function ContractStatusBadge({ status }: { status: string }) {
  const l = labelOf(contractStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

/** Recebe o status efetivo (use effectiveFinanceStatus para obter "vencido"). */
export function ReceivableStatusBadge({ status }: { status: string }) {
  const l = labelOf(receivableStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function PayableStatusBadge({ status }: { status: string }) {
  const l = labelOf(payableStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function CommissionStatusBadge({ status }: { status: string }) {
  const l = labelOf(commissionStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function PurchaseOrderStatusBadge({ status }: { status: string }) {
  const l = labelOf(purchaseOrderStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}

export function PurchaseRequestStatusBadge({ status }: { status: string }) {
  const l = labelOf(purchaseRequestStatus, status);
  return <ToneBadge tone={l.tone}>{l.label}</ToneBadge>;
}
