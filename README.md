# SplitMate

SplitMate is a shared-expense tracker for trips, flats, and small groups. It has a responsive React dashboard, an Expo React Native client, a Node.js/Express API, and a normalized PostgreSQL database.

Its feature set is deliberately appropriate for an early-career portfolio: it solves a familiar problem, contains meaningful SQL, and is small enough to explain confidently in an interview.

## Live API and demo account

- API: https://splitmate.hrms.ssym.co.in
- Health check: https://splitmate.hrms.ssym.co.in/health
- Login: `demo@splitmate.app` / `Demo@123`

The web and mobile clients already use the live endpoint.

## What it demonstrates

- JWT login and protected group data
- Groups with many members
- Expenses, equal splits, balances, and settlements
- Transaction-based creation of an expense and its split rows
- Responsive web dashboard plus a mobile client
- Parameterized SQL, validation, password hashing, and security headers

## Structure

```text
splitmate/
├── api/       Express + TypeScript + PostgreSQL
├── web/       React + TypeScript + Vite
└── mobile/    React Native + Expo
```

Request flow: `React / React Native → HTTPS REST API → Express → PostgreSQL`.

## Database design

- `users`: account details and password hashes
- `groups`: a trip or household expense group
- `group_members`: many-to-many link between groups and users
- `expenses`: amount, payer, category, and date
- `expense_splits`: each member's share of an expense
- `settlements`: payments made between members

The split table avoids storing comma-separated members and makes balances queryable with SQL.

## API routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | API and database health |
| POST | `/api/auth/login` | Sign in and receive a JWT |
| GET | `/api/groups` | List the signed-in user's groups |
| GET | `/api/groups/:id` | Group members and expense history |
| POST | `/api/groups/:id/expenses` | Add and split an expense |
| GET | `/api/groups/:id/balances` | Calculate member balances |
| POST | `/api/groups/:id/settlements` | Record a payment between members |

Protected routes expect `Authorization: Bearer <token>`.

## Run locally

Requirements: Node.js 18+, npm, and PostgreSQL.

1. Create a `splitmate` database and run `api/sql/schema.sql`.
2. In `api`, copy `.env.example` to `.env`, update the database URL, then run:

```bash
npm install
npm run build
npm run seed
npm run dev
```

3. In `web`, optionally copy `.env.example` to `.env`, then run `npm install` and `npm run dev`.
4. In `mobile`, run `npm install` and `npm start`, then use Expo Go or an emulator.

The mobile API URL is near the top of `mobile/App.tsx`.

## Deploy the web app to Vercel

Push this folder to its own GitHub repository, import it into Vercel, and set:

- Root Directory: `web`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable (optional): `VITE_API_URL=https://splitmate.hrms.ssym.co.in`

`web/vercel.json` handles SPA routing. The API is already publicly reachable over HTTPS.

## Interview talking points

**Why did you use a many-to-many table for members?**  A user can join several groups and a group can have several users. `group_members` represents that relationship cleanly and prevents duplicate membership with a composite primary key.

**How is an expense saved safely?**  The expense and its split rows are inserted inside one transaction. If any split fails, the whole operation rolls back so partial expense data is not left behind.

**How do balances work?**  For each member, the API compares what they paid with their assigned shares and includes completed settlements. A positive result means they should receive money; a negative result means they owe money.

**Why calculate balances instead of storing one balance column?**  A stored balance can become incorrect when an expense changes. Deriving it from expenses, splits, and settlements keeps the source of truth clear.

**What security basics are included?**  Passwords are hashed, routes validate JWTs, input is checked with Zod, SQL values are parameterized, and Helmet sets common HTTP security headers.

**What bug can happen in aggregate SQL?**  Joining several one-to-many tables can multiply rows and double-count totals. The safe pattern is to aggregate each relationship separately or use carefully scoped subqueries.

**Why build both web and mobile?**  Both clients demonstrate consuming the same backend. The web view is better for overview and the mobile view fits the on-the-go use case.

**What would you add next?**  Unequal/percentage splits, invitations, editing and deleting expenses, recurring expenses, offline caching, automated tests, and push notifications.

## Honest résumé bullets

- Developed a shared-expense tracker with React, React Native, Express, and PostgreSQL, supporting groups, expense splits, calculated balances, and settlements.
- Modeled many-to-many membership and used database transactions to keep expense and split records consistent.
- Built responsive web and mobile interfaces against one authenticated REST API and deployed the backend behind HTTPS.

