const sqlite3 = require('sqlite3').verbose();

// Create a local database file. 
const db = new sqlite3.Database('./src/db/prices.db');

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
  // Create an index on the sku column
  db.run(`CREATE INDEX IF NOT EXISTS idx_sku ON prices(sku)`);
});

db.close();
