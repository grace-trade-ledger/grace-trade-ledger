import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Company, type Warehouse, type Product, type Supplier, type Customer } from "./api";

interface ReferenceData {
  companies: Company[];
  warehouses: Warehouse[];
  products: Product[];
  suppliers: Supplier[];
  customers: Customer[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const Ctx = createContext<ReferenceData | null>(null);

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<Company[]>("/api/companies"),
      api.get<Warehouse[]>("/api/warehouses"),
      api.get<Product[]>("/api/products"),
      api.get<Supplier[]>("/api/suppliers"),
      api.get<Customer[]>("/api/customers"),
    ])
      .then(([c, w, p, sup, cus]) => {
        setCompanies(c); setWarehouses(w); setProducts(p); setSuppliers(sup); setCustomers(cus);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tick]);

  return (
    <Ctx.Provider value={{ companies, warehouses, products, suppliers, customers, loading, error, reload: () => setTick((t) => t + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useReference() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReference must be used within ReferenceProvider");
  return ctx;
}
