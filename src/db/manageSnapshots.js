const sqlite3 = require('sqlite3').verbose();

const MAX_SNAPSHOTS = 30; // Define the maximum number of snapshots per SKU

function manageSnapshots(db, sku, callback) {
  // Retrieve all snapshots for the SKU ordered by timestamp descending
  db.all(`SELECT id FROM prices WHERE sku = ? ORDER BY timestamp DESC`, [sku], (err, rows) => {
    if (err) {
      console.error('Error querying the database', err);
      callback(err);
    } else if (rows.length > MAX_SNAPSHOTS) {
      // Determine the IDs of the snapshots to delete (those exceeding the limit)
      const idsToDelete = rows.slice(MAX_SNAPSHOTS).map(row => row.id);
      const placeholders = idsToDelete.map(() => '?').join(',');

      // Delete the oldest snapshots that exceed the limit
      db.run(`DELETE FROM prices WHERE id IN (${placeholders})`, idsToDelete, (deleteErr) => {
        if (deleteErr) {
          console.error('Error deleting old snapshots', deleteErr);
          callback(deleteErr);
        } else {
          callback(null);
        }
      });
    } else {
      callback(null); // No snapshots need to be deleted
    }
  });
}

module.exports = { manageSnapshots };
