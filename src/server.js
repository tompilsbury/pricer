const express = require('express');
const http = require('http');
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

io.on('connection', (socket) => {
    console.log('A client connected');

    socket.on('message', (data) => {
        console.log(`Received: ${data}`)
    })

    socket.on('disconnect', () => {
        console.log('A client disconnected');
    })
})



function processItemInWorker(sku) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./src/getPriceWorker.js', { workerData: sku });
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    });
  }
  
  async function backgroundTask() {
    try {
      const data = await fs.readFile(`${config.pathToPricelist}/pricelist.json`, 'utf8');
      const items = JSON.parse(data);
      const queue = Object.keys(items);
  
      const processQueue = async () => {
        while (queue.length > 0) {
          const sku = queue.shift();
          try {
            console.log(`GETTING PRICE FOR ${sku}`);
            const price = await processItemInWorker(sku);
            io.emit('price', price);
            if (price && price.buy && price.sell) {
              console.log(`Emitted {price: buy: {keys: ${price.buy.keys}, metal: ${price.buy.metal}}, sell: {keys: ${price.sell.keys}, metal: ${price.sell.metal}}} for item ${price.sku}`);
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