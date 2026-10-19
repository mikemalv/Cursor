/** Format-preserving token stand-in. Real implementation calls the HSM. */
export function tokenize(pan: string): string {
  return "tok_" + pan.slice(-4).padStart(pan.length, "*");
}
