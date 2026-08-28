import { useEffect, useState } from "react";
import { api, type DashboardData } from "../lib/api";
import { useReference } from "../lib/ReferenceData";
import { useI18n, productName } from "../lib/i18n";

const jpy = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function Dashboard() {
  const { companies } = useReference();
  const { t, lang } = useI18n();
  const [companyId, setCompanyId] = useState<string>("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (companies.length && !companyId) setCompanyId(companies.find((c) => c.code === "GRC")?.id ?? companies[0].id);
  }, [companies]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    api.get<DashboardData>(`/api/dashboard?companyId=${companyId}`).then(setData).finally(() => setLoading(false));
  }, [companyId]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t.dashboard.title}</h1>
          <div className="sub">{t.dashboard.subtitle}</div>
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label>{t.dashboard.company}</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.nameLocal} ({c.code})</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="hint">{t.common.loadingDots}</p>}
      {data && (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="l">{t.dashboard.thisMonthImport}</div><div className="v">{jpy(data.import.amountJpy)}</div></div>
            <div className="kpi"><div className="l">{t.dashboard.importCount}</div><div className="v">{data.import.count}</div></div>
            <div className="kpi"><div className="l">{t.dashboard.inventoryValue}</div><div className="v">{jpy(data.inventory.totalValue)}</div></div>
            <div className="kpi"><div className="l">{t.dashboard.inventoryQty}</div><div className="v">{data.inventory.totalQty}</div></div>
            <div className="kpi"><div className="l">{t.dashboard.thisMonthSales}</div><div className="v">{jpy(data.sales.amountJpy)}</div></div>
            <div className="kpi"><div className="l">{t.dashboard.thisMonthMargin}</div><div className="v">{pct(data.sales.grossMarginPct)}</div></div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="card">
              <h2>{t.dashboard.top10}</h2>
              <table>
                <thead><tr><th>{t.common.product}</th><th className="num">{t.dashboard.value}</th></tr></thead>
                <tbody>
                  {data.inventory.top10.map((r) => (
                    <tr key={r.product_code}>
                      <td>{r.product_code} · {productName({ nameLocal: r.name_local, nameJa: r.name_ja, nameZh: r.name_zh }, lang)}</td>
                      <td className="num">{jpy(Number(r.value))}</td>
                    </tr>
                  ))}
                  {data.inventory.top10.length === 0 && <tr><td colSpan={2} className="hint">{t.common.noData}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card">
              <h2>{t.dashboard.expiring}</h2>
              <table>
                <thead><tr><th>{t.dashboard.lot}</th><th>{t.common.product}</th><th className="num">{t.dashboard.daysLeft}</th></tr></thead>
                <tbody>
                  {data.alerts.expiring.map((r) => (
                    <tr key={r.lot_no}>
                      <td>{r.lot_no}</td>
                      <td>{r.product_code}</td>
                      <td className="num">
                        <span className={`pill ${Number(r.days_left) <= 7 ? "bad" : "warn"}`}>{r.days_left} {t.dashboard.days}</span>
                      </td>
                    </tr>
                  ))}
                  {data.alerts.expiring.length === 0 && <tr><td colSpan={3} className="hint">{t.dashboard.noExpiring}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
