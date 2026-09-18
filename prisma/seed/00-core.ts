import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/auth";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "../../src/lib/modules";

/**
 * Departments, branches, roles, permissions and the seven demo logins.
 *
 * The staff names here are seeded rather than taken from the bank's own
 * correspondence. The people named in the tender document may well be in the
 * room, and putting their names on invented transactions is a needless risk.
 */

export const DEMO_PASSWORD = "Demo@2026";

export async function seedCore(db: PrismaClient) {
  const password = hashPassword(DEMO_PASSWORD);

  // --- Departments --------------------------------------------------------
  const departments = await Promise.all(
    [
      { name: "Common Services Division", code: "CSD", costCenterCode: "CC-1100" },
      { name: "Information Technology Division", code: "ITD", costCenterCode: "CC-1200" },
      { name: "Human Resources Division", code: "HRD", costCenterCode: "CC-1300" },
      { name: "Finance and Accounts Division", code: "FAD", costCenterCode: "CC-1400" },
      { name: "General Banking Division", code: "GBD", costCenterCode: "CC-1500" },
    ].map(d => db.department.create({ data: d })),
  );
  const dept = Object.fromEntries(departments.map(d => [d.code, d]));

  // --- Branches -----------------------------------------------------------
  const branches = await Promise.all(
    [
      { name: "Corporate Head Office", code: "CHO", district: "Dhaka", isHeadOffice: true,
        address: "Shahjalal Islami Bank Tower, Plot 4, Block CWN(C), Gulshan Avenue, Gulshan, Dhaka 1212" },
      { name: "Gulshan Branch", code: "GUL", district: "Dhaka", address: "Gulshan Avenue, Gulshan-1, Dhaka 1212" },
      { name: "Motijheel Branch", code: "MOT", district: "Dhaka", address: "Dilkusha C/A, Motijheel, Dhaka 1000" },
      { name: "Dhanmondi Branch", code: "DHN", district: "Dhaka", address: "Satmasjid Road, Dhanmondi, Dhaka 1209" },
      { name: "Uttara Branch", code: "UTT", district: "Dhaka", address: "Sector 7, Uttara Model Town, Dhaka 1230" },
      { name: "Agrabad Branch", code: "AGR", district: "Chattogram", address: "Agrabad C/A, Chattogram 4100" },
      { name: "Zindabazar Branch", code: "ZIN", district: "Sylhet", address: "Zindabazar, Sylhet 3100" },
    ].map(b => db.branch.create({ data: b })),
  );
  const branch = Object.fromEntries(branches.map(b => [b.code, b]));

  // --- Permissions --------------------------------------------------------
  // One row per module/action pair. The RBAC grid in /admin/roles renders
  // exactly this matrix, and the checkboxes on it are live.
  const permissionRows: Array<{ module: string; action: string; description: string }> = [];
  for (const m of PERMISSION_MODULES) {
    for (const a of PERMISSION_ACTIONS) {
      permissionRows.push({ module: m, action: a, description: `${a} on ${m}` });
    }
  }
  await db.permission.createMany({ data: permissionRows });
  const permissions = await db.permission.findMany();
  const permId = (module: string, action: string) =>
    permissions.find(p => p.module === module && p.action === action)!.id;

  // --- Roles --------------------------------------------------------------
  const roleDefs = [
    { code: "REQ_INITIATOR", name: "Requisition Initiator", rank: 10, isSystemRole: false,
      description: "Raises requisitions for their branch or department. Cannot approve anything, including their own requests." },
    { code: "DEPT_HEAD", name: "Department Head", rank: 30, isSystemRole: false,
      description: "First approval tier. Approves requisitions raised within their division." },
    { code: "DIVISIONAL_HEAD", name: "Divisional Head", rank: 50, isSystemRole: false,
      description: "Second approval tier, engaged by value threshold under the active workflow." },
    { code: "MANAGING_DIRECTOR", name: "Managing Director", rank: 90, isSystemRole: false,
      description: "Highest approval tier, engaged only on high-value procurement." },
    { code: "PROCUREMENT", name: "Procurement Executive", rank: 40, isSystemRole: false,
      description: "Converts approved requisitions into tenders, configures committees and issues work orders." },
    { code: "PROCUREMENT_HEAD", name: "Procurement Head", rank: 60, isSystemRole: false,
      description: "Approves tender documents before publication." },
    { code: "PURCHASE_COMMITTEE", name: "Purchase Committee", rank: 65, isSystemRole: false,
      description: "Committee approval on tenders above the configured value threshold." },
    { code: "TEC", name: "Technical Evaluation Committee", rank: 55, isSystemRole: false,
      description: "Opens and evaluates technical offers. Cannot read financial offers before technical sign-off." },
    { code: "FINANCE_OFFICER", name: "Finance Officer", rank: 35, isSystemRole: false,
      description: "Verifies invoices and runs the three-way match against purchase order and goods receipt." },
    { code: "FINANCE_MANAGER", name: "Finance Manager", rank: 55, isSystemRole: false,
      description: "Approves verified invoices for payment." },
    { code: "CFO", name: "Chief Financial Officer", rank: 85, isSystemRole: false,
      description: "Final payment approval above the configured value threshold." },
    { code: "STORE_KEEPER", name: "Store Keeper", rank: 20, isSystemRole: false,
      description: "Records goods receipt against work orders and maintains stock balances." },
    { code: "ADMIN", name: "System Administrator", rank: 100, isSystemRole: true,
      description: "Configures workflows, roles and permissions. Cannot edit or delete audit records." },
    { code: "VENDOR", name: "Vendor", rank: 5, isSystemRole: true,
      description: "External bidder. Entirely separate identity class with no access to internal bank data." },
  ];
  const roles = await Promise.all(roleDefs.map(r => db.role.create({ data: r })));
  const role = Object.fromEntries(roles.map(r => [r.code, r]));

  // --- Role -> permission grants -----------------------------------------
  // Deliberately narrow. The demo opens as a junior officer, and the first
  // thing the room should notice is how little he can see.
  const grants: Record<string, Array<[string, string]>> = {
    REQ_INITIATOR: [
      ["REQUISITION", "VIEW"], ["REQUISITION", "CREATE"],
      ["STOCK", "VIEW"], ["ASSET", "VIEW"], ["CANTEEN", "VIEW"], ["CANTEEN", "CREATE"],
      ["VISITOR", "VIEW"], ["TRANSPORT", "VIEW"],
    ],
    DEPT_HEAD: [
      ["REQUISITION", "VIEW"], ["REQUISITION", "CREATE"], ["REQUISITION", "APPROVE"],
      ["STOCK", "VIEW"], ["ASSET", "VIEW"], ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"],
      ["TENDER", "VIEW"], ["BUDGET", "VIEW"], ["VENDOR", "VIEW"], ["CONTRACT", "VIEW"],
      ["VISITOR", "VIEW"], ["CANTEEN", "VIEW"], ["TRANSPORT", "VIEW"],
    ],
    DIVISIONAL_HEAD: [
      ["REQUISITION", "VIEW"], ["REQUISITION", "APPROVE"], ["TENDER", "VIEW"], ["TENDER", "APPROVE"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"], ["BUDGET", "VIEW"],
      ["PO", "VIEW"], ["INVOICE", "VIEW"], ["CONTRACT", "VIEW"], ["ASSET", "VIEW"], ["STOCK", "VIEW"],
    ],
    MANAGING_DIRECTOR: [
      ["REQUISITION", "VIEW"], ["REQUISITION", "APPROVE"], ["TENDER", "VIEW"], ["TENDER", "APPROVE"],
      ["PO", "VIEW"], ["PO", "APPROVE"], ["INVOICE", "VIEW"], ["INVOICE", "APPROVE"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"], ["BUDGET", "VIEW"], ["AUDIT", "VIEW"],
    ],
    PROCUREMENT: [
      ["REQUISITION", "VIEW"], ["TENDER", "VIEW"], ["TENDER", "CREATE"],
      ["VENDOR", "VIEW"], ["VENDOR", "CREATE"], ["VENDOR", "APPROVE"],
      ["PO", "VIEW"], ["PO", "CREATE"], ["STOCK", "VIEW"], ["GRN", "VIEW"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"],
      ["CONTRACT", "VIEW"], ["CONTRACT", "CREATE"], ["AUCTION", "VIEW"], ["AUCTION", "CREATE"],
      ["WAREHOUSE", "VIEW"], ["BUDGET", "VIEW"], ["DISPATCH", "VIEW"],
    ],
    PROCUREMENT_HEAD: [
      ["REQUISITION", "VIEW"], ["TENDER", "VIEW"], ["TENDER", "CREATE"], ["TENDER", "APPROVE"],
      ["VENDOR", "VIEW"], ["VENDOR", "APPROVE"], ["PO", "VIEW"], ["PO", "CREATE"], ["PO", "APPROVE"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"], ["CONTRACT", "VIEW"], ["BUDGET", "VIEW"],
    ],
    PURCHASE_COMMITTEE: [
      ["TENDER", "VIEW"], ["TENDER", "APPROVE"], ["REQUISITION", "VIEW"],
      ["PO", "VIEW"], ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"],
    ],
    TEC: [
      ["TENDER", "VIEW"], ["TENDER", "EVALUATE"], ["REQUISITION", "VIEW"], ["VENDOR", "VIEW"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["PO", "VIEW"],
    ],
    FINANCE_OFFICER: [
      ["INVOICE", "VIEW"], ["INVOICE", "CREATE"], ["INVOICE", "EVALUATE"],
      ["PO", "VIEW"], ["GRN", "VIEW"], ["BUDGET", "VIEW"], ["VENDOR", "VIEW"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"], ["CONTRACT", "VIEW"], ["INSURANCE", "VIEW"],
    ],
    FINANCE_MANAGER: [
      ["INVOICE", "VIEW"], ["INVOICE", "APPROVE"], ["PO", "VIEW"], ["GRN", "VIEW"],
      ["BUDGET", "VIEW"], ["BUDGET", "CONFIGURE"], ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"],
    ],
    CFO: [
      ["INVOICE", "VIEW"], ["INVOICE", "APPROVE"], ["BUDGET", "VIEW"], ["BUDGET", "CONFIGURE"],
      ["DASHBOARD", "VIEW"], ["REPORT", "VIEW"], ["REPORT", "EXPORT"], ["AUDIT", "VIEW"],
    ],
    STORE_KEEPER: [
      ["GRN", "VIEW"], ["GRN", "CREATE"], ["STOCK", "VIEW"], ["STOCK", "CREATE"],
      ["WAREHOUSE", "VIEW"], ["PO", "VIEW"], ["DISPATCH", "VIEW"], ["DISPATCH", "CREATE"],
    ],
    VENDOR: [],
  };

  // The administrator gets everything EXCEPT any write action on the audit
  // trail. There is no such permission to grant, because there is no code path
  // behind it — the claim in the bid is that nobody can alter audit records,
  // and that has to be true of administrators too.
  const adminGrants: Array<[string, string]> = [];
  for (const m of PERMISSION_MODULES) {
    for (const a of PERMISSION_ACTIONS) {
      if (m === "AUDIT" && a !== "VIEW" && a !== "EXPORT") continue;
      adminGrants.push([m, a]);
    }
  }
  grants.ADMIN = adminGrants;

  const rolePermData: Array<{ roleId: string; permissionId: string }> = [];
  for (const [roleCode, pairs] of Object.entries(grants)) {
    for (const [m, a] of pairs) {
      rolePermData.push({ roleId: role[roleCode]!.id, permissionId: permId(m, a) });
    }
  }
  await db.rolePermission.createMany({ data: rolePermData });

  // --- The seven demo logins ---------------------------------------------
  const userDefs = [
    { employeeId: "SJIBL/4417", fullName: "Rezaul Karim", email: "rezaul.karim@sjiblbd.com",
      designation: "Officer", dept: "CSD", branch: "GUL", roles: ["REQ_INITIATOR"], phone: "+880 1711-204417" },
    { employeeId: "SJIBL/2891", fullName: "Farhana Akter", email: "farhana.akter@sjiblbd.com",
      designation: "Senior Assistant Vice President", dept: "CSD", branch: "CHO",
      roles: ["DEPT_HEAD", "PURCHASE_COMMITTEE", "TEC"], phone: "+880 1713-102891" },
    { employeeId: "SJIBL/3102", fullName: "Shahidul Islam", email: "shahidul.islam@sjiblbd.com",
      designation: "Assistant Vice President", dept: "CSD", branch: "CHO",
      roles: ["PROCUREMENT", "STORE_KEEPER"], phone: "+880 1713-503102" },
    { employeeId: "SJIBL/2755", fullName: "Tanvir Ahmed", email: "tanvir.ahmed@sjiblbd.com",
      designation: "Vice President", dept: "CSD", branch: "CHO",
      roles: ["TEC", "PROCUREMENT_HEAD"], phone: "+880 1755-002755" },
    { employeeId: "SJIBL/3348", fullName: "Nasrin Sultana", email: "nasrin.sultana@sjiblbd.com",
      designation: "Senior Officer", dept: "FAD", branch: "CHO",
      roles: ["FINANCE_OFFICER"], phone: "+880 1717-303348" },
    { employeeId: "SJIBL/1902", fullName: "Mizanur Rahman", email: "mizanur.rahman@sjiblbd.com",
      designation: "Senior Vice President", dept: "ITD", branch: "CHO",
      roles: ["ADMIN", "DIVISIONAL_HEAD"], phone: "+880 1711-901902" },
  ];

  const users: Record<string, { id: string; fullName: string }> = {};
  for (const u of userDefs) {
    const created = await db.user.create({
      data: {
        employeeId: u.employeeId,
        fullName: u.fullName,
        email: u.email,
        passwordHash: password,
        designation: u.designation,
        userType: "INTERNAL",
        phone: u.phone,
        departmentId: dept[u.dept]!.id,
        branchId: branch[u.branch]!.id,
        roles: { create: u.roles.map((r, i) => ({ roleId: role[r]!.id, sequence: i })) },
      },
    });
    users[u.fullName] = created;
  }

  // Supporting staff so approval tiers and queues are not all one person.
  const extras = [
    { employeeId: "SJIBL/1544", fullName: "Abdul Mannan", email: "abdul.mannan@sjiblbd.com",
      designation: "Deputy Managing Director", dept: "CSD", branch: "CHO", roles: ["MANAGING_DIRECTOR"] },
    { employeeId: "SJIBL/2210", fullName: "Kamrun Nahar", email: "kamrun.nahar@sjiblbd.com",
      designation: "Vice President", dept: "FAD", branch: "CHO", roles: ["FINANCE_MANAGER"] },
    // A second Finance Officer. Without one the invoice chain deadlocks: the
    // officer who enters a bill is its maker, so maker-checker correctly
    // refuses her own verification of it, and there would be nobody else
    // holding the role to act. Two officers in a bills section is also simply
    // how the function is staffed.
    { employeeId: "SJIBL/3612", fullName: "Sumaiya Haque", email: "sumaiya.haque@sjiblbd.com",
      designation: "Officer", dept: "FAD", branch: "CHO", roles: ["FINANCE_OFFICER"] },
    { employeeId: "SJIBL/1188", fullName: "Golam Mostafa", email: "golam.mostafa@sjiblbd.com",
      designation: "Executive Vice President", dept: "FAD", branch: "CHO", roles: ["CFO"] },
    { employeeId: "SJIBL/3927", fullName: "Sharmin Akhter", email: "sharmin.akhter@sjiblbd.com",
      designation: "Principal Officer", dept: "ITD", branch: "CHO", roles: ["TEC"] },
    { employeeId: "SJIBL/4088", fullName: "Rakibul Hasan", email: "rakibul.hasan@sjiblbd.com",
      designation: "Officer", dept: "CSD", branch: "CHO", roles: ["STORE_KEEPER"] },
    { employeeId: "SJIBL/4512", fullName: "Nusrat Jahan", email: "nusrat.jahan@sjiblbd.com",
      designation: "Officer", dept: "GBD", branch: "MOT", roles: ["REQ_INITIATOR"] },
    { employeeId: "SJIBL/4630", fullName: "Sabbir Ahmed", email: "sabbir.ahmed@sjiblbd.com",
      designation: "Junior Officer", dept: "GBD", branch: "DHN", roles: ["REQ_INITIATOR"] },
    { employeeId: "SJIBL/4701", fullName: "Tahmina Begum", email: "tahmina.begum@sjiblbd.com",
      designation: "Officer", dept: "HRD", branch: "UTT", roles: ["REQ_INITIATOR"] },
    { employeeId: "SJIBL/4822", fullName: "Imran Hossain", email: "imran.hossain@sjiblbd.com",
      designation: "Senior Officer", dept: "GBD", branch: "AGR", roles: ["REQ_INITIATOR"] },
    { employeeId: "SJIBL/2077", fullName: "Shafiqul Alam", email: "shafiqul.alam@sjiblbd.com",
      designation: "Vice President", dept: "ITD", branch: "CHO", roles: ["DEPT_HEAD"] },
    // Deputy Head of Procurement. The Procurement Head both approves tenders
    // and work orders AND can raise them, so a single holder would deadlock
    // anything that holder raised.
    { employeeId: "SJIBL/2418", fullName: "Rafiqul Islam", email: "rafiqul.islam@sjiblbd.com",
      designation: "Senior Assistant Vice President", dept: "CSD", branch: "CHO",
      roles: ["PROCUREMENT_HEAD"] },
  ];
  for (const u of extras) {
    const created = await db.user.create({
      data: {
        employeeId: u.employeeId, fullName: u.fullName, email: u.email, passwordHash: password,
        designation: u.designation, userType: "INTERNAL",
        departmentId: dept[u.dept]!.id, branchId: branch[u.branch]!.id,
        roles: { create: u.roles.map((r, i) => ({ roleId: role[r]!.id, sequence: i })) },
      },
    });
    users[u.fullName] = created;
  }

  return { dept, branch, role, users, password };
}
