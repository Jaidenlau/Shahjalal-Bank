/**
 * THE 25 MODULES committed in Annexure-B, as one registry.
 *
 * This drives the sidebar, the permission matrix, and the module coverage
 * screen. Keeping it in one place means the navigation, the RBAC grid and the
 * compliance view can never drift out of step with each other.
 *
 * `tier` records how far each module is built in this demo:
 *   full  — complete working workflow, end to end
 *   data  — working list and detail screens over real seeded data
 *   list  — populated register view
 * The About screen shows this honestly rather than implying all 25 are deep.
 */

export type ModuleTier = "full" | "data" | "list";

export interface ModuleDef {
  /** Annexure-B module number. */
  no: number;
  code: string;
  name: string;
  href: string;
  group: ModuleGroup;
  tier: ModuleTier;
  /** Permission module key. */
  perm: string;
  blurb: string;
  /**
   * Set where we have built something the Bank did not ask for in Annexure-B.
   * The coverage screen shows these separately so nobody can mistake an
   * addition of ours for a line item the Bank specified.
   */
  beyondScope?: true;
}

export type ModuleGroup =
  | "Procurement"
  | "Inventory & Assets"
  | "Facilities"
  | "Finance"
  | "Administration";

export const MODULE_GROUPS: ModuleGroup[] = [
  "Procurement",
  "Inventory & Assets",
  "Facilities",
  "Finance",
  "Administration",
];

export const MODULES: ModuleDef[] = [
  // ---- Procurement -------------------------------------------------------
  { no: 2, code: "REQUISITION", name: "Requisitions", href: "/requisitions", group: "Procurement", tier: "full", perm: "REQUISITION",
    blurb: "Pre-facto, post-facto, repair and auction requisitions with stock check, store/purchase routing and maker-checker approval." },
  { no: 2, code: "APPROVALS", name: "My Approvals", href: "/requisitions/approvals", group: "Procurement", tier: "full", perm: "REQUISITION",
    blurb: "The approval queue, filtered to what this user can action right now." },
  { no: 3, code: "TENDER", name: "Tenders", href: "/tenders", group: "Procurement", tier: "full", perm: "TENDER",
    blurb: "OTM, LTM, quotation, direct purchase and two-stage methods, with committee configuration and two-envelope opening." },
  { no: 6, code: "VENDOR", name: "Vendors", href: "/vendors", group: "Procurement", tier: "data", perm: "VENDOR",
    blurb: "Vendor enlistment, document verification, trade licence expiry tracking and category tagging." },
  { no: 5, code: "AUCTION", name: "e-Auction", href: "/auctions", group: "Procurement", tier: "list", perm: "AUCTION",
    blurb: "Auction lots for retired assets with anonymous bidding and timed closing." },
  { no: 3, code: "SHARIAH", name: "Shariah Governance", href: "/shariah", group: "Procurement", tier: "full", perm: "SHARIAH",
    beyondScope: true,
    blurb: "Screening of vendors, contracts and work orders against the rules the Bank's Shariah Supervisory Committee maintains, with the Committee's decisions recorded against each document." },

  // ---- Inventory & Assets ------------------------------------------------
  { no: 21, code: "GRN", name: "Goods Receipt", href: "/grn", group: "Inventory & Assets", tier: "full", perm: "GRN",
    blurb: "Receipt against a purchase order, full or partial, with accepted and rejected quantities and challan reference." },
  { no: 21, code: "STOCK", name: "Stock & Catalogue", href: "/stock", group: "Inventory & Assets", tier: "data", perm: "STOCK",
    blurb: "Item catalogue with on-hand, in-transit and under-purchase balances, reorder levels and last purchase price." },
  { no: 19, code: "WAREHOUSE", name: "Warehouses", href: "/warehouses", group: "Inventory & Assets", tier: "data", perm: "WAREHOUSE",
    blurb: "Multiple warehouses with capacity, stock position and inter-warehouse movement." },
  { no: 4, code: "ASSET", name: "Assets & Maintenance", href: "/assets", group: "Inventory & Assets", tier: "data", perm: "ASSET",
    blurb: "Fixed asset register with depreciation, location, specification and work order history." },
  { no: 11, code: "DISPATCH", name: "Dispatch & Gate Pass", href: "/dispatch", group: "Inventory & Assets", tier: "list", perm: "DISPATCH",
    blurb: "Gate pass issue, dispatch approval, delivery confirmation and proof of delivery." },

  // ---- Facilities --------------------------------------------------------
  { no: 12, code: "BUILDING", name: "Building Management", href: "/building", group: "Facilities", tier: "list", perm: "BUILDING",
    blurb: "Utility consumption, preventive maintenance schedules and facility status across sites." },
  { no: 13, code: "CIVIL", name: "Interior & Civil Works", href: "/civil-works", group: "Facilities", tier: "list", perm: "CIVIL",
    blurb: "Project initiation, BOQ, contractor engagement, site inspection and liability period tracking." },
  { no: 16, code: "TRANSPORT", name: "Transport", href: "/transport", group: "Facilities", tier: "list", perm: "TRANSPORT",
    blurb: "Vehicle register, fuel and trip logs, and tax token, fitness and insurance expiry tracking." },
  { no: 17, code: "VISITOR", name: "Visitors", href: "/visitors", group: "Facilities", tier: "list", perm: "VISITOR",
    blurb: "Visitor registration, appointments, host notification, badge issue and in/out times." },
  { no: 18, code: "CANTEEN", name: "Canteen", href: "/canteen", group: "Facilities", tier: "list", perm: "CANTEEN",
    blurb: "Pre-orders, cart management and serving slots. Payment collection pending gateway selection." },
  { no: 14, code: "MEDICAL", name: "Medical Supplies", href: "/medical", group: "Facilities", tier: "list", perm: "MEDICAL",
    blurb: "Medical inventory with batch and expiry tracking, issues and equipment register." },

  // ---- Finance -----------------------------------------------------------
  { no: 3, code: "PO", name: "Purchase Orders", href: "/purchase-orders", group: "Finance", tier: "full", perm: "PO",
    blurb: "Work order generation from an awarded bid, validated line by line against the approved requisition." },
  { no: 22, code: "INVOICE", name: "Invoices & Payment", href: "/invoices", group: "Finance", tier: "full", perm: "INVOICE",
    blurb: "Invoice entry, three-way match against purchase order and goods receipt, VAT and AIT calculation, payment approval." },
  { no: 22, code: "BUDGET", name: "Budget Control", href: "/budgets", group: "Finance", tier: "data", perm: "BUDGET",
    blurb: "Allocation, commitment and consumption by cost centre and GL code for the financial year." },
  { no: 20, code: "CONTRACT", name: "Contracts", href: "/contracts", group: "Finance", tier: "data", perm: "CONTRACT",
    blurb: "Contract register with validity, performance security, retention money, SLA terms and expiry reminders." },
  { no: 15, code: "INSURANCE", name: "Insurance", href: "/insurance", group: "Finance", tier: "list", perm: "INSURANCE",
    blurb: "Vehicle, locker, vault and property policies with renewal dates and claim settlement." },

  // ---- Administration ----------------------------------------------------
  { no: 8, code: "DASHBOARD", name: "Dashboards", href: "/dashboards", group: "Administration", tier: "data", perm: "DASHBOARD",
    blurb: "Tender status, requisition status and work order dashboards with filters and summary statistics." },
  { no: 23, code: "REPORT", name: "Reports", href: "/reports", group: "Administration", tier: "data", perm: "REPORT",
    blurb: "Pre-built reports plus a self-service builder, so new reports need no vendor involvement." },
  { no: 1, code: "WORKFLOW", name: "Workflow Builder", href: "/admin/workflows", group: "Administration", tier: "full", perm: "WORKFLOW",
    blurb: "Versioned, parameterised approval routing that bank administrators configure themselves." },
  { no: 25, code: "AUDIT", name: "Audit Trail", href: "/admin/audit", group: "Administration", tier: "full", perm: "AUDIT",
    blurb: "Append-only, hash-chained activity log with field-level diffs and end-to-end integrity verification." },
  { no: 24, code: "USER", name: "Users & Roles", href: "/admin/users", group: "Administration", tier: "full", perm: "USER",
    blurb: "User management and a live role-to-permission matrix enforced server side." },
  { no: 1, code: "INTEGRATION", name: "Integrations", href: "/admin/integrations", group: "Administration", tier: "data", perm: "INTEGRATION",
    blurb: "CBS, HRMS, DMS, email, SMS, payment gateway and IAM connection status through the middleware tier." },
];

export function modulesByGroup(): Array<{ group: ModuleGroup; modules: ModuleDef[] }> {
  return MODULE_GROUPS.map(group => ({
    group,
    modules: MODULES.filter(m => m.group === group),
  }));
}

export function moduleByPerm(perm: string): ModuleDef | undefined {
  return MODULES.find(m => m.perm === perm);
}

/** Distinct permission module keys, for the RBAC grid. */
export const PERMISSION_MODULES = Array.from(new Set(MODULES.map(m => m.perm))).sort();

export const PERMISSION_ACTIONS = ["VIEW", "CREATE", "APPROVE", "EVALUATE", "EXPORT", "CONFIGURE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
