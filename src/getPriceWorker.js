const { parentPort, workerData } = require('worker_threads');
const { getPrice } = require('./getPrice');

(async () => {
  try {
    const price = await getPrice(workerData);
    parentPort.postMessage(price);
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
})();
