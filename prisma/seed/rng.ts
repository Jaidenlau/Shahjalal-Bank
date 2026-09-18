/**
 * Deterministic pseudo-randomness for the seed.
 *
 * Every rehearsal and every reset must produce the SAME database. A seed that
 * varies between runs means the demo you rehearsed is not the demo you give.
 * So no Math.random anywhere in the seed — everything derives from this.
 */

let state = 0x2f6e2b1;

export function reseed(n = 0x2f6e2b1) {
  state = n;
}

/** xorshift32 — small, fast, and identical across Node versions. */
export function rnd(): number {
  state ^= state << 13; state >>>= 0;
  state ^= state >> 17;
  state ^= state << 5; state >>>= 0;
  return state / 0x100000000;
}

export function int(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

export function pickMany<T>(arr: readonly T[], n: number): T[] {
  const copy = arr.slice();
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]!);
  }
  return out;
}

export function chance(p: number): boolean {
  return rnd() < p;
}

/** Weighted pick: [["A", 3], ["B", 1]] picks A three times as often. */
export function weighted<T>(pairs: Array<[T, number]>): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1]![0];
}

/** A date N days before `from`, with a plausible working-hours time. */
export function daysAgo(n: number, from: Date = new Date()): Date {
  const d = new Date(from.getTime() - n * 86_400_000);
  // Dhaka office hours, expressed in UTC (UTC+6): 10:00–17:00 local.
  d.setUTCHours(int(4, 11), int(0, 59), int(0, 59), 0);
  return d;
}

export function daysAhead(n: number, from: Date = new Date()): Date {
  return daysAgo(-n, from);
}

/** Round a poisha amount to a plausible price point. */
export function roundPrice(poisha: number): number {
  if (poisha >= 100_000_00) return Math.round(poisha / 50_00) * 50_00;
  if (poisha >= 10_000_00) return Math.round(poisha / 10_00) * 10_00;
  return Math.round(poisha / 100) * 100;
}

// ---------------------------------------------------------------------------
// Bangladeshi reference pools
//
// Generic placeholder data is the fastest way to make a demo feel fake to a
// local audience, so names, companies and places here are all plausible for
// Dhaka and Chattogram.
// ---------------------------------------------------------------------------

export const MALE_FIRST = [
  "Mohammad", "Abdul", "Rafiqul", "Shahidul", "Nazrul", "Kamrul", "Aminul", "Ashraful",
  "Mahbubur", "Golam", "Anisur", "Jahangir", "Mostafizur", "Tanvir", "Saiful", "Rezaul",
  "Habibur", "Ariful", "Shafiqul", "Mizanur", "Faridul", "Nurul", "Imran", "Sohel",
  "Arif", "Rashed", "Masud", "Tariqul", "Zahirul", "Mahmudul", "Sabbir", "Rakibul",
];
export const FEMALE_FIRST = [
  "Farhana", "Nasrin", "Shirin", "Rokeya", "Tahmina", "Sultana", "Nusrat", "Sharmin",
  "Fatema", "Ayesha", "Rubina", "Shabnam", "Kamrun", "Dilruba", "Munira", "Sabina",
  "Nasima", "Rehana", "Jesmin", "Afroza", "Tasnim", "Marzia", "Sadia", "Ishrat",
];
export const SURNAME = [
  "Islam", "Rahman", "Ahmed", "Hossain", "Khan", "Chowdhury", "Uddin", "Alam",
  "Akter", "Begum", "Karim", "Haque", "Sarkar", "Talukder", "Mia", "Bhuiyan",
  "Molla", "Sheikh", "Mondal", "Das", "Roy", "Bhattacharjee", "Nath", "Saha",
];

export function personName(gender: "M" | "F" = "M"): string {
  const first = gender === "F" ? pick(FEMALE_FIRST) : pick(MALE_FIRST);
  return `${first} ${pick(SURNAME)}`;
}

export const DESIGNATIONS = [
  "Officer", "Senior Officer", "Principal Officer", "Assistant Vice President",
  "Senior Assistant Vice President", "Vice President", "Senior Vice President",
  "Executive Officer", "Junior Officer",
];

export const DHAKA_AREAS = [
  "Gulshan", "Banani", "Dhanmondi", "Uttara", "Motijheel", "Mirpur", "Bashundhara",
  "Tejgaon", "Mohakhali", "Paltan", "Kakrail", "Malibagh", "Badda", "Khilgaon",
];

export const VISITOR_COMPANIES = [
  "Beximco Pharmaceuticals Ltd", "Square Group", "ACI Limited", "Pran-RFL Group",
  "Walton Hi-Tech Industries", "BRAC Bank PLC", "Grameenphone Ltd", "Robi Axiata Ltd",
  "Bashundhara Group", "Akij Group", "Meghna Group of Industries", "Navana Group",
  "Summit Group", "City Group", "Partex Star Group", "Abul Khair Group",
  "Bangladesh Bank", "National Board of Revenue", "Dhaka WASA", "Titas Gas T&D",
  "KPMG Bangladesh", "Rahman Rahman Huq", "Hoda Vasi Chowdhury & Co",
];

export const VISIT_PURPOSES = [
  "Vendor meeting — procurement", "Contract signing", "Technical presentation",
  "Audit visit", "Interview", "Account opening discussion", "Delivery of documents",
  "Maintenance call", "Corporate client meeting", "Regulatory inspection",
  "Training session", "Product demonstration",
];

export const CANTEEN_ITEMS: Array<[string, number]> = [
  ["Rice & Beef Curry", 140_00], ["Rice & Chicken Curry", 120_00],
  ["Khichuri with Egg", 90_00], ["Rice & Fish Curry (Rui)", 130_00],
  ["Vegetable & Dal", 60_00], ["Paratha & Vegetable", 55_00],
  ["Chicken Biryani", 180_00], ["Morning Tea & Biscuit", 25_00],
  ["Singara (2 pcs)", 30_00], ["Samosa (2 pcs)", 30_00],
  ["Mineral Water 500ml", 20_00], ["Lemon Tea", 20_00],
];

export const MEDICAL_ITEMS: Array<[string, string, string]> = [
  ["Napa 500mg Tablet", "Analgesic", "Strip"], ["Seclo 20mg Capsule", "Gastric", "Strip"],
  ["Monas 10mg Tablet", "Respiratory", "Strip"], ["Fexo 120mg Tablet", "Antihistamine", "Strip"],
  ["Antacid Plus Suspension", "Gastric", "Bottle"], ["Savlon Antiseptic 500ml", "Antiseptic", "Bottle"],
  ["Hexisol Hand Rub 250ml", "Antiseptic", "Bottle"], ["Cotton Roll 500g", "Dressing", "Roll"],
  ["Gauze Bandage 4 inch", "Dressing", "Roll"], ["Surgical Gloves (Medium)", "Consumable", "Box"],
  ["Face Mask 3-ply", "Consumable", "Box"], ["Digital Thermometer", "Equipment", "Unit"],
  ["Blood Pressure Monitor", "Equipment", "Unit"], ["Glucometer Strips", "Diagnostic", "Box"],
  ["Nebulizer Machine", "Equipment", "Unit"], ["First Aid Box (Standard)", "Kit", "Unit"],
  ["Burnol Cream 20g", "Topical", "Tube"], ["ORS Sachet", "Rehydration", "Sachet"],
  ["Paracetamol Syrup 100ml", "Analgesic", "Bottle"], ["Betadine Solution 100ml", "Antiseptic", "Bottle"],
];

export const INSURERS: Array<[string, string]> = [
  ["Green Delta Insurance PLC", "GDI"], ["Pragati Insurance Ltd", "PIL"],
  ["Reliance Insurance Ltd", "RIL"], ["Eastland Insurance Co Ltd", "EIC"],
  ["Sadharan Bima Corporation", "SBC"], ["Pioneer Insurance Co Ltd", "PNR"],
];

export const CARRIERS = [
  "Sundarban Courier Service", "SA Paribahan", "Continental Courier",
  "Pathao Courier", "RedX", "Steadfast Courier", "Bank's own transport",
];

export const VEHICLE_MODELS: Array<[string, string, string]> = [
  ["Toyota", "Premio", "Car"], ["Toyota", "Corolla Axio", "Car"],
  ["Toyota", "Hiace", "Microbus"], ["Toyota", "Land Cruiser Prado", "SUV"],
  ["Nissan", "X-Trail", "SUV"], ["Honda", "Grace", "Car"],
  ["Mitsubishi", "Pajero Sport", "SUV"], ["Tata", "LPT 709", "Truck"],
  ["Ashok Leyland", "Falcon", "Bus"], ["Toyota", "Noah", "Microbus"],
];
