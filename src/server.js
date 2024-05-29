const express = require('express');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const socketIo = require('socket.io');
const { getPrice } = require('./getPrice');
const schedule = require('node-schedule');
const fs = require('fs/promises');
const { Worker } = require('worker_threads');


const config = require('../config/config.json');
const app = express();

const server = http.createServer(app)

const io = socketIo(server, {
    pingInterval: 10000, // How often the server sends a ping packet to the client (in milliseconds)
    pingTimeout: 60000, // How long the server waits for a pong packet from the client (in milliseconds)
  });

app.get('/items', (req, res) => {
    res.send({ message: 'Hello from the API' });
});

app.route('/items/:sku')
.get(async (req, res) => {
    const sku = req.params.sku;
    console.log('GET request for SKU:', sku);
    try {
      const price = await getPrice(sku);
      res.send(price);
    } catch (error) {
      console.error('Error getting price:', error);
      res.status(500).send('Internal Server Error');
    }
})
.post(async (req, res) => {
    const sku = req.params.sku;
    console.log('POST request for SKU:', sku);
    console.log('Request body:', req.body); // You can process the body data if needed
    try {
      const price = await getPrice(sku);
      res.send(price);
    } catch (error) {
      console.error('Error getting price:', error);
      res.status(500).send('Internal Server Error');
    }
});

app.get('/price-history/:sku', (req, res) => {
  const sku = req.params.sku;
  const db = new sqlite3.Database('./prices.db');
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
    console.log('A client connected');

    socket.on('message', (data) => {
        console.log(`Received: ${data}`)
    })

    socket.on('disconnect', () => {
        console.log('A client disconnected');
    })
})

  
async function backgroundTask() {
  try {
    const data = await fs.readFile(`${config.pathToPricelist}/pricelist.json`, 'utf8');
    const items = JSON.parse(data);
    const queue = Object.keys(items);

    const db = new sqlite3.Database('./prices.db');

    const processQueue = async () => {
      while (queue.length > 0) {
        const sku = queue.shift();
        try {
          console.log(`GETTING PRICE FOR ${sku}`);
          const price = await getPrice(sku);
          io.emit('price', price);
          if (price && price.buy && price.sell) {
            console.log(`Emitted {price: buy: {keys: ${price.buy.keys}, metal: ${price.buy.metal}}, sell: {keys: ${price.sell.keys}, metal: ${price.sell.metal}}} for item ${price.sku}`);

            db.run(`INSERT INTO prices (sku, buy_keys, buy_metal, sell_keys, sell_metal) VALUES (?, ?, ?, ?, ?)`, 
              [sku, price.buy.keys, price.buy.metal, price.sell.keys, price.sell.metal], 
              (err) => {
                if (err) {
                  console.error('Error inserting data into the database', err);
                } else {
                  console.log(`Inserted price for ${sku} in the database`);
                }
              }
            );
          } else {
            console.error('Error: Price object or its properties are undefined.');
          }
        } catch (error) {
          console.error(error);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };

    await processQueue();
  } catch (error) {
    console.error('Error reading pricelist file');
    console.error(error);
  }
}
  
backgroundTask();
schedule.scheduleJob('*/30 * * * *', backgroundTask);


const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'
server.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});