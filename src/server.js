const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { getPrice } = require('./getPrice');
const schedule = require('node-schedule');
const fs = require('fs/promises');


const config = require('../config/config.json');
const app = express();

const server = http.createServer(app)

const io = socketIo(server);

app.get('/items', (req, res) => {
    res.send({ message: 'Hello from the API' });
});

app.get('/items/:sku', async (req, res) => {
    const sku = req.params.sku;
    console.log(sku);
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


// Background task
// async function backgroundTask() {
//     try {
//         const data = await fs.readFile(`${config.pathToPricelist}/pricelist.json`, 'utf8');
//         const items = JSON.parse(data);
//         for (sku in items) {
//             try {
//                 console.log(`GETTING PRICE FOR ${sku}`)
//                 // const price = await getPrice("205;11;kt-2"); // Strange Spec KS Rocket Launcher
//                 //const price = await getPrice(sku)
//                 const price = await getPrice(sku)
//                 io.emit('price', price);
//                 if (price && price.buy && price.sell) {
//                     console.log(`Emitted {price: buy: {keys: ${price.buy.keys}, metal: ${price.buy.metal}}, sell: {keys: ${price.sell.keys}, metal: ${price.sell.metal}}} for item ${price.sku}`);
//             } else {
//                 console.error('Error: Price object or its properties are undefined.');
//             }          
//             await new Promise(resolve => setTimeout(resolve, 3000)); // sleep for 3 seconds
//             } catch (error) {
//             //console.error(`ERROR GETTING PRICE FOR ${item}`);
//             console.error(error);
//             }
//         }
//     } catch (error) {
//       console.error('Error reading pricelist file');
//       console.error(error);
//     }
// }


async function backgroundTask() {
    try {
        const data = await fs.readFile(`${config.pathToPricelist}/pricelist.json`, 'utf8');
        const items = JSON.parse(data);
        const queue = Object.keys(items); // Create a queue of item keys (SKUs)

        // Function to process queue with delay
        const processQueue = async () => {
            while (queue.length > 0) {
                const sku = queue.shift(); // Dequeue an item from the queue
                try {
                    console.log(`GETTING PRICE FOR ${sku}`);
                    const price = await getPrice(sku);
                    io.emit('price', price);
                    if (price && price.buy && price.sell) {
                        console.log(`Emitted {price: buy: {keys: ${price.buy.keys}, metal: ${price.buy.metal}}, sell: {keys: ${price.sell.keys}, metal: ${price.sell.metal}}} for item ${price.sku}`);
                    } else {
                        console.error('Error: Price object or its properties are undefined.');
                    }
                } catch (error) {
                    console.error(error);
                }
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 2 second before processing next item
            }
        };

        await processQueue(); // Start processing the queue
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