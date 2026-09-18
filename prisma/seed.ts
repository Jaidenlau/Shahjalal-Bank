import { PrismaClient } from "@prisma/client";
import { reseed } from "./seed/rng";
import { seedCore, DEMO_PASSWORD } from "./seed/00-core";
import { seedCatalogue } from "./seed/10-catalogue";
import { seedVendors } from "./seed/20-vendors";
import { seedWorkflows } from "./seed/30-workflows";
import { seedProcurement } from "./seed/40-procurement";
import { seedPurchase } from "./seed/45-purchase";
import { seedModules } from "./seed/50-modules";
import { seedAudit } from "./seed/60-audit";
import { seedSystem } from "./seed/70-system";

/**
 * Vertex ERP demo seed.
 *
 * Deterministic: the same database comes out of every run, so the demo you
 * rehearse is the demo you give. `npm run reset` drops the file and re-runs
 * this from scratch.
 */

const db = new PrismaClient();

/** Delete in dependency order. SQLite has no TRUNCATE CASCADE. */
async function clear() {
  const order = [
    "auditLog", "notification", "savedReport", "integrationEndpoint",
    "workflowAction", "workflowInstanceStep", "workflowInstance", "workflowStep", "workflowDefinition",
    "goodsReceiptLine", "goodsReceiptNote", "invoice", "purchaseOrderLine", "purchaseOrder",
    "comparativeStatement", "bidFinancialPart", "bidTechnicalPart", "bid",
    "committeeMember", "committee", "tenderDocument", "tenderRequisition", "tender",
    "requisitionLine", "requisition", "budget",
    "stockBalance", "item", "itemCategory", "warehouse",
    "vendorDocument", "vendorUser", "vendorCategory", "vendor",
    "auctionBid", "auctionLot", "insuranceClaim", "insurancePolicy",
    "assetMaintenance", "asset", "contractMilestone", "contract",
    "fuelLog", "vehicleTrip", "vehicle", "visitorAppointment", "visitor",
    "canteenOrder", "medicalItem", "buildingUtility", "preventiveMaintenanceSchedule",
    "dispatchNote", "civilWorksProject",
    "rolePermission", "userRole", "permission", "role", "user", "department", "branch",
  ] as const;
  for (const model of order) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[model].deleteMany({});
  }
}

function step(n: string) {
  process.stdout.write(`  ${n.padEnd(42, ".")} `);
}
function done(detail = "ok") {
  process.stdout.write(`${detail}\n`);
}

async function main() {
  const started = Date.now();
  console.log("\n  Vertex ERP — seeding demo database\n");

  reseed();

  step("clearing existing data");
  await clear();
  done();

  step("core: departments, roles, users");
  const core = await seedCore(db);
  done(`${Object.keys(core.users).length} users`);

  step("catalogue: items, warehouses, stock");
  const catalogue = await seedCatalogue(db);
  done(`${Object.keys(catalogue.items).length} items`);

  step("vendors and portal logins");
  const vendorData = await seedVendors(db);
  done(`${Object.keys(vendorData.vendors).length} vendors`);

  step("workflow definitions");
  const workflows = await seedWorkflows(db, core.role, core.users["Mizanur Rahman"]!);
  done("8 definitions");

  step("requisitions, tenders and bids");
  const procurement = await seedProcurement(db, {
    dept: core.dept, branch: core.branch, role: core.role, users: core.users,
    items: catalogue.items, vendors: vendorData.vendors, workflows,
  });
  const reqCount = await db.requisition.count();
  const tenderCount = await db.tender.count();
  done(`${reqCount} requisitions, ${tenderCount} tenders`);

  step("budgets, work orders, receipts, invoices");
  await seedPurchase(db, {
    dept: core.dept, role: core.role, users: core.users,
    items: catalogue.items, vendors: vendorData.vendors, workflows,
  });
  const poCount = await db.purchaseOrder.count();
  const invCount = await db.invoice.count();
  done(`${poCount} work orders, ${invCount} invoices`);

  step("assets, contracts and facilities modules");
  await seedModules(db, {
    dept: core.dept, branch: core.branch, users: core.users, vendors: vendorData.vendors,
  });
  done();

  step("integrations and notifications");
  await seedSystem(db, core.users);
  done();

  step("audit trail backfill");
  const auditRows = await seedAudit(db, core.users);
  done(`${auditRows} records`);

  // --- Summary -----------------------------------------------------------
  const counts = {
    users: await db.user.count(),
    vendors: await db.vendor.count(),
    items: await db.item.count(),
    requisitions: await db.requisition.count(),
    tenders: await db.tender.count(),
    bids: await db.bid.count(),
    purchaseOrders: await db.purchaseOrder.count(),
    grns: await db.goodsReceiptNote.count(),
    invoices: await db.invoice.count(),
    assets: await db.asset.count(),
    contracts: await db.contract.count(),
    vehicles: await db.vehicle.count(),
    visitors: await db.visitor.count(),
    auditLog: await db.auditLog.count(),
  };

  console.log("\n  Seeded:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`    ${k.padEnd(18)} ${String(v).padStart(5)}`);
  }

  console.log(`\n  Demo thread:`);
  console.log(`    Tender          ${procurement.demoTender.tenderNo} — closed, 3 bids, financial envelopes SEALED`);
  console.log(`    Fallback req    ${procurement.fallbackReq.requisitionNo} — awaiting Farhana Akter`);
  console.log(`    Source req      ${procurement.sourceReq.requisitionNo} — approved, converted to tender`);
  console.log(`\n  All logins use password: ${DEMO_PASSWORD}`);
  console.log(`\n  Done in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main()
  .catch(e => {
    console.error("\n  SEED FAILED\n");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
