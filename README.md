# Custom pricer for tf2autobot
*** USE AT OWN RISK OF ITEMS ***

This is a pricer written in Python that uses Flask, Flask-socketio, Redis and Celery.

## Requirements/Setup
1. Install Redis on local machine
2. Navigate to pricer folder and install requirements by running `pip install -r requirements.txt`
3. Enter url of pricer in ecosystems.json file of autobot

## How To Start 
1. Start Redis server by entering `redis-server` in terminal
2. Start up pricer.py by running `python3 pricer.py`


