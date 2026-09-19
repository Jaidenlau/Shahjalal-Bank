import type { PrismaClient } from "@prisma/client";
import {
  contractNo, workOrderNo, gatePassNo, dispatchNo, visitorNo, auctionLotNo,
  claimNo, tripNo, canteenOrderNo, projectNo, scheduleNo, policyNo,
} from "../../src/lib/docno";
import {
  daysAgo, daysAhead, int, pick, pickMany, chance, personName,
  VISITOR_COMPANIES, VISIT_PURPOSES, CANTEEN_ITEMS, MEDICAL_ITEMS,
  INSURERS, CARRIERS, VEHICLE_MODELS, DHAKA_AREAS, DESIGNATIONS,
} from "./rng";

/**
 * P1 and P2 module data.
 *
 * Volume is the point here. A visitor log with three rows looks like a
 * prototype; one with forty looks like a system that has been running. Anyone
 * who wanders off the demo path should land on a register that looks lived in.
 */

const SITES = [
  "Corporate Head Office, Gulshan", "Gulshan Branch", "Motijheel Branch",
  "Dhanmondi Branch", "Uttara Branch", "Agrabad Branch, Chattogram", "Zindabazar Branch, Sylhet",
];

export async function seedModules(
  db: PrismaClient,
  ctx: {
    dept: Record<string, { id: string }>;
    branch: Record<string, { id: string; name: string }>;
    users: Record<string, { id: string; fullName: string }>;
    vendors: Record<string, { id: string; companyName: string }>;
  },
) {
  const YEAR = 2026;
  const { dept, branch, users, vendors } = ctx;
  const branchList = Object.values(branch);
  const vendorList = Object.values(vendors);

  // -------------------------------------------------------------------------
  // Assets (30) and maintenance work orders
  // -------------------------------------------------------------------------
  const assetSpecs: Array<[string, string, number, number]> = [
    ["Desktop Computer, Dell OptiPlex 7010", "IT Equipment", 86500_00, 2000],
    ["Laptop, HP ProBook 450 G10", "IT Equipment", 142000_00, 2000],
    ["Rack Server, Dell PowerEdge R650", "IT Equipment", 1285000_00, 2000],
    ["Network Switch, Cisco Catalyst 24-port", "IT Equipment", 96500_00, 2000],
    ["Firewall, FortiGate 100F", "IT Equipment", 785000_00, 2000],
    ["UPS, 6kVA Online Rack Mount", "Electrical", 185000_00, 1500],
    ["Diesel Generator, 60 kVA", "Electrical", 1450000_00, 1000],
    ["Air Conditioner, 2 Ton Split Inverter", "Electrical", 112000_00, 1500],
    ["Photocopier, Canon imageRUNNER 2630i", "Office Equipment", 385000_00, 2000],
    ["Fire Resistant Safe, 120kg", "Furniture & Fixtures", 145000_00, 1000],
    ["Teller Counter Unit", "Furniture & Fixtures", 68500_00, 1000],
    ["Workstation Cluster, 4-seat", "Furniture & Fixtures", 92000_00, 1000],
    ["Executive Desk with Credenza", "Furniture & Fixtures", 78000_00, 1000],
    ["Branch Signage Board, backlit", "Furniture & Fixtures", 185000_00, 1500],
    ["CCTV System, 16-channel with NVR", "Security Equipment", 240000_00, 1500],
    ["Access Control System, 4-door", "Security Equipment", 168000_00, 1500],
    ["Currency Counting Machine, Glory", "Banking Equipment", 320000_00, 2000],
    ["Fake Note Detector Machine", "Banking Equipment", 48000_00, 2000],
    ["ATM Machine, NCR SelfServ 22", "Banking Equipment", 1850000_00, 1500],
    ["Cheque Scanner, Digital Check", "Banking Equipment", 165000_00, 2000],
  ];

  const assets: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < 30; i++) {
    const [name, category, cost, rate] = assetSpecs[i % assetSpecs.length]!;
    const purchaseDate = daysAgo(int(200, 1800));
    const yearsHeld = (Date.now() - purchaseDate.getTime()) / (365 * 86_400_000);
    const accumulated = Math.min(cost, Math.round(cost * (rate / 10_000) * yearsHeld));
    const b = pick(branchList);
    const a = await db.asset.create({
      data: {
        assetTag: `SJIBL/FA/${YEAR}/${String(1000 + i).padStart(4, "0")}`,
        name, category,
        serialNo: `SN${int(100000, 999999)}${String.fromCharCode(65 + (i % 26))}`,
        location: `${b.name}, ${pick(["Ground Floor", "1st Floor", "2nd Floor", "3rd Floor", "Server Room", "Vault Area"])}`,
        branchId: b.id,
        departmentId: pick(Object.values(dept)).id,
        purchaseDate, purchaseCost: cost,
        depreciationRateBp: rate,
        accumulatedDepreciation: accumulated,
        bookValue: Math.max(0, cost - accumulated),
        status: i % 11 === 0 ? "UNDER_REPAIR" : i % 17 === 0 ? "RETIRED" : "IN_USE",
        warrantyExpiry: daysAhead(int(-400, 500)),
        specification: `${name}. Asset capitalised under the fixed asset register and depreciated at ${rate / 100}% per annum on the straight line basis.`,
      },
    });
    assets.push({ id: a.id, name });
  }

  let woSeq = 220;
  for (const a of pickMany(assets, 18)) {
    const reportedAt = daysAgo(int(5, 240));
    const isDone = chance(0.65);
    await db.assetMaintenance.create({
      data: {
        assetId: a.id,
        workOrderNo: workOrderNo(YEAR, woSeq++),
        type: chance(0.55) ? "PREVENTIVE" : "CORRECTIVE",
        description: pick([
          "Scheduled preventive servicing as per the annual maintenance contract.",
          "Unit not powering on. Reported by the branch operations team.",
          "Cooling performance degraded; gas refill and coil cleaning required.",
          "Routine inspection and filter replacement.",
          "Intermittent fault reported. Diagnostic visit raised with the vendor.",
          "Firmware update and configuration backup.",
        ]),
        reportedAt,
        completedAt: isDone ? new Date(reportedAt.getTime() + int(1, 14) * 86_400_000) : null,
        cost: isDone ? int(1500, 48000) * 100 : 0,
        status: isDone ? "COMPLETED" : chance(0.5) ? "IN_PROGRESS" : "OPEN",
        vendorName: pick(vendorList).companyName,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Contracts (15), two expiring inside 60 days
  // -------------------------------------------------------------------------
  const contractSpecs: Array<[string, string, number, number]> = [
    ["Annual Maintenance Contract — Air Conditioning Units", "AMC", 1850000_00, 42],
    ["Annual Maintenance Contract — Generator Sets", "AMC", 980000_00, 55],
    ["Housekeeping and Cleaning Services, Head Office", "SERVICE", 4200000_00, 180],
    ["Security Guard Services, Dhaka Branches", "SERVICE", 8600000_00, 240],
    ["Rate Contract — A4 Paper and Printing Stationery", "SUPPLY", 3100000_00, 120],
    ["Annual Maintenance Contract — Lift and Elevator", "AMC", 1420000_00, 310],
    ["Vehicle Rental Agreement — Pool Cars", "LEASE", 5400000_00, 200],
    ["Rate Contract — Toner and Printer Consumables", "SUPPLY", 2280000_00, 95],
    ["Office Premises Lease, Uttara Branch", "LEASE", 12600000_00, 420],
    ["Annual Maintenance Contract — CCTV and Access Control", "AMC", 1180000_00, 265],
    ["Courier and Document Dispatch Services", "SERVICE", 1640000_00, 150],
    ["Rate Contract — Furniture Supply and Installation", "SUPPLY", 4800000_00, 330],
    ["Annual Maintenance Contract — UPS and Power Systems", "AMC", 860000_00, 75],
    ["Pest Control Services, All Premises", "SERVICE", 620000_00, 285],
    ["Rate Contract — Drinking Water Supply", "SUPPLY", 480000_00, 165],
    ["Interior Fit-Out and Civil Works — Dhanmondi Branch", "SERVICE", 9400000_00, 140],
    ["Staff Canteen Catering Services, Head Office", "SERVICE", 2760000_00, 88],
  ];

  for (const [i, [title, type, value, daysToExpiry]] of contractSpecs.entries()) {
    const endDate = daysAhead(daysToExpiry);
    const startDate = new Date(endDate.getTime() - 365 * 86_400_000);
    const contract = await db.contract.create({
      data: {
        contractNo: contractNo(YEAR, 40 + i),
        title, type, value,
        vendorId: pick(vendorList).id,
        startDate, endDate,
        status: "ACTIVE",
        performanceSecurity: Math.round(value * 0.05),
        retentionMoney: Math.round(value * 0.05),
        slaTerms:
          type === "AMC"
            ? "Response within 4 hours for critical faults, 1 business day for non-critical. Quarterly preventive visits."
            : type === "SERVICE"
            ? "Service delivery as per the agreed schedule. Monthly performance review against the agreed scope."
            : "Delivery within 7 working days of each call-off order. Prices firm for the contract period.",
        renewalNoticeDays: 60,
      },
    });
    const count = int(2, 4);
    for (let m = 0; m < count; m++) {
      const due = new Date(startDate.getTime() + ((m + 1) / (count + 1)) * (endDate.getTime() - startDate.getTime()));
      await db.contractMilestone.create({
        data: {
          contractId: contract.id,
          name: type === "AMC" ? `Quarter ${m + 1} preventive maintenance visit` : `Instalment ${m + 1}`,
          dueDate: due,
          amount: Math.round(value / count),
          status: due.getTime() < Date.now() ? "COMPLETED" : "PENDING",
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Vehicles (12) with trips and fuel logs
  // -------------------------------------------------------------------------
  let tripSeq = 1040; // monotonic: trip numbers must be unique across vehicles
  for (let i = 0; i < 12; i++) {
    const [make, model, type] = VEHICLE_MODELS[i % VEHICLE_MODELS.length]!;
    // One road tax expiring soon, so the expiry notification has something real.
    const taxDays = i === 2 ? 18 : int(60, 640);
    const vehicle = await db.vehicle.create({
      data: {
        registrationNo: `DHAKA METRO-${pick(["GA", "GHA", "KHA", "CHA"])} ${int(11, 39)}-${int(1000, 9999)}`,
        make, model, year: int(2016, 2024), type,
        assignedTo: chance(0.7) ? pick(["Managing Director's Office", "Common Services Division", "IT Division", "General Banking Division", "Cash Movement"]) : null,
        driverName: personName("M"),
        branchName: pick(SITES),
        status: i === 7 ? "UNDER_REPAIR" : "ACTIVE",
        taxTokenExpiry: daysAhead(taxDays),
        fitnessExpiry: daysAhead(int(40, 500)),
        insuranceExpiry: daysAhead(int(30, 400)),
        odometerKm: int(18000, 186000),
      },
    });

    for (let t = 0; t < int(3, 6); t++) {
      const startedAt = daysAgo(int(1, 90));
      await db.vehicleTrip.create({
        data: {
          vehicleId: vehicle.id,
          tripNo: tripNo(YEAR, tripSeq++),
          purpose: pick(["Cash movement to branch", "Management visit to branch", "Document delivery to Bangladesh Bank",
            "Staff transport", "Vendor site visit", "Airport pickup — visiting delegation", "Branch inspection"]),
          origin: "Corporate Head Office, Gulshan",
          destination: pick(SITES.filter(s => !s.includes("Head Office"))),
          startedAt,
          endedAt: new Date(startedAt.getTime() + int(1, 9) * 3_600_000),
          distanceKm: int(6, 260),
          requestedBy: personName(chance(0.3) ? "F" : "M"),
          status: "COMPLETED",
        },
      });
    }

    for (let f = 0; f < int(3, 7); f++) {
      const litres = int(2000, 5500); // stored x100
      await db.fuelLog.create({
        data: {
          vehicleId: vehicle.id,
          filledAt: daysAgo(int(1, 120)),
          litres,
          costAmount: Math.round((litres / 100) * 122_00), // ~BDT 122/litre octane
          odometerKm: int(18000, 186000),
          station: pick(["Padma Filling Station, Gulshan", "Meghna CNG & Filling, Tejgaon",
            "Jamuna Filling Station, Mohakhali", "Rupali Filling Station, Motijheel"]),
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Visitors (40) across the last week, plus appointments
  // -------------------------------------------------------------------------
  for (let i = 0; i < 40; i++) {
    const gender = chance(0.25) ? "F" : "M";
    const name = personName(gender);
    const checkIn = daysAgo(int(0, 6));
    const stillIn = i < 4; // a few currently on site
    await db.visitor.create({
      data: {
        visitorNo: visitorNo(YEAR, 4200 + i),
        fullName: name,
        company: pick(VISITOR_COMPANIES),
        phone: `+880 1${int(3, 9)}${int(10, 99)}-${int(100000, 999999)}`,
        nid: `${int(1000, 9999)}${int(100000000, 999999999)}`,
        purpose: pick(VISIT_PURPOSES),
        hostName: pick(Object.values(users)).fullName,
        hostDepartment: pick(["Common Services Division", "IT Division", "Finance and Accounts Division",
          "Human Resources Division", "General Banking Division"]),
        branchId: pick(branchList).id,
        checkInAt: checkIn,
        checkOutAt: stillIn ? null : new Date(checkIn.getTime() + int(20, 220) * 60_000),
        badgeNo: `V-${String(int(1, 250)).padStart(3, "0")}`,
        isBlacklisted: i === 31,
        photoInitials: name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      },
    });
  }

  for (let i = 0; i < 12; i++) {
    const scheduledAt = daysAhead(int(0, 10));
    await db.visitorAppointment.create({
      data: {
        visitorName: personName(chance(0.3) ? "F" : "M"),
        company: pick(VISITOR_COMPANIES),
        hostName: pick(Object.values(users)).fullName,
        scheduledAt,
        purpose: pick(VISIT_PURPOSES),
        status: "SCHEDULED",
      },
    });
  }

  // -------------------------------------------------------------------------
  // Canteen orders (25) from today
  // -------------------------------------------------------------------------
  const today = new Date();
  for (let i = 0; i < 25; i++) {
    const picked = pickMany(CANTEEN_ITEMS, int(1, 3));
    const lines = picked.map(([n, p]) => ({ name: n, qty: int(1, 2), price: p }));
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const ordered = new Date(today);
    ordered.setUTCHours(int(3, 8), int(0, 59), 0, 0);
    await db.canteenOrder.create({
      data: {
        orderNo: canteenOrderNo(YEAR, 18400 + i),
        employeeName: personName(chance(0.3) ? "F" : "M"),
        employeeId: `SJIBL/${int(1000, 4999)}`,
        department: pick(["Common Services Division", "IT Division", "Finance and Accounts Division",
          "Human Resources Division", "General Banking Division", "Credit Division", "Treasury"]),
        items: JSON.stringify(lines),
        totalAmount: total,
        orderedAt: ordered,
        servingSlot: pick(["12:30 – 13:00", "13:00 – 13:30", "13:30 – 14:00"]),
        status: i < 14 ? "SERVED" : i < 20 ? "PREPARING" : i === 24 ? "CANCELLED" : "PLACED",
        paymentStatus: "PENDING_GATEWAY",
      },
    });
  }

  // -------------------------------------------------------------------------
  // Medical items (35)
  // -------------------------------------------------------------------------
  for (let i = 0; i < 35; i++) {
    const [name, category, uom] = MEDICAL_ITEMS[i % MEDICAL_ITEMS.length]!;
    const isEquipment = category === "Equipment";
    await db.medicalItem.create({
      data: {
        code: `MED-${String(100 + i).padStart(4, "0")}`,
        name: i >= MEDICAL_ITEMS.length ? `${name} (Branch Stock)` : name,
        category, unitOfMeasure: uom,
        quantityOnHand: isEquipment ? int(1, 8) : int(0, 240),
        reorderLevel: isEquipment ? 2 : int(20, 80),
        expiryDate: isEquipment ? null : daysAhead(int(-30, 640)),
        batchNo: isEquipment ? null : `B${int(10000, 99999)}`,
        supplier: "Surma Medical Supplies",
      },
    });
  }

  // -------------------------------------------------------------------------
  // Insurance policies (20) and claims
  // -------------------------------------------------------------------------
  const policyTypes: Array<[string, string, number]> = [
    ["VEHICLE", "Pool vehicle comprehensive cover", 2400000_00],
    ["LOCKER", "Safe deposit locker contents cover", 15000000_00],
    ["VAULT", "Cash in vault and cash in transit", 45000000_00],
    ["PROPERTY", "Building and contents, fire and allied perils", 68000000_00],
    ["FIDELITY", "Employee fidelity guarantee", 8000000_00],
  ];
  const policies: Array<{ id: string }> = [];
  for (let i = 0; i < 20; i++) {
    const [type, cover, sum] = policyTypes[i % policyTypes.length]!;
    const [insurer, code] = INSURERS[i % INSURERS.length]!;
    const endDate = daysAhead(int(20, 420));
    const p = await db.insurancePolicy.create({
      data: {
        policyNo: policyNo(code, YEAR, 500 + i),
        type, insurer,
        coveredAsset: `${cover} — ${pick(SITES)}`,
        sumInsured: sum,
        premium: Math.round(sum * 0.004),
        startDate: new Date(endDate.getTime() - 365 * 86_400_000),
        endDate,
        status: "ACTIVE",
      },
    });
    policies.push(p);
  }

  for (const [i, p] of pickMany(policies, 7).entries()) {
    const incident = daysAgo(int(20, 300));
    const settled = i < 4;
    const claimed = int(40000, 850000) * 100;
    await db.insuranceClaim.create({
      data: {
        claimNo: claimNo(YEAR, 120 + i),
        policyId: p.id,
        incidentDate: incident,
        description: pick([
          "Minor collision damage to pool vehicle during branch cash movement.",
          "Water damage to office equipment following a burst pipe on the floor above.",
          "Theft of an ATM peripheral from an offsite booth.",
          "Fire damage to electrical panel in the server room.",
          "Windscreen replacement following road debris damage.",
        ]),
        claimedAmount: claimed,
        settledAmount: settled ? Math.round(claimed * 0.82) : 0,
        status: settled ? "SETTLED" : chance(0.5) ? "UNDER_REVIEW" : "SUBMITTED",
        settledAt: settled ? new Date(incident.getTime() + int(30, 90) * 86_400_000) : null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Building utilities and preventive maintenance (14)
  // -------------------------------------------------------------------------
  const utilityTypes = ["ELECTRICITY", "WATER", "GAS", "GENERATOR", "LIFT", "HVAC"];
  for (let i = 0; i < 36; i++) {
    const utilityType = utilityTypes[i % utilityTypes.length]!;
    await db.buildingUtility.create({
      data: {
        site: SITES[i % SITES.length]!,
        utilityType,
        meterNo: ["ELECTRICITY", "WATER", "GAS"].includes(utilityType) ? `M-${int(100000, 999999)}` : null,
        readingDate: daysAgo(int(1, 90)),
        consumption: int(400, 18000),
        costAmount: int(8000, 240000) * 100,
        status: i === 19 ? "UNDER_MAINTENANCE" : "OPERATIONAL",
        vendorName: utilityType === "ELECTRICITY" ? "DPDC" : utilityType === "WATER" ? "Dhaka WASA"
          : utilityType === "GAS" ? "Titas Gas T&D" : pick(vendorList).companyName,
      },
    });
  }

  for (let i = 0; i < 14; i++) {
    const nextDue = daysAhead(int(-10, 90));
    await db.preventiveMaintenanceSchedule.create({
      data: {
        scheduleNo: scheduleNo(YEAR, 300 + i),
        site: SITES[i % SITES.length]!,
        equipment: pick(["Central HVAC Plant", "Passenger Lift A", "Passenger Lift B", "Diesel Generator 60 kVA",
          "Fire Suppression System", "UPS Bank, Server Room", "Water Pump and Reservoir",
          "Electrical Substation", "CCTV and NVR System", "Access Control Panel"]),
        frequency: pick(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUAL"]),
        lastServicedAt: daysAgo(int(20, 180)),
        nextDueAt: nextDue,
        assignedVendor: pick(vendorList).companyName,
        status: nextDue.getTime() < Date.now() ? "OVERDUE" : "SCHEDULED",
      },
    });
  }

  // -------------------------------------------------------------------------
  // Dispatch notes (18)
  // -------------------------------------------------------------------------
  for (let i = 0; i < 18; i++) {
    const dispatchedAt = daysAgo(int(0, 40));
    const status = i < 11 ? "DELIVERED" : i < 15 ? "IN_TRANSIT" : i === 15 ? "DELAYED" : i === 16 ? "DAMAGED" : "PENDING_APPROVAL";
    await db.dispatchNote.create({
      data: {
        dispatchNo: dispatchNo(YEAR, 600 + i),
        gatePassNo: gatePassNo(YEAR, 800 + i),
        itemDescription: pick([
          "Laptop computers for branch allocation", "Office stationery consignment",
          "Cheque books for branch distribution", "Printer toner cartridges",
          "Executive chairs, 6 units", "Network switches and patch panels",
          "Branch signage panels", "Archived records cartons for offsite storage",
          "Currency counting machine for servicing", "First aid boxes for branch distribution",
        ]),
        quantity: int(1, 40),
        fromLocation: "Central Store, Corporate Head Office",
        toLocation: pick(SITES.filter(s => !s.includes("Head Office"))),
        dispatchedAt,
        deliveredAt: status === "DELIVERED" ? new Date(dispatchedAt.getTime() + int(4, 40) * 3_600_000) : null,
        receivedBy: status === "DELIVERED" ? personName(chance(0.3) ? "F" : "M") : null,
        carrier: pick(CARRIERS),
        status,
        podFileName: status === "DELIVERED" ? `pod-${dispatchNo(YEAR, 600 + i).replace(/\//g, "-")}.pdf` : null,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Auction lots (6) with anonymous bids
  // -------------------------------------------------------------------------
  const lotSpecs: Array<[string, string, string, number]> = [
    ["Retired pool vehicle — Toyota Premio 2014", "Vehicles", "Sold as seen. Registration transfer at buyer's cost. Fitness expired.", 680000_00],
    ["Condemned desktop computers, lot of 24 units", "IT Non-IT", "Working condition not guaranteed. Data storage removed and destroyed.", 96000_00],
    ["Used office furniture — desks and chairs, 40 pieces", "Furniture & Fixtures", "Mixed condition. Buyer to arrange removal.", 145000_00],
    ["Retired air conditioning units, 8 units", "Electronics & Mechanical", "Compressors untested. Sold as scrap or for repair.", 72000_00],
    ["Obsolete printing equipment and plates", "Printing items", "Weight-based lot. Inspection permitted before bidding.", 38000_00],
    ["Retired pool vehicle — Toyota Noah 2012", "Vehicles", "High mileage. Engine overhauled in 2023. Sold as seen.", 520000_00],
  ];
  for (const [i, [title, category, description, reserve]] of lotSpecs.entries()) {
    const startsAt = daysAgo(int(2, 30));
    const endsAt = i < 4 ? daysAgo(int(0, 1)) : daysAhead(int(2, 9));
    const lot = await db.auctionLot.create({
      data: {
        lotNo: auctionLotNo(YEAR, 20 + i),
        title, category, description,
        reservePrice: reserve,
        startsAt, endsAt,
        status: endsAt.getTime() < Date.now() ? "CLOSED" : "OPEN",
      },
    });
    let running = reserve;
    for (let b = 0; b < int(3, 8); b++) {
      running += int(2000, 25000) * 100;
      await db.auctionBid.create({
        data: {
          lotId: lot.id,
          bidderAlias: `Bidder-${String.fromCharCode(65 + b)}${int(10, 99)}`,
          amount: running,
          placedAt: new Date(startsAt.getTime() + (b + 1) * int(2, 20) * 3_600_000),
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Civil works projects (9)
  // -------------------------------------------------------------------------
  const projectSpecs: Array<[string, string, number, number]> = [
    ["Interior refurbishment, Dhanmondi Branch", "Dhanmondi Branch", 5850000_00, 100],
    ["Branch fit-out, new Bashundhara sub-branch", "Bashundhara, Dhaka", 9200000_00, 62],
    ["Vault strengthening works, Motijheel Branch", "Motijheel Branch", 3400000_00, 100],
    ["Toilet block renovation, Head Office levels 3-5", "Corporate Head Office, Gulshan", 1850000_00, 78],
    ["Facade cleaning and repainting, Head Office", "Corporate Head Office, Gulshan", 2600000_00, 34],
    ["Server room civil and electrical works", "Corporate Head Office, Gulshan", 4100000_00, 100],
    ["Reception area remodelling, Uttara Branch", "Uttara Branch", 1240000_00, 18],
    ["Car park resurfacing, Head Office", "Corporate Head Office, Gulshan", 980000_00, 55],
    ["ATM booth construction, Agrabad", "Agrabad Branch, Chattogram", 1680000_00, 6],
  ];
  for (const [i, [title, site, boq, progress]] of projectSpecs.entries()) {
    const startDate = daysAgo(int(40, 280));
    const targetEnd = daysAhead(progress === 100 ? -int(5, 60) : int(20, 140));
    await db.civilWorksProject.create({
      data: {
        projectNo: projectNo(YEAR, 15 + i),
        title, site,
        contractor: pick(["Delta Engineering Works", "Shahjahan Furnishers", "Karnaphuli Trading"]),
        boqValue: boq,
        startDate, targetEndDate: targetEnd,
        actualEndDate: progress === 100 ? targetEnd : null,
        progressPct: progress,
        status: progress === 100 ? "COMPLETED" : "IN_PROGRESS",
        liabilityPeriodEndsAt: progress === 100 ? new Date(targetEnd.getTime() + 365 * 86_400_000) : null,
      },
    });
  }
}
