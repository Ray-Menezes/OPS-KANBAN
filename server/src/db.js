import sqlite3 from "sqlite3";

export const db = new sqlite3.Database("./data.sqlite");

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
        FOREIGN KEY(board_id) REFERENCES boards(id)
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
