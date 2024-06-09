const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const socketIo = require('socket.io');
const schedule = require('node-schedule');
const fs = require('fs/promises');
// const winston = require('winston')

const { getPrice } = require('./getPrice');
const { manageSnapshots } = require('./db/manageSnapshots');
const logger = require('./logger')


const config = require('../config/config.json');
const app = express();

const server = http.createServer(app)

const io = socketIo(server, {
  pingInterval: 10000, // How often the server sends a ping packet to the client (in milliseconds)
  pingTimeout: 60000, // How long the server waits for a pong packet from the client (in milliseconds)
});

// Configure winston logger
// const logger = winston.createLogger({
//   level: 'info',
//   format: winston.format.combine(
//     winston.format.timestamp(),
//     winston.format.printf(({ timestamp, level, message }) => {
//       return `${timestamp} [${level}]: ${message}`;
//     })
//   ),
//   transports: [
//     new winston.transports.Console(),
//     new winston.transports.File({ filename: 'combined.log' })
//   ]
// })

// if (process.env.NODE_ENV !== 'production') {
//   logger.add(new winston.transports.Console({
//     format: winston.format.simple()
//   }));
// }



app.get('/items', (req, res) => {
    res.send({ message: 'Hello from the API' });
});

app.route('/items/:sku')
.get(async (req, res) => {
    const sku = req.params.sku;
    logger.debug('GET request for SKU:', sku);
    try {
      const price = await getPrice(sku);
      res.send(price);
    } catch (error) {
      logger.error('Error getting price:', error);
      res.status(500).send('Internal Server Error');
    }
})
.post(async (req, res) => {
    const sku = req.params.sku;
    logger.debug('POST request for SKU:', sku);
    try {
      const price = await getPrice(sku);
      res.send(price);
    } catch (error) {
      logger.error('Error getting price:', error);
      res.status(500).send('Internal Server Error');
    }
});

app.get('/price-history/:sku', (req, res) => {
  const sku = req.params.sku;
  const db = new sqlite3.Database('./src/db/prices.db');
  db.all(`SELECT * FROM prices WHERE sku = ? ORDER BY timestamp`, [sku], (err, rows) => {
    if (err) {
      res.status(500).send('Error querying the database');
    } else {
      res.json(rows);
    }
    db.close();
  });
});

io.on('connection', (socket) => {
    logger.info('A client connected');

    socket.on('message', (data) => {
        logger.info(`Received: ${data}`)
    })

    socket.on('disconnect', () => {
        logger.info('A client disconnected');
    })
})

const arePricesEqual = async (price1, price2) => {
  return (
    price1.keys === price2.keys &&
    price1.metal === price2.metal
  );
};

  
async function backgroundTask() {
  try {
    const data = await fs.readFile(`${config.pathToPricelist}/pricelist.json`, 'utf8');
    const items = JSON.parse(data);
    const queue = Object.keys(items);

    const db = new sqlite3.Database('./src/db/prices.db');

    const processQueue = async () => {
      while (queue.length > 0) {
        const sku = queue.shift();
        const originalPrice = {buy: items[sku]?.buy, sell: items[sku]?.sell}
        try {
          logger.debug(`GETTING PRICE FOR ${sku}`);
          const price = await getPrice(sku);
          if (price && price.buy && price.sell) {
            logger.info(`Emitted {price: buy: {keys: ${price.buy.keys}, metal: ${price.buy.metal}}, sell: {keys: ${price.sell.keys}, metal: ${price.sell.metal}}} for item ${price.sku}`);

            // Insert the new price snapshot
            db.run(`INSERT INTO prices (sku, buy_keys, buy_metal, sell_keys, sell_metal) VALUES (?, ?, ?, ?, ?)`, 
              [sku, price.buy.keys, price.buy.metal, price.sell.keys, price.sell.metal], 
              (err) => {
                if (err) {
                  logger.error('Error inserting data into the database', err);
                } else {
                  logger.info(`Inserted price for ${sku} in the database`);

                  // Manage snapshots to ensure we do not exceed the maximum allowed
                  manageSnapshots(db, sku, (manageErr) => {
                    if (manageErr) {
                      logger.error('Error managing snapshots', manageErr);
                    } else {
                      logger.info(`Managed snapshots for ${sku}`);
                    }
                  });
                }
              }
            );

            if (!await arePricesEqual(price.buy, originalPrice.buy) || !await arePricesEqual(price.sell, originalPrice.sell)) {
              // New price differs from old price, emit the new price.
              io.emit('price', price);
            } else {
              // New price is the same as the old price, don't emit.
              logger.debug(`No change in price for ${sku}, skipping...`)
            }
          } else {
            logger.error('Error: Price object or its properties are undefined.');
          }
        } catch (error) {
          logger.error(error);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };

    await processQueue();
    db.close();
  } catch (error) {
    logger.error('Error reading pricelist file');
    logger.error(error);
  }
}
  
backgroundTask();
schedule.scheduleJob('*/30 * * * *', backgroundTask);


const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'
server.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});