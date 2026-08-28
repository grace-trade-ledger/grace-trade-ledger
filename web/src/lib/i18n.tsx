import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "zh" | "ja";

export interface Dict {
  brand: string; loginAs: string; loading: string; connError: (msg: string) => string;
  nav: { dashboard: string; import: string; quotation: string; sales: string };
  common: { product: string; qty: string; price: string; amount: string; cost: string; profit: string; margin: string; selectProduct: string; addProduct: string; save: string; loadingDots: string; noData: string };
  dashboard: {
    title: string; subtitle: string; company: string; thisMonthImport: string; importCount: string;
    inventoryValue: string; inventoryQty: string; thisMonthSales: string; thisMonthMargin: string;
    top10: string; value: string; expiring: string; lot: string; daysLeft: string; days: string; noExpiring: string;
  };
  import: {
    title: string; subtitle: string; step1: string; supplier: string; selectSupplier: string;
    warehouse: string; selectWarehouse: string; currency: string; exchangeRate: string;
    items: string; unitPrice: string; addProduct: string; createImport: string; landedUnitCost: string;
    step2: string; category: string; amount: string; allocationMethod: string; allocatedAmount: string;
    addCostItem: string; method: string; step3: string;
  };
  quotation: { title: string; subtitle: string; seller: string; customer: string; createQuotation: string; convert: string; marginLow: string };
  sales: {
    title: string; subtitle: string; selectSO: string; selectPlaceholder: string; noSelection: string;
    delivered: string; createDelivery: string; createInvoice: string; intercompany: string; payments: string;
    paymentNo: string; outstanding: string; paymentAmount: string; recordPayment: string; total: string;
  };
}

const dict: Record<Lang, Dict> = {
  zh: {
    brand: "GRACE Trade Ledger",
    loginAs: "登入身分 (demo)",
    loading: "載入參考資料中…",
    connError: (msg: string) => `無法連線後端 API：${msg}（請確認 server 是否已啟動於 :4000）`,
    nav: {
      dashboard: "01・總覽",
      import: "06-07・進口＋Landed Cost",
      quotation: "10・報價單",
      sales: "10・訂單 → 收款",
    },
    common: {
      product: "商品", qty: "數量", price: "單價", amount: "金額", cost: "成本", profit: "利潤", margin: "毛利率",
      selectProduct: "選擇商品", addProduct: "+ 新增商品", save: "儲存", loadingDots: "載入中…",
      noData: "無資料",
    },
    dashboard: {
      title: "總覽", subtitle: "進口／庫存／銷售／利潤 — 即時總覽", company: "公司",
      thisMonthImport: "本月進口金額", importCount: "進口件數", inventoryValue: "庫存金額",
      inventoryQty: "庫存數量", thisMonthSales: "本月銷售額", thisMonthMargin: "本月毛利率",
      top10: "庫存金額 TOP 10", value: "金額", expiring: "即將到期商品（30天內）",
      lot: "批號", daysLeft: "剩餘天數", days: "天", noExpiring: "無即將到期商品",
    },
    import: {
      title: "進口＋Landed Cost", subtitle: "建立進口案件 → 輸入成本項目 → 系統自動分攤 → Landed Unit Cost",
      step1: "1. 建立 Import 案件", supplier: "供應商", selectSupplier: "選擇供應商",
      warehouse: "倉庫", selectWarehouse: "選擇倉庫", currency: "幣別", exchangeRate: "匯率 → JPY",
      items: "進口項目", unitPrice: "單價", addProduct: "+ 新增商品", createImport: "建立 Import",
      landedUnitCost: "Landed Unit Cost",
      step2: "2. 新增成本項目 Cost Item", category: "類別", amount: "金額 (JPY)",
      allocationMethod: "分攤方式", allocatedAmount: "分攤金額", addCostItem: "新增並自動分攤",
      method: "方式", step3: "3. Finalize — 產生 Landed Cost ＋ GRACE 庫存",
    },
    quotation: {
      title: "報價單", subtitle: "選商品即帶入成本，輸入售價即時試算毛利率", seller: "賣方",
      customer: "客戶", createQuotation: "建立 Quotation", convert: "轉換為 Sales Order →",
      marginLow: "毛利率過低",
    },
    sales: {
      title: "訂單 → 出貨 → 請款 → 收款", subtitle: "一鍵建立文件，資料不重複輸入",
      selectSO: "選擇 Sales Order", selectPlaceholder: "— 選擇 —", noSelection: "請先從報價單頁面建立訂單，或於上方選擇既有 Sales Order。",
      delivered: "已出貨", createDelivery: "建立出貨單", createInvoice: "開立請款單",
      intercompany: "Intercompany 已自動配對リープ庫存", payments: "收款紀錄",
      paymentNo: "收款單號", outstanding: "未收金額", paymentAmount: "收款金額", recordPayment: "記錄收款",
      total: "合計",
    },
  },
  ja: {
    brand: "GRACE Trade Ledger",
    loginAs: "ログインユーザー (デモ)",
    loading: "参照データを読み込み中…",
    connError: (msg: string) => `バックエンドAPIに接続できません：${msg}（サーバーが :4000 で起動しているか確認してください）`,
    nav: {
      dashboard: "01・ダッシュボード",
      import: "06-07・輸入＋Landed Cost",
      quotation: "10・見積書",
      sales: "10・受注 → 入金",
    },
    common: {
      product: "商品", qty: "数量", price: "単価", amount: "金額", cost: "原価", profit: "利益", margin: "粗利率",
      selectProduct: "商品を選択", addProduct: "＋ 商品を追加", save: "保存", loadingDots: "読み込み中…",
      noData: "データなし",
    },
    dashboard: {
      title: "ダッシュボード", subtitle: "輸入／在庫／販売／利益 — リアルタイム概況", company: "会社",
      thisMonthImport: "今月の輸入金額", importCount: "輸入件数", inventoryValue: "在庫金額",
      inventoryQty: "在庫数量", thisMonthSales: "今月の売上", thisMonthMargin: "今月の粗利率",
      top10: "在庫金額 TOP 10", value: "金額", expiring: "賞味期限間近商品（30日以内）",
      lot: "ロット番号", daysLeft: "残り日数", days: "日", noExpiring: "賞味期限間近の商品はありません",
    },
    import: {
      title: "輸入＋Landed Cost", subtitle: "輸入案件を作成 → コスト項目を入力 → 自動配賦 → Landed Unit Cost",
      step1: "1. 輸入案件を作成", supplier: "仕入先", selectSupplier: "仕入先を選択",
      warehouse: "倉庫", selectWarehouse: "倉庫を選択", currency: "通貨", exchangeRate: "為替レート → JPY",
      items: "輸入品目", unitPrice: "単価", addProduct: "＋ 商品を追加", createImport: "輸入案件を作成",
      landedUnitCost: "Landed Unit Cost",
      step2: "2. コスト項目を追加", category: "カテゴリー", amount: "金額 (JPY)",
      allocationMethod: "配賦方法", allocatedAmount: "配賦金額", addCostItem: "追加して自動配賦",
      method: "方法", step3: "3. Finalize — Landed Cost ＋ GRACE 在庫を計上",
    },
    quotation: {
      title: "見積書", subtitle: "商品を選ぶと原価が自動反映、販売価格入力で粗利率を即時計算", seller: "売主",
      customer: "得意先", createQuotation: "見積書を作成", convert: "受注に変換 →",
      marginLow: "粗利率が最低ラインを下回っています",
    },
    sales: {
      title: "受注 → 出荷 → 請求 → 入金", subtitle: "ワンクリックで帳票作成、データの二重入力なし",
      selectSO: "受注を選択", selectPlaceholder: "— 選択 —", noSelection: "先に見積書ページから受注を作成するか、上部で既存の受注を選択してください。",
      delivered: "出荷済み", createDelivery: "出荷伝票を作成", createInvoice: "請求書を発行",
      intercompany: "Intercompany：リープ在庫に自動反映済み", payments: "入金履歴",
      paymentNo: "入金番号", outstanding: "未収金額", paymentAmount: "入金額", recordPayment: "入金を記録",
      total: "合計",
    },
  },
};

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: Dict; }
const LangContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ja");
  return <LangContext.Provider value={{ lang, setLang, t: dict[lang] }}>{children}</LangContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

/** Pick the product's display name for the current language, falling back to nameLocal. */
export function productName(p: { nameLocal: string; nameJa?: string | null; nameZh?: string | null } | undefined | null, lang: Lang): string {
  if (!p) return "";
  if (lang === "ja") return p.nameJa || p.nameLocal;
  return p.nameZh || p.nameLocal;
}
