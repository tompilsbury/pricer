# Custom pricer for tf2autobot
***USE AT OWN RISK OF ITEMS***
This pricer has not been updated in a long time. I am not responsible for any loss of items that may occur from using it.

This is a pricer written in Python that uses Flask and Flask-socketio.

## How it works
The pricer loops through your pricelist.json file in your TF2Autobot directory every 30 minutes. For each item, it looks at the three best buy and sell listings from bots, and tries to match the best one based on the differences in price. This is to try and keep prices highly competitive, while minimising risk.

## Requirements/Setup
1. Navigate to pricer folder and install requirements by running `pip install -r requirements.txt`
2. Fill out config_template.py and save it as config.py
3. Enter url of pricer in ecosystems.json file of your TF2Autobot


## How To Start 
Start up pricer.py by running `python pricer.py`


