export function maskContact(value: string): string {
  return value
    .replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi, "[이메일]")
    .replace(/(?:\+82[-.\s]?(?:\(0\))?|0)(?:1[016789]|2|[3-6][1-5]|70)[-. ]?\d{3,4}[-. ]?\d{4}(?!\d)/g, "[전화번호]")
    .replace(/\b\d{6}[- ]?[1-8]\d{6}\b/g, "[식별번호]");
}

export function htmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
