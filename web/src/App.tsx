import { useState } from "react";
import "./styles.css";
import { useReference } from "./lib/ReferenceData";
import { useCurrentUser } from "./lib/CurrentUser";
import { useI18n } from "./lib/i18n";
import Dashboard from "./pages/Dashboard";
import ImportPage from "./pages/ImportPage";
import QuotationPage from "./pages/QuotationPage";
import SalesChainPage from "./pages/SalesChainPage";

type Page = "dashboard" | "import" | "quotation" | "sales";

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
        <div className="brand"><span className="dot" /> {t.brand}</div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={page === n.key ? "active" : ""} onClick={() => setPage(n.key)}>{n.label}</button>
          ))}
        </nav>
        <div style={{ marginTop: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
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
