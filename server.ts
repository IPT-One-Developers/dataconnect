import "dotenv/config";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
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
  ssl: {
    rejectUnauthorized: false,
  },
});

const SESSION_COOKIE = "dc_session";
const SESSION_TTL_DAYS = 30;

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
  const PORT = 3000;

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

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
          to_regclass('public.password_reset_requests') is not null as password_reset_requests`
      );
      const s = rows[0] || {};
      const missing = Object.entries(s)
        .filter(([, ok]) => ok !== true)
        .map(([k]) => k);
      res.json({ status: "ok", db: "ok", schema: { ok: missing.length === 0, missing } });
    } catch {
      res.status(503).json({ status: "error", db: "error" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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

    const { rows } = await pool.query("select * from users where email = $1 limit 1", [email]);
    const userRow = rows[0];
    if (!userRow) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    if (userRow.status !== "active") return res.status(403).json({ error: "account_suspended" });

    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const session = await pool.query(
      "insert into sessions (user_id, expires_at) values ($1, $2) returning id",
      [userRow.id, expiresAt.toISOString()]
    );
    const sessionId = session.rows[0].id;

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
        const existingAdmins = await pool.query("select count(*)::int as count from users where role = 'admin'");
        if (Number(existingAdmins.rows[0]?.count || 0) === 0) role = "admin";
      }
      const insert = await pool.query(
        `insert into users (email, password_hash, name, phone, role, status)
         values ($1, $2, $3, $4, $5, 'active')
         returning *`,
        [email, passwordHash, name, phone, role]
      );
      userRow = insert.rows[0];
    } catch {
      return res.status(409).json({ error: "email_exists" });
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const session = await pool.query(
      "insert into sessions (user_id, expires_at) values ($1, $2) returning id",
      [userRow.id, expiresAt.toISOString()]
    );
    const sessionId = session.rows[0].id;

    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
    const { rows } = await pool.query("select * from company_settings where id = 'global' limit 1");
    res.json({ settings: rows[0] || null });
  });

  app.put("/api/admin/company-settings", requireAdmin, async (req, res) => {
    const payload = {
      company_name: String(req.body?.companyName ?? "DataConnect"),
      support_email: String(req.body?.supportEmail ?? ""),
      support_phone: String(req.body?.supportPhone ?? ""),
      banking_details: String(req.body?.bankingDetails ?? ""),
      logo_url: String(req.body?.logoUrl ?? ""),
    };
    const { rows } = await pool.query(
      `update company_settings
       set company_name = $1, support_email = $2, support_phone = $3, banking_details = $4, logo_url = $5, updated_at = now()
       where id = 'global'
       returning *`,
      [payload.company_name, payload.support_email, payload.support_phone, payload.banking_details, payload.logo_url]
    );
    res.json({ settings: rows[0] });
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
      sets.push(`role = $${idx++}`);
      values.push(role);
    }
    if (status) {
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
    const activeOnly = String(req.query.activeOnly || "false") === "true";
    const { rows } = await pool.query(
      `select id, name, description, amount_mb, price, duration_days, is_active
       from data_packages
       where ($1::boolean = false) or (is_active = true)
       order by created_at desc`,
      [activeOnly]
    );
    res.json({
      packages: rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        amountMB: Number(p.amount_mb),
        price: Number(p.price),
        durationDays: Number(p.duration_days),
        isActive: p.is_active,
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
      `insert into data_packages (name, description, amount_mb, price, duration_days, is_active)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, description, amount_mb, price, duration_days, is_active`,
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
       returning id, name, description, amount_mb, price, duration_days, is_active`,
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
      },
    });
  });

  app.patch("/api/admin/packages/:id/status", requireAdmin, async (req, res) => {
    const packageId = String(req.params.id);
    const isActive = Boolean(req.body?.isActive);
    const { rows } = await pool.query(
      `update data_packages set is_active = $1, updated_at = now()
       where id = $2
       returning id, name, description, amount_mb, price, duration_days, is_active`,
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
      },
    });
  });

  app.get("/api/admin/sims", requireAdmin, async (_req, res) => {
    const { rows } = await pool.query(
      `select s.id, s.user_id, s.iccid, s.phone_number, s.network, s.status, u.email as user_email
       from sim_cards s
       join users u on u.id = s.user_id
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

  app.get("/api/client/sims", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      "select id, user_id, iccid, phone_number, network, status from sim_cards where user_id = $1 order by created_at desc",
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
      })),
    });
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
      `insert into orders (user_id, package_id, sim_id, reference, status, amount, package_name)
       values ($1, $2, $3, $4, 'pending', $5, $6)
       returning id, status, created_at`,
      [userId, packageId, simId, reference, amount, pkgName]
    );
    res.json({ order: { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at } });
  });

  app.get("/api/client/orders", requireAuth, async (req, res) => {
    const userId = req.user!.id;
    const { rows } = await pool.query(
      `select o.id, o.package_id, o.sim_id, o.reference, o.status, o.amount, o.package_name, o.created_at,
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
        status: o.status,
        amount: Number(o.amount),
        packageName: o.package_name,
        createdAt: o.created_at,
      })),
    });
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
        status: o.status,
        amount: Number(o.amount),
        packageName: o.package_name,
        createdAt: o.created_at,
      })),
    });
  });

  app.post("/api/admin/orders/:id/reject", requireAdmin, async (req, res) => {
    const orderId = String(req.params.id);
    await pool.query("update orders set status = 'rejected', updated_at = now() where id = $1", [orderId]);
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

    await pool.query("begin");
    try {
      await pool.query("update orders set status = 'completed', updated_at = now() where id = $1", [orderId]);
      await pool.query(
        `insert into active_bundles (user_id, sim_card_id, package_id, total_amount_mb, remaining_amount_mb, expiry_date, status)
         values ($1, $2, $3, $4, $4, $5, 'active')`,
        [order.user_id, order.sim_id, order.package_id, Number(pkg.amount_mb), expiry.toISOString()]
      );
      await pool.query(
        `insert into transactions (user_id, package_id, amount, reference, payment_method, status, created_at)
         values ($1, $2, $3, $4, 'bank_transfer', 'success', now())`,
        [order.user_id, order.package_id, Number(pkg.price), order.reference]
      );
      await pool.query("commit");
      res.json({ ok: true });
    } catch {
      await pool.query("rollback");
      res.status(500).json({ error: "fulfill_failed" });
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
