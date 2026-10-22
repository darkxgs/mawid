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
