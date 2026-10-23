/**
 * Normalise a phone number to +<digits>. Local Gulf/Egypt formats are mapped
 * to their country code because that is what customers actually type.
 * Returns null when the input can't be a phone number.
 */
export function normalizePhone(input: string, defaultCountry: "AE" | "SA" | "EG" | "QA" | "KW" | "BH" | "OM" = "AE"): string | null {
  const raw = input.replace(/[\s\-().]/g, "").replace(/^00/, "+");
  // Arabic-Indic and Eastern Arabic-Indic digits → ASCII
  const ascii = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  if (!/^\+?\d+$/.test(ascii)) return null;
  let digits = ascii.startsWith("+") ? ascii.slice(1) : ascii;
  if (!ascii.startsWith("+") && digits.startsWith("0")) {
    const cc = { AE: "971", SA: "966", EG: "20", QA: "974", KW: "965", BH: "973", OM: "968" }[defaultCountry];
    digits = cc + digits.slice(1);
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export const currencyCountry: Record<string, "AE" | "SA" | "EG" | "QA" | "KW" | "BH" | "OM"> = {
  AED: "AE", SAR: "SA", EGP: "EG", QAR: "QA", KWD: "KW", BHD: "BH", OMR: "OM",
};

export const dialCode: Record<"AE" | "SA" | "EG" | "QA" | "KW" | "BH" | "OM", string> = {
  AE: "971", SA: "966", EG: "20", QA: "974", KW: "965", BH: "973", OM: "968",
};

/** "+971501234567" → "+971 50 123 4567". Unknown shapes come back unchanged. */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/^\+/, "");
  const cc = Object.values(dialCode).find((c) => digits.startsWith(c));
  if (!cc) return e164;
  const rest = digits.slice(cc.length);
  const groups = rest.length === 9 ? [2, 3, 4] : rest.length === 10 ? [3, 3, 4] : rest.length === 8 ? [4, 4] : null;
  if (!groups) return `+${cc} ${rest}`;
  let i = 0;
  return `+${cc} ${groups.map((n) => rest.slice(i, (i += n))).join(" ")}`;
}
