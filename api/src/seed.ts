import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const hash = await bcrypt.hash("Demo@123", 10);
  const people = [["Naman Choudhary","demo@splitmate.app"],["Aarav Mehta","aarav@splitmate.app"],["Sara Khan","sara@splitmate.app"]];
  const ids: string[] = [];
  for (const person of people) {
    const result = await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash RETURNING id", [...person, hash]);
    ids.push(result.rows[0].id);
  }
  const existing = await pool.query("SELECT id FROM groups WHERE name='Goa weekend' LIMIT 1");
  if (!existing.rowCount) {
    const group = await pool.query("INSERT INTO groups(name,emoji,created_by) VALUES('Goa weekend','🌴',$1) RETURNING id", [ids[0]]);
    for (const id of ids) await pool.query("INSERT INTO group_members(group_id,user_id) VALUES($1,$2)", [group.rows[0].id, id]);
    const items = [["Beach house","Stay",7200,ids[0]],["Dinner by the sea","Food",2850,ids[1]],["Scooter rental","Travel",1800,ids[2]]];
    for (const item of items) {
      const expense = await pool.query("INSERT INTO expenses(group_id,title,category,amount,paid_by,expense_date) VALUES($1,$2,$3,$4,$5,CURRENT_DATE) RETURNING id", [group.rows[0].id,...item]);
      const share = Number(item[2]) / ids.length;
      for (const id of ids) await pool.query("INSERT INTO expense_splits(expense_id,user_id,amount) VALUES($1,$2,$3)", [expense.rows[0].id,id,share]);
    }
  }
  console.log("SplitMate seed complete");
}
seed().finally(() => pool.end());
