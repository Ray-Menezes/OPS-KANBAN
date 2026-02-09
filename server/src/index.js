import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import multer from "multer";
import { db, initDb, getOrCreateBoard } from "./db.js";
import { authMiddleware, signToken } from "./auth.js";

initDb();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const app = express();
app.use(cors());
app.use(express.json());

// uploads
const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

// SSE clients
const sseClients = new Set();
function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) res.write(data);
}
function nowMs() { return Date.now(); }

// multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}_${Math.random().toString(16).slice(2)}_${safe}`);
  }
});
const upload = multer({ storage });

// seed user (cria/atualiza usuário)
app.post("/api/admin/seed", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });

  const hash = await bcrypt.hash(password, 10);
  db.run(
    `INSERT INTO users (email, pass_hash) VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET pass_hash=excluded.pass_hash`,
    [email, hash],
    (err) => {
      if (err) return res.status(500).json({ error: "db_error" });
      res.json({ ok: true });
    }
  );
});

// login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email_password_required" });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!user) return res.status(401).json({ error: "invalid_credentials" });

    const ok = await bcrypt.compare(password, user.pass_hash);
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// SSE stream (token via query)
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
  req.on("close", () => sseClients.delete(res));
});

// board/cards
app.get("/api/board/:dateKey", authMiddleware, async (req, res) => {
  const board = await getOrCreateBoard(req.params.dateKey);
  db.all(`SELECT * FROM cards WHERE board_id = ? ORDER BY updated_at DESC`, [board.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    res.json({ board, cards: rows });
  });
});

app.post("/api/board/:dateKey/cards", authMiddleware, async (req, res) => {
  const board = await getOrCreateBoard(req.params.dateKey);

  const body = req.body || {};
  const title = (body.title || "").trim();
  const status = body.status || "A_FAZER";
  const assignee = body.assignee ?? "";
  const priority = body.priority ?? "NORMAL";
  const notes = body.notes ?? "";
  const due_at = Number.isFinite(Number(body.due_at)) ? Number(body.due_at) : null;

  // tags pode vir como string JSON ("[...]" ) ou como array
  let tagsJson = "[]";
  try {
    if (typeof body.tags === "string") tagsJson = body.tags;
    else if (Array.isArray(body.tags)) tagsJson = JSON.stringify(body.tags);
  } catch { tagsJson = "[]"; }

  if (!title) return res.status(400).json({ error: "title_required" });

  const updatedAt = nowMs();

  // Lead time: começa no A_FAZER (ou na criação se vier direto em outra coluna)
  const startedAt = updatedAt;
  const completedAt = status === "CONCLUIDO" ? updatedAt : null;

  // Work time: roda só em EM_ANDAMENTO
  const workStartedAt = status === "EM_ANDAMENTO" ? updatedAt : null;
  const workAccumMs = 0;

  const returnsToAfazer = 0;

  db.run(
    `INSERT INTO cards (
      board_id, title, status, assignee, priority, notes, updated_at,
      started_at, completed_at, due_at, tags,
      work_started_at, work_accum_ms, returns_to_afazer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      board.id, title, status, assignee, priority, notes, updatedAt,
      startedAt, completedAt, due_at, tagsJson,
      workStartedAt, workAccumMs, returnsToAfazer
    ],
    function (err) {
      if (err) return res.status(500).json({ error: "db_error" });

      const card = {
        id: this.lastID,
        board_id: board.id,
        title,
        status,
        assignee,
        priority,
        notes,
        updated_at: updatedAt,
        started_at: startedAt,
        completed_at: completedAt,
        due_at,
        tags: tagsJson,
        work_started_at: workStartedAt,
        work_accum_ms: workAccumMs,
        returns_to_afazer: returnsToAfazer
      };

      db.run(
        `INSERT INTO card_events (card_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)`,
        [card.id, "create", JSON.stringify({ status }), updatedAt]
      );

      broadcast("board_update", { action: "create", card });
      res.json({ card });
    }
  );
});

app.patch("/api/cards/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const updatedAt = nowMs();

  db.get(`SELECT * FROM cards WHERE id = ?`, [id], (err, existing) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!existing) return res.status(404).json({ error: "not_found" });

    const next = {
      title: body.title ?? existing.title,
      status: body.status ?? existing.status,
      assignee: body.assignee ?? existing.assignee,
      priority: body.priority ?? existing.priority,
      notes: body.notes ?? existing.notes,
      due_at: (body.due_at === undefined ? existing.due_at : (Number.isFinite(Number(body.due_at)) ? Number(body.due_at) : null)),
      tags: (body.tags === undefined ? existing.tags : (Array.isArray(body.tags) ? JSON.stringify(body.tags) : String(body.tags)))
    };

    const statusChanged = next.status !== existing.status;

    // LEAD / KPI: conta do started_at até completed_at (para em CONCLUIDO).
    let startedAt = existing.started_at ?? null;
    let completedAt = existing.completed_at ?? null;

    // WORK: conta só em EM_ANDAMENTO (pausa BLOQUEADO / A_FAZER, finaliza CONCLUIDO)
    let workStartedAt = existing.work_started_at ?? null;
    let workAccumMs = existing.work_accum_ms ?? 0;

    // Retornos para A_FAZER
    let returnsToAfazer = existing.returns_to_afazer ?? 0;

    if (statusChanged) {
      const from = existing.status;
      const to = next.status;

      // Se estava rodando, ao sair de EM_ANDAMENTO acumula
      if (from === "EM_ANDAMENTO" && workStartedAt) {
        workAccumMs += (updatedAt - workStartedAt);
        workStartedAt = null;
      }

      // Entrou em EM_ANDAMENTO: inicia/resume work timer
      if (to === "EM_ANDAMENTO") {
        workStartedAt = updatedAt;
        // se já tinha concluído antes e voltou, reabre
        completedAt = null;
      }

      // Entrou em CONCLUIDO: para tudo e marca completed
      if (to === "CONCLUIDO") {
        if (workStartedAt) {
          workAccumMs += (updatedAt - workStartedAt);
          workStartedAt = null;
        }
        completedAt = updatedAt;
      }

      // Voltou para A_FAZER: reinicia tudo e conta retorno
      if (to === "A_FAZER") {
        if (from !== "A_FAZER") returnsToAfazer += 1;
        startedAt = updatedAt;     // reinicia lead
        completedAt = null;
        workStartedAt = null;
        workAccumMs = 0;
      }

      // BLOQUEADO: só fica pausado (lead continua, work já pausou acima)
      if (to === "BLOQUEADO") {
        // nada
      }

      db.run(
        `INSERT INTO card_events (card_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)`,
        [id, "status_change", JSON.stringify({ from, to }), updatedAt]
      );
    }

    db.run(
      `UPDATE cards SET
        title=?, status=?, assignee=?, priority=?, notes=?, updated_at=?,
        started_at=?, completed_at=?, due_at=?, tags=?,
        work_started_at=?, work_accum_ms=?, returns_to_afazer=?
       WHERE id=?`,
      [
        next.title, next.status, next.assignee, next.priority, next.notes, updatedAt,
        startedAt, completedAt, next.due_at, next.tags,
        workStartedAt, workAccumMs, returnsToAfazer,
        id
      ],
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

// comments
app.get("/api/cards/:id/comments", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  db.all(`SELECT * FROM card_comments WHERE card_id=? ORDER BY created_at ASC`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    res.json({ comments: rows });
  });
});

app.post("/api/cards/:id/comments", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const text = (req.body?.text || "").trim();
  const author = (req.body?.author || req.user?.email || "operador").trim();
  if (!text) return res.status(400).json({ error: "text_required" });

  const createdAt = nowMs();
  db.run(
    `INSERT INTO card_comments (card_id, author, text, created_at) VALUES (?, ?, ?, ?)`,
    [id, author, text, createdAt],
    function (err) {
      if (err) return res.status(500).json({ error: "db_error" });

      db.run(
        `INSERT INTO card_events (card_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)`,
        [id, "comment", JSON.stringify({ author }), createdAt]
      );

      broadcast("board_update", { action: "comment", card_id: id });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

// attachments
app.get("/api/cards/:id/attachments", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  db.all(`SELECT * FROM card_attachments WHERE card_id=? ORDER BY created_at DESC`, [id], (err, rows) => {
    if (err) return res.status(500).json({ error: "db_error" });
    const attachments = rows.map(r => ({ ...r, url: `/uploads/${r.filename}` }));
    res.json({ attachments });
  });
});

app.post("/api/cards/:id/attachments", authMiddleware, upload.single("file"), (req, res) => {
  const id = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: "file_required" });

  const createdAt = nowMs();
  db.run(
    `INSERT INTO card_attachments (card_id, filename, original_name, mime, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, createdAt],
    function (err) {
      if (err) return res.status(500).json({ error: "db_error" });

      db.run(
        `INSERT INTO card_events (card_id, event_type, payload, created_at) VALUES (?, ?, ?, ?)`,
        [id, "attachment", JSON.stringify({ original_name: req.file.originalname }), createdAt]
      );

      broadcast("board_update", { action: "attachment", card_id: id });
      res.json({
        ok: true,
        attachment: {
          id: this.lastID,
          card_id: id,
          filename: req.file.filename,
          original_name: req.file.originalname,
          mime: req.file.mimetype,
          size: req.file.size,
          created_at: createdAt,
          url: `/uploads/${req.file.filename}`
        }
      });
    }
  );
});

app.delete("/api/attachments/:attId", authMiddleware, (req, res) => {
  const attId = Number(req.params.attId);
  db.get(`SELECT * FROM card_attachments WHERE id=?`, [attId], (err, row) => {
    if (err) return res.status(500).json({ error: "db_error" });
    if (!row) return res.status(404).json({ error: "not_found" });

    const filePath = path.join(UPLOAD_DIR, row.filename);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}

    db.run(`DELETE FROM card_attachments WHERE id=?`, [attId], (err2) => {
      if (err2) return res.status(500).json({ error: "db_error" });
      broadcast("board_update", { action: "attachment_delete", card_id: row.card_id });
      res.json({ ok: true });
    });
  });
});

const PORT = Number(process.env.PORT || 4001);
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
