import dotenv from "dotenv";
dotenv.config({ override: true });
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import { readFile } from "fs/promises";
import { Pool } from "pg";
import path from "path";
import { createServer as createViteServer } from "vite";

type AuthedUser = {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: "admin" | "client";
  status: "active" | "suspended";
  photoUrl: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
      sessionId?: string;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 30000,
  max: 10,
  keepAlive: true,
  ssl: {
    rejectUnauthorized: false,
  },
});

{
  const rawQuery = pool.query.bind(pool);
  (pool as any).query = async (text: any, params?: any) => {
    try {
      return await rawQuery(text as any, params as any);
    } catch (e: any) {
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      const isSchemaMissing = code === "42P01" || code === "42704" || msg.includes("does not exist");
      const isConnIssue =
        code.startsWith("08") ||
        code.startsWith("57") ||
        code === "53300" ||
        msg.includes("Connection terminated") ||
        msg.includes("terminating connection") ||
        msg.includes("connection timeout");

      if (isSchemaMissing) {
        await ensureExtendedSchema().catch(() => {});
        return await rawQuery(text as any, params as any);
      }
      if (isConnIssue) {
        return await rawQuery(text as any, params as any);
      }
      throw e;
    }
  };
}

const SESSION_COOKIE = "dc_session";
const SESSION_TTL_DAYS = 30;

const ZOOMCONNECT_URL_TOKEN = process.env.ZOOMCONNECT_URL_TOKEN || "";
const ZOOMCONNECT_SMS_CAMPAIGN = process.env.ZOOMCONNECT_SMS_CAMPAIGN || "DataConnect";

let extendedSchemaEnsured: Promise<void> | null = null;

function toUser(row: any): AuthedUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name || "",
    phone: row.phone || "",
    role: row.role,
    status: row.status,
    photoUrl: row.photo_url ?? null,
  };
}

function cleanPhoneNumber(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[^\d+]/g, "");
}

async function sendZoomconnectSms(recipientNumber: string, message: string) {
  const token = ZOOMCONNECT_URL_TOKEN.trim();
  const number = cleanPhoneNumber(recipientNumber);
  const msg = String(message || "").trim();
  if (!token || !number || !msg) return;

  const url = new URL(`https://www.zoomconnect.com/app/api/rest/v1/sms/send-url/${token}`);
  url.searchParams.set("recipientNumber", number);
  url.searchParams.set("message", msg);
  url.searchParams.set("campaign", ZOOMCONNECT_SMS_CAMPAIGN);

  const resp = await fetch(url.toString(), { method: "POST" });
  if (!resp.ok) {
    throw new Error("sms_send_failed");
  }
}

function isFiniteNumber(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function parseNullableNumber(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function ensureExtendedSchema() {
  if (extendedSchemaEnsured) return extendedSchemaEnsured;
  extendedSchemaEnsured = (async () => {
    await pool.query(`create extension if not exists pgcrypto;`).catch(() => {});

    try {
      const schemaSql = await readFile(path.join(process.cwd(), "schema.sql"), "utf8");
      if (schemaSql && schemaSql.trim()) {
        await pool.query(schemaSql);
      }
    } catch {
    }

    await pool.query(
      `do $$ begin
         create type user_role as enum ('admin', 'client');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});
    await pool.query(
      `do $$ begin
         create type user_status as enum ('active', 'suspended');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});
    await pool.query(
      `do $$ begin
         create type sim_status as enum ('active', 'inactive');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});
    await pool.query(
      `do $$ begin
         create type bundle_status as enum ('active', 'depleted', 'expired');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});
    await pool.query(
      `do $$ begin
         create type transaction_status as enum ('success', 'failed', 'pending');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});

    await pool.query(
      `create table if not exists users (
         id uuid primary key default gen_random_uuid(),
         email text not null unique,
         password_hash text not null,
         name text not null default '',
         phone text not null default '',
         role user_role not null default 'client',
         status user_status not null default 'active',
         photo_url text,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});

    await pool.query(
      `create table if not exists sessions (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         created_at timestamptz not null default now(),
         expires_at timestamptz not null
       );`
    ).catch(() => {});
    await pool.query("create index if not exists sessions_user_id_idx on sessions(user_id);").catch(() => {});
    await pool.query("create index if not exists sessions_expires_at_idx on sessions(expires_at);").catch(() => {});

    await pool.query(
      `create table if not exists password_reset_requests (
         id uuid primary key default gen_random_uuid(),
         email text not null,
         user_id uuid references users(id) on delete set null,
         ip text not null default '',
         user_agent text not null default '',
         created_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query(
      "create index if not exists password_reset_requests_created_at_idx on password_reset_requests(created_at desc);"
    ).catch(() => {});
    await pool.query(
      "create index if not exists password_reset_requests_email_created_at_idx on password_reset_requests(email, created_at desc);"
    ).catch(() => {});

    await pool.query(
      `create table if not exists data_packages (
         id uuid primary key default gen_random_uuid(),
         name text not null,
         description text not null default '',
         amount_mb integer not null check (amount_mb > 0),
         price numeric(12,2) not null check (price >= 0),
         duration_days integer not null check (duration_days > 0),
         is_active boolean not null default true,
         order_index integer not null default 0,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists data_packages_is_active_idx on data_packages(is_active);").catch(() => {});

    await pool.query(
      `create table if not exists sim_cards (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         iccid text not null unique,
         phone_number text not null unique,
         network text not null default '',
         status sim_status not null default 'active',
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists sim_cards_user_id_idx on sim_cards(user_id);").catch(() => {});

    await pool.query(
      `create table if not exists active_bundles (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         sim_card_id uuid not null references sim_cards(id) on delete cascade,
         package_id uuid not null references data_packages(id) on delete restrict,
         total_amount_mb integer not null check (total_amount_mb > 0),
         remaining_amount_mb integer not null check (remaining_amount_mb >= 0),
         expiry_date timestamptz not null,
         status bundle_status not null default 'active',
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists active_bundles_user_id_status_idx on active_bundles(user_id, status);").catch(() => {});
    await pool.query("create index if not exists active_bundles_expiry_date_idx on active_bundles(expiry_date);").catch(() => {});

    await pool.query(
      `create table if not exists company_settings (
         id text primary key,
         company_name text not null default 'DataConnect',
         support_email text not null default '',
         support_phone text not null default '',
         banking_details text not null default '',
         logo_url text not null default '',
         payment_processors jsonb not null default '[]'::jsonb,
         payment_processor_settings jsonb not null default '{}'::jsonb,
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query(
      `alter table company_settings add column if not exists payment_processors jsonb not null default '[]'::jsonb;`
    ).catch(() => {});
    await pool.query(
      `alter table company_settings add column if not exists payment_processor_settings jsonb not null default '{}'::jsonb;`
    ).catch(() => {});
    await pool.query(`insert into company_settings (id) values ('global') on conflict (id) do nothing;`).catch(() => {});

    await pool.query(
      `do $$ begin
         create type order_status as enum ('pending', 'completed', 'rejected');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});

    await pool.query(
      `do $$ begin
         create type coverage_status as enum ('open', 'responded', 'closed');
       exception
         when duplicate_object then null;
       end $$;`
    ).catch(() => {});

    await pool.query(`alter table data_packages add column if not exists order_index integer not null default 0;`).catch(() => {});
    await pool.query(`create index if not exists data_packages_order_index_idx on data_packages(order_index);`).catch(() => {});

    await pool.query(
      `create table if not exists orders (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         package_id uuid not null references data_packages(id) on delete restrict,
         sim_id uuid not null references sim_cards(id) on delete restrict,
         reference text not null default '',
         payment_method text not null default '',
         status order_status not null default 'pending',
         amount numeric(12,2) not null check (amount >= 0),
         package_name text not null default '',
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists orders_status_created_at_idx on orders(status, created_at desc);").catch(() => {});
    await pool.query("create index if not exists orders_user_id_created_at_idx on orders(user_id, created_at desc);").catch(() => {});
    await pool.query(`alter table orders add column if not exists payment_method text not null default '';`).catch(() => {});

    await pool.query(
      `create table if not exists transactions (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         type text not null default '',
         amount numeric(12,2) not null check (amount >= 0),
         status transaction_status not null default 'pending',
         reference text not null default '',
         created_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists transactions_user_id_created_at_idx on transactions(user_id, created_at desc);").catch(() => {});
    await pool.query("create index if not exists transactions_status_created_at_idx on transactions(status, created_at desc);").catch(() => {});

    await pool.query(
      `create table if not exists user_preferences (
         user_id uuid primary key references users(id) on delete cascade,
         expiry_reminders boolean not null default true,
         reminder_days integer not null default 3,
         low_balance_alerts boolean not null default true,
         low_balance_threshold_mb integer not null default 500,
         push_enabled boolean not null default false,
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});

    await pool.query(
      `create table if not exists lte_packages (
         id uuid primary key default gen_random_uuid(),
         name text not null,
         description text not null default '',
         data_cap_gb integer,
         day_cap_gb integer,
         night_cap_gb integer,
         speed_mbps integer,
         network text not null default 'MTN',
         price numeric(12,2) not null check (price >= 0),
         duration_days integer not null check (duration_days > 0),
         is_active boolean not null default true,
         order_index integer not null default 0,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query(`alter table lte_packages add column if not exists order_index integer not null default 0;`).catch(() => {});
    await pool.query(`alter table lte_packages add column if not exists network text not null default 'MTN';`).catch(() => {});
    await pool.query(`alter table lte_packages add column if not exists day_cap_gb integer;`).catch(() => {});
    await pool.query(`alter table lte_packages add column if not exists night_cap_gb integer;`).catch(() => {});
    await pool.query(`update lte_packages set network = 'MTN' where network is null or btrim(network) = '';`).catch(() => {});
    await pool.query("create index if not exists lte_packages_is_active_idx on lte_packages(is_active)").catch(() => {});
    await pool.query("create index if not exists lte_packages_order_index_idx on lte_packages(order_index)").catch(() => {});
    await pool.query(
      `insert into lte_packages (name, description, data_cap_gb, speed_mbps, price, duration_days, is_active, order_index)
       select $1, $2, $3, $4, $5, $6, true, (select coalesce(max(order_index), 0) + 1 from lte_packages)
       where not exists (select 1 from lte_packages where name = $1)`,
      ["MTN Fixed LTE - 500 GB (Sim Only)", "MTN Fixed LTE 500GB Sim Only", 500, null, 695, 30]
    ).catch(() => {});

    await pool.query(
      `create table if not exists lte_orders (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         package_id uuid not null references lte_packages(id) on delete restrict,
         status order_status not null default 'pending',
         amount numeric(12,2) not null check (amount >= 0),
         package_amount numeric(12,2) not null default 0 check (package_amount >= 0),
         delivery_fee numeric(12,2) not null default 149 check (delivery_fee >= 0),
         package_name text not null default '',
         reference text not null default '',
         payment_method text not null default '',
         address text not null default '',
         notes text not null default '',
         admin_comment text not null default '',
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists lte_orders_status_created_at_idx on lte_orders(status, created_at desc)").catch(() => {});
    await pool.query("create index if not exists lte_orders_user_id_created_at_idx on lte_orders(user_id, created_at desc)").catch(() => {});
    await pool.query(`alter table lte_orders add column if not exists package_amount numeric(12,2) not null default 0;`).catch(() => {});
    await pool.query(`alter table lte_orders add column if not exists delivery_fee numeric(12,2) not null default 149;`).catch(() => {});
    await pool.query(`alter table lte_orders add column if not exists reference text not null default '';`).catch(() => {});
    await pool.query(`alter table lte_orders add column if not exists payment_method text not null default '';`).catch(() => {});

    await pool.query(
      `create table if not exists sim_orders (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         network text not null default '',
         address text not null default '',
         notes text not null default '',
         reference text not null default '',
         payment_method text not null default '',
         amount numeric(12,2) not null default 99 check (amount >= 0),
         status order_status not null default 'pending',
         admin_comment text not null default '',
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists sim_orders_status_created_at_idx on sim_orders(status, created_at desc)").catch(() => {});
    await pool.query("create index if not exists sim_orders_user_id_created_at_idx on sim_orders(user_id, created_at desc)").catch(() => {});
    await pool.query(`alter table sim_orders add column if not exists reference text not null default '';`).catch(() => {});
    await pool.query(`alter table sim_orders add column if not exists payment_method text not null default '';`).catch(() => {});
    await pool.query(`alter table sim_orders add column if not exists amount numeric(12,2) not null default 99;`).catch(() => {});

    await pool.query(
      `create table if not exists coverage_checks (
         id uuid primary key default gen_random_uuid(),
         user_id uuid not null references users(id) on delete cascade,
         network_preference text not null default '',
         address text not null default '',
         notes text not null default '',
         status coverage_status not null default 'open',
         admin_comment text not null default '',
         suggested_package_ids uuid[] not null default '{}',
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`
    ).catch(() => {});
    await pool.query("create index if not exists coverage_checks_status_created_at_idx on coverage_checks(status, created_at desc)").catch(() => {});
    await pool.query("create index if not exists coverage_checks_user_id_created_at_idx on coverage_checks(user_id, created_at desc)").catch(() => {});
  })();
  return extendedSchemaEnsured;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (req.user.status !== "active") return res.status(403).json({ error: "account_suspended" });
  next();
}

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) return res.status(401).json({ error: "unauthorized" });
  if (req.user.status !== "active") return res.status(403).json({ error: "account_suspended" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  const shouldUseSecureCookie = (req: express.Request) => {
    const override = String(process.env.COOKIE_SECURE || "").trim().toLowerCase();
    if (override === "true") return true;
    if (override === "false") return false;
    if (process.env.NODE_ENV !== "production") return false;
    const xfProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
    return Boolean(req.secure) || xfProto.includes("https");
  };

  const wrapHandler = (fn: any) => {
    if (typeof fn !== "function") return fn;
    if (fn.length === 4) return fn;
    return (req: any, res: any, next: any) => {
      try {
        const out = fn(req, res, next);
        if (out && typeof out.then === "function") {
          out.catch(next);
        }
      } catch (e) {
        next(e);
      }
    };
  };
  const wrapArgs = (args: any[]) =>
    args.map((a) => (Array.isArray(a) ? a.map((x) => wrapHandler(x)) : wrapHandler(a)));

  {
    const appAny = app as any;
    const origUse = appAny.use.bind(appAny);
    appAny.use = (...args: any[]) => origUse(...wrapArgs(args));
    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"] as const) {
      const orig = appAny[method].bind(appAny);
      appAny[method] = (...args: any[]) => orig(...wrapArgs(args));
    }
  }

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  ensureExtendedSchema().catch(() => {});

  app.use((req, _res, next) => {
    if (process.env.NODE_ENV !== "production" && process.env.DEV_ADMIN_BYPASS === "true") {
      if (req.cookies?.dc_dev_admin === "1") {
        req.user = {
          id: "dev-admin",
          email: "dev-admin@local",
          name: "Dev Admin",
          phone: "",
          role: "admin",
          status: "active",
          photoUrl: null,
        };
      }
    }
    next();
  });

  app.use(async (req, _res, next) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (!sessionId) return next();
    try {
      const { rows } = await pool.query(
        `select s.id as session_id, u.*
         from sessions s
         join users u on u.id = s.user_id
         where s.id = $1 and s.expires_at > now()
         limit 1`,
        [sessionId]
      );
      if (rows[0]) {
        req.sessionId = rows[0].session_id;
        req.user = toUser(rows[0]);
      }
    } catch {
    }
    next();
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1 as ok");
      const { rows } = await pool.query(
        `select
          to_regclass('public.users') is not null as users,
          to_regclass('public.sessions') is not null as sessions,
          to_regclass('public.data_packages') is not null as data_packages,
          to_regclass('public.sim_cards') is not null as sim_cards,
          to_regclass('public.active_bundles') is not null as active_bundles,
          to_regclass('public.orders') is not null as orders,
          to_regclass('public.transactions') is not null as transactions,
          to_regclass('public.user_preferences') is not null as user_preferences,
          to_regclass('public.company_settings') is not null as company_settings,
          to_regclass('public.password_reset_requests') is not null as password_reset_requests,
          to_regclass('public.lte_packages') is not null as lte_packages,
          to_regclass('public.lte_orders') is not null as lte_orders,
          to_regclass('public.sim_orders') is not null as sim_orders,
          to_regclass('public.coverage_checks') is not null as coverage_checks`
      );
      const s = rows[0] || {};
      const missing = Object.entries(s)
        .filter(([, ok]) => ok !== true)
        .map(([k]) => k);
      res.json({ status: "ok", db: "ok", schema: { ok: missing.length === 0, missing } });
    } catch (e: any) {
      const debug =
        process.env.NODE_ENV !== "production"
          ? {
              error: String(e?.message || "db_error"),
              code: e?.code ? String(e.code) : undefined,
            }
          : undefined;
      res.status(503).json({ status: "error", db: "error", ...(debug ? { debug } : {}) });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  app.post("/api/dev/login-admin", (req, res) => {
    if (process.env.NODE_ENV === "production" || process.env.DEV_ADMIN_BYPASS !== "true") {
      return res.status(404).json({ error: "not_found" });
    }
    res.cookie("dc_dev_admin", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
    res.json({
      user: {
        id: "dev-admin",
        email: "dev-admin@local",
        name: "Dev Admin",
        phone: "",
        role: "admin",
        status: "active",
        photoUrl: null,
      },
    });
  });

  app.post("/api/dev/logout-admin", (req, res) => {
    if (process.env.NODE_ENV === "production" || process.env.DEV_ADMIN_BYPASS !== "true") {
      return res.status(404).json({ error: "not_found" });
    }
    res.clearCookie("dc_dev_admin", { path: "/" });
    res.json({ ok: true });
  });

  app.post("/api/dev/seed-demo", requireAdmin, async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "not_found" });
    }

    try {
      const demoPassword = "Demo_123!";
      const demoPasswordHash = await bcrypt.hash(demoPassword, 12);

      const demoClients = [
        { email: "demo.client1@dataconnect.local", name: "Demo Client 1", phone: "+27 82 000 0001" },
        { email: "demo.client2@dataconnect.local", name: "Demo Client 2", phone: "+27 82 000 0002" },
        { email: "demo.client3@dataconnect.local", name: "Demo Client 3", phone: "+27 82 000 0003" },
      ];

      const createdUsers: any[] = [];
      for (const c of demoClients) {
        const existing = await pool.query("select id from users where email = $1 limit 1", [c.email]);
        if (existing.rows[0]) {
          createdUsers.push({ id: existing.rows[0].id, ...c });
          continue;
        }
        const inserted = await pool.query(
          `insert into users (email, password_hash, name, phone, role, status)
           values ($1, $2, $3, $4, 'client', 'active')
           returning id`,
          [c.email, demoPasswordHash, c.name, c.phone]
        );
        createdUsers.push({ id: inserted.rows[0].id, ...c });
      }

      const pkgRes = await pool.query(
        "select id, name, amount_mb, duration_days from data_packages where is_active = true order by order_index asc, created_at desc limit 1"
      );
      const pkg = pkgRes.rows[0] || null;

      const simsCreated: any[] = [];
      const simsEnsured: any[] = [];
      const bundlesUpserted: any[] = [];
      for (let i = 0; i < createdUsers.length; i++) {
        const u = createdUsers[i];
        const iccid = `89927DEMO${String(i + 1).padStart(6, "0")}`;
        const phoneNumber = `+27820000${String(i + 1).padStart(3, "0")}`;

        const simExisting = await pool.query("select id from sim_cards where iccid = $1 or phone_number = $2 limit 1", [
          iccid,
          phoneNumber,
        ]);

        let simId: string;
        if (simExisting.rows[0]) {
          simId = String(simExisting.rows[0].id);
        } else {
          const simIns = await pool.query(
            `insert into sim_cards (user_id, iccid, phone_number, network, status)
             values ($1, $2, $3, $4, 'active')
             returning id`,
            [u.id, iccid, phoneNumber, i % 2 === 0 ? "MTN" : "Vodacom"]
          );
          simId = String(simIns.rows[0].id);
          simsCreated.push({ id: simId, userId: u.id, phoneNumber, iccid });
        }

        simsEnsured.push({ simId, userId: u.id, iccid, phoneNumber });
      }

      if (pkg) {
        for (let i = 0; i < simsEnsured.length; i++) {
          const s = simsEnsured[i];
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + Number(pkg.duration_days || 30));
          const remaining = Math.max(0, Number(pkg.amount_mb || 0) - (i + 1) * 512);

          const activeRes = await pool.query(
            "select id from active_bundles where sim_card_id = $1 and status = 'active' order by created_at desc limit 1",
            [s.simId]
          );
          if (activeRes.rows[0]) {
            const upd = await pool.query(
              `update active_bundles
               set package_id = $1,
                   total_amount_mb = $2,
                   remaining_amount_mb = $3,
                   expiry_date = $4,
                   updated_at = now()
               where id = $5
               returning id`,
              [pkg.id, Number(pkg.amount_mb), remaining, expiry.toISOString(), activeRes.rows[0].id]
            );
            bundlesUpserted.push({ id: upd.rows[0].id, simId: s.simId });
          } else {
            const ins = await pool.query(
              `insert into active_bundles (user_id, sim_card_id, package_id, total_amount_mb, remaining_amount_mb, expiry_date, status)
               values ($1, $2, $3, $4, $5, $6, 'active')
               returning id`,
              [s.userId, s.simId, pkg.id, Number(pkg.amount_mb), remaining, expiry.toISOString()]
            );
            bundlesUpserted.push({ id: ins.rows[0].id, simId: s.simId });
          }
        }
      }

      res.json({
        ok: true,
        demoPassword,
        createdClients: createdUsers.length,
        createdSims: simsCreated.length,
        updatedOrCreatedBundles: bundlesUpserted.length,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "seed_failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(req),
      path: "/",
    });
    if (sessionId) {
      try {
        await pool.query("delete from sessions where id = $1", [sessionId]);
      } catch {
      }
    }
    res.json({ ok: true });
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ error: "invalid_input" });

    let rows: any[] = [];
    try {
      const result = await pool.query("select * from users where email = $1 limit 1", [email]);
      rows = result.rows;
    } catch {
      return res.status(503).json({ error: "db_unavailable" });
    }
    const userRow = rows[0];
    if (!userRow) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    if (userRow.status !== "active") return res.status(403).json({ error: "account_suspended" });

    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    let sessionId: string;
    try {
      const session = await pool.query(
        "insert into sessions (user_id, expires_at) values ($1, $2) returning id",
        [userRow.id, expiresAt.toISOString()]
      );
      sessionId = session.rows[0].id;
    } catch {
      return res.status(503).json({ error: "db_unavailable" });
    }

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(req),
      path: "/",
      expires: expiresAt,
    });

    res.json({ user: toUser(userRow) });
  });

  app.post("/api/setup/bootstrap-admin", async (req, res) => {
    const token = String(process.env.BOOTSTRAP_ADMIN_TOKEN || "");
    const provided = String(req.headers["x-bootstrap-token"] || req.query?.token || req.body?.token || "");
    if (!token || provided !== token) return res.status(404).json({ error: "not_found" });

    let adminCount = 0;
    try {
      const existingAdmins = await pool.query("select count(*)::int as count from users where role = 'admin'");
      adminCount = Number(existingAdmins.rows[0]?.count || 0);
    } catch {
      return res.status(503).json({ error: "db_unavailable" });
    }
    if (adminCount > 0) return res.status(409).json({ error: "admin_exists" });

    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    if (!email || !password) return res.status(400).json({ error: "invalid_input" });
    if (password.length < 8) return res.status(400).json({ error: "password_too_short" });

    const passwordHash = await bcrypt.hash(password, 12);

    let userRow: any;
    try {
      const insert = await pool.query(
        `insert into users (email, password_hash, name, phone, role, status)
         values ($1, $2, $3, $4, 'admin', 'active')
         returning *`,
        [email, passwordHash, name, phone]
      );
      userRow = insert.rows[0];
    } catch (e: any) {
      if (String(e?.code || "") === "23505") return res.status(409).json({ error: "email_exists" });
      return res.status(503).json({ error: "db_unavailable" });
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    let sessionId: string;
    try {
      const session = await pool.query(
        "insert into sessions (user_id, expires_at) values ($1, $2) returning id",
        [userRow.id, expiresAt.toISOString()]
      );
      sessionId = session.rows[0].id;
    } catch {
      return res.status(503).json({ error: "db_unavailable" });
    }

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(req),
      path: "/",
      expires: expiresAt,
    });

    res.json({ user: toUser(userRow) });
  });

  app.post("/api/auth/signup", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    if (!email || !password) return res.status(400).json({ error: "invalid_input" });
    if (password.length < 6) return res.status(400).json({ error: "password_too_short" });

    const passwordHash = await bcrypt.hash(password, 12);

    let userRow: any;
    try {
      let role: "admin" | "client" = "client";
      if (email === "microdevelopers8@gmail.com") {
        try {
          const existingAdmins = await pool.query("select count(*)::int as count from users where role = 'admin'");
          if (Number(existingAdmins.rows[0]?.count || 0) === 0) role = "admin";
        } catch {
          return res.status(503).json({ error: "db_unavailable" });
        }
      }
      const insert = await pool.query(
        `insert into users (email, password_hash, name, phone, role, status)
         values ($1, $2, $3, $4, $5, 'active')
         returning *`,
        [email, passwordHash, name, phone, role]
      );
      userRow = insert.rows[0];
    } catch (e: any) {
      if (String(e?.code || "") === "23505") return res.status(409).json({ error: "email_exists" });
      return res.status(503).json({ error: "db_unavailable" });
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    let sessionId: string;
    try {
      const session = await pool.query(
        "insert into sessions (user_id, expires_at) values ($1, $2) returning id",
        [userRow.id, expiresAt.toISOString()]
      );
      sessionId = session.rows[0].id;
    } catch {
      return res.status(503).json({ error: "db_unavailable" });
    }

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(req),
      path: "/",
      expires: expiresAt,
    });

    res.json({ user: toUser(userRow) });
  });

  app.post("/api/auth/password-reset/request", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "invalid_input" });

    let userId: string | null = null;
    try {
      const found = await pool.query("select id from users where email = $1 limit 1", [email]);
      userId = found.rows[0]?.id ?? null;
    } catch {
    }

    try {
      await pool.query(
        `insert into password_reset_requests (email, user_id, ip, user_agent)
         values ($1, $2, $3, $4)`,
        [email, userId, String(req.ip || ""), String(req.headers["user-agent"] || "")]
      );
    } catch {
    }

    res.json({ ok: true });
  });

  app.get("/api/company-settings", requireAuth, async (_req, res) => {
    try {
      const { rows } = await pool.query("select * from company_settings where id = 'global' limit 1");
      const r: any = rows[0] || null;
      res.json({
        settings: r
          ? {
              id: r.id,
              company_name: r.company_name,
              support_email: r.support_email,
              support_phone: r.support_phone,
              banking_details: r.banking_details,
              logo_url: r.logo_url,
              payment_processors: r.payment_processors ?? [],
              updated_at: r.updated_at,
            }
          : null,
      });
    } catch {
      res.status(503).json({ error: "db_unavailable" });
    }
  });

  app.get("/api/admin/company-settings", requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query("select * from company_settings where id = 'global' limit 1");
      res.json({ settings: rows[0] || null });
    } catch {
      res.status(503).json({ error: "db_unavailable" });
    }
  });

  app.put("/api/admin/company-settings", requireAdmin, async (req, res) => {
    const allowedProcessors = new Set(["PayFast", "Yoco", "Pay@"]);
    const rawProcessors = Array.isArray(req.body?.paymentProcessors) ? req.body.paymentProcessors : [];
    const paymentProcessors = rawProcessors
      .map((p: any) => String(p))
      .filter((p: string) => allowedProcessors.has(p));

    const settingsRaw = req.body?.paymentProcessorSettings;
    const paymentProcessorSettings =
      settingsRaw && typeof settingsRaw === "object" && !Array.isArray(settingsRaw) ? settingsRaw : {};

    const payload = {
      company_name: String(req.body?.companyName ?? "DataConnect"),
      support_email: String(req.body?.supportEmail ?? ""),
      support_phone: String(req.body?.supportPhone ?? ""),
      banking_details: String(req.body?.bankingDetails ?? ""),
      logo_url: String(req.body?.logoUrl ?? ""),
      payment_processors: paymentProcessors,
      payment_processor_settings: paymentProcessorSettings,
    };
    try {
      const { rows } = await pool.query(
        `update company_settings
         set company_name = $1, support_email = $2, support_phone = $3, banking_details = $4, logo_url = $5, payment_processors = $6, payment_processor_settings = $7, updated_at = now()
         where id = 'global'
         returning *`,
        [
          payload.company_name,
          payload.support_email,
          payload.support_phone,
          payload.banking_details,
          payload.logo_url,
          payload.payment_processors,
          payload.payment_processor_settings,
        ]
      );
      res.json({ settings: rows[0] });
    } catch {
      res.status(503).json({ error: "db_unavailable" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      "select id, email, name, phone, role, status, photo_url, created_at from users order by created_at desc"
    );
    res.json({
      users: rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        phone: r.phone,
        role: r.role,
        status: r.status,
        photoURL: r.photo_url ?? null,
        createdAt: r.created_at,
      })),
    });
  });

  app.get("/api/admin/clients", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      "select id, email, name, phone, role, status, photo_url, created_at from users where role = 'client' order by created_at desc"
    );
    res.json({
      clients: rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        phone: r.phone,
        role: r.role,
        status: r.status,
        photoURL: r.photo_url ?? null,
        createdAt: r.created_at,
      })),
    });
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    if (!email || !password) return res.status(400).json({ error: "invalid_input" });
    if (password.length < 6) return res.status(400).json({ error: "password_too_short" });

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query(
        `insert into users (email, password_hash, name, phone, role, status)
         values ($1, $2, $3, $4, 'client', 'active')
         returning id, email, name, phone, role, status, photo_url, created_at`,
        [email, passwordHash, name, phone]
      );
      const u = rows[0];
      res.json({
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          phone: u.phone,
          role: u.role,
          status: u.status,
          photoURL: u.photo_url ?? null,
          createdAt: u.created_at,
        },
      });
    } catch {
      res.status(409).json({ error: "email_exists" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const userId = String(req.params.id);
    const role = req.body?.role ? String(req.body.role) : null;
    const status = req.body?.status ? String(req.body.status) : null;
    const name = req.body?.name !== undefined ? String(req.body.name) : null;
    const phone = req.body?.phone !== undefined ? String(req.body.phone) : null;

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role) {
      if (role !== "admin" && role !== "client") return res.status(400).json({ error: "invalid_role" });
      sets.push(`role = $${idx++}`);
      values.push(role);
    }
    if (status) {
      if (status !== "active" && status !== "suspended") return res.status(400).json({ error: "invalid_status" });
      sets.push(`status = $${idx++}`);
      values.push(status);
    }
    if (name !== null) {
      sets.push(`name = $${idx++}`);
      values.push(name);
    }
    if (phone !== null) {
      sets.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (sets.length === 0) return res.status(400).json({ error: "no_updates" });

    values.push(userId);
    const { rows } = await pool.query(
      `update users set ${sets.join(", ")}, updated_at = now()
       where id = $${idx}
       returning id, email, name, phone, role, status, photo_url, created_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const u = rows[0];
    res.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        role: u.role,
        status: u.status,
        photoURL: u.photo_url ?? null,
        createdAt: u.created_at,
      },
    });
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const userId = String(req.params.id);
    await pool.query("delete from users where id = $1", [userId]);
    res.json({ ok: true });
  });

  app.get("/api/admin/users/:id/details", requireAdmin, async (req, res) => {
    const userId = String(req.params.id);
    const userRes = await pool.query(
      "select id, email, name, phone, role, status, photo_url, created_at from users where id = $1 limit 1",
      [userId]
    );
    if (!userRes.rows[0]) return res.status(404).json({ error: "not_found" });

    const simsRes = await pool.query(
      "select id, user_id, iccid, phone_number, network, status from sim_cards where user_id = $1 order by created_at desc",
      [userId]
    );
    const bundlesRes = await pool.query(
      `select b.*, p.name as package_name
       from active_bundles b
       join data_packages p on p.id = b.package_id
       where b.user_id = $1
       order by b.expiry_date desc`,
      [userId]
    );

    res.json({
      client: {
        id: userRes.rows[0].id,
        email: userRes.rows[0].email,
        name: userRes.rows[0].name,
        phone: userRes.rows[0].phone,
        role: userRes.rows[0].role,
        status: userRes.rows[0].status,
        photoURL: userRes.rows[0].photo_url ?? null,
        createdAt: userRes.rows[0].created_at,
      },
      sims: simsRes.rows.map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        iccid: s.iccid,
        phoneNumber: s.phone_number,
        network: s.network,
        status: s.status,
      })),
      bundles: bundlesRes.rows.map((b: any) => ({
        id: b.id,
        userId: b.user_id,
        simCardId: b.sim_card_id,
        packageId: b.package_id,
        packageName: b.package_name,
        totalAmountMB: b.total_amount_mb,
        remainingAmountMB: b.remaining_amount_mb,
        expiryDate: b.expiry_date,
        status: b.status,
      })),
    });
  });

  app.get("/api/packages", requireAuth, async (req, res) => {
    const activeOnlyQuery = String(req.query.activeOnly || "false") === "true";
    const activeOnly = req.user?.role === "admin" ? activeOnlyQuery : true;
    let rows: any[] = [];
    try {
      const result = await pool.query(
        `select id, name, description, amount_mb, price, duration_days, is_active, order_index
         from data_packages
         where ($1::boolean = false) or (is_active = true)
         order by order_index asc, created_at desc`,
        [activeOnly]
      );
      rows = result.rows;
    } catch {
      return res.status(503).json({ error: "db_unavailable" });
    }
    res.json({
      packages: rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        amountMB: Number(p.amount_mb),
        price: Number(p.price),
        durationDays: Number(p.duration_days),
        isActive: p.is_active,
        orderIndex: Number(p.order_index ?? 0),
      })),
    });
  });

  app.post("/api/admin/packages", requireAdmin, async (req, res) => {
    const payload = {
      name: String(req.body?.name || "").trim(),
      description: String(req.body?.description || "").trim(),
      amountMB: Number(req.body?.amountMB),
      price: Number(req.body?.price),
      durationDays: Number(req.body?.durationDays),
      isActive: Boolean(req.body?.isActive),
    };
    const { rows } = await pool.query(
      `insert into data_packages (name, description, amount_mb, price, duration_days, is_active, order_index)
       values (
         $1, $2, $3, $4, $5, $6,
         (select coalesce(max(order_index), 0) + 1 from data_packages)
       )
       returning id, name, description, amount_mb, price, duration_days, is_active, order_index`,
      [payload.name, payload.description, payload.amountMB, payload.price, payload.durationDays, payload.isActive]
    );
    const p = rows[0];
    res.json({
      package: {
        id: p.id,
        name: p.name,
        description: p.description,
        amountMB: Number(p.amount_mb),
        price: Number(p.price),
        durationDays: Number(p.duration_days),
        isActive: p.is_active,
        orderIndex: Number(p.order_index ?? 0),
      },
    });
  });

  app.put("/api/admin/packages/:id", requireAdmin, async (req, res) => {
    const packageId = String(req.params.id);
    const payload = {
      name: String(req.body?.name || "").trim(),
      description: String(req.body?.description || "").trim(),
      amountMB: Number(req.body?.amountMB),
      price: Number(req.body?.price),
      durationDays: Number(req.body?.durationDays),
      isActive: Boolean(req.body?.isActive),
    };
    const { rows } = await pool.query(
      `update data_packages
       set name = $1, description = $2, amount_mb = $3, price = $4, duration_days = $5, is_active = $6, updated_at = now()
       where id = $7
       returning id, name, description, amount_mb, price, duration_days, is_active, order_index`,
      [payload.name, payload.description, payload.amountMB, payload.price, payload.durationDays, payload.isActive, packageId]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const p = rows[0];
    res.json({
      package: {
        id: p.id,
        name: p.name,
        description: p.description,
        amountMB: Number(p.amount_mb),
        price: Number(p.price),
        durationDays: Number(p.duration_days),
        isActive: p.is_active,
        orderIndex: Number(p.order_index ?? 0),
      },
    });
  });

  app.patch("/api/admin/packages/:id/status", requireAdmin, async (req, res) => {
    const packageId = String(req.params.id);
    const isActive = Boolean(req.body?.isActive);
    const { rows } = await pool.query(
      `update data_packages set is_active = $1, updated_at = now()
       where id = $2
       returning id, name, description, amount_mb, price, duration_days, is_active, order_index`,
      [isActive, packageId]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const p = rows[0];
    res.json({
      package: {
        id: p.id,
        name: p.name,
        description: p.description,
        amountMB: Number(p.amount_mb),
        price: Number(p.price),
        durationDays: Number(p.duration_days),
        isActive: p.is_active,
        orderIndex: Number(p.order_index ?? 0),
      },
    });
  });

  app.delete("/api/admin/packages/:id", requireAdmin, async (req, res) => {
    try {
      const packageId = String(req.params.id);
      const { rows } = await pool.query("select id from data_packages where id = $1 limit 1", [packageId]);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      try {
        await pool.query("delete from data_packages where id = $1", [packageId]);
        res.json({ ok: true });
      } catch (e: any) {
        const code = String(e?.code || "");
        if (code === "23503") {
          return res.status(409).json({ error: "in_use" });
        }
        throw e;
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "delete_failed" });
    }
  });

  app.post("/api/admin/packages/reorder", requireAdmin, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    if (ids.length === 0) return res.status(400).json({ error: "invalid_input" });
    const unique = Array.from(new Set(ids.map((x) => String(x))));
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (let i = 0; i < unique.length; i++) {
        await client.query("update data_packages set order_index = $1, updated_at = now() where id = $2", [i, unique[i]]);
      }
      await client.query("commit");
      res.json({ ok: true });
    } catch {
      await client.query("rollback");
      res.status(500).json({ error: "reorder_failed" });
    } finally {
      client.release();
    }
  });

  app.get("/api/lte-packages", requireAuth, async (req, res) => {
    try {
      await ensureExtendedSchema().catch(() => {});
      const activeOnlyQuery = String(req.query.activeOnly || "false") === "true";
      const activeOnly = req.user?.role === "admin" ? activeOnlyQuery : true;
      const { rows } = await pool.query(
        `select id, name, description, data_cap_gb, day_cap_gb, night_cap_gb, speed_mbps, network, price, duration_days, is_active, order_index
         from lte_packages
         where ($1::boolean = false) or (is_active = true)
         order by order_index asc, created_at desc`,
        [activeOnly]
      );
      res.json({
        packages: rows.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          dataCapGB: p.data_cap_gb === null ? null : Number(p.data_cap_gb),
          dayCapGB: p.day_cap_gb === null ? null : Number(p.day_cap_gb),
          nightCapGB: p.night_cap_gb === null ? null : Number(p.night_cap_gb),
          speedMbps: p.speed_mbps === null ? null : Number(p.speed_mbps),
          network: p.network ? String(p.network) : "MTN",
          price: Number(p.price),
          durationDays: Number(p.duration_days),
          isActive: p.is_active,
          orderIndex: Number(p.order_index ?? 0),
        })),
      });
    } catch (e) {
      console.error(e);
      const pgCode = (e as any)?.code ? String((e as any).code) : "";
      if (pgCode === "42P01") return res.status(500).json({ error: "schema_missing_lte_packages" });
      if (pgCode === "42703") return res.status(500).json({ error: "schema_missing_lte_packages_column" });
      if (pgCode === "42501") return res.status(500).json({ error: "db_permission_denied" });
      res.status(500).json({ error: "list_failed" });
    }
  });

  app.post("/api/admin/lte-packages", requireAdmin, async (req, res) => {
    try {
      await ensureExtendedSchema().catch(() => {});
      const payload = {
        name: String(req.body?.name || "").trim(),
        description: String(req.body?.description || "").trim(),
        dataCapGB: parseNullableNumber(req.body?.dataCapGB),
        dayCapGB: parseNullableNumber(req.body?.dayCapGB),
        nightCapGB: parseNullableNumber(req.body?.nightCapGB),
        speedMbps: parseNullableNumber(req.body?.speedMbps),
        network: String(req.body?.network || "MTN").trim(),
        price: parseNullableNumber(req.body?.price),
        durationDays: parseNullableNumber(req.body?.durationDays),
        isActive: Boolean(req.body?.isActive),
      };

      if (!payload.name) return res.status(400).json({ error: "invalid_input" });
      if (!isFiniteNumber(payload.price) || payload.price < 0) return res.status(400).json({ error: "invalid_input" });
      if (!isFiniteNumber(payload.durationDays) || payload.durationDays <= 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.dataCapGB !== null && payload.dataCapGB < 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.dayCapGB !== null && payload.dayCapGB < 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.nightCapGB !== null && payload.nightCapGB < 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.speedMbps !== null && payload.speedMbps < 0) return res.status(400).json({ error: "invalid_input" });
      if (!["MTN", "Vodacom", "Telkom"].includes(payload.network)) return res.status(400).json({ error: "invalid_input" });

      const { rows } = await pool.query(
        `insert into lte_packages (name, description, data_cap_gb, day_cap_gb, night_cap_gb, speed_mbps, network, price, duration_days, is_active, order_index)
         values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           (select coalesce(max(order_index), 0) + 1 from lte_packages)
         )
         returning id, name, description, data_cap_gb, day_cap_gb, night_cap_gb, speed_mbps, network, price, duration_days, is_active, order_index`,
        [
          payload.name,
          payload.description,
          payload.dataCapGB === null ? null : Math.round(payload.dataCapGB),
          payload.dayCapGB === null ? null : Math.round(payload.dayCapGB),
          payload.nightCapGB === null ? null : Math.round(payload.nightCapGB),
          payload.speedMbps === null ? null : Math.round(payload.speedMbps),
          payload.network,
          payload.price,
          Math.round(payload.durationDays),
          payload.isActive,
        ]
      );
      const p = rows[0];
      res.json({
        package: {
          id: p.id,
          name: p.name,
          description: p.description,
          dataCapGB: p.data_cap_gb === null ? null : Number(p.data_cap_gb),
          dayCapGB: p.day_cap_gb === null ? null : Number(p.day_cap_gb),
          nightCapGB: p.night_cap_gb === null ? null : Number(p.night_cap_gb),
          speedMbps: p.speed_mbps === null ? null : Number(p.speed_mbps),
          network: p.network ? String(p.network) : "MTN",
          price: Number(p.price),
          durationDays: Number(p.duration_days),
          isActive: p.is_active,
          orderIndex: Number(p.order_index ?? 0),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "create_failed" });
    }
  });

  app.put("/api/admin/lte-packages/:id", requireAdmin, async (req, res) => {
    try {
      await ensureExtendedSchema().catch(() => {});
      const id = String(req.params.id);
      const payload = {
        name: String(req.body?.name || "").trim(),
        description: String(req.body?.description || "").trim(),
        dataCapGB: parseNullableNumber(req.body?.dataCapGB),
        dayCapGB: parseNullableNumber(req.body?.dayCapGB),
        nightCapGB: parseNullableNumber(req.body?.nightCapGB),
        speedMbps: parseNullableNumber(req.body?.speedMbps),
        network: String(req.body?.network || "MTN").trim(),
        price: parseNullableNumber(req.body?.price),
        durationDays: parseNullableNumber(req.body?.durationDays),
        isActive: Boolean(req.body?.isActive),
      };

      if (!payload.name) return res.status(400).json({ error: "invalid_input" });
      if (!isFiniteNumber(payload.price) || payload.price < 0) return res.status(400).json({ error: "invalid_input" });
      if (!isFiniteNumber(payload.durationDays) || payload.durationDays <= 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.dataCapGB !== null && payload.dataCapGB < 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.dayCapGB !== null && payload.dayCapGB < 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.nightCapGB !== null && payload.nightCapGB < 0) return res.status(400).json({ error: "invalid_input" });
      if (payload.speedMbps !== null && payload.speedMbps < 0) return res.status(400).json({ error: "invalid_input" });
      if (!["MTN", "Vodacom", "Telkom"].includes(payload.network)) return res.status(400).json({ error: "invalid_input" });

      const { rows } = await pool.query(
        `update lte_packages
         set name = $1, description = $2, data_cap_gb = $3, day_cap_gb = $4, night_cap_gb = $5, speed_mbps = $6, network = $7, price = $8, duration_days = $9, is_active = $10, updated_at = now()
         where id = $11
         returning id, name, description, data_cap_gb, day_cap_gb, night_cap_gb, speed_mbps, network, price, duration_days, is_active, order_index`,
        [
          payload.name,
          payload.description,
          payload.dataCapGB === null ? null : Math.round(payload.dataCapGB),
          payload.dayCapGB === null ? null : Math.round(payload.dayCapGB),
          payload.nightCapGB === null ? null : Math.round(payload.nightCapGB),
          payload.speedMbps === null ? null : Math.round(payload.speedMbps),
          payload.network,
          payload.price,
          Math.round(payload.durationDays),
          payload.isActive,
          id,
        ]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      const p = rows[0];
      res.json({
        package: {
          id: p.id,
          name: p.name,
          description: p.description,
          dataCapGB: p.data_cap_gb === null ? null : Number(p.data_cap_gb),
          dayCapGB: p.day_cap_gb === null ? null : Number(p.day_cap_gb),
          nightCapGB: p.night_cap_gb === null ? null : Number(p.night_cap_gb),
          speedMbps: p.speed_mbps === null ? null : Number(p.speed_mbps),
          network: p.network ? String(p.network) : "MTN",
          price: Number(p.price),
          durationDays: Number(p.duration_days),
          isActive: p.is_active,
          orderIndex: Number(p.order_index ?? 0),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "update_failed" });
    }
  });

  app.patch("/api/admin/lte-packages/:id/status", requireAdmin, async (req, res) => {
    try {
      await ensureExtendedSchema().catch(() => {});
      const id = String(req.params.id);
      const isActive = Boolean(req.body?.isActive);
      const { rows } = await pool.query(
        `update lte_packages set is_active = $1, updated_at = now()
         where id = $2
         returning id, name, description, data_cap_gb, speed_mbps, price, duration_days, is_active, order_index`,
        [isActive, id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      const p = rows[0];
      res.json({
        package: {
          id: p.id,
          name: p.name,
          description: p.description,
          dataCapGB: p.data_cap_gb === null ? null : Number(p.data_cap_gb),
          speedMbps: p.speed_mbps === null ? null : Number(p.speed_mbps),
          price: Number(p.price),
          durationDays: Number(p.duration_days),
          isActive: p.is_active,
          orderIndex: Number(p.order_index ?? 0),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "update_failed" });
    }
  });

  app.delete("/api/admin/lte-packages/:id", requireAdmin, async (req, res) => {
    try {
      await ensureExtendedSchema().catch(() => {});
      const id = String(req.params.id);
      const { rows } = await pool.query("select id from lte_packages where id = $1 limit 1", [id]);
      if (!rows[0]) return res.status(404).json({ error: "not_found" });

      try {
        await pool.query("delete from lte_packages where id = $1", [id]);
        res.json({ ok: true });
      } catch (e: any) {
        const code = String(e?.code || "");
        if (code === "23503") {
          return res.status(409).json({ error: "in_use" });
        }
        throw e;
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "delete_failed" });
    }
  });

  app.post("/api/admin/lte-packages/reorder", requireAdmin, async (req, res) => {
    try {
      await ensureExtendedSchema().catch(() => {});
      const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
      if (ids.length === 0) return res.status(400).json({ error: "invalid_input" });
      const unique = Array.from(new Set(ids.map((x) => String(x))));
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (let i = 0; i < unique.length; i++) {
          await client.query("update lte_packages set order_index = $1, updated_at = now() where id = $2", [i, unique[i]]);
        }
        await client.query("commit");
        res.json({ ok: true });
      } catch (e) {
        await client.query("rollback");
        console.error(e);
        res.status(500).json({ error: "reorder_failed" });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "reorder_failed" });
    }
  });

  app.get("/api/admin/sims", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `select
         s.id,
         s.user_id,
         s.iccid,
         s.phone_number,
         s.network,
         s.status,
         u.email as user_email,
         b.id as bundle_id,
         b.package_id as bundle_package_id,
         p.name as bundle_package_name,
         b.total_amount_mb as bundle_total_amount_mb,
         b.remaining_amount_mb as bundle_remaining_amount_mb,
         b.expiry_date as bundle_expiry_date
       from sim_cards s
       join users u on u.id = s.user_id
       left join lateral (
         select b.*
         from active_bundles b
         where b.sim_card_id = s.id and b.status = 'active'
         order by b.expiry_date desc, b.created_at desc
         limit 1
       ) b on true
       left join data_packages p on p.id = b.package_id
       order by s.created_at desc`
    );
    res.json({
      sims: rows.map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        userEmail: s.user_email,
        iccid: s.iccid,
        phoneNumber: s.phone_number,
        network: s.network,
        status: s.status,
        activeBundle: s.bundle_id
          ? {
              id: s.bundle_id,
              packageId: s.bundle_package_id,
              packageName: s.bundle_package_name,
              totalAmountMB: Number(s.bundle_total_amount_mb),
              remainingAmountMB: Number(s.bundle_remaining_amount_mb),
              expiryDate: s.bundle_expiry_date,
            }
          : null,
      })),
    });
  });

  app.post("/api/admin/sims", requireAdmin, async (req, res) => {
    const payload = {
      userId: String(req.body?.userId || ""),
      iccid: String(req.body?.iccid || "").trim(),
      phoneNumber: String(req.body?.phoneNumber || "").trim(),
      network: String(req.body?.network || "").trim(),
      status: String(req.body?.status || "active"),
    };
    const { rows } = await pool.query(
      `insert into sim_cards (user_id, iccid, phone_number, network, status)
       values ($1, $2, $3, $4, $5)
       returning id, user_id, iccid, phone_number, network, status`,
      [payload.userId, payload.iccid, payload.phoneNumber, payload.network, payload.status]
    );
    const s = rows[0];
    res.json({
      sim: {
        id: s.id,
        userId: s.user_id,
        iccid: s.iccid,
        phoneNumber: s.phone_number,
        network: s.network,
        status: s.status,
      },
    });
  });

  app.patch("/api/admin/sims/:id/status", requireAdmin, async (req, res) => {
    const simId = String(req.params.id);
    const status = String(req.body?.status || "active");
    const { rows } = await pool.query(
      `update sim_cards set status = $1, updated_at = now()
       where id = $2
       returning id, user_id, iccid, phone_number, network, status`,
      [status, simId]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    const s = rows[0];
    res.json({
      sim: {
        id: s.id,
        userId: s.user_id,
        iccid: s.iccid,
        phoneNumber: s.phone_number,
        network: s.network,
        status: s.status,
      },
    });
  });

  app.put("/api/admin/sims/:id/bundle", requireAdmin, async (req, res) => {
    const simId = String(req.params.id);
    const packageId = String(req.body?.packageId || "");
    const remainingAmountMBRaw = Number(req.body?.remainingAmountMB);
    const remainingAmountMB = Math.round(remainingAmountMBRaw);
    const expiryDateRaw = req.body?.expiryDate;

    if (!packageId || !Number.isFinite(remainingAmountMBRaw) || remainingAmountMB < 0) {
      return res.status(400).json({ error: "invalid_input" });
    }

    const simRes = await pool.query("select id, user_id from sim_cards where id = $1 limit 1", [simId]);
    if (!simRes.rows[0]) return res.status(404).json({ error: "not_found" });
    const userId = String(simRes.rows[0].user_id);

    const pkgRes = await pool.query("select id, name, amount_mb, duration_days from data_packages where id = $1 limit 1", [packageId]);
    if (!pkgRes.rows[0]) return res.status(400).json({ error: "invalid_package" });

    const pkgName = String(pkgRes.rows[0].name);
    const totalAmountMB = Number(pkgRes.rows[0].amount_mb);
    const durationDays = Number(pkgRes.rows[0].duration_days);

    let expiry = expiryDateRaw ? new Date(String(expiryDateRaw)) : null;
    if (!expiry || Number.isNaN(expiry.getTime())) {
      const d = new Date();
      d.setDate(d.getDate() + (Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 30));
      expiry = d;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const currentRes = await client.query(
        "select id from active_bundles where sim_card_id = $1 and status = 'active' order by created_at desc limit 1",
        [simId]
      );

      let bundleRow: any;
      if (currentRes.rows[0]) {
        const bundleId = String(currentRes.rows[0].id);
        const updatedRes = await client.query(
          `update active_bundles
           set package_id = $1,
               total_amount_mb = $2,
               remaining_amount_mb = $3,
               expiry_date = $4,
               status = 'active',
               updated_at = now()
           where id = $5
           returning id, user_id, sim_card_id, package_id, total_amount_mb, remaining_amount_mb, expiry_date, status`,
          [packageId, totalAmountMB, remainingAmountMB, expiry.toISOString(), bundleId]
        );
        bundleRow = updatedRes.rows[0];
      } else {
        const insertedRes = await client.query(
          `insert into active_bundles (user_id, sim_card_id, package_id, total_amount_mb, remaining_amount_mb, expiry_date, status)
           values ($1, $2, $3, $4, $5, $6, 'active')
           returning id, user_id, sim_card_id, package_id, total_amount_mb, remaining_amount_mb, expiry_date, status`,
          [userId, simId, packageId, totalAmountMB, remainingAmountMB, expiry.toISOString()]
        );
        bundleRow = insertedRes.rows[0];
      }

      await client.query(
        "update active_bundles set status = 'expired', updated_at = now() where sim_card_id = $1 and status = 'active' and id <> $2",
        [simId, bundleRow.id]
      );

      await client.query("commit");
      res.json({
        bundle: {
          id: bundleRow.id,
          userId: bundleRow.user_id,
          simCardId: bundleRow.sim_card_id,
          packageId: bundleRow.package_id,
          packageName: pkgName,
          totalAmountMB: Number(bundleRow.total_amount_mb),
          remainingAmountMB: Number(bundleRow.remaining_amount_mb),
          expiryDate: bundleRow.expiry_date,
          status: bundleRow.status,
        },
      });
    } catch (e) {
      await client.query("rollback");
      console.error(e);
      res.status(500).json({ error: "update_failed" });
    } finally {
      client.release();
    }
  });

  app.get("/api/client/sims", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select
         s.id,
         s.user_id,
         s.iccid,
         s.phone_number,
         s.network,
         s.status,
         b.id as bundle_id,
         b.package_id as bundle_package_id,
         p.name as bundle_package_name,
         b.total_amount_mb as bundle_total_amount_mb,
         b.remaining_amount_mb as bundle_remaining_amount_mb,
         b.expiry_date as bundle_expiry_date
       from sim_cards s
       left join lateral (
         select b.*
         from active_bundles b
         where b.sim_card_id = s.id and b.status = 'active'
         order by b.expiry_date desc, b.created_at desc
         limit 1
       ) b on true
       left join data_packages p on p.id = b.package_id
       where s.user_id = $1
       order by s.created_at desc`,
      [userId]
    );
    res.json({
      sims: rows.map((s: any) => ({
        id: s.id,
        userId: s.user_id,
        iccid: s.iccid,
        phoneNumber: s.phone_number,
        network: s.network,
        status: s.status,
        activeBundle: s.bundle_id
          ? {
              id: s.bundle_id,
              packageId: s.bundle_package_id,
              packageName: s.bundle_package_name,
              totalAmountMB: Number(s.bundle_total_amount_mb),
              remainingAmountMB: Number(s.bundle_remaining_amount_mb),
              expiryDate: s.bundle_expiry_date,
            }
          : null,
      })),
    });
  });

  app.post("/api/client/sims", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const phoneRaw = String(req.body?.phoneNumber || "").trim();

    const phoneNumber = cleanPhoneNumber(phoneRaw);
    const phoneDigits = phoneNumber.replace(/[^\d]/g, "");

    if (!phoneNumber || phoneDigits.length < 10) {
      return res.status(400).json({ error: "invalid_input" });
    }

    const network = "MTN";
    const iccid =
      String(req.body?.iccid || "")
        .trim()
        .replace(/[^\d]/g, "") || `99${phoneDigits.slice(-10).padStart(10, "0")}${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    try {
      const { rows } = await pool.query(
        `insert into sim_cards (user_id, iccid, phone_number, network, status)
         values ($1, $2, $3, $4, 'active')
         returning id, iccid, phone_number, network, status, created_at`,
        [userId, iccid, phoneNumber, network]
      );
      const s = rows[0];
      res.json({
        sim: {
          id: s.id,
          iccid: s.iccid,
          phoneNumber: s.phone_number,
          network: s.network,
          status: s.status,
          createdAt: s.created_at,
        },
      });
    } catch (e: any) {
      const code = String(e?.code || "");
      if (code === "23505") {
        return res.status(409).json({ error: "already_exists" });
      }
      console.error(e);
      res.status(500).json({ error: "create_failed" });
    }
  });

  app.get("/api/client/dashboard", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const sims = await pool.query("select count(*)::int as count from sim_cards where user_id = $1", [userId]);
    const bundles = await pool.query(
      "select count(*)::int as count, coalesce(sum(remaining_amount_mb), 0)::int as remaining from active_bundles where user_id = $1 and status = 'active'",
      [userId]
    );
    res.json({
      stats: {
        activeSims: Number(sims.rows[0]?.count || 0),
        activeBundles: Number(bundles.rows[0]?.count || 0),
        totalRemainingMB: Number(bundles.rows[0]?.remaining || 0),
      },
    });
  });

  app.post("/api/client/orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const packageId = String(req.body?.packageId || "");
    const simId = String(req.body?.simId || "");
    const rawPaymentMethod = String(req.body?.paymentMethod || "").trim();
    const allowedPaymentMethods = new Set(["bank_transfer", "payfast", "yoco", "payat"]);
    const paymentMethod = allowedPaymentMethods.has(rawPaymentMethod) ? rawPaymentMethod : "bank_transfer";
    if (!packageId || !simId) return res.status(400).json({ error: "invalid_input" });

    const simRes = await pool.query("select phone_number from sim_cards where id = $1 and user_id = $2 limit 1", [
      simId,
      userId,
    ]);
    if (!simRes.rows[0]) return res.status(400).json({ error: "invalid_sim" });

    const pkgRes = await pool.query(
      "select id, name, price from data_packages where id = $1 and is_active = true limit 1",
      [packageId]
    );
    if (!pkgRes.rows[0]) return res.status(400).json({ error: "invalid_package" });

    const reference = simRes.rows[0].phone_number;
    const pkgName = pkgRes.rows[0].name;
    const amount = Number(pkgRes.rows[0].price);

    const { rows } = await pool.query(
      `insert into orders (user_id, package_id, sim_id, reference, payment_method, status, amount, package_name)
       values ($1, $2, $3, $4, $5, 'pending', $6, $7)
       returning id, status, created_at`,
      [userId, packageId, simId, reference, paymentMethod, amount, pkgName]
    );
    res.json({ order: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } });
  });

  app.get("/api/client/orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select o.id, o.package_id, o.sim_id, o.reference, o.payment_method, o.status, o.amount, o.package_name, o.created_at,
              s.phone_number, s.network
       from orders o
       join sim_cards s on s.id = o.sim_id
       where o.user_id = $1
       order by o.created_at desc`,
      [userId]
    );
    res.json({
      orders: rows.map((o: any) => ({
        id: o.id,
        packageId: o.package_id,
        simId: o.sim_id,
        simPhoneNumber: o.phone_number,
        simNetwork: o.network,
        reference: o.reference,
        paymentMethod: o.payment_method,
        status: o.status,
        amount: Number(o.amount),
        packageName: o.package_name,
        createdAt: o.created_at,
      })),
    });
  });

  app.post("/api/client/lte-orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const packageId = String(req.body?.packageId || "");
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const rawPaymentMethod = String(req.body?.paymentMethod || "").trim();
    const allowedPaymentMethods = new Set(["bank_transfer", "payfast", "yoco", "payat"]);
    const paymentMethod = allowedPaymentMethods.has(rawPaymentMethod) ? rawPaymentMethod : "bank_transfer";
    const incomingRef = String(req.body?.reference || "").trim();
    const reference = /^SC00[A-Za-z0-9]{4,}$/.test(incomingRef) ? incomingRef : `SC00${Math.floor(100000 + Math.random() * 900000)}`;
    if (!packageId) return res.status(400).json({ error: "invalid_input" });

    const pkgRes = await pool.query("select id, name, price from lte_packages where id = $1 and is_active = true limit 1", [
      packageId,
    ]);
    if (!pkgRes.rows[0]) return res.status(400).json({ error: "invalid_package" });

    const pkgName = pkgRes.rows[0].name;
    const packageAmount = Number(pkgRes.rows[0].price);
    const deliveryFee = 149;
    const amount = packageAmount + deliveryFee;
    const { rows } = await pool.query(
      `insert into lte_orders (user_id, package_id, status, amount, package_amount, delivery_fee, package_name, reference, payment_method, address, notes)
       values ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10)
       returning id, status, created_at`,
      [userId, packageId, amount, packageAmount, deliveryFee, pkgName, reference, paymentMethod, address, notes]
    );
    res.json({ order: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } });
  });

  app.get("/api/client/lte-orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select id, package_id, status, amount, package_amount, delivery_fee, package_name, reference, payment_method, address, notes, admin_comment, created_at
       from lte_orders
       where user_id = $1
       order by created_at desc`,
      [userId]
    );
    res.json({
      orders: rows.map((o: any) => ({
        id: o.id,
        packageId: o.package_id,
        status: o.status,
        amount: Number(o.amount),
        packageAmount: Number(o.package_amount ?? 0),
        deliveryFee: Number(o.delivery_fee ?? 0),
        packageName: o.package_name,
        reference: o.reference,
        paymentMethod: o.payment_method,
        address: o.address,
        notes: o.notes,
        adminComment: o.admin_comment,
        createdAt: o.created_at,
      })),
    });
  });

  app.get("/api/admin/lte-orders", requireAdmin, async (req, res) => {
    const status = String(req.query.status || "pending");
    const { rows } = await pool.query(
      `select o.*, u.email as user_email
       from lte_orders o
       join users u on u.id = o.user_id
       where o.status = $1
       order by o.created_at desc`,
      [status]
    );
    res.json({
      orders: rows.map((o: any) => ({
        id: o.id,
        userId: o.user_id,
        userEmail: o.user_email,
        packageId: o.package_id,
        status: o.status,
        amount: Number(o.amount),
        packageAmount: Number(o.package_amount ?? 0),
        deliveryFee: Number(o.delivery_fee ?? 0),
        packageName: o.package_name,
        reference: o.reference,
        paymentMethod: o.payment_method,
        address: o.address,
        notes: o.notes,
        adminComment: o.admin_comment,
        createdAt: o.created_at,
      })),
    });
  });

  app.post("/api/admin/lte-orders/:id/reject", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const adminComment = String(req.body?.adminComment || "");
    const orderRes = await pool.query(
      `select o.id, o.status, o.user_id, o.package_name, u.phone as user_phone
       from lte_orders o
       join users u on u.id = o.user_id
       where o.id = $1
       limit 1`,
      [id]
    );
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "pending") return res.status(400).json({ error: "not_pending" });

    await pool.query("update lte_orders set status = 'rejected', admin_comment = $1, updated_at = now() where id = $2", [
      adminComment,
      id,
    ]);

    try {
      const suffix = adminComment ? ` Comment: ${adminComment}` : "";
      await sendZoomconnectSms(order.user_phone || "", `DataConnect: Your LTE / 5G order for ${order.package_name} was rejected.${suffix}`);
    } catch {
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/lte-orders/:id/fulfill", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const adminComment = String(req.body?.adminComment || "");
    const orderRes = await pool.query(
      `select o.id, o.status, o.user_id, o.package_name, u.phone as user_phone
       from lte_orders o
       join users u on u.id = o.user_id
       where o.id = $1
       limit 1`,
      [id]
    );
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "pending") return res.status(400).json({ error: "not_pending" });

    await pool.query("update lte_orders set status = 'completed', admin_comment = $1, updated_at = now() where id = $2", [
      adminComment,
      id,
    ]);

    try {
      const suffix = adminComment ? ` Comment: ${adminComment}` : "";
      await sendZoomconnectSms(order.user_phone || "", `DataConnect: Your LTE / 5G order for ${order.package_name} is completed.${suffix}`);
    } catch {
    }
    res.json({ ok: true });
  });

  app.post("/api/client/sim-orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const network = String(req.body?.network || "").trim();
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    const rawPaymentMethod = String(req.body?.paymentMethod || "").trim();
    const allowedPaymentMethods = new Set(["bank_transfer", "payfast", "yoco", "payat"]);
    const paymentMethod = allowedPaymentMethods.has(rawPaymentMethod) ? rawPaymentMethod : "bank_transfer";
    const amount = 99;
    const reference = String(req.user?.phone || "").trim() || String(req.user?.email || "").trim();
    const { rows } = await pool.query(
      `insert into sim_orders (user_id, network, address, notes, reference, payment_method, amount, status)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending')
       returning id, status, created_at`,
      [userId, network, address, notes, reference, paymentMethod, amount]
    );
    res.json({ order: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } });
  });

  app.get("/api/client/sim-orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select id, network, address, notes, reference, payment_method, amount, status, admin_comment, created_at
       from sim_orders
       where user_id = $1
       order by created_at desc`,
      [userId]
    );
    res.json({
      orders: rows.map((o: any) => ({
        id: o.id,
        network: o.network,
        address: o.address,
        notes: o.notes,
        reference: o.reference,
        paymentMethod: o.payment_method,
        amount: Number(o.amount ?? 0),
        status: o.status,
        adminComment: o.admin_comment,
        createdAt: o.created_at,
      })),
    });
  });

  app.get("/api/admin/sim-orders", requireAdmin, async (req, res) => {
    const status = String(req.query.status || "pending");
    const { rows } = await pool.query(
      `select o.*, u.email as user_email
       from sim_orders o
       join users u on u.id = o.user_id
       where o.status = $1
       order by o.created_at desc`,
      [status]
    );
    res.json({
      orders: rows.map((o: any) => ({
        id: o.id,
        userId: o.user_id,
        userEmail: o.user_email,
        network: o.network,
        address: o.address,
        notes: o.notes,
        reference: o.reference,
        paymentMethod: o.payment_method,
        amount: Number(o.amount ?? 0),
        status: o.status,
        adminComment: o.admin_comment,
        createdAt: o.created_at,
      })),
    });
  });

  app.put("/api/admin/sim-orders/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const status = String(req.body?.status || "");
    const adminComment = String(req.body?.adminComment || "");
    if (!["pending", "completed", "rejected"].includes(status)) return res.status(400).json({ error: "invalid_input" });
    const orderRes = await pool.query(
      `select o.id, o.status, o.user_id, o.network, u.phone as user_phone
       from sim_orders o
       join users u on u.id = o.user_id
       where o.id = $1
       limit 1`,
      [id]
    );
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "pending") return res.status(400).json({ error: "not_pending" });

    await pool.query("update sim_orders set status = $1, admin_comment = $2, updated_at = now() where id = $3", [
      status,
      adminComment,
      id,
    ]);

    try {
      const suffix = adminComment ? ` Comment: ${adminComment}` : "";
      const msg =
        status === "completed"
          ? `DataConnect: Your SIM order (${order.network}) is completed.${suffix}`
          : status === "rejected"
            ? `DataConnect: Your SIM order (${order.network}) was rejected.${suffix}`
            : `DataConnect: Your SIM order (${order.network}) was updated.${suffix}`;
      await sendZoomconnectSms(order.user_phone || "", msg);
    } catch {
    }
    res.json({ ok: true });
  });

  app.post("/api/client/coverage-checks", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const networkPreference = String(req.body?.networkPreference || "").trim();
    const address = String(req.body?.address || "").trim();
    const notes = String(req.body?.notes || "").trim();
    if (!address) return res.status(400).json({ error: "invalid_input" });
    const { rows } = await pool.query(
      `insert into coverage_checks (user_id, network_preference, address, notes, status)
       values ($1, $2, $3, $4, 'open')
       returning id, status, created_at`,
      [userId, networkPreference, address, notes]
    );
    res.json({ request: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } });
  });

  app.get("/api/client/coverage-checks", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select id, network_preference, address, notes, status, admin_comment, suggested_package_ids, created_at
       from coverage_checks
       where user_id = $1
       order by created_at desc`,
      [userId]
    );
    res.json({
      requests: rows.map((r: any) => ({
        id: r.id,
        networkPreference: r.network_preference,
        address: r.address,
        notes: r.notes,
        status: r.status,
        adminComment: r.admin_comment,
        suggestedPackageIds: Array.isArray(r.suggested_package_ids) ? r.suggested_package_ids : [],
        createdAt: r.created_at,
      })),
    });
  });

  app.get("/api/admin/coverage-checks", requireAdmin, async (req, res) => {
    const status = String(req.query.status || "open");
    const { rows } = await pool.query(
      `select r.*, u.email as user_email
       from coverage_checks r
       join users u on u.id = r.user_id
       where r.status = $1
       order by r.created_at desc`,
      [status]
    );
    res.json({
      requests: rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        networkPreference: r.network_preference,
        address: r.address,
        notes: r.notes,
        status: r.status,
        adminComment: r.admin_comment,
        suggestedPackageIds: Array.isArray(r.suggested_package_ids) ? r.suggested_package_ids : [],
        createdAt: r.created_at,
      })),
    });
  });

  app.put("/api/admin/coverage-checks/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const status = String(req.body?.status || "");
    const adminComment = String(req.body?.adminComment || "");
    const suggested = Array.isArray(req.body?.suggestedPackageIds) ? (req.body.suggestedPackageIds as string[]) : [];
    if (!["open", "responded", "closed"].includes(status)) return res.status(400).json({ error: "invalid_input" });
    const requestRes = await pool.query(
      `select r.id, r.user_id, r.address, u.phone as user_phone
       from coverage_checks r
       join users u on u.id = r.user_id
       where r.id = $1
       limit 1`,
      [id]
    );
    const reqRow = requestRes.rows[0];
    if (!reqRow) return res.status(404).json({ error: "not_found" });

    const { rows } = await pool.query(
      `update coverage_checks
       set status = $1, admin_comment = $2, suggested_package_ids = $3::uuid[], updated_at = now()
       where id = $4
       returning id, status, updated_at`,
      [status, adminComment, suggested.map((x) => String(x)), id]
    );
    if (!rows[0]) return res.status(404).json({ error: "not_found" });

    try {
      let packagePart = "";
      if (suggested.length > 0) {
        const namesRes = await pool.query("select name from lte_packages where id = any($1::uuid[])", [suggested]);
        const names = namesRes.rows.map((r: any) => r.name).filter(Boolean).slice(0, 4);
        if (names.length > 0) packagePart = ` Suggested: ${names.join(", ")}`;
      }
      const commentPart = adminComment ? ` Comment: ${adminComment}` : "";
      await sendZoomconnectSms(reqRow.user_phone || "", `DataConnect: Coverage check update (${reqRow.address}) - ${status}.${commentPart}${packagePart}`);
    } catch {
    }
    res.json({ ok: true });
  });

  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const status = String(req.query.status || "pending");
    const { rows } = await pool.query(
      `select o.*, u.email as user_email
       from orders o
       join users u on u.id = o.user_id
       where o.status = $1
       order by o.created_at desc`,
      [status]
    );
    res.json({
      orders: rows.map((o: any) => ({
        id: o.id,
        userId: o.user_id,
        userEmail: o.user_email,
        packageId: o.package_id,
        simId: o.sim_id,
        reference: o.reference,
        paymentMethod: o.payment_method,
        status: o.status,
        amount: Number(o.amount),
        packageName: o.package_name,
        createdAt: o.created_at,
      })),
    });
  });

  app.post("/api/admin/orders/:id/reject", requireAdmin, async (req, res) => {
    const orderId = String(req.params.id);
    const orderRes = await pool.query(
      `select o.id, o.status, o.user_id, o.package_name, o.reference, u.phone as user_phone
       from orders o
       join users u on u.id = o.user_id
       where o.id = $1
       limit 1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "pending") return res.status(400).json({ error: "not_pending" });

    await pool.query("update orders set status = 'rejected', updated_at = now() where id = $1", [orderId]);

    const recipient = order.user_phone || order.reference || "";
    try {
      await sendZoomconnectSms(recipient, `DataConnect: Your top-up order for ${order.package_name} was rejected.`);
    } catch {
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/orders/:id/fulfill", requireAdmin, async (req, res) => {
    const orderId = String(req.params.id);

    const orderRes = await pool.query("select * from orders where id = $1 limit 1", [orderId]);
    const order = orderRes.rows[0];
    if (!order) return res.status(404).json({ error: "not_found" });
    if (order.status !== "pending") return res.status(400).json({ error: "not_pending" });

    const pkgRes = await pool.query("select * from data_packages where id = $1 limit 1", [order.package_id]);
    const pkg = pkgRes.rows[0];
    if (!pkg) return res.status(400).json({ error: "package_not_found" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + Number(pkg.duration_days));

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("update orders set status = 'completed', updated_at = now() where id = $1", [orderId]);
      await client.query(
        `insert into active_bundles (user_id, sim_card_id, package_id, total_amount_mb, remaining_amount_mb, expiry_date, status)
         values ($1, $2, $3, $4, $4, $5, 'active')`,
        [order.user_id, order.sim_id, order.package_id, Number(pkg.amount_mb), expiry.toISOString()]
      );
      const pm = String(order.payment_method || "bank_transfer") || "bank_transfer";
      await client.query(
        `insert into transactions (user_id, package_id, amount, reference, payment_method, status, created_at)
         values ($1, $2, $3, $4, $5, 'success', now())`,
        [order.user_id, order.package_id, Number(pkg.price), order.reference, pm]
      );
      await client.query("commit");
      const phoneRes = await pool.query("select phone from users where id = $1 limit 1", [order.user_id]);
      const recipient = phoneRes.rows[0]?.phone || order.reference || "";
      try {
        await sendZoomconnectSms(recipient, `DataConnect: Your top-up order for ${order.package_name} is completed.`);
      } catch {
      }
      res.json({ ok: true });
    } catch {
      await client.query("rollback");
      res.status(500).json({ error: "fulfill_failed" });
    } finally {
      client.release();
    }
  });

  app.get("/api/client/transactions", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select id, amount, reference, payment_method, status, created_at
       from transactions
       where user_id = $1
       order by created_at desc`,
      [userId]
    );
    res.json({
      transactions: rows.map((t: any) => ({
        id: t.id,
        amount: Number(t.amount),
        reference: t.reference,
        paymentMethod: t.payment_method,
        status: t.status,
        createdAt: t.created_at,
      })),
    });
  });

  app.get("/api/admin/dashboard", requireAdmin, async (_req, res) => {
    const users = await pool.query("select count(*)::int as count from users");
    const sims = await pool.query("select count(*)::int as count from sim_cards");
    const tx = await pool.query("select count(*)::int as count from transactions");
    res.json({
      stats: {
        totalUsers: Number(users.rows[0]?.count || 0),
        totalSims: Number(sims.rows[0]?.count || 0),
        transactions: Number(tx.rows[0]?.count || 0),
      },
    });
  });

  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    const days = Number(req.query.days || 30);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - (Number.isFinite(days) ? days : 30));

    const txRes = await pool.query(
      `select t.amount, t.package_id, t.created_at, p.name as package_name
       from transactions t
       left join data_packages p on p.id = t.package_id
       where t.status = 'success' and t.created_at >= $1
       order by t.created_at asc`,
      [threshold.toISOString()]
    );

    const revenueByDate = new Map<string, number>();
    const packagesById = new Map<string, { name: string; count: number; revenue: number }>();
    let totalRevenue = 0;

    for (const row of txRes.rows) {
      const amt = Number(row.amount);
      totalRevenue += amt;
      const dayKey = new Date(row.created_at).toISOString().slice(0, 10);
      revenueByDate.set(dayKey, (revenueByDate.get(dayKey) || 0) + amt);

      const pkgId = row.package_id || "unknown";
      const name = row.package_name || "Unknown Package";
      const current = packagesById.get(pkgId) || { name, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += amt;
      packagesById.set(pkgId, current);
    }

    const revenueData = Array.from(revenueByDate.entries())
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const packageStats = Array.from(packagesById.values()).sort((a, b) => b.count - a.count);

    res.json({ totalRevenue, revenueData, packageStats });
  });

  app.get("/api/client/preferences", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const pref = await pool.query("select * from user_preferences where user_id = $1 limit 1", [userId]);
    if (!pref.rows[0]) {
      return res.json({
        preferences: {
          expiryReminders: true,
          reminderDays: 3,
          lowBalanceAlerts: true,
          lowBalanceThresholdMB: 500,
          pushEnabled: false,
        },
      });
    }
    res.json({
      preferences: {
        expiryReminders: pref.rows[0].expiry_reminders,
        reminderDays: Number(pref.rows[0].reminder_days),
        lowBalanceAlerts: pref.rows[0].low_balance_alerts,
        lowBalanceThresholdMB: Number(pref.rows[0].low_balance_threshold_mb),
        pushEnabled: pref.rows[0].push_enabled,
      },
    });
  });

  app.put("/api/client/preferences", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const payload = {
      expiryReminders: Boolean(req.body?.expiryReminders),
      reminderDays: Number(req.body?.reminderDays),
      lowBalanceAlerts: Boolean(req.body?.lowBalanceAlerts),
      lowBalanceThresholdMB: Number(req.body?.lowBalanceThresholdMB),
      pushEnabled: Boolean(req.body?.pushEnabled),
    };
    await pool.query(
      `insert into user_preferences (user_id, expiry_reminders, reminder_days, low_balance_alerts, low_balance_threshold_mb, push_enabled, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (user_id) do update set
         expiry_reminders = excluded.expiry_reminders,
         reminder_days = excluded.reminder_days,
         low_balance_alerts = excluded.low_balance_alerts,
         low_balance_threshold_mb = excluded.low_balance_threshold_mb,
         push_enabled = excluded.push_enabled,
         updated_at = now()`,
      [
        userId,
        payload.expiryReminders,
        payload.reminderDays,
        payload.lowBalanceAlerts,
        payload.lowBalanceThresholdMB,
        payload.pushEnabled,
      ]
    );
    res.json({ ok: true });
  });

  app.put("/api/client/profile", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const photoUrl = req.body?.photoURL === null ? null : String(req.body?.photoURL || "");
    const { rows } = await pool.query(
      `update users set photo_url = $1, updated_at = now()
       where id = $2
       returning id, email, name, phone, role, status, photo_url`,
      [photoUrl, userId]
    );
    res.json({ user: toUser(rows[0]) });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    if (req.path.startsWith("/api/")) {
      if (res.headersSent) return next(err);
      const pgCode = String(err?.code || "");
      const msg = String(err?.message || "");
      if (pgCode === "42P01" || pgCode === "42704" || msg.includes("does not exist")) {
        return res.status(503).json({ error: "schema_missing" });
      }
      if (
        pgCode.startsWith("08") ||
        pgCode.startsWith("57") ||
        pgCode === "53300" ||
        msg.includes("Connection terminated") ||
        msg.includes("terminating connection") ||
        msg.includes("connection timeout")
      ) {
        return res.status(503).json({ error: "db_unavailable" });
      }
      const status = Number(err?.statusCode ?? err?.status);
      if (Number.isFinite(status) && status >= 400 && status < 600) {
        const code =
          String(err?.type || "") === "entity.parse.failed" ? "invalid_json" : status === 404 ? "not_found" : "bad_request";
        return res.status(status).json({ error: code });
      }
      return res.status(500).json({ error: "internal_error" });
    }
    next(err);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
