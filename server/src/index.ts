import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import negotiateRouter from "./routes/negotiate.js";
import threadsRouter from "./routes/threads.js";
import healthRouter from "./routes/health.js";
import paymentsRouter from "./routes/payments.js";
import { seedDatabase } from "./db/seed.js";
import { db } from "./db/connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/negotiate", negotiateRouter);
app.use("/api/threads", threadsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api", healthRouter);

// Ensure default seed data exists
try {
  const policyCheck = db.prepare("SELECT COUNT(*) as c FROM policy_configs").get() as { c: number };
  if (policyCheck.c === 0) {
    seedDatabase();
  }
} catch (e) {
  console.error("Initial seed check failed:", e);
}

export let server: any = null;
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  A2A Bounded Procurement Agent Server Running        `);
    console.log(`  Port: http://localhost:${PORT}                      `);
    console.log(`  Health: http://localhost:${PORT}/api/health         `);
    console.log(`  Policy: http://localhost:${PORT}/api/policy         `);
    console.log(`  Audit Threads: http://localhost:${PORT}/api/threads `);
    console.log(`=======================================================`);
  });
}

export { app };
export default app;
