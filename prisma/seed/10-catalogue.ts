import type { PrismaClient } from "@prisma/client";
import { int, daysAgo, chance } from "./rng";

/**
 * Item catalogue, warehouses and stock balances.
 *
 * The laptop line is load-bearing: stock must be exactly 3 against a
 * requisition for 15, so the stock check splits 3 from store and 12 to
 * purchase, and the tender that follows is for 12 units at the price the
 * seeded bids quote. Do not change IT-LAP-0041's on-hand quantity without
 * re-checking the whole thread.
 */

interface ItemSpec {
  code: string; name: string; cat: string; uom: string; capex: "CAPEX" | "OPEX";
  gl: string; stock: number; reorder: number; lastPrice: number; spec?: string;
}

const CATEGORIES: Array<{ code: string; name: string; children: Array<{ code: string; name: string }> }> = [
  { code: "IT", name: "IT Equipment", children: [
    { code: "IT-COM", name: "Computers" }, { code: "IT-PER", name: "Peripherals" }, { code: "IT-NET", name: "Networking" },
  ]},
  { code: "FF", name: "Furniture and Fixtures", children: [
    { code: "FF-DSK", name: "Desks" }, { code: "FF-CHR", name: "Chairs" }, { code: "FF-STO", name: "Storage" },
  ]},
  { code: "OS", name: "Office Supplies", children: [
    { code: "OS-STA", name: "Stationery" }, { code: "OS-CON", name: "Consumables" },
  ]},
  { code: "EL", name: "Electrical Equipment", children: [] },
  { code: "VT", name: "Vehicles and Transport", children: [] },
  { code: "MD", name: "Medical Supplies", children: [] },
  { code: "PB", name: "Printing and Branding", children: [] },
  { code: "CI", name: "Civil and Interior Materials", children: [] },
];

/** 60 items at plausible Bangladeshi market prices (poisha). */
const ITEMS: ItemSpec[] = [
  // --- IT: Computers (the demo thread lives here) ------------------------
  { code: "IT-LAP-0041", name: "Laptop, Dell Latitude 5450, i5 16GB 512GB", cat: "IT-COM", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 3, reorder: 10, lastPrice: 118500_00,
    spec: "Intel Core i5-1335U, 16GB DDR5, 512GB NVMe SSD, 14\" FHD, Windows 11 Pro, 3-year onsite warranty" },
  { code: "IT-LAP-0042", name: "Laptop, HP ProBook 450 G10, i7 16GB 512GB", cat: "IT-COM", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 6, reorder: 8, lastPrice: 142000_00 },
  { code: "IT-DSK-0015", name: "Desktop, Dell OptiPlex 7010 SFF, i5 8GB 256GB", cat: "IT-COM", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 11, reorder: 10, lastPrice: 86500_00 },
  { code: "IT-DSK-0016", name: "Desktop, HP ProDesk 400 G9, i3 8GB 256GB", cat: "IT-COM", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 4, reorder: 10, lastPrice: 68000_00 },
  { code: "IT-SRV-0003", name: "Rack Server, Dell PowerEdge R650, Xeon Silver", cat: "IT-COM", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 1, reorder: 2, lastPrice: 1285000_00 },
  { code: "IT-TAB-0008", name: "Tablet, Samsung Galaxy Tab A9+, 64GB LTE", cat: "IT-COM", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 9, reorder: 6, lastPrice: 32500_00 },
  // --- IT: Peripherals ----------------------------------------------------
  { code: "IT-MON-0018", name: "Monitor, 24 inch LED, Dell P2425", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 14, reorder: 12, lastPrice: 21800_00 },
  { code: "IT-MON-0019", name: "Monitor, 27 inch LED, HP E27 G5", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-01", stock: 7, reorder: 6, lastPrice: 34900_00 },
  { code: "IT-PRN-0009", name: "Printer, Laser Mono, HP LaserJet Pro M404dn", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-02", stock: 2, reorder: 5, lastPrice: 34200_00 },
  { code: "IT-PRN-0011", name: "Printer, Dot Matrix, Epson LQ-310", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-02", stock: 8, reorder: 6, lastPrice: 24500_00 },
  { code: "IT-SCN-0004", name: "Scanner, Document, Canon DR-C225 II", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-02", stock: 5, reorder: 4, lastPrice: 48500_00 },
  { code: "IT-UPS-0022", name: "UPS, 1kVA Line Interactive, APC", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-03", stock: 18, reorder: 15, lastPrice: 12800_00 },
  { code: "IT-UPS-0023", name: "UPS, 6kVA Online Rack Mount", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-03", stock: 2, reorder: 3, lastPrice: 185000_00 },
  { code: "IT-KBM-0031", name: "Keyboard and Mouse Set, USB, Logitech MK275", cat: "IT-PER", uom: "Set", capex: "OPEX", gl: "2301-08", stock: 42, reorder: 30, lastPrice: 2450_00 },
  { code: "IT-TON-0055", name: "Toner Cartridge, HP 59A Black", cat: "IT-PER", uom: "Piece", capex: "OPEX", gl: "2301-09", stock: 26, reorder: 20, lastPrice: 11200_00 },
  { code: "IT-TON-0056", name: "Toner Cartridge, Canon 337 Black", cat: "IT-PER", uom: "Piece", capex: "OPEX", gl: "2301-09", stock: 15, reorder: 20, lastPrice: 8900_00 },
  { code: "IT-HDD-0044", name: "External Hard Drive, 2TB USB 3.0", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-02", stock: 12, reorder: 8, lastPrice: 9800_00 },
  { code: "IT-BIO-0007", name: "Biometric Fingerprint Reader, ZKTeco", cat: "IT-PER", uom: "Unit", capex: "CAPEX", gl: "1204-04", stock: 6, reorder: 5, lastPrice: 15400_00 },
  // --- IT: Networking -----------------------------------------------------
  { code: "IT-SWT-0012", name: "Network Switch, 24-port Gigabit Managed, Cisco", cat: "IT-NET", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 4, reorder: 4, lastPrice: 96500_00 },
  { code: "IT-SWT-0013", name: "Network Switch, 8-port Gigabit Unmanaged", cat: "IT-NET", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 16, reorder: 10, lastPrice: 4800_00 },
  { code: "IT-RTR-0006", name: "Router, Enterprise Branch, MikroTik CCR2004", cat: "IT-NET", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 3, reorder: 3, lastPrice: 68000_00 },
  { code: "IT-WAP-0019", name: "Wireless Access Point, Wi-Fi 6, Ubiquiti U6-Pro", cat: "IT-NET", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 11, reorder: 8, lastPrice: 24500_00 },
  { code: "IT-FWL-0002", name: "Firewall Appliance, FortiGate 100F", cat: "IT-NET", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 1, reorder: 2, lastPrice: 785000_00 },
  { code: "IT-CBL-0067", name: "Cat6 UTP Cable, 305m Box", cat: "IT-NET", uom: "Box", capex: "OPEX", gl: "2301-10", stock: 9, reorder: 6, lastPrice: 14500_00 },
  { code: "IT-PPL-0021", name: "Patch Panel, 24-port Cat6", cat: "IT-NET", uom: "Unit", capex: "CAPEX", gl: "1204-05", stock: 7, reorder: 5, lastPrice: 6800_00 },
  // --- Furniture ----------------------------------------------------------
  { code: "FF-CHR-0027", name: "Executive Chair, high back, mesh", cat: "FF-CHR", uom: "Unit", capex: "CAPEX", gl: "1206-01", stock: 8, reorder: 10, lastPrice: 14900_00 },
  { code: "FF-CHR-0028", name: "Visitor Chair, fixed frame, fabric", cat: "FF-CHR", uom: "Unit", capex: "CAPEX", gl: "1206-01", stock: 34, reorder: 25, lastPrice: 5200_00 },
  { code: "FF-CHR-0029", name: "Operator Chair, mid back, adjustable", cat: "FF-CHR", uom: "Unit", capex: "CAPEX", gl: "1206-01", stock: 21, reorder: 20, lastPrice: 8400_00 },
  { code: "FF-DSK-0014", name: "Office Desk, 5ft with side drawer", cat: "FF-DSK", uom: "Unit", capex: "CAPEX", gl: "1206-01", stock: 13, reorder: 12, lastPrice: 18500_00 },
  { code: "FF-DSK-0015", name: "Workstation Cluster, 4-seat modular", cat: "FF-DSK", uom: "Set", capex: "CAPEX", gl: "1206-01", stock: 2, reorder: 3, lastPrice: 92000_00 },
  { code: "FF-DSK-0016", name: "Teller Counter Unit, laminated", cat: "FF-DSK", uom: "Unit", capex: "CAPEX", gl: "1206-02", stock: 3, reorder: 4, lastPrice: 68500_00 },
  { code: "FF-STO-0033", name: "Filing Cabinet, 4-drawer steel", cat: "FF-STO", uom: "Unit", capex: "CAPEX", gl: "1206-01", stock: 17, reorder: 12, lastPrice: 16800_00 },
  { code: "FF-STO-0034", name: "Fire Resistant Safe, 120kg", cat: "FF-STO", uom: "Unit", capex: "CAPEX", gl: "1206-03", stock: 2, reorder: 2, lastPrice: 145000_00 },
  { code: "FF-STO-0035", name: "Book Shelf, 5-tier wooden", cat: "FF-STO", uom: "Unit", capex: "CAPEX", gl: "1206-01", stock: 9, reorder: 8, lastPrice: 12400_00 },
  // --- Office supplies ----------------------------------------------------
  { code: "OS-PPR-0112", name: "A4 Paper, 80gsm, ream", cat: "OS-CON", uom: "Ream", capex: "OPEX", gl: "2301-04", stock: 340, reorder: 200, lastPrice: 520_00 },
  { code: "OS-PPR-0113", name: "Legal Size Paper, 80gsm, ream", cat: "OS-CON", uom: "Ream", capex: "OPEX", gl: "2301-04", stock: 96, reorder: 80, lastPrice: 640_00 },
  { code: "OS-PEN-0201", name: "Ball Point Pen, blue, box of 50", cat: "OS-STA", uom: "Box", capex: "OPEX", gl: "2301-04", stock: 58, reorder: 40, lastPrice: 450_00 },
  { code: "OS-FIL-0088", name: "Box File, foolscap", cat: "OS-STA", uom: "Piece", capex: "OPEX", gl: "2301-04", stock: 210, reorder: 150, lastPrice: 145_00 },
  { code: "OS-REG-0091", name: "Register Book, 400 pages", cat: "OS-STA", uom: "Piece", capex: "OPEX", gl: "2301-04", stock: 74, reorder: 60, lastPrice: 380_00 },
  { code: "OS-STP-0104", name: "Stapler, heavy duty with pins", cat: "OS-STA", uom: "Piece", capex: "OPEX", gl: "2301-04", stock: 38, reorder: 30, lastPrice: 620_00 },
  { code: "OS-ENV-0117", name: "Envelope, A4 window, pack of 100", cat: "OS-CON", uom: "Pack", capex: "OPEX", gl: "2301-04", stock: 82, reorder: 60, lastPrice: 340_00 },
  { code: "OS-CLN-0140", name: "Floor Cleaner, 5 litre", cat: "OS-CON", uom: "Bottle", capex: "OPEX", gl: "2301-06", stock: 44, reorder: 30, lastPrice: 680_00 },
  { code: "OS-TSU-0142", name: "Tissue Roll, 2-ply, pack of 12", cat: "OS-CON", uom: "Pack", capex: "OPEX", gl: "2301-06", stock: 120, reorder: 80, lastPrice: 560_00 },
  { code: "OS-WTR-0150", name: "Drinking Water Jar, 20 litre", cat: "OS-CON", uom: "Jar", capex: "OPEX", gl: "2301-06", stock: 65, reorder: 50, lastPrice: 90_00 },
  // --- Electrical ---------------------------------------------------------
  { code: "EL-ACU-0009", name: "Air Conditioner, 2 Ton Split, Inverter", cat: "EL", uom: "Unit", capex: "CAPEX", gl: "1205-01", stock: 5, reorder: 6, lastPrice: 112000_00 },
  { code: "EL-ACU-0010", name: "Air Conditioner, 1.5 Ton Split", cat: "EL", uom: "Unit", capex: "CAPEX", gl: "1205-01", stock: 8, reorder: 8, lastPrice: 78500_00 },
  { code: "EL-GEN-0002", name: "Diesel Generator, 60 kVA, soundproof", cat: "EL", uom: "Unit", capex: "CAPEX", gl: "1205-02", stock: 1, reorder: 1, lastPrice: 1450000_00 },
  { code: "EL-LED-0055", name: "LED Panel Light, 40W, 2x2 ft", cat: "EL", uom: "Piece", capex: "OPEX", gl: "2301-11", stock: 88, reorder: 60, lastPrice: 1450_00 },
  { code: "EL-CBL-0071", name: "Electrical Cable, 2.5 sq mm, 100 yard coil", cat: "EL", uom: "Coil", capex: "OPEX", gl: "2301-11", stock: 14, reorder: 10, lastPrice: 8900_00 },
  { code: "EL-STB-0018", name: "Voltage Stabilizer, 5kVA", cat: "EL", uom: "Unit", capex: "CAPEX", gl: "1205-01", stock: 6, reorder: 5, lastPrice: 22400_00 },
  { code: "EL-FAN-0024", name: "Ceiling Fan, 56 inch", cat: "EL", uom: "Unit", capex: "OPEX", gl: "2301-11", stock: 23, reorder: 15, lastPrice: 4800_00 },
  // --- Vehicles and transport --------------------------------------------
  { code: "VT-TYR-0033", name: "Tyre, 195/65 R15, tubeless", cat: "VT", uom: "Piece", capex: "OPEX", gl: "2302-02", stock: 16, reorder: 12, lastPrice: 11500_00 },
  { code: "VT-BAT-0012", name: "Car Battery, 12V 65Ah", cat: "VT", uom: "Unit", capex: "OPEX", gl: "2302-02", stock: 7, reorder: 6, lastPrice: 14200_00 },
  { code: "VT-OIL-0044", name: "Engine Oil, 5W-30 synthetic, 4 litre", cat: "VT", uom: "Can", capex: "OPEX", gl: "2302-03", stock: 28, reorder: 20, lastPrice: 4600_00 },
  // --- Medical ------------------------------------------------------------
  { code: "MD-KIT-0005", name: "First Aid Box, standard branch kit", cat: "MD", uom: "Unit", capex: "OPEX", gl: "2303-01", stock: 19, reorder: 15, lastPrice: 3200_00 },
  { code: "MD-BPM-0003", name: "Blood Pressure Monitor, digital", cat: "MD", uom: "Unit", capex: "CAPEX", gl: "1207-01", stock: 4, reorder: 4, lastPrice: 5400_00 },
  // --- Printing and branding ---------------------------------------------
  { code: "PB-LET-0077", name: "Letterhead, A4, 4-colour, pack of 500", cat: "PB", uom: "Pack", capex: "OPEX", gl: "2301-05", stock: 48, reorder: 40, lastPrice: 2800_00 },
  { code: "PB-VIS-0081", name: "Visiting Card, box of 100", cat: "PB", uom: "Box", capex: "OPEX", gl: "2301-05", stock: 130, reorder: 100, lastPrice: 450_00 },
  { code: "PB-SGN-0016", name: "Branch Signage Board, backlit acrylic", cat: "PB", uom: "Unit", capex: "CAPEX", gl: "1206-04", stock: 2, reorder: 2, lastPrice: 185000_00 },
  { code: "PB-CHQ-0029", name: "Cheque Book, 25 leaf, MICR printed", cat: "PB", uom: "Book", capex: "OPEX", gl: "2301-05", stock: 480, reorder: 300, lastPrice: 88_00 },
  // --- Civil and interior -------------------------------------------------
  { code: "CI-PNT-0062", name: "Interior Emulsion Paint, 20 litre", cat: "CI", uom: "Bucket", capex: "OPEX", gl: "2304-01", stock: 21, reorder: 15, lastPrice: 9800_00 },
  { code: "CI-TIL-0038", name: "Floor Tile, 24x24 inch vitrified, per box", cat: "CI", uom: "Box", capex: "OPEX", gl: "2304-01", stock: 64, reorder: 40, lastPrice: 2400_00 },
  { code: "CI-GLS-0025", name: "Toughened Glass Partition, per sq ft", cat: "CI", uom: "Sq Ft", capex: "CAPEX", gl: "1206-05", stock: 0, reorder: 100, lastPrice: 1250_00 },
  { code: "CI-CRP-0049", name: "Office Carpet Tile, per sq metre", cat: "CI", uom: "Sq M", capex: "OPEX", gl: "2304-01", stock: 145, reorder: 100, lastPrice: 1850_00 },
];

export async function seedCatalogue(db: PrismaClient) {
  // --- Categories ---------------------------------------------------------
  const catIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const parent = await db.itemCategory.create({ data: { name: c.name, code: c.code } });
    catIds[c.code] = parent.id;
    for (const child of c.children) {
      const sub = await db.itemCategory.create({
        data: { name: child.name, code: child.code, parentId: parent.id },
      });
      catIds[child.code] = sub.id;
    }
  }

  // --- Warehouses ---------------------------------------------------------
  const warehouses = await Promise.all([
    db.warehouse.create({ data: { name: "Central Store, Head Office", code: "WH-CHO", location: "Basement 1, Shahjalal Islami Bank Tower, Gulshan, Dhaka", capacity: 12000 } }),
    db.warehouse.create({ data: { name: "IT Store, Head Office", code: "WH-ITS", location: "Level 6, Shahjalal Islami Bank Tower, Gulshan, Dhaka", capacity: 3500 } }),
    db.warehouse.create({ data: { name: "Regional Store, Chattogram", code: "WH-CTG", location: "Agrabad C/A, Chattogram", capacity: 4200 } }),
  ]);
  const central = warehouses[0]!;

  // --- Items and stock ----------------------------------------------------
  const items: Record<string, { id: string; code: string; name: string }> = {};
  for (const spec of ITEMS) {
    const item = await db.item.create({
      data: {
        code: spec.code, name: spec.name, categoryId: catIds[spec.cat]!,
        unitOfMeasure: spec.uom, capexOpex: spec.capex, glCode: spec.gl,
        reorderLevel: spec.reorder, specification: spec.spec ?? "",
      },
    });
    items[spec.code] = item;

    await db.stockBalance.create({
      data: {
        itemId: item.id,
        warehouseId: central.id,
        quantityOnHand: spec.stock,
        // Some items legitimately have units on the way in, which is what the
        // requisition screen surfaces as "stock in transit".
        quantityInTransit: chance(0.25) ? int(1, 8) : 0,
        quantityUnderPurchase: chance(0.2) ? int(2, 15) : 0,
        lastPurchasePrice: spec.lastPrice,
        lastPurchaseDate: daysAgo(int(20, 260)),
      },
    });
  }

  return { catIds, warehouses, items, itemSpecs: ITEMS };
}
