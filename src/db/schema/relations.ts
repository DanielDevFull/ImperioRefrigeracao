import { relations } from "drizzle-orm";
import { user } from "./auth";
import { customerSites, customers, equipment, equipmentTypes } from "./customers";
import { bankAccounts, financeCategories, payables, receivables } from "./finance";
import {
  products,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequests,
  stockLevels,
  stockLocations,
  stockMovements,
  suppliers,
} from "./inventory";
import {
  contractEquipment,
  contracts,
  maintenancePlanMaterials,
  maintenancePlanTasks,
  maintenancePlans,
} from "./maintenance";
import { notifications, pmocDocuments } from "./system";
import {
  commissionEntries,
  commissionPayouts,
  commissionRules,
  technicianAbsences,
  technicians,
} from "./team";
import {
  workOrderEvents,
  workOrderMaterials,
  workOrderPhotos,
  workOrderTasks,
  workOrders,
} from "./work-orders";

export const userRelations = relations(user, ({ one, many }) => ({
  technician: one(technicians, { fields: [user.id], references: [technicians.userId] }),
  customer: one(customers, { fields: [user.id], references: [customers.userId] }),
  notifications: many(notifications),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(user, { fields: [customers.userId], references: [user.id] }),
  defaultTechnician: one(technicians, {
    fields: [customers.defaultTechnicianId],
    references: [technicians.id],
  }),
  sites: many(customerSites),
  equipment: many(equipment),
  contracts: many(contracts),
  workOrders: many(workOrders),
  receivables: many(receivables),
  pmocDocuments: many(pmocDocuments),
}));

export const customerSitesRelations = relations(customerSites, ({ one, many }) => ({
  customer: one(customers, { fields: [customerSites.customerId], references: [customers.id] }),
  equipment: many(equipment),
}));

export const equipmentTypesRelations = relations(equipmentTypes, ({ many }) => ({
  equipment: many(equipment),
  plans: many(maintenancePlans),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  customer: one(customers, { fields: [equipment.customerId], references: [customers.id] }),
  site: one(customerSites, { fields: [equipment.siteId], references: [customerSites.id] }),
  type: one(equipmentTypes, { fields: [equipment.typeId], references: [equipmentTypes.id] }),
  contractLinks: many(contractEquipment),
  workOrders: many(workOrders),
}));

export const maintenancePlansRelations = relations(maintenancePlans, ({ one, many }) => ({
  equipmentType: one(equipmentTypes, {
    fields: [maintenancePlans.equipmentTypeId],
    references: [equipmentTypes.id],
  }),
  tasks: many(maintenancePlanTasks),
  materials: many(maintenancePlanMaterials),
}));

export const maintenancePlanTasksRelations = relations(maintenancePlanTasks, ({ one }) => ({
  plan: one(maintenancePlans, {
    fields: [maintenancePlanTasks.planId],
    references: [maintenancePlans.id],
  }),
}));

export const maintenancePlanMaterialsRelations = relations(maintenancePlanMaterials, ({ one }) => ({
  plan: one(maintenancePlans, {
    fields: [maintenancePlanMaterials.planId],
    references: [maintenancePlans.id],
  }),
  product: one(products, {
    fields: [maintenancePlanMaterials.productId],
    references: [products.id],
  }),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  customer: one(customers, { fields: [contracts.customerId], references: [customers.id] }),
  items: many(contractEquipment),
  receivables: many(receivables),
}));

export const contractEquipmentRelations = relations(contractEquipment, ({ one, many }) => ({
  contract: one(contracts, { fields: [contractEquipment.contractId], references: [contracts.id] }),
  equipment: one(equipment, {
    fields: [contractEquipment.equipmentId],
    references: [equipment.id],
  }),
  plan: one(maintenancePlans, {
    fields: [contractEquipment.maintenancePlanId],
    references: [maintenancePlans.id],
  }),
  preferredTechnician: one(technicians, {
    fields: [contractEquipment.preferredTechnicianId],
    references: [technicians.id],
  }),
  workOrders: many(workOrders),
}));

export const techniciansRelations = relations(technicians, ({ one, many }) => ({
  user: one(user, { fields: [technicians.userId], references: [user.id] }),
  absences: many(technicianAbsences),
  workOrders: many(workOrders),
  commissionEntries: many(commissionEntries),
  commissionPayouts: many(commissionPayouts),
  commissionRules: many(commissionRules),
  stockLocations: many(stockLocations),
}));

export const technicianAbsencesRelations = relations(technicianAbsences, ({ one }) => ({
  technician: one(technicians, {
    fields: [technicianAbsences.technicianId],
    references: [technicians.id],
  }),
}));

export const commissionRulesRelations = relations(commissionRules, ({ one }) => ({
  technician: one(technicians, {
    fields: [commissionRules.technicianId],
    references: [technicians.id],
  }),
}));

export const commissionEntriesRelations = relations(commissionEntries, ({ one }) => ({
  technician: one(technicians, {
    fields: [commissionEntries.technicianId],
    references: [technicians.id],
  }),
  workOrder: one(workOrders, {
    fields: [commissionEntries.workOrderId],
    references: [workOrders.id],
  }),
  rule: one(commissionRules, {
    fields: [commissionEntries.ruleId],
    references: [commissionRules.id],
  }),
  payout: one(commissionPayouts, {
    fields: [commissionEntries.payoutId],
    references: [commissionPayouts.id],
  }),
}));

export const commissionPayoutsRelations = relations(commissionPayouts, ({ one, many }) => ({
  technician: one(technicians, {
    fields: [commissionPayouts.technicianId],
    references: [technicians.id],
  }),
  entries: many(commissionEntries),
  payable: one(payables, { fields: [commissionPayouts.payableId], references: [payables.id] }),
}));

export const workOrdersRelations = relations(workOrders, ({ one, many }) => ({
  customer: one(customers, { fields: [workOrders.customerId], references: [customers.id] }),
  site: one(customerSites, { fields: [workOrders.siteId], references: [customerSites.id] }),
  equipment: one(equipment, { fields: [workOrders.equipmentId], references: [equipment.id] }),
  contractEquipment: one(contractEquipment, {
    fields: [workOrders.contractEquipmentId],
    references: [contractEquipment.id],
  }),
  plan: one(maintenancePlans, {
    fields: [workOrders.maintenancePlanId],
    references: [maintenancePlans.id],
  }),
  technician: one(technicians, {
    fields: [workOrders.technicianId],
    references: [technicians.id],
  }),
  createdBy: one(user, { fields: [workOrders.createdById], references: [user.id] }),
  receivable: one(receivables, {
    fields: [workOrders.receivableId],
    references: [receivables.id],
  }),
  tasks: many(workOrderTasks),
  photos: many(workOrderPhotos),
  materials: many(workOrderMaterials),
  events: many(workOrderEvents),
  commissionEntries: many(commissionEntries),
}));

export const workOrderTasksRelations = relations(workOrderTasks, ({ one, many }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderTasks.workOrderId],
    references: [workOrders.id],
  }),
  photos: many(workOrderPhotos),
}));

export const workOrderPhotosRelations = relations(workOrderPhotos, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderPhotos.workOrderId],
    references: [workOrders.id],
  }),
  task: one(workOrderTasks, { fields: [workOrderPhotos.taskId], references: [workOrderTasks.id] }),
}));

export const workOrderMaterialsRelations = relations(workOrderMaterials, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderMaterials.workOrderId],
    references: [workOrders.id],
  }),
  product: one(products, { fields: [workOrderMaterials.productId], references: [products.id] }),
  location: one(stockLocations, {
    fields: [workOrderMaterials.locationId],
    references: [stockLocations.id],
  }),
}));

export const workOrderEventsRelations = relations(workOrderEvents, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderEvents.workOrderId],
    references: [workOrders.id],
  }),
  user: one(user, { fields: [workOrderEvents.userId], references: [user.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  purchaseOrders: many(purchaseOrders),
  payables: many(payables),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  preferredSupplier: one(suppliers, {
    fields: [products.preferredSupplierId],
    references: [suppliers.id],
  }),
  levels: many(stockLevels),
  movements: many(stockMovements),
  purchaseRequests: many(purchaseRequests),
}));

export const stockLocationsRelations = relations(stockLocations, ({ one, many }) => ({
  technician: one(technicians, {
    fields: [stockLocations.technicianId],
    references: [technicians.id],
  }),
  levels: many(stockLevels),
}));

export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  product: one(products, { fields: [stockLevels.productId], references: [products.id] }),
  location: one(stockLocations, {
    fields: [stockLevels.locationId],
    references: [stockLocations.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  location: one(stockLocations, {
    fields: [stockMovements.locationId],
    references: [stockLocations.id],
  }),
  user: one(user, { fields: [stockMovements.userId], references: [user.id] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchaseOrders.supplierId], references: [suppliers.id] }),
  location: one(stockLocations, {
    fields: [purchaseOrders.locationId],
    references: [stockLocations.id],
  }),
  items: many(purchaseOrderItems),
  requests: many(purchaseRequests),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderItems.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
  product: one(products, { fields: [purchaseOrderItems.productId], references: [products.id] }),
}));

export const purchaseRequestsRelations = relations(purchaseRequests, ({ one }) => ({
  product: one(products, { fields: [purchaseRequests.productId], references: [products.id] }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseRequests.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

export const receivablesRelations = relations(receivables, ({ one }) => ({
  customer: one(customers, { fields: [receivables.customerId], references: [customers.id] }),
  contract: one(contracts, { fields: [receivables.contractId], references: [contracts.id] }),
  category: one(financeCategories, {
    fields: [receivables.categoryId],
    references: [financeCategories.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [receivables.bankAccountId],
    references: [bankAccounts.id],
  }),
}));

export const payablesRelations = relations(payables, ({ one }) => ({
  supplier: one(suppliers, { fields: [payables.supplierId], references: [suppliers.id] }),
  category: one(financeCategories, {
    fields: [payables.categoryId],
    references: [financeCategories.id],
  }),
  bankAccount: one(bankAccounts, {
    fields: [payables.bankAccountId],
    references: [bankAccounts.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
}));

export const pmocDocumentsRelations = relations(pmocDocuments, ({ one }) => ({
  customer: one(customers, { fields: [pmocDocuments.customerId], references: [customers.id] }),
  site: one(customerSites, { fields: [pmocDocuments.siteId], references: [customerSites.id] }),
}));
