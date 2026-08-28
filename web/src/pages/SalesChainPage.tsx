import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useReference } from "../lib/ReferenceData";
import { useCurrentUser } from "../lib/CurrentUser";
import { useI18n, productName } from "../lib/i18n";

const jpy = (n: number) => `¥${Math.round(n).toLocaleString()}`;

interface SalesOrder { id: string; salesOrderNo: string; status: string; customerId: string; items: any[]; deliveries: any[]; }
interface Delivery { id: string; deliveryNo: string; intercompany?: boolean; }
interface Invoice { id: string; invoiceNo: string; total: string; status: string; items: any[]; payments: any[]; }

export default function SalesChainPage({ salesOrderId, onSelect }: { salesOrderId: string | null; onSelect: (id: string) => void }) {
  const { warehouses, customers, products } = useReference();
  const { currentUserId } = useCurrentUser();
  const { t, lang } = useI18n();
  const [allOrders, setAllOrders] = useState<{ id: string; salesOrderNo: string; status: string }[]>([]);
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  useEffect(() => { api.get<any[]>("/api/sales-orders").then(setAllOrders); }, [so]);

  useEffect(() => {
    if (!salesOrderId) { setSo(null); setDelivery(null); setInvoice(null); return; }
    api.get<SalesOrder>(`/api/sales-orders/${salesOrderId}`).then((data) => {
      setSo(data);
      setDelivery(data.deliveries[0] ?? null);
    });
  }, [salesOrderId]);

  useEffect(() => {
    // Selecting a different sales order resets the in-progress invoice view. (A full build would
    // add GET /api/deliveries/:id/invoice to restore it when re-opening an already-invoiced order.)
    setInvoice(null);
  }, [salesOrderId]);

  async function createDelivery() {
    if (!so) return;
    setError(null);
    try {
      const wh = warehouses[0];
      const d = await api.post<Delivery>(`/api/sales-orders/${so.id}/deliveries`, { warehouseId: wh.id, createdById: currentUserId });
      setDelivery(d);
      setSo(await api.get<SalesOrder>(`/api/sales-orders/${so.id}`));
    } catch (e: any) { setError(e.message); }
  }

  async function createInvoice() {
    if (!so || !delivery) return;
    setError(null);
    try {
      const inv = await api.post<Invoice>("/api/invoices", { salesOrderId: so.id, deliveryId: delivery.id });
      setInvoice(inv);
    } catch (e: any) { setError(e.message); }
  }

  async function recordPayment() {
    if (!invoice) return;
    setError(null);
    try {
      await api.post(`/api/invoices/${invoice.id}/payments`, { paymentAmount: Number(paymentAmount), paymentMethod: "銀行振込" });
      setInvoice(await api.get<Invoice>(`/api/invoices/${invoice.id}`));
      setPaymentAmount("");
    } catch (e: any) { setError(e.message); }
  }

  const customer = so ? customers.find((c) => c.id === so.customerId) : null;

  return (
    <div>
      <div className="page-head">
        <div><h1>{t.sales.title}</h1><div className="sub">{t.sales.subtitle}</div></div>
        <div className="field" style={{ minWidth: 220 }}>
          <label>{t.sales.selectSO}</label>
          <select value={salesOrderId ?? ""} onChange={(e) => onSelect(e.target.value)}>
            <option value="">{t.sales.selectPlaceholder}</option>
            {allOrders.map((o) => <option key={o.id} value={o.id}>{o.salesOrderNo} ({o.status})</option>)}
          </select>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {!so && <p className="hint">{t.sales.noSelection}</p>}

      {so && (
        <div className="card">
          <div className="spread">
            <h2>{so.salesOrderNo} <span className="pill neutral">{so.status}</span></h2>
            <span className="hint">{t.quotation.customer}: {customer?.name}</span>
          </div>
          <table>
            <thead><tr><th>{t.common.product}</th><th className="num">{t.common.qty}</th><th className="num">{t.common.price}</th><th className="num">{t.sales.delivered}</th></tr></thead>
            <tbody>
              {so.items.map((it: any) => {
                const p = products.find((pp) => pp.id === it.productId);
                return (
                  <tr key={it.id}>
                    <td>{p?.productCode} {productName(p, lang)}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{jpy(Number(it.unitPrice))}</td>
                    <td className="num">{it.deliveredQuantity} / {it.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button className="btn" onClick={createDelivery} disabled={!!delivery}>{t.sales.createDelivery}</button>
            <button className="btn" onClick={createInvoice} disabled={!delivery || !!invoice}>{t.sales.createInvoice}</button>
          </div>

          {delivery && (
            <p className="hint" style={{ marginTop: 10 }}>
              {t.sales.delivered} {delivery.deliveryNo} {delivery.intercompany && <span className="pill ok">{t.sales.intercompany}</span>}
            </p>
          )}

          {invoice && (
            <div className="card" style={{ marginTop: 14, background: "var(--surface-2)" }}>
              <h2>{invoice.invoiceNo} <span className="pill neutral">{invoice.status}</span></h2>
              <table>
                <thead><tr><th>{t.common.product}</th><th className="num">{t.common.amount}</th><th className="num">{t.common.cost}</th><th className="num">{t.common.profit}</th><th className="num">{t.common.margin}</th></tr></thead>
                <tbody>
                  {invoice.items.map((it: any) => {
                    const p = products.find((pp) => pp.id === it.productId);
                    return (
                      <tr key={it.id}>
                        <td>{p?.productCode}</td>
                        <td className="num">{jpy(Number(it.amount))}</td>
                        <td className="num">{jpy(Number(it.costSnapshot) * Number(it.quantity))}</td>
                        <td className="num">{jpy(Number(it.grossProfit))}</td>
                        <td className="num">{(Number(it.grossMarginPct) * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="hint">{t.sales.total}: {jpy(Number(invoice.total))}</p>

              <h2 style={{ marginTop: 10 }}>{t.sales.payments}</h2>
              <table>
                <thead><tr><th>{t.sales.paymentNo}</th><th className="num">{t.common.amount}</th><th className="num">{t.sales.outstanding}</th></tr></thead>
                <tbody>
                  {(invoice.payments ?? []).map((p: any) => (
                    <tr key={p.id}><td>{p.paymentNo}</td><td className="num">{jpy(Number(p.paymentAmount))}</td><td className="num">{jpy(Number(p.outstandingAmount))}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 10 }}>
                <div className="field"><label>{t.sales.paymentAmount}</label><input value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} /></div>
                <button className="btn" onClick={recordPayment} disabled={!paymentAmount}>{t.sales.recordPayment}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
