const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./prices.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT,
    buy_keys REAL,
    buy_metal REAL,
    sell_keys REAL,
    sell_metal REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

db.close();
