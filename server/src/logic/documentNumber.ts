/**
 * §06.5 文件編號規則
 * {PREFIX}-{YYYY}-{5位流水號}   (Import 案件例外，維持 IMP-YYYY-0001 四位)
 *
 * The counter itself lives in document_sequences (company_id + document_type + year) and is
 * incremented transactionally in the DB layer (see src/repo/documentSequence.ts) — this module
 * only knows how to *format* a number once it has been reserved, kept pure & unit-testable.
 */

export type DocumentPrefix = "QT" | "SO" | "DO" | "INV" | "PAY" | "IMP";

const PAD_WIDTH: Record<DocumentPrefix, number> = {
  QT: 5,
  SO: 5,
  DO: 5,
  INV: 5,
  PAY: 5,
  IMP: 4,
};

export function formatDocumentNo(prefix: DocumentPrefix, year: number, seq: number): string {
  const width = PAD_WIDTH[prefix];
  const padded = String(seq).padStart(width, "0");
  return `${prefix}-${year}-${padded}`;
}
