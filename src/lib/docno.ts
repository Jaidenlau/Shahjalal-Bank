/**
 * Document numbering.
 *
 * Bangladeshi bank paperwork carries structured reference numbers and the
 * audience reads them at a glance, so the formats here match the conventions
 * used in the client's own correspondence:
 *
 *   REQ/CSD/2026/0847      requisition, by division and year
 *   TND/SJIBL/2026/112     tender, bank-wide sequence
 *   PO/CSD/2026/0391       work order
 *   GRN/CSD/2026/0508      goods receipt
 *   INV/RTL/2026/0233      invoice, keyed to the vendor's initials
 */
import type { Tx } from "./db";

const pad = (n: number, width: number) => String(n).padStart(width, "0");

export function requisitionNo(divisionCode: string, year: number, seq: number) {
  return `REQ/${divisionCode}/${year}/${pad(seq, 4)}`;
}
export function tenderNo(year: number, seq: number) {
  return `TND/SJIBL/${year}/${pad(seq, 3)}`;
}
export function purchaseOrderNo(divisionCode: string, year: number, seq: number) {
  return `PO/${divisionCode}/${year}/${pad(seq, 4)}`;
}
export function grnNo(divisionCode: string, year: number, seq: number) {
  return `GRN/${divisionCode}/${year}/${pad(seq, 4)}`;
}
export function invoiceNo(vendorInitials: string, year: number, seq: number) {
  return `INV/${vendorInitials}/${year}/${pad(seq, 4)}`;
}
export function contractNo(year: number, seq: number) {
  return `CON/SJIBL/${year}/${pad(seq, 3)}`;
}
export function workOrderNo(year: number, seq: number) {
  return `WO/CSD/${year}/${pad(seq, 4)}`;
}
export function gatePassNo(year: number, seq: number) {
  return `GP/CSD/${year}/${pad(seq, 4)}`;
}
export function dispatchNo(year: number, seq: number) {
  return `DSP/CSD/${year}/${pad(seq, 4)}`;
}
export function visitorNo(year: number, seq: number) {
  return `VIS/${year}/${pad(seq, 5)}`;
}
export function auctionLotNo(year: number, seq: number) {
  return `AUC/SJIBL/${year}/${pad(seq, 3)}`;
}
export function claimNo(year: number, seq: number) {
  return `CLM/${year}/${pad(seq, 4)}`;
}
export function tripNo(year: number, seq: number) {
  return `TRP/${year}/${pad(seq, 4)}`;
}
export function canteenOrderNo(year: number, seq: number) {
  return `CTN/${year}/${pad(seq, 5)}`;
}
export function projectNo(year: number, seq: number) {
  return `CIV/SJIBL/${year}/${pad(seq, 3)}`;
}
export function scheduleNo(year: number, seq: number) {
  return `PMS/${year}/${pad(seq, 4)}`;
}
export function policyNo(insurerCode: string, year: number, seq: number) {
  return `${insurerCode}/POL/${year}/${pad(seq, 4)}`;
}

/** Vendor initials used in invoice numbers: "Rahim Traders Ltd" -> "RTL". */
export function vendorInitials(companyName: string): string {
  const words = companyName.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 3).map(w => w[0]!.toUpperCase()).join("") || "VEN";
}

/**
 * Next sequence number for a live document, read from the existing rows so
 * numbering continues from the seeded history rather than restarting at 1.
 */
export async function nextRequisitionSeq(tx: Tx, year: number): Promise<number> {
  const rows = await tx.requisition.findMany({
    where: { requisitionNo: { contains: `/${year}/` } },
    select: { requisitionNo: true },
  });
  return maxSeq(rows.map(r => r.requisitionNo)) + 1;
}

/** Highest trailing sequence across a set of document numbers. */
function maxSeq(numbers: string[]): number {
  return numbers.reduce((m, n) => Math.max(m, Number(n.split("/").pop()) || 0), 0);
}

export async function nextTenderSeq(tx: Tx, year: number): Promise<number> {
  const rows = await tx.tender.findMany({
    where: { tenderNo: { contains: `/${year}/` } },
    select: { tenderNo: true },
  });
  return maxSeq(rows.map(r => r.tenderNo)) + 1;
}

export async function nextPoSeq(tx: Tx, year: number): Promise<number> {
  const rows = await tx.purchaseOrder.findMany({
    where: { poNo: { contains: `/${year}/` } },
    select: { poNo: true },
  });
  return maxSeq(rows.map(r => r.poNo)) + 1;
}

export async function nextGrnSeq(tx: Tx, year: number): Promise<number> {
  const rows = await tx.goodsReceiptNote.findMany({
    where: { grnNo: { contains: `/${year}/` } },
    select: { grnNo: true },
  });
  return maxSeq(rows.map(r => r.grnNo)) + 1;
}

export async function nextInvoiceSeq(tx: Tx, year: number): Promise<number> {
  const rows = await tx.invoice.findMany({
    where: { invoiceNo: { contains: `/${year}/` } },
    select: { invoiceNo: true },
  });
  return maxSeq(rows.map(r => r.invoiceNo)) + 1;
}
