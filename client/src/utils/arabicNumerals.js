const easternArabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/**
 * Convert Western digits (0-9) to Eastern Arabic digits (٠-٩).
 * Returns the original string unchanged when `enabled` is false.
 */
export function toArabicNumerals(str) {
  return String(str).replace(/\d/g, (d) => easternArabicDigits[parseInt(d)]);
}
