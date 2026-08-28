import express from "express";
import cors from "cors";
import { productsRouter } from "./routes/products";
import { companiesRouter, warehousesRouter, suppliersRouter, customersRouter, usersRouter } from "./routes/masters";
import { importsRouter } from "./routes/imports";
import { inventoryRouter } from "./routes/inventory";
import { pricingRouter } from "./routes/pricing";
import { quotationsRouter } from "./routes/quotations";
import { salesOrdersRouter } from "./routes/salesOrders";
import { invoicesRouter } from "./routes/invoices";
import { dashboardRouter } from "./routes/dashboard";

export const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/products", productsRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/users", usersRouter);
app.use("/api/imports", importsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/quotations", quotationsRouter);
app.use("/api/sales-orders", salesOrdersRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/dashboard", dashboardRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? "internal error" });
});
