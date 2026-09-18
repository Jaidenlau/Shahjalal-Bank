/**
 * Money handling for Vertex ERP.
 *
 * All monetary values are stored as INTEGER POISHA (1 BDT = 100 poisha) so
 * that no arithmetic in the system ever touches a float. Formatting happens
 * here and nowhere else.
 *
 * Bangladesh uses the South Asian lakh/crore grouping, not Western thousands
 * grouping: 1386000 BDT is written 13,86,000 — the first group from the right
 * has three digits and every group after it has two.
 */

/** BDT -> poisha. Accepts a decimal taka amount. */
export function taka(amount: number): number {
  return Math.round(amount * 100);
}

/** poisha -> whole taka, rounded down. */
export function toTaka(poisha: number): number {
  return Math.floor(poisha / 100);
}

/**
 * Group an integer string using the South Asian system.
 * 1386000 -> "13,86,000"    100000 -> "1,00,000"    999 -> "999"
 */
export function groupLakh(value: number | string): string {
  const negative = typeof value === "number" ? value < 0 : String(value).startsWith("-");
  const digits = String(value).replace(/[^0-9]/g, "");
  if (digits.length <= 3) return (negative ? "-" : "") + (digits || "0");

  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  // Every remaining group is two digits, read right to left.
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (negative ? "-" : "") + grouped + "," + last3;
}

/**
 * Format poisha as a display string with the taka sign.
 * 1386000_00 -> "৳ 13,86,000"
 */
export function formatBDT(poisha: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const { decimals = false, sign = true } = opts;
  const whole = Math.trunc(Math.abs(poisha) / 100);
  const frac = Math.abs(poisha) % 100;
  const negative = poisha < 0;
  let out = groupLakh(whole);
  if (decimals || frac !== 0) out += "." + String(frac).padStart(2, "0");
  if (negative) out = "-" + out;
  return sign ? `৳ ${out}` : out;
}

/**
 * Compact form for dashboard tiles, using local units.
 * 20000000_00 -> "৳ 2.00 Cr"   1777500_00 -> "৳ 17.78 L"
 */
export function formatBDTCompact(poisha: number): string {
  const tk = Math.trunc(Math.abs(poisha) / 100);
  const sign = poisha < 0 ? "-" : "";
  // Round on integers rather than via toFixed, which mis-rounds values like
  // 17.775 that have no exact binary representation.
  const at = (unit: number, dp: number) => {
    const scale = 10 ** dp;
    const v = Math.round((tk * scale) / unit) / scale;
    return v.toFixed(dp);
  };
  if (tk >= 1_00_00_000) return `${sign}৳ ${at(1_00_00_000, 2)} Cr`;
  if (tk >= 1_00_000) return `${sign}৳ ${at(1_00_000, 2)} L`;
  if (tk >= 1_000) return `${sign}৳ ${at(1_000, 1)}K`;
  return `${sign}৳ ${groupLakh(tk)}`;
}

/** Parse a user-typed taka string ("13,86,000" or "1386000.50") into poisha. */
export function parseTakaToPoisha(input: string): number {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  return Math.round(parseFloat(cleaned) * 100);
}

/** Words form used on printed work orders, as Bangladeshi banks require. */
export function takaInWords(poisha: number): string {
  const n = Math.trunc(poisha / 100);
  if (n === 0) return "Zero Taka Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigit = (v: number): string => {
    if (v < 20) return ones[v];
    const t = Math.floor(v / 10);
    const o = v % 10;
    return tens[t] + (o ? " " + ones[o] : "");
  };

  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1_000);
  const hundred = Math.floor((n % 1_000) / 100);
  const rest = n % 100;

  if (crore) parts.push(twoDigit(crore) + " Crore");
  if (lakh) parts.push(twoDigit(lakh) + " Lakh");
  if (thousand) parts.push(twoDigit(thousand) + " Thousand");
  if (hundred) parts.push(ones[hundred] + " Hundred");
  if (rest) parts.push(twoDigit(rest));

  return parts.join(" ") + " Taka Only";
}

/** Basis-point percentage of an amount. 1500bp of 100000 = 15000. */
export function applyBp(poisha: number, basisPoints: number): number {
  return Math.round((poisha * basisPoints) / 10_000);
}

/** "15%" from 1500 basis points. */
export function formatBp(basisPoints: number): string {
  const pct = basisPoints / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

/**
 * Narrow a BigInt money column to a number at the data-access boundary.
 *
 * Money is stored in BigInt columns because a 32-bit integer caps out around
 * BDT 2.14 crore in poisha. Reading it back as a JS number is exact: numbers
 * hold integers precisely up to 2^53, which is roughly BDT 90 trillion, far
 * beyond anything this system will hold. Converting here keeps arithmetic and
 * React props in plain numbers rather than propagating bigint through the app,
 * where it would not survive serialisation to a client component.
 */
export function num(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}
