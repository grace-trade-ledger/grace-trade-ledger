import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useReference } from "../lib/ReferenceData";
import { useCurrentUser } from "../lib/CurrentUser";
import { useI18n, productName } from "../lib/i18n";

interface Line { productId: string; quantity: string; unitPrice: string; cost: string; guard?: any; }

const jpy = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function QuotationPage({ onConverted }: { onConverted: (salesOrderId: string) => void }) {
  const { companies, customers, products } = useReference();
  const { currentUserId } = useCurrentUser();
  const { t, lang } = useI18n();
  const grace = companies.find((c) => c.code === "GRC");
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "", unitPrice: "", cost: "0" }]);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (customers.length && !customerId) setCustomerId(customers[0].id);
  }, [customers]);

  async function updateLine(idx: number, patch: Partial<Line>) {
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    const merged = { ...lines[idx], ...patch };
    if (merged.productId && grace) {
      const cost = await api.get<{ currentUnitCost: string }>(`/api/products/${merged.productId}/current-cost?companyId=${grace.id}`);
      setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, cost: cost.currentUnitCost } : r)));
    }
  }

  async function refreshGuard(idx: number) {
    const line = lines[idx];
    if (!line.productId || !line.unitPrice || !grace) return;
    try {
      const g = await api.post<any>("/api/pricing/calculate", {
        companyId: grace.id, productId: line.productId, cost: Number(line.cost), price: Number(line.unitPrice),
      });
      setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, guard: g } : r)));
    } catch { /* pricing policy may not exist for this product yet — ignore */ }
  }

  async function submit() {
    setBusy(true); setError(null);
    try {
      const created = await api.post<any>("/api/quotations", {
        sellerCompanyId: grace!.id, customerId, currency: "JPY", createdById: currentUserId,
        items: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      });
      setResult(created);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function convert() {
    if (!result) return;
    setBusy(true); setError(null);
    try {
      const so = await api.post<any>(`/api/quotations/${result.id}/convert-to-sales-order`, {});
      onConverted(so.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-head">
        <div><h1>{t.quotation.title}</h1><div className="sub">{t.quotation.subtitle}</div></div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {!result && (
        <div className="card">
          <div className="row">
            <div className="field"><label>{t.quotation.seller}</label><input value={grace?.nameLocal ?? ""} disabled /></div>
            <div className="field"><label>{t.quotation.customer}</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <table style={{ marginTop: 14 }}>
            <thead><tr><th>{t.common.product}</th><th className="num">{t.common.qty}</th><th className="num">{t.common.price}</th><th className="num">{t.common.cost}</th><th className="num">{t.common.profit}</th><th className="num">{t.common.margin}</th></tr></thead>
            <tbody>
              {lines.map((l, idx) => {
                const qty = Number(l.quantity) || 0;
                const price = Number(l.unitPrice) || 0;
                const cost = Number(l.cost) || 0;
                const profit = (price - cost) * qty;
                const margin = price > 0 ? (price - cost) / price : 0;
                return (
                  <tr key={idx}>
                    <td>
                      <select value={l.productId} onChange={(e) => updateLine(idx, { productId: e.target.value })}>
                        <option value="">{t.common.selectProduct}</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.productCode} {productName(p, lang)}</option>)}
                      </select>
                    </td>
                    <td className="num"><input style={{ width: 70 }} value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} /></td>
                    <td className="num">
                      <input style={{ width: 80 }} value={l.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                        onBlur={() => refreshGuard(idx)} />
                    </td>
                    <td className="num">{jpy(cost)}</td>
                    <td className="num">{jpy(profit)}</td>
                    <td className="num">
                      {pct(margin)}
                      {l.guard?.guard?.belowMinimum && (
                        <span className={`pill ${l.guard.guard.action === "WARN" ? "warn" : "bad"}`} style={{ marginLeft: 6 }}>
                          {l.guard.guard.action === "WARN" ? t.quotation.marginLow : l.guard.guard.action}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => setLines((r) => [...r, { productId: "", quantity: "", unitPrice: "", cost: "0" }])}>{t.common.addProduct}</button>
          <div style={{ marginTop: 14 }}><button className="btn" onClick={submit} disabled={busy || !customerId}>{t.quotation.createQuotation}</button></div>
        </div>
      )}

      {result && (
        <div className="card">
          <h2>{result.quotationNo} <span className="pill neutral">DRAFT</span></h2>
          <table>
            <thead><tr><th>{t.common.product}</th><th className="num">{t.common.qty}</th><th className="num">{t.common.price}</th><th className="num">{t.common.profit}</th><th className="num">{t.common.margin}</th></tr></thead>
            <tbody>
              {result.items.map((it: any) => {
                const p = products.find((pp) => pp.id === it.productId);
                return (
                  <tr key={it.id}>
                    <td>{p?.productCode}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{jpy(Number(it.unitPrice))}</td>
                    <td className="num">{jpy(Number(it.grossProfit))}</td>
                    <td className="num">{pct(Number(it.grossMarginPct))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={convert} disabled={busy}>{t.quotation.convert}</button>
          </div>
        </div>
      )}
    </div>
  );
}
