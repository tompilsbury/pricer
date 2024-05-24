# Custom pricer for tf2autobot
***USE AT OWN RISK OF ITEMS***
This pricer has not been updated in a long time. I am not responsible for any loss of items that may occur from using it.

## How it works
The pricer loops through your pricelist.json file in your TF2Autobot directory every 30 minutes. For each item, it looks at the three best buy and sell listings from bots, and tries to match the best one based on the differences in price. This is to try and keep prices highly competitive, while minimising risk.

## Requirements/Setup
1. Navigate to pricer folder and install dependencies by running `npm install`.
2. Navigate into the /config folder and fill out the config_template.json file. Save it as config.json.
3. Enter url of pricer in ecosystems.json file of your TF2Autobot.


## How To Start 
Start the pricer server by running `node src/server.js`.
Alternatively, you can use pm2: `pm2 start src/server.js`.

