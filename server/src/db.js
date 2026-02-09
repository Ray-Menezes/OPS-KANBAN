import sqlite3 from "sqlite3";

export const db = new sqlite3.Database("./data.sqlite");

function addColumn(table, column, type) {
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, () => {});
}

export function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        pass_hash TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_key TEXT UNIQUE NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        assignee TEXT,
        priority TEXT,
        notes TEXT,
        updated_at INTEGER NOT NULL,
        -- KPI / prazos / tags
        started_at INTEGER,
        completed_at INTEGER,
        due_at INTEGER,
        tags TEXT,
        -- Work timer (só conta EM_ANDAMENTO)
        work_started_at INTEGER,
        work_accum_ms INTEGER,
        -- Quantas vezes voltou para A_FAZER
        returns_to_afazer INTEGER,
        FOREIGN KEY(board_id) REFERENCES boards(id)
      )
    `);

    // Migrações (ignora erro se já existir)
    addColumn("cards", "started_at", "INTEGER");
    addColumn("cards", "completed_at", "INTEGER");
    addColumn("cards", "due_at", "INTEGER");
    addColumn("cards", "tags", "TEXT"); // JSON string
    addColumn("cards", "work_started_at", "INTEGER");
    addColumn("cards", "work_accum_ms", "INTEGER");
    addColumn("cards", "returns_to_afazer", "INTEGER");

    db.run(`
      CREATE TABLE IF NOT EXISTS card_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(card_id) REFERENCES cards(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS card_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(card_id) REFERENCES cards(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS card_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(card_id) REFERENCES cards(id)
      )
    `);
  });
}

export function getOrCreateBoard(dateKey) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM boards WHERE date_key = ?`, [dateKey], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row);

      db.run(`INSERT INTO boards (date_key) VALUES (?)`, [dateKey], function (err2) {
        if (err2) return reject(err2);
        resolve({ id: this.lastID, date_key: dateKey });
      });
    });
  });
}
