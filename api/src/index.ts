import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import morgan from "morgan";
import pg from "pg";
import { z } from "zod";

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const port = Number(process.env.PORT || 5102);
const jwtSecret = process.env.JWT_SECRET || "development-only-secret";
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
type User = { id: string; name: string; email: string };
type AuthRequest = Request & { user?: User };

app.use(helmet()); app.use(cors({ origin: (origin, callback) => callback(null, !origin || !allowedOrigins.length || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: "200kb" })); app.use(morgan("combined"));
const asyncRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>) => (req: AuthRequest, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next);
function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Authentication required" });
  try { req.user = jwt.verify(token, jwtSecret) as User; next(); } catch { return res.status(401).json({ message: "Invalid or expired token" }); }
}
async function isMember(groupId: string, userId: string) {
  const result = await pool.query("SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2", [groupId, userId]);
  return Boolean(result.rowCount);
}

app.get("/health", asyncRoute(async (_req, res) => { await pool.query("SELECT 1"); res.json({ status: "ok", service: "splitmate-api" }); }));
app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const input = z.object({ email: z.email(), password: z.string().min(6) }).parse(req.body);
  const result = await pool.query("SELECT id,name,email,password_hash FROM users WHERE LOWER(email)=LOWER($1)", [input.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) return res.status(401).json({ message: "Incorrect email or password" });
  const payload = { id: user.id, name: user.name, email: user.email };
  res.json({ token: jwt.sign(payload, jwtSecret, { expiresIn: "8h" }), user: payload });
}));

app.get("/api/groups", auth, asyncRoute(async (req, res) => {
  const result = await pool.query(`
    SELECT g.id,g.name,g.emoji,
           (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id=g.id) AS member_count,
           (SELECT COALESCE(SUM(e.amount),0)::float FROM expenses e WHERE e.group_id=g.id) AS total_spent
    FROM groups g JOIN group_members mine ON mine.group_id=g.id AND mine.user_id=$1
    ORDER BY g.created_at DESC`, [req.user?.id]);
  res.json(result.rows);
}));

app.get("/api/groups/:id", auth, asyncRoute(async (req, res) => {
  if (!(await isMember(String(req.params.id), req.user!.id))) return res.status(403).json({ message: "Not a group member" });
  const [group, members, expenses] = await Promise.all([
    pool.query("SELECT id,name,emoji FROM groups WHERE id=$1", [req.params.id]),
    pool.query("SELECT u.id,u.name,u.email FROM users u JOIN group_members gm ON gm.user_id=u.id WHERE gm.group_id=$1 ORDER BY u.name", [req.params.id]),
    pool.query(`SELECT e.id,e.title,e.category,e.amount::float,e.expense_date,u.name AS paid_by_name
                FROM expenses e JOIN users u ON u.id=e.paid_by WHERE e.group_id=$1 ORDER BY e.expense_date DESC,e.created_at DESC`, [req.params.id]),
  ]);
  res.json({ ...group.rows[0], members: members.rows, expenses: expenses.rows });
}));

app.post("/api/groups/:id/expenses", auth, asyncRoute(async (req, res) => {
  if (!(await isMember(String(req.params.id), req.user!.id))) return res.status(403).json({ message: "Not a group member" });
  const input = z.object({ title: z.string().min(2).max(160), category: z.string().min(2).max(40), amount: z.number().positive().max(1_000_000), date: z.iso.date().optional() }).parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const members = await client.query("SELECT user_id FROM group_members WHERE group_id=$1", [req.params.id]);
    const expense = await client.query("INSERT INTO expenses(group_id,paid_by,title,category,amount,expense_date) VALUES($1,$2,$3,$4,$5,COALESCE($6::date,CURRENT_DATE)) RETURNING *", [req.params.id, req.user?.id, input.title, input.category, input.amount, input.date || null]);
    const share = Math.round((input.amount / members.rowCount!) * 100) / 100;
    let allocated = 0;
    for (let i = 0; i < members.rows.length; i++) {
      const amount = i === members.rows.length - 1 ? Number((input.amount - allocated).toFixed(2)) : share;
      allocated += amount;
      await client.query("INSERT INTO expense_splits(expense_id,user_id,amount) VALUES($1,$2,$3)", [expense.rows[0].id, members.rows[i].user_id, amount]);
    }
    await client.query("COMMIT"); res.status(201).json(expense.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}));

app.get("/api/groups/:id/balances", auth, asyncRoute(async (req, res) => {
  if (!(await isMember(String(req.params.id), req.user!.id))) return res.status(403).json({ message: "Not a group member" });
  const result = await pool.query(`
    WITH paid AS (SELECT paid_by AS user_id,SUM(amount) amount FROM expenses WHERE group_id=$1 GROUP BY paid_by),
    owed AS (SELECT es.user_id,SUM(es.amount) amount FROM expense_splits es JOIN expenses e ON e.id=es.expense_id WHERE e.group_id=$1 GROUP BY es.user_id),
    sent AS (SELECT paid_by AS user_id,SUM(amount) amount FROM settlements WHERE group_id=$1 GROUP BY paid_by),
    received AS (SELECT paid_to AS user_id,SUM(amount) amount FROM settlements WHERE group_id=$1 GROUP BY paid_to)
    SELECT u.id,u.name,(COALESCE(p.amount,0)-COALESCE(o.amount,0)+COALESCE(s.amount,0)-COALESCE(r.amount,0))::float AS balance
    FROM users u JOIN group_members gm ON gm.user_id=u.id
    LEFT JOIN paid p ON p.user_id=u.id LEFT JOIN owed o ON o.user_id=u.id LEFT JOIN sent s ON s.user_id=u.id LEFT JOIN received r ON r.user_id=u.id
    WHERE gm.group_id=$1 ORDER BY balance DESC`, [req.params.id]);
  res.json(result.rows);
}));

app.post("/api/groups/:id/settlements", auth, asyncRoute(async (req, res) => {
  if (!(await isMember(String(req.params.id), req.user!.id))) return res.status(403).json({ message: "Not a group member" });
  const input = z.object({ paidTo: z.uuid(), amount: z.number().positive().max(1_000_000) }).parse(req.body);
  const result = await pool.query("INSERT INTO settlements(group_id,paid_by,paid_to,amount) VALUES($1,$2,$3,$4) RETURNING id,amount::float,created_at", [req.params.id, req.user?.id, input.paidTo, input.amount]);
  res.status(201).json(result.rows[0]);
}));

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", issues: error.issues });
  console.error(error); res.status(500).json({ message: "Unexpected server error" });
});
app.listen(port, "127.0.0.1", () => console.log(`SplitMate API listening on ${port}`));
