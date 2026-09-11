import { Fragment, useState } from "react";
import { api } from "../lib/api";
import { useReference } from "../lib/ReferenceData";
import { useCurrentUser } from "../lib/CurrentUser";
import { useI18n, productName } from "../lib/i18n";

interface ItemRow { productId: string; quantity: string; unitPrice: string; }
interface Correction {
  id: string; importItemId: string; quantityDelta: string; costDelta: string;
  landedUnitCostBefore: string; landedUnitCostAfter: string; reason: string; createdAt: string;
}
interface ImportDetail {
  id: string; importNo: string; status: string; currency: string;
  items: { id: string; productId: string; quantity: string; unitPrice: string; landedUnitCost: string | null; landedTotalCost: string | null }[];
  costItems: { id: string; costCategory: string; amount: string; allocationMethod: string }[];
  corrections: Correction[];
}

const ALLOCATION_METHODS = ["BY_VALUE", "BY_WEIGHT", "BY_QTY", "BY_CBM", "MANUAL"] as const;
const jpy = (n: number) => `¥${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ImportPage() {
  const { companies, suppliers, warehouses, products } = useReference();
  const { currentUserId } = useCurrentUser();
  const { t, lang } = useI18n();
  const grace = companies.find((c) => c.code === "GRC");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [currency, setCurrency] = useState("TWD");
  const [exchangeRate, setExchangeRate] = useState("5.0");
  const [items, setItems] = useState<ItemRow[]>([{ productId: "", quantity: "", unitPrice: "" }]);
  const [imp, setImp] = useState<ImportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [costCategory, setCostCategory] = useState("Ocean Freight");
  const [costAmount, setCostAmount] = useState("");
  const [costMethod, setCostMethod] = useState<typeof ALLOCATION_METHODS[number]>("BY_VALUE");
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});

  // Edit-before-finalize (DRAFT only): inline qty/unit-price edit per item.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Correct-after-finalize (COSTED only): inline correction form per item.
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctQtyDelta, setCorrectQtyDelta] = useState("");
  const [correctCostDelta, setCorrectCostDelta] = useState("");
  const [correctReason, setCorrectReason] = useState("");

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function refreshImp(id: string) {
    setImp(await api.get<ImportDetail>(`/api/imports/${id}`));
  }

  async function createImport() {
    setError(null);
    try {
      const body = {
        supplierId, buyerCompanyId: grace!.id, currency, exchangeRate: Number(exchangeRate), warehouseId,
        importDate: new Date().toISOString().slice(0, 10),
        items: items.filter((i) => i.productId).map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
      };
      const created = await api.post<any>("/api/imports", body);
      await refreshImp(created.id);
    } catch (e: any) { setError(e.message); }
  }

  async function addCostItem() {
    if (!imp) return;
    setError(null);
    try {
      const body: any = { costCategory, amount: Number(costAmount), currency: "JPY", allocationMethod: costMethod };
      if (costMethod === "MANUAL") {
        body.manualAmounts = Object.fromEntries(imp.items.map((it) => [it.id, Number(manualAmounts[it.id] ?? 0)]));
      }
      await api.post(`/api/imports/${imp.id}/cost-items`, body);
      await refreshImp(imp.id);
      setCostAmount("");
    } catch (e: any) { setError(e.message); }
  }

  async function deleteCostItem(costItemId: string) {
    if (!imp) return;
    if (!window.confirm(t.import.deleteCostItemConfirm)) return;
    setError(null);
    try {
      await api.del(`/api/imports/${imp.id}/cost-items/${costItemId}`);
      await refreshImp(imp.id);
    } catch (e: any) { setError(e.message); }
  }

  function startEdit(it: ImportDetail["items"][number]) {
    setEditingId(it.id); setEditQty(it.quantity); setEditPrice(it.unitPrice);
  }
  function cancelEdit() { setEditingId(null); }
  async function saveEdit(itemId: string) {
    if (!imp) return;
    setError(null);
    try {
      await api.put(`/api/imports/${imp.id}/items/${itemId}`, { quantity: Number(editQty), unitPrice: Number(editPrice) });
      await refreshImp(imp.id);
      setEditingId(null);
    } catch (e: any) { setError(e.message); }
  }

  function startCorrect(it: ImportDetail["items"][number]) {
    setCorrectingId(it.id); setCorrectQtyDelta(""); setCorrectCostDelta(""); setCorrectReason("");
  }
  function cancelCorrect() { setCorrectingId(null); }
  async function submitCorrect(itemId: string) {
    if (!imp) return;
    setError(null);
    try {
      await api.post(`/api/imports/${imp.id}/items/${itemId}/correct`, {
        quantityDelta: correctQtyDelta ? Number(correctQtyDelta) : 0,
        costDelta: correctCostDelta ? Number(correctCostDelta) : 0,
        reason: correctReason, createdById: currentUserId,
      });
      await refreshImp(imp.id);
      setCorrectingId(null);
    } catch (e: any) { setError(e.message); }
  }

  async function finalize() {
    if (!imp) return;
    setError(null);
    try {
      await api.post(`/api/imports/${imp.id}/finalize`, { createdById: currentUserId });
      await refreshImp(imp.id);
    } catch (e: any) { setError(e.message); }
  }

  const isDraft = imp?.status !== "COSTED";

  return (
    <div>
      <div className="page-head">
        <div><h1>{t.import.title}</h1><div className="sub">{t.import.subtitle}</div></div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {!imp && (
        <div className="card">
          <h2>{t.import.step1}</h2>
          <div className="row">
            <div className="field"><label>{t.import.supplier}</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">{t.import.selectSupplier}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>{t.import.warehouse}</label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{t.import.selectWarehouse}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="field"><label>{t.import.currency}</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>TWD</option><option>USD</option><option>JPY</option>
              </select>
            </div>
            <div className="field"><label>{t.import.exchangeRate}</label>
              <input value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
            </div>
          </div>

          <h2 style={{ marginTop: 16 }}>{t.import.items}</h2>
          <div className="stack">
            {items.map((row, idx) => (
              <div className="row" key={idx}>
                <div className="field"><label>{t.common.product}</label>
                  <select value={row.productId} onChange={(e) => updateItem(idx, { productId: e.target.value })}>
                    <option value="">{t.common.selectProduct}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.productCode} {productName(p, lang)}</option>)}
                  </select>
                </div>
                <div className="field"><label>{t.common.qty}</label><input value={row.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} /></div>
                <div className="field"><label>{t.import.unitPrice} ({currency})</label><input value={row.unitPrice} onChange={(e) => updateItem(idx, { unitPrice: e.target.value })} /></div>
              </div>
            ))}
            <button className="btn secondary" style={{ alignSelf: "flex-start" }} onClick={() => setItems((r) => [...r, { productId: "", quantity: "", unitPrice: "" }])}>{t.common.addProduct}</button>
          </div>
          <div style={{ marginTop: 16 }}>
            <button className="btn" onClick={createImport} disabled={!supplierId || !warehouseId}>{t.import.createImport}</button>
          </div>
        </div>
      )}

      {imp && (
        <>
          <div className="card">
            <div className="spread">
              <h2>{imp.importNo} <span className="pill neutral">{imp.status}</span></h2>
              <span className="hint">{isDraft ? t.import.draftEditHint : t.import.correctHint}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t.common.product}</th><th className="num">{t.common.qty}</th>
                  <th className="num">{t.import.unitPrice}</th><th className="num">{t.import.landedUnitCost}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {imp.items.map((it) => {
                  const p = products.find((pp) => pp.id === it.productId);
                  const itemCorrections = imp.corrections.filter((c) => c.importItemId === it.id);
                  return (
                    <Fragment key={it.id}>
                      <tr>
                        <td>{p?.productCode} {productName(p, lang)}</td>
                        <td className="num">
                          {editingId === it.id
                            ? <input style={{ width: 70 }} value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                            : it.quantity}
                        </td>
                        <td className="num">
                          {editingId === it.id
                            ? <input style={{ width: 80 }} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                            : it.unitPrice}
                        </td>
                        <td className="num">{it.landedUnitCost ? jpy(Number(it.landedUnitCost)) : "—"}</td>
                        <td className="num">
                          {editingId === it.id ? (
                            <>
                              <button className="btn" style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => saveEdit(it.id)}>{t.common.save}</button>{" "}
                              <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={cancelEdit}>{t.common.cancel}</button>
                            </>
                          ) : isDraft ? (
                            <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => startEdit(it)}>{t.common.edit}</button>
                          ) : it.landedUnitCost ? (
                            <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => startCorrect(it)}>{t.import.correct}</button>
                          ) : null}
                        </td>
                      </tr>
                      {correctingId === it.id && (
                        <tr>
                          <td colSpan={5}>
                            <div className="row" style={{ background: "var(--surface-sunken)", padding: 12, borderRadius: "var(--radius-sm)" }}>
                              <div className="field"><label>{t.import.correctionQtyDelta}</label>
                                <input value={correctQtyDelta} onChange={(e) => setCorrectQtyDelta(e.target.value)} />
                              </div>
                              <div className="field"><label>{t.import.correctionCostDelta}</label>
                                <input value={correctCostDelta} onChange={(e) => setCorrectCostDelta(e.target.value)} />
                              </div>
                              <div className="field" style={{ flex: 2, minWidth: 220 }}><label>{t.import.correctionReason}</label>
                                <input placeholder={t.import.correctionReasonPlaceholder} value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} />
                              </div>
                              <div>
                                <button className="btn" onClick={() => submitCorrect(it.id)} disabled={!correctReason.trim()}>{t.import.submitCorrection}</button>{" "}
                                <button className="btn secondary" onClick={cancelCorrect}>{t.common.cancel}</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {itemCorrections.length > 0 && correctingId !== it.id && (
                        <tr>
                          <td colSpan={5} style={{ paddingTop: 0 }}>
                            <div className="hint">
                              {t.import.correctionHistory}:{" "}
                              {itemCorrections.map((c) => (
                                <span key={c.id} style={{ marginRight: 14 }}>
                                  {new Date(c.createdAt).toLocaleDateString()} · {c.reason}
                                  {Number(c.quantityDelta) !== 0 && ` · ${t.import.qtyDelta} ${Number(c.quantityDelta) > 0 ? "+" : ""}${c.quantityDelta}`}
                                  {Number(c.costDelta) !== 0 && ` · ${t.import.costDelta} ${Number(c.costDelta) > 0 ? "+" : ""}${jpy(Number(c.costDelta))}`}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isDraft && (
            <div className="card">
              <h2>{t.import.step2}</h2>
              <div className="row">
                <div className="field"><label>{t.import.category}</label>
                  <select value={costCategory} onChange={(e) => setCostCategory(e.target.value)}>
                    {["Ocean Freight", "Air Freight", "Insurance", "Customs Duty", "Import Consumption Tax",
                      "Customs Clearance Fee", "Port Fee", "Terminal Fee", "Warehouse Receiving Fee",
                      "Warehouse Handling Fee", "Warehouse Storage Fee", "Delivery Fee", "Inspection Fee",
                      "Document Fee", "Other Import Cost"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field"><label>{t.import.amount}</label><input value={costAmount} onChange={(e) => setCostAmount(e.target.value)} /></div>
                <div className="field"><label>{t.import.allocationMethod}</label>
                  <select value={costMethod} onChange={(e) => setCostMethod(e.target.value as any)}>
                    {ALLOCATION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {costMethod === "MANUAL" && (
                <div className="row" style={{ marginTop: 8 }}>
                  {imp.items.map((it) => {
                    const p = products.find((pp) => pp.id === it.productId);
                    return (
                      <div className="field" key={it.id}>
                        <label>{p?.productCode} {t.import.allocatedAmount}</label>
                        <input value={manualAmounts[it.id] ?? ""} onChange={(e) => setManualAmounts((m) => ({ ...m, [it.id]: e.target.value }))} />
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ marginTop: 12 }}><button className="btn" onClick={addCostItem} disabled={!costAmount}>{t.import.addCostItem}</button></div>

              <table style={{ marginTop: 14 }}>
                <thead><tr><th>{t.import.category}</th><th className="num">{t.import.amount}</th><th>{t.import.method}</th><th></th></tr></thead>
                <tbody>
                  {imp.costItems.map((ci) => (
                    <tr key={ci.id}>
                      <td>{ci.costCategory}</td><td className="num">¥{Number(ci.amount).toLocaleString()}</td><td>{ci.allocationMethod}</td>
                      <td className="num">
                        <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 11.5 }} onClick={() => deleteCostItem(ci.id)}>{t.common.delete}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 14 }}>
                <button className="btn secondary" onClick={finalize} disabled={imp.costItems.length === 0}>{t.import.step3}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
