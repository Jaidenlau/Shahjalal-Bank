/**
 * Report schema.
 *
 * Declared as plain data rather than in the server-action module: a "use
 * server" file may only export async functions, so the entity, column and
 * filter definitions live here and are imported by both the action layer and
 * the builder UI.
 *
 * Annexure-A 6(c)(ii) commits to bank users preparing new reports without the
 * bidder. Adding a reportable entity is adding an entry below.
 */

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "money" | "date" | "status";
  filterable?: boolean;
}

export interface EntityDef {
  key: string;
  label: string;
  description: string;
  module: string;
  fields: FieldDef[];
}

export const ENTITIES: EntityDef[] = [
  {
    key: "requisition", label: "Requisitions", module: "Module 2",
    description: "Division, department, branch, category, value and status of every requisition raised.",
    fields: [
      { key: "requisitionNo", label: "Requisition no.", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "type", label: "Type", type: "status", filterable: true },
      { key: "status", label: "Status", type: "status", filterable: true },
      { key: "department", label: "Division", type: "text", filterable: true },
      { key: "branch", label: "Branch", type: "text", filterable: true },
      { key: "requestedBy", label: "Raised by", type: "text", filterable: true },
      { key: "costCenterCode", label: "Cost centre", type: "text" },
      { key: "totalEstimatedValue", label: "Value", type: "money" },
      { key: "createdAt", label: "Raised on", type: "date" },
      { key: "submittedAt", label: "Submitted on", type: "date" },
    ],
  },
  {
    key: "tender", label: "Tenders", module: "Module 3",
    description: "Tender status history by method, value and outcome.",
    fields: [
      { key: "tenderNo", label: "Tender no.", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "method", label: "Method", type: "status", filterable: true },
      { key: "envelopeSystem", label: "Envelope", type: "status", filterable: true },
      { key: "status", label: "Status", type: "status", filterable: true },
      { key: "estimatedValue", label: "Estimated value", type: "money" },
      { key: "bidCount", label: "Bids received", type: "number" },
      { key: "publishedAt", label: "Published", type: "date" },
      { key: "closingAt", label: "Closing", type: "date" },
      { key: "awardedAt", label: "Awarded", type: "date" },
    ],
  },
  {
    key: "purchaseOrder", label: "Work orders", module: "Module 3",
    description: "Vendor-wise work order history with source tender and requisition.",
    fields: [
      { key: "poNo", label: "Work order no.", type: "text" },
      { key: "vendor", label: "Supplier", type: "text", filterable: true },
      { key: "status", label: "Status", type: "status", filterable: true },
      { key: "totalAmount", label: "Value", type: "money" },
      { key: "tenderNo", label: "Tender", type: "text" },
      { key: "requisitionNo", label: "Requisition", type: "text" },
      { key: "issuedAt", label: "Issued", type: "date" },
      { key: "deliveryDueAt", label: "Delivery due", type: "date" },
    ],
  },
  {
    key: "invoice", label: "Invoices and payments", module: "Module 22",
    description: "Invoicing and payment history with VAT, tax deduction and match status.",
    fields: [
      { key: "invoiceNo", label: "Invoice no.", type: "text" },
      { key: "vendorInvoiceNo", label: "Vendor invoice", type: "text" },
      { key: "vendor", label: "Supplier", type: "text", filterable: true },
      { key: "status", label: "Status", type: "status", filterable: true },
      { key: "matchStatus", label: "Three-way match", type: "status", filterable: true },
      { key: "amount", label: "Invoice value", type: "money" },
      { key: "vatAmount", label: "VAT", type: "money" },
      { key: "taxDeducted", label: "AIT deducted", type: "money" },
      { key: "netPayable", label: "Net payable", type: "money" },
      { key: "receivedAt", label: "Received", type: "date" },
      { key: "paidAt", label: "Paid", type: "date" },
    ],
  },
  {
    key: "vendor", label: "Vendors", module: "Module 6",
    description: "Enlisted vendor history with licence validity and participation.",
    fields: [
      { key: "companyName", label: "Company", type: "text" },
      { key: "tradeLicenseNo", label: "Trade licence", type: "text" },
      { key: "enlistmentStatus", label: "Enlistment", type: "status", filterable: true },
      { key: "tradeLicenseExpiry", label: "Licence expiry", type: "date" },
      { key: "contactPerson", label: "Contact", type: "text" },
      { key: "bidCount", label: "Bids submitted", type: "number" },
      { key: "poCount", label: "Work orders", type: "number" },
      { key: "enlistedAt", label: "Enlisted", type: "date" },
    ],
  },
  {
    key: "asset", label: "Assets", module: "Module 4",
    description: "Fixed asset register with depreciation and book value.",
    fields: [
      { key: "assetTag", label: "Asset tag", type: "text" },
      { key: "name", label: "Asset", type: "text" },
      { key: "category", label: "Category", type: "text", filterable: true },
      { key: "status", label: "Status", type: "status", filterable: true },
      { key: "location", label: "Location", type: "text" },
      { key: "purchaseCost", label: "Cost", type: "money" },
      { key: "bookValue", label: "Book value", type: "money" },
      { key: "purchaseDate", label: "Purchased", type: "date" },
    ],
  },
];

