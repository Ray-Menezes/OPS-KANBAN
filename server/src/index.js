import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, initDb, getOrCreateBoard } from "./db.js";
import { authMiddleware, signToken } from "./auth.js";

initDb();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const app = express();
app.use(cors());
app.use(express.json());

// --- SSE clients
const sseClients = new Set();
function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(data);
}

function nowMs() { return Date.now(); }

// --- seed user
app.post("/api/admin/seed", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });

  const hash = await bcrypt.hash(password, 10);
  db.run(
    `INSERT OR IGNORE INTO users (email, pass_hash) VALUES (?, ?)`,
    [email, hash],
    (err) => {
      if (err) return res.status(500).json({ error: "db_error" });
      return res.json({ ok: true });
    }
  );
});

// --- auth
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.pass_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = signToken(user);
    return res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// --- realtime stream (SSE via query token)
app.get("/api/stream", (req, res) => {
  const token = req.query.access_token;
  if (!token) return res.status(401).end();

  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.status(401).end(); }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write(`event: hello\ndata: {"ok":true}\n\n`);
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

// --- boards/cards
app.get("/api/board/:dateKey", authMiddleware, async (req, res) => {
  const board = await getOrCreateBoard(req.params.dateKey);

  db.all(`SELECT * FROM cards WHERE board_id = ? ORDER BY updated_at DESC`, [board.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    res.json({ board, cards: rows });
  });
});

app.post("/api/board/:dateKey/cards", authMiddleware, async (req, res) => {
  const board = await getOrCreateBoard(req.params.dateKey);

  const { title, status = "A_FAZER", assignee = "", priority = "NORMAL", notes = "" } = req.body || {};
  if (!title) return res.status(400).json({ error: "title_required" });

  const updatedAt = nowMs();
  db.run(
    `INSERT INTO cards (board_id, title, status, assignee, priority, notes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [board.id, title, status, assignee, priority, notes, updatedAt],
    function (err) {
      if (err) return res.status(500).json({ error: "db_error" });
      const card = { id: this.lastID, board_id: board.id, title, status, assignee, priority, notes, updated_at: updatedAt };
      broadcast("board_update", { action: "create", card });
      res.json({ card });
    }
  );
});

app.patch("/api/cards/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const { title, status, assignee, priority, notes } = req.body || {};
  const updatedAt = nowMs();

  db.get(`SELECT * FROM cards WHERE id = ?`, [id], (err, existing) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!existing) return res.status(404).json({ error: "not_found" });

    const next = {
      title: title ?? existing.title,
      status: status ?? existing.status,
      assignee: assignee ?? existing.assignee,
      priority: priority ?? existing.priority,
      notes: notes ?? existing.notes
    };

    db.run(
      `UPDATE cards SET title=?, status=?, assignee=?, priority=?, notes=?, updated_at=? WHERE id=?`,
      [next.title, next.status, next.assignee, next.priority, next.notes, updatedAt, id],
      (err2) => {
        if (err2) return res.status(500).json({ error: "db_error" });

        db.get(`SELECT * FROM cards WHERE id = ?`, [id], (err3, row) => {
          if (err3) return res.status(500).json({ error: "db_error" });
          broadcast("board_update", { action: "update", card: row });
          res.json({ card: row });
        });
      }
    );
  });
});

app.delete("/api/cards/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  db.run(`DELETE FROM cards WHERE id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ error: "db_error" });
    broadcast("board_update", { action: "delete", card: { id } });
    res.json({ ok: true });
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
