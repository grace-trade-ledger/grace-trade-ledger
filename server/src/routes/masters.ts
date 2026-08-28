/** Companies / Warehouses / Suppliers / Customers — plain master-data CRUD (list + create). */
import { Router } from "express";
import { db } from "../db/client";
import * as s from "../db/schema";

export const companiesRouter = Router();
companiesRouter.get("/", async (_req, res) => res.json(await db.select().from(s.companies)));
companiesRouter.post("/", async (req, res) => {
  const [row] = await db.insert(s.companies).values(req.body).returning();
  res.status(201).json(row);
});

export const warehousesRouter = Router();
warehousesRouter.get("/", async (_req, res) => res.json(await db.select().from(s.warehouses)));
warehousesRouter.post("/", async (req, res) => {
  const [row] = await db.insert(s.warehouses).values(req.body).returning();
  res.status(201).json(row);
});

export const suppliersRouter = Router();
suppliersRouter.get("/", async (_req, res) => res.json(await db.select().from(s.suppliers)));
suppliersRouter.post("/", async (req, res) => {
  const [row] = await db.insert(s.suppliers).values(req.body).returning();
  res.status(201).json(row);
});

export const customersRouter = Router();
customersRouter.get("/", async (_req, res) => res.json(await db.select().from(s.customers)));
customersRouter.post("/", async (req, res) => {
  const [row] = await db.insert(s.customers).values(req.body).returning();
  res.status(201).json(row);
});

export const usersRouter = Router();
usersRouter.get("/", async (_req, res) => res.json(await db.select().from(s.users)));
