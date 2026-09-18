/**
 * Compile every route once before a test run or a demo.
 *
 * Next.js in development compiles a route the first time it is requested, so a
 * cold server can take several seconds on the first visit to each screen. That
 * is fine in a test but not acceptable on stage, so this is also the last thing
 * to run before walking into the room.
 */
const B = "http://localhost:3000";
const PATHS = [
  "/login", "/vendor/login", "/", "/requisitions", "/requisitions/new",
  "/requisitions/approvals", "/tenders", "/purchase-orders", "/purchase-orders/new",
  "/grn", "/grn/new", "/invoices", "/invoices/new", "/stock", "/vendors",
  "/assets", "/contracts", "/budgets", "/warehouses", "/transport", "/visitors",
  "/canteen", "/medical", "/insurance", "/auctions", "/dispatch", "/building",
  "/civil-works", "/dashboards", "/reports", "/admin/workflows", "/admin/audit",
  "/admin/users", "/admin/roles", "/admin/integrations", "/about",
  "/vendor", "/vendor/tenders", "/vendor/profile",
];

const t0 = Date.now();
let slowest = { path: "", ms: 0 };
for (const path of PATHS) {
  const s = Date.now();
  await fetch(B + path, { redirect: "manual" }).catch(() => {});
  const ms = Date.now() - s;
  if (ms > slowest.ms) slowest = { path, ms };
}
console.log(`  warmed ${PATHS.length} routes in ${((Date.now() - t0) / 1000).toFixed(1)}s (slowest: ${slowest.path} ${slowest.ms}ms)`);
