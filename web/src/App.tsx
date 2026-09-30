import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
const API = import.meta.env.VITE_API_URL || "https://splitmate.hrms.ssym.co.in";
type Group = {
  id: string;
  name: string;
  emoji: string;
  member_count: number;
  total_spent: number;
};
type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  paid_by_name: string;
};
type Member = { id: string; name: string; email: string };
type Detail = {
  id: string;
  name: string;
  emoji: string;
  members: Member[];
  expenses: Expense[];
};
type Balance = { id: string; name: string; balance: number };
async function request(
  path: string,
  token?: string,
  options: RequestInit = {},
) {
  const r = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || "Request failed");
  return d;
}
export default function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("splitmate-token") || "",
  );
  const [user, setUser] = useState(() =>
    JSON.parse(localStorage.getItem("splitmate-user") || "null"),
  );
  const [email, setEmail] = useState("demo@splitmate.app");
  const [password, setPassword] = useState("Demo@123");
  const [groups, setGroups] = useState<Group[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"expense" | "settle" | "group" | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Food");
  const [amount, setAmount] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupEmoji, setGroupEmoji] = useState("👥");
  const [paidTo, setPaidTo] = useState("");
  const [showAll, setShowAll] = useState(false);
  async function openGroup(id: string) {
    const [d, b] = await Promise.all([
      request(`/api/groups/${id}`, token),
      request(`/api/groups/${id}/balances`, token),
    ]);
    setDetail(d);
    setBalances(b);
    if (!paidTo) {
      const recipient = d.members.find((m: Member) => m.id !== user?.id);
      if (recipient) setPaidTo(recipient.id);
    }
  }
  async function refresh(preferredId?: string) {
    const g = await request("/api/groups", token);
    setGroups(g);
    const id = preferredId || detail?.id || g[0]?.id;
    if (id) await openGroup(id);
  }
  useEffect(() => {
    if (!token) return;
    refresh().catch((e) => setError(e.message));
  }, [token]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const d = await request("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("splitmate-token", d.token);
      localStorage.setItem("splitmate-user", JSON.stringify(d.user));
      setToken(d.token);
      setUser(d.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function logout() {
    localStorage.clear();
    setToken("");
    setUser(null);
  }
  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setLoading(true);
    setError("");
    try {
      await request(`/api/groups/${detail.id}/expenses`, token, {
        method: "POST",
        body: JSON.stringify({ title, category, amount: Number(amount) }),
      });
      await refresh(detail.id);
      setDialog(null);
      setTitle("");
      setAmount("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function addSettlement(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setLoading(true);
    setError("");
    try {
      await request(`/api/groups/${detail.id}/settlements`, token, {
        method: "POST",
        body: JSON.stringify({ paidTo, amount: Number(amount) }),
      });
      await refresh(detail.id);
      setDialog(null);
      setAmount("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function addGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const group = await request("/api/groups", token, {
        method: "POST",
        body: JSON.stringify({ name: groupName, emoji: groupEmoji }),
      });
      await refresh(group.id);
      setDialog(null);
      setGroupName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const total = useMemo(
    () => detail?.expenses.reduce((s, e) => s + e.amount, 0) || 0,
    [detail],
  );
  if (!token || !user)
    return (
      <Login
        email={email}
        password={password}
        setEmail={setEmail}
        setPassword={setPassword}
        submit={login}
        error={error}
        loading={loading}
      />
    );
  return (
    <div className="app">
      <aside className={menu ? "side open" : "side"}>
        <div className="brand">
          <b>S</b>splitmate.
        </div>
        <button className="close" onClick={() => setMenu(false)}>
          <X />
        </button>
        <nav>
          <a className="active" href="#overview" onClick={() => setMenu(false)}>
            <LayoutGrid />
            Overview
          </a>
          <a href="#groups" onClick={() => setMenu(false)}>
            <Users />
            Groups
          </a>
          <a href="#expenses" onClick={() => setMenu(false)}>
            <ReceiptText />
            Expenses
          </a>
          <a href="#insights" onClick={() => setMenu(false)}>
            <TrendingUp />
            Insights
          </a>
        </nav>
        <div className="profile">
          <span>{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
        </div>
        <button className="logout" onClick={logout}>
          <LogOut />
          Sign out
        </button>
      </aside>
      <main className="main">
        <header>
          <button className="menu" onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div>
            <small>YOUR SHARED SPACE</small>
            <h1>Money is easier together.</h1>
          </div>
          <button className="new" onClick={() => setDialog("expense")}>
            <Plus />
            Add expense
          </button>
        </header>
        {error && <div className="error">{error}</div>}
        <section className="balance-hero" id="overview">
          <div>
            <small>TOTAL GROUP SPEND</small>
            <h2>₹{total.toLocaleString("en-IN")}</h2>
            <p>
              {detail?.name} · {detail?.members.length || 0} people
            </p>
          </div>
          <div className="avatars">
            {detail?.members.map((m, i) => (
              <span style={{ zIndex: 9 - i }} key={m.id}>
                {m.name[0]}
              </span>
            ))}
          </div>
          <div className="shape" />
        </section>
        <section className="quick-grid">
          <article>
            <span>You are owed</span>
            <strong>
              ₹
              {Math.max(
                0,
                balances.find((b) => b.id === user.id)?.balance || 0,
              ).toLocaleString("en-IN")}
            </strong>
            <i>Across this group</i>
          </article>
          <article>
            <span>Your share</span>
            <strong>
              ₹
              {Math.round(total / (detail?.members.length || 1)).toLocaleString(
                "en-IN",
              )}
            </strong>
            <i>Equal split</i>
          </article>
          <article className="settle">
            <div>
              <span>All caught up?</span>
              <strong>Record a payment</strong>
            </div>
            <button aria-label="Record a payment" onClick={() => setDialog("settle")}>
              <ArrowRight />
            </button>
          </article>
        </section>
        <div className="dashboard-grid">
          <section className="panel" id="expenses">
            <div className="head">
              <div>
                <small>RECENT ACTIVITY</small>
                <h3>Group expenses</h3>
              </div>
              <button onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show less" : "View all"}
              </button>
            </div>
            <div className="expenses">
              {detail?.expenses.slice(0, showAll ? undefined : 4).map((e) => (
                <div className="expense" key={e.id}>
                  <i>{iconFor(e.category)}</i>
                  <div>
                    <strong>{e.title}</strong>
                    <span>
                      {e.paid_by_name} paid ·{" "}
                      {new Date(e.expense_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <b>₹{e.amount.toLocaleString("en-IN")}</b>
                  <ChevronRight />
                </div>
              ))}
            </div>
          </section>
          <section className="panel" id="insights">
            <div className="head">
              <div>
                <small>BALANCES</small>
                <h3>Who owes what</h3>
              </div>
            </div>
            <div className="balances">
              {balances.map((b) => (
                <div key={b.id}>
                  <span>{b.name[0]}</span>
                  <div>
                    <strong>{b.name}</strong>
                    <small>{b.balance >= 0 ? "gets back" : "owes"}</small>
                  </div>
                  <b className={b.balance >= 0 ? "positive" : "negative"}>
                    {b.balance >= 0 ? "+" : "−"}₹
                    {Math.abs(b.balance).toLocaleString("en-IN")}
                  </b>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="groups" id="groups">
          <div className="head">
            <div>
              <small>YOUR GROUPS</small>
              <h3>Keep every plan organised</h3>
            </div>
          </div>
          <div className="group-list">
            {groups.map((g) => (
              <button
                className={
                  detail?.id === g.id ? "group-card selected" : "group-card"
                }
                key={g.id}
                onClick={() =>
                  openGroup(g.id).catch((e) => setError(e.message))
                }
              >
                <span>{g.emoji}</span>
                <div>
                  <strong>{g.name}</strong>
                  <small>{g.member_count} members</small>
                </div>
                <b>₹{g.total_spent.toLocaleString("en-IN")}</b>
              </button>
            ))}
            <button onClick={() => setDialog("group")}>
              <Plus />
              New group
            </button>
          </div>
        </section>
      </main>
      {dialog && (
        <div className="modal-backdrop" onMouseDown={() => setDialog(null)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
          <button className="modal-close" aria-label="Close" onClick={() => setDialog(null)}>
              <X />
            </button>
            {dialog === "expense" ? (
              <form onSubmit={addExpense}>
                <p>NEW EXPENSE</p>
                <h2>Add to {detail?.name}</h2>
                <label>
                  Description
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    minLength={2}
                  />
                </label>
                <label>
                  Category
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option>Food</option>
                    <option>Stay</option>
                    <option>Travel</option>
                    <option>Shopping</option>
                    <option>Other</option>
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
                <button className="modal-primary" disabled={loading}>
                  {loading ? "Saving…" : "Add expense"}
                </button>
              </form>
            ) : dialog === "settle" ? (
              <form onSubmit={addSettlement}>
                <p>SETTLEMENT</p>
                <h2>Record a payment</h2>
                <label>
                  Paid to
                  <select
                    value={paidTo}
                    onChange={(e) => setPaidTo(e.target.value)}
                    required
                  >
                    {detail?.members
                      .filter((m) => m.id !== user.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
                <button className="modal-primary" disabled={loading}>
                  {loading ? "Saving…" : "Record payment"}
                </button>
              </form>
            ) : (
              <form onSubmit={addGroup}>
                <p>NEW GROUP</p>
                <h2>Start a shared space</h2>
                <label>
                  Group name
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    required
                    minLength={2}
                  />
                </label>
                <label>
                  Emoji
                  <input
                    value={groupEmoji}
                    onChange={(e) => setGroupEmoji(e.target.value)}
                    maxLength={10}
                    required
                  />
                </label>
                <button className="modal-primary" disabled={loading}>
                  {loading ? "Creating…" : "Create group"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function iconFor(category: string) {
  return (
    ({ Stay: "⌂", Food: "◉", Travel: "↗" } as Record<string, string>)[
      category
    ] || "₹"
  );
}
function Login({
  email,
  password,
  setEmail,
  setPassword,
  submit,
  error,
  loading,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  submit: (e: React.FormEvent) => void;
  error: string;
  loading: boolean;
}) {
  return (
    <main className="login">
      <section>
        <div className="brand light">
          <b>S</b>splitmate.
        </div>
        <div className="login-copy">
          <p>SHARED EXPENSES, ZERO AWKWARDNESS</p>
          <h1>
            Trips are memorable.
            <br />
            <em>Splitting bills should not be.</em>
          </h1>
          <span>
            Track shared spending, understand balances, and settle up without
            spreadsheets.
          </span>
        </div>
        <div className="mini-card">
          <span>🌴</span>
          <div>
            <small>GOA WEEKEND</small>
            <strong>₹11,850 shared fairly</strong>
          </div>
          <b>3 friends</b>
        </div>
      </section>
      <form onSubmit={submit}>
        <p>WELCOME BACK</p>
        <h2>Sign in to SplitMate</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button disabled={loading}>
          {loading ? "Opening your groups…" : "Continue"}
          <ArrowRight />
        </button>
        <div className="demo">
          <strong>Demo login</strong>
          <span>demo@splitmate.app · Demo@123</span>
        </div>
      </form>
    </main>
  );
}
