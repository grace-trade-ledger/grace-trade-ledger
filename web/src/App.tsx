import { useState, type ReactNode } from "react";
import "./styles.css";
import { useReference } from "./lib/ReferenceData";
import { useCurrentUser } from "./lib/CurrentUser";
import { useI18n } from "./lib/i18n";
import Dashboard from "./pages/Dashboard";
import ImportPage from "./pages/ImportPage";
import QuotationPage from "./pages/QuotationPage";
import SalesChainPage from "./pages/SalesChainPage";

type Page = "dashboard" | "import" | "quotation" | "sales";

const ICONS: Record<Page, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="6.5" height="8" rx="1.2" />
      <rect x="11" y="2.5" width="6.5" height="5" rx="1.2" />
      <rect x="11" y="10" width="6.5" height="7.5" rx="1.2" />
      <rect x="2.5" y="13" width="6.5" height="4.5" rx="1.2" />
    </svg>
  ),
  import: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5v9" />
      <path d="M6.2 8 10 11.8 13.8 8" />
      <path d="M3 13.5v2.2c0 .94.76 1.7 1.7 1.7h10.6c.94 0 1.7-.76 1.7-1.7v-2.2" />
    </svg>
  ),
  quotation: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.5h7l3.5 3.5V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
      <path d="M12 2.5V6a1 1 0 0 0 1 1h3" />
      <path d="M6.7 10.2h6.6M6.7 12.7h6.6M6.7 15.2h4" />
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 5h2l1.7 8.4a1.4 1.4 0 0 0 1.4 1.1h6.4a1.4 1.4 0 0 0 1.37-1.1L17 7H6" />
      <circle cx="8" cy="17" r="1.1" />
      <circle cx="14" cy="17" r="1.1" />
    </svg>
  ),
};

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [salesOrderId, setSalesOrderId] = useState<string | null>(null);
  const { loading, error } = useReference();
  const { users, currentUserId, setCurrentUserId } = useCurrentUser();
  const { lang, setLang, t } = useI18n();

  const NAV: { key: Page; label: string }[] = [
    { key: "dashboard", label: t.nav.dashboard },
    { key: "import", label: t.nav.import },
    { key: "quotation", label: t.nav.quotation },
    { key: "sales", label: t.nav.sales },
  ];

  if (loading) return <div style={{ padding: 40 }}>{t.loading}</div>;
  if (error) return <div style={{ padding: 40 }} className="error-banner">{t.connError(error)}</div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">GT</span>
          <div className="name">
            <b>{t.brand}</b>
            <span>ERP</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={page === n.key ? "active" : ""} onClick={() => setPage(n.key)}>
              {ICONS[n.key]}
              <span className="lbl">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="lang-toggle">
            <button className={lang === "zh" ? "active" : ""} onClick={() => setLang("zh")}>中文</button>
            <button className={lang === "ja" ? "active" : ""} onClick={() => setLang("ja")}>日本語</button>
          </div>
          <div className="field">
            <label>{t.loginAs}</label>
            <select value={currentUserId} onChange={(e) => setCurrentUserId(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>
      </aside>
      <main className="main">
        {page === "dashboard" && <Dashboard />}
        {page === "import" && <ImportPage />}
        {page === "quotation" && (
          <QuotationPage onConverted={(id) => { setSalesOrderId(id); setPage("sales"); }} />
        )}
        {page === "sales" && <SalesChainPage salesOrderId={salesOrderId} onSelect={setSalesOrderId} />}
      </main>
    </div>
  );
}
