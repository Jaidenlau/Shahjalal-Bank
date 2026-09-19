import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/lib/auth";
import { daysAgo, daysAhead, int, pick, personName } from "./rng";

/**
 * Vendors, their categories, documents and portal logins.
 *
 * Trade licence expiries are spread across the next 18 months with one falling
 * inside 30 days, so the expiry warning on the vendor profile has something
 * real to fire on rather than being a screenshot.
 */

interface VendorSpec {
  companyName: string; licence: string; status: string; categories: string[];
  /** Days until trade licence expiry. */
  expiryDays: number;
  area: string;
}

const VENDORS: VendorSpec[] = [
  { companyName: "Rahim Traders Ltd", licence: "TRAD/DNCC/041892/2019", status: "APPROVED",
    categories: ["IT Equipment", "Office Supplies"], expiryDays: 412, area: "Motijheel" },
  { companyName: "Bengal Office Solutions", licence: "TRAD/DNCC/038210/2018", status: "APPROVED",
    categories: ["Furniture", "Office Supplies"], expiryDays: 233, area: "Kawran Bazar" },
  { companyName: "Meghna Technologies Ltd", licence: "TRAD/DNCC/052771/2021", status: "APPROVED",
    categories: ["IT Equipment", "Networking"], expiryDays: 178, area: "Gulshan" },
  { companyName: "Padma Enterprise", licence: "TRAD/DNCC/029934/2016", status: "APPROVED",
    categories: ["Stationery", "Printing"], expiryDays: 24, area: "Paltan" }, // expiry warning fires here
  { companyName: "Shahjahan Furnishers", licence: "TRAD/DSCC/044120/2020", status: "APPROVED",
    categories: ["Furniture", "Interior"], expiryDays: 300, area: "Old Dhaka" },
  { companyName: "Delta Engineering Works", licence: "TRAD/DNCC/031056/2017", status: "APPROVED",
    categories: ["Electrical", "Civil Works"], expiryDays: 486, area: "Tejgaon" },
  { companyName: "Nabil Motors Ltd", licence: "TRAD/DNCC/047733/2020", status: "APPROVED",
    categories: ["Vehicles", "Transport"], expiryDays: 351, area: "Tejgaon" },
  { companyName: "Sonar Bangla Suppliers", licence: "TRAD/DNCC/055901/2022", status: "PENDING",
    categories: ["Office Supplies"], expiryDays: 520, area: "Mirpur" },
  { companyName: "Titas Electric Co", licence: "TRAD/DNCC/026418/2015", status: "APPROVED",
    categories: ["Electrical"], expiryDays: 96, area: "Nawabpur" },
  { companyName: "Karnaphuli Trading", licence: "TRAD/CCC/039877/2019", status: "APPROVED",
    categories: ["General Supplies"], expiryDays: 268, area: "Agrabad, Chattogram" },
  { companyName: "Jamuna IT Services", licence: "TRAD/DNCC/058102/2023", status: "PENDING",
    categories: ["IT Services"], expiryDays: 445, area: "Banani" },
  { companyName: "Surma Medical Supplies", licence: "TRAD/SCC/033445/2018", status: "APPROVED",
    categories: ["Medical"], expiryDays: 205, area: "Zindabazar, Sylhet" },
  // A staff canteen needs a caterer, and a caterer at an Islami bank needs
  // current halal certification. This vendor exists so that requirement is a
  // real record in the system rather than a claim on a slide.
  { companyName: "Bismillah Catering Services", licence: "TRAD/DNCC/061204/2023", status: "APPROVED",
    categories: ["Catering", "Food Supply"], expiryDays: 118, area: "Mohakhali" },
  // Vehicle supply and leasing finance sit in the same firm, which is ordinary
  // in this market and is exactly the case the Committee wants to see.
  { companyName: "Meherun Auto and Leasing Finance", licence: "TRAD/DNCC/049920/2021", status: "APPROVED",
    categories: ["Transport", "Leasing Finance"], expiryDays: 332, area: "Tejgaon" },
];

const DOC_TYPES = [
  "Trade Licence", "TIN Certificate", "BIN / VAT Registration",
  "Bank Solvency Certificate", "Company Profile", "Audited Financial Statement",
  "Authorised Distributor Certificate", "Experience Certificate",
];

export async function seedVendors(db: PrismaClient) {
  const password = hashPassword("Demo@2026");
  const vendors: Record<string, { id: string; companyName: string }> = {};

  for (const [i, v] of VENDORS.entries()) {
    const contact = personName(i % 5 === 0 ? "F" : "M");
    const slug = v.companyName.toLowerCase().replace(/[^a-z]+/g, "").slice(0, 14);
    // Registration must predate enlistment approval. Leaving createdAt to
    // default to now() produced vendors "registered today, approved two years
    // ago" in the audit trail, which is exactly the kind of detail a careful
    // reviewer notices while clicking around.
    const enlistedAt = v.status === "APPROVED" ? daysAgo(int(120, 900)) : null;
    const registeredAt = enlistedAt
      ? new Date(enlistedAt.getTime() - int(14, 60) * 86_400_000)
      : daysAgo(int(20, 90));
    const created = await db.vendor.create({
      data: {
        companyName: v.companyName,
        tradeLicenseNo: v.licence,
        tradeLicenseExpiry: daysAhead(v.expiryDays),
        tin: `${int(100, 999)}${int(100000, 999999)}${int(1000, 9999)}`,
        bin: `00${int(10000, 99999)}-${int(1000, 9999)}-${int(1, 9)}`,
        contactPerson: contact,
        contactPhone: `+880 17${int(10, 99)}-${int(100000, 999999)}`,
        contactEmail: `info@${slug}.com.bd`,
        address: `${int(12, 340)}, ${v.area}, ${v.area.includes("Chattogram") ? "Chattogram" : v.area.includes("Sylhet") ? "Sylhet" : "Dhaka"}, Bangladesh`,
        enlistmentStatus: v.status,
        createdAt: registeredAt,
        enlistedAt,
        incomeTaxSubmittedAt: v.status === "APPROVED" ? daysAgo(int(30, 300)) : null,
        categories: { create: v.categories.map(c => ({ category: c })) },
      },
    });
    vendors[v.companyName] = created;

    // Enlistment documents. Verified for approved vendors, awaiting
    // verification for the two pending ones.
    const docs = v.status === "APPROVED" ? DOC_TYPES : DOC_TYPES.slice(0, 4);
    for (const d of docs) {
      await db.vendorDocument.create({
        data: {
          vendorId: created.id,
          docType: d,
          fileName: `${slug}-${d.toLowerCase().replace(/[^a-z]+/g, "-")}.pdf`,
          fileSize: int(140, 3800) * 1024,
          // Documents are uploaded between registration and enlistment, and
          // verified at enlistment. Ordering these correctly keeps the vendor
          // timeline coherent when someone opens the record.
          uploadedAt: new Date(registeredAt.getTime() + int(1, 10) * 86_400_000),
          verifiedBy: enlistedAt ? "Shahidul Islam" : null,
          verifiedAt: enlistedAt,
        },
      });
    }
  }

  // --- Vendor portal logins ----------------------------------------------
  // Vendors are a separate identity class: userType VENDOR, the VENDOR role,
  // and a cookie that the internal application does not read.
  const vendorRole = await db.role.findUniqueOrThrow({ where: { code: "VENDOR" } });

  const logins: Array<{ vendor: string; email: string; name: string }> = [
    { vendor: "Rahim Traders Ltd", email: "bids@rahimtraders.com.bd", name: "Abdur Rahim" },
    { vendor: "Meghna Technologies Ltd", email: "bids@meghnatech.com.bd", name: "Shahadat Hossain" },
    { vendor: "Bengal Office Solutions", email: "bids@bengaloffice.com.bd", name: "Nasima Khatun" },
  ];

  const vendorUsers: Record<string, { id: string; fullName: string }> = {};
  for (const [i, l] of logins.entries()) {
    const u = await db.user.create({
      data: {
        employeeId: `VEN/${String(i + 1).padStart(4, "0")}`,
        fullName: l.name,
        email: l.email,
        passwordHash: password,
        designation: "Authorised Representative",
        userType: "VENDOR",
        roles: { create: [{ roleId: vendorRole.id }] },
        vendorUser: { create: { vendorId: vendors[l.vendor]!.id } },
      },
    });
    vendorUsers[l.vendor] = u;
  }

  return { vendors, vendorUsers };
}
