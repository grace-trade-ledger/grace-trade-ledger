/**
 * §06.5 — reserve the next number for a document type, scoped to company + year.
 * Uses SELECT ... FOR UPDATE inside a transaction so concurrent requests never collide.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { formatDocumentNo, type DocumentPrefix } from "../logic/documentNumber";

export async function nextDocumentNo(companyId: string, type: DocumentPrefix): Promise<string> {
  const year = new Date().getFullYear();
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      insert into document_sequences (company_id, document_type, year, last_number)
      values (${companyId}, ${type}, ${year}, 1)
      on conflict (company_id, document_type, year)
      do update set last_number = document_sequences.last_number + 1
      returning last_number
    `);
    const lastNumber = Number((rows as any).rows[0].last_number);
    return formatDocumentNo(type, year, lastNumber);
  });
}
