const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
};

// ---------- domain types (mirrors server/src/db/schema.ts) ----------
export interface Company { id: string; code: string; nameLocal: string; nameEn: string; country: string; baseCurrency: string; }
export interface Warehouse { id: string; companyId: string; code: string; name: string; type: string; }
export interface Product {
  id: string; productCode: string; nameLocal: string; nameJa: string | null; nameZh: string | null;
  unit: string | null; weightKg: string | null; storageType: string;
}
export interface Supplier { id: string; code: string; name: string; linkedCompanyId: string | null; }
export interface Customer { id: string; code: string; name: string; linkedCompanyId: string | null; }
export interface ImportRecord {
  id: string; importNo: string; status: string; supplierId: string; buyerCompanyId: string;
  warehouseId: string; currency: string; exchangeRate: string;
}
export interface ImportItem {
  id: string; importId: string; productId: string; quantity: string; unitPrice: string;
  amountOriginal: string; amountJpy: string; landedUnitCost: string | null; landedTotalCost: string | null;
}
export interface DashboardData {
  import: { count: number; amountJpy: number };
  inventory: { totalQty: number; totalValue: number; top10: { product_code: string; name_local: string; name_ja: string | null; name_zh: string | null; value: string }[] };
  sales: { amountJpy: number; amountExTaxJpy: number; grossProfit: number; grossMarginPct: number };
  alerts: { expiring: { product_code: string; lot_no: string; expiry_date: string; days_left: number }[] };
}
