from flask import Flask
from flask_socketio import SocketIO
import time
import json
import math
from urllib import parse, request
from tf2utilities.main import TF2
import eventlet
from celery import Celery

#import config file
import config


tf2 = TF2(config.steamApiKey).schema

eventlet.monkey_patch(socket=True)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret'
socketio = SocketIO(app, async_mode='eventlet', logger=True, engineio_logger=True, message_queue='redis://' + config.redisURL)

celery = Celery(app.name, broker='redis://' + config.redisURL)
celery.conf.update(app.config)

item = {
    "success": True,
    "currency": None,
    "items": [{}],
    }

class Price():
    def __init__(self, buy, sell, name, sku):
        self.buy = buy
        self.sell = sell
        self.name = name
        self.sku = sku
    def get_json(self):
        price = {
            "buy": self.buy,
            "sell": self.sell,
            "currency": None,
            "name": self.name,
            "sku": self.sku,
            "source": 'bptf',
            "time": int((time.time()) * 1000)
        }
        return price
        

def getPrice(sku):
    #Convert to name from sku
    name = tf2.getNameFromSku(sku)
    #Get item listing data from bptf api
    url = f'https://backpack.tf/api/classifieds/listings/snapshot?token={config.bptfApiKey}&sku={parse.quote(name)}&appid=440'
    data = json.load(request.urlopen(url))
    listings = data['listings']
    #Initialise Listings stacks
    sellListings = []
    buyListings = []

    #Append only bot listings to the stacks
    for i in listings:
        if i['intent'] == 'sell' and 'userAgent' in i:
            sellListings.append(i)
        elif 'userAgent' in i:
            buyListings.append(i)
    
    #Reverse so best prices are at the tops of the stacks.
    sellListings.reverse()
    buyListings.reverse()
    def getBuy(first):
        #Initialise buy dict
        buy = {
            'keys': 0,
            'metal': 0    
        }
        #Check if listing is from the bot. If it is, look at next one
        if first['steamid'] == config.botSteamID:
            return getBuy(buyListings.pop())

        if len(buyListings) > 1:
            x = buyListings.pop()
            #Check if listing is from the bot. If it is, look at next one
            if x['steamid'] == config.botSteamID:
                x = buyListings.pop()

            #If both listings are for >=1 key
            if 'keys' in first['currencies'] and 'keys' in x['currencies']:
                if (first['currencies']['keys']) > (x['currencies']['keys']):
                    #Highest buy listing is too risky to match, try again with next listing...
                    return getBuy(x)
                elif (first['currencies']['keys']) == (x['currencies']['keys']):
                    #Match key price
                    buy['keys'] = first['currencies']['keys']

                    #If listing is for {x keys, 0 ref}, then 'currencies' won't have a 'metal' attribute, so if statements check if they exist
                    if 'metal' in first['currencies'] and 'metal' in x['currencies']:
                        if (first['currencies']['metal']*0.9) > (x['currencies']['metal']):
                            #Ref price is too much greater than the next highest listing, try again with next listing...
                            return getBuy(x)
                        else:
                            buy['metal'] = first['currencies']['metal']
                    elif 'metal' in first['currencies'] or 'metal' in x['currencies']:
                        #Highest buy listing is too risky to match, try again with next listing...
                        return getBuy(x)
                    else:
                        #Neither listing is selling for metal => buy['metal'] = 0
                        buy['metal'] = 0

                #This gets called due to out-of-date bp.tf key prices. E.g highest buy listing is 9 keys 82 ref, and next highest is 10 keys (even though second listing is acutally higher price.)
                #Here I just match the highest buy listing. Not very safe rn, needs improving.
                else:
                    buy['keys'] = first['currencies']['keys']
                    if 'metal' in first['currencies']:
                        buy['metal'] = first['currencies']['metal']
                    else:
                        buy['metal'] = 0
            
            #One listing is for a key, one isn't. Highest buy listing is too risky to match, try again with next listing...
            elif 'keys' in first['currencies'] or 'keys' in x['currencies']:
                return getBuy(x)

            #Deal with lower tier items (not buy for keys, only ref)
            else:
                if 'metal' in first['currencies'] and 'metal' in x['currencies']:
                    if (first['currencies']['metal']*0.9) > (x['currencies']['metal']):
                        #Ref price is too much greater than the next highest listing, try again with next listing...
                        return getBuy(x)
                    else:
                        buy['metal'] = first['currencies']['metal']
                else:
                    return None
        
        #Only 1 bot buy listing, match it.
        elif len(buyListings) == 1:
            x = buyListings.pop()
            if 'metal' in x['currencies']:
                buy['metal'] = x['currencies']['metal']
            if 'keys' in x['currencies']:
                buy['keys'] = x['currencies']['keys']
        else:
            return None
        return buy
    
    def getSell(first):
        #Initialise sell dict
        sell = {
            'keys': 0,
            'metal': 0    
        }
        #Check if listing is from the bot. If it is, look at next one
        if first['steamid'] == config.botSteamID:
            return getSell(sellListings.pop())

        if len(sellListings) > 1:
            x = sellListings.pop()
            #Check if listing is from the bot. If it is, look at next one
            if x['steamid'] == config.botSteamID:
                x = sellListings.pop()

            #If both listings are for >=1 key
            if 'keys' in first['currencies'] and 'keys' in x['currencies']:
                if (first['currencies']['keys']) < (x['currencies']['keys']):
                    #Cheapest sell listing is too risky to match, try again with next listing...
                    return getSell(x)
                elif (first['currencies']['keys']) == (x['currencies']['keys']):
                    #Match key price
                    sell['keys'] = first['currencies']['keys']
                    
                    #If listing is for {x keys, 0 ref}, then 'currencies' won't have a 'metal' attribute, so if statements check if they exist
                    if 'metal' in first['currencies'] and 'metal' in x['currencies']:
                        if (first['currencies']['metal']) > (x['currencies']['metal']*1.1):
                            #Ref price is too much lower than the next cheapest listing, try again with next listing...
                            return getSell(x)
                        else:
                            #Match listing price
                            sell['metal'] = first['currencies']['metal']
            
                    elif 'metal' in first['currencies'] or 'metal' in x['currencies']:
                        #Cheapest sell listing is too risky to match, try again with next listing...
                        return getSell(x)
                    else:
                        #Neither listing is selling for metal => sell['metal'] = 0
                        sell['metal'] = 0
                
                #This gets called due to out-of-date bp.tf key prices. E.g cheapest sell listing is 10 keys, and next cheapest is 9 keys 82 ref (even though second listing is acutally cheaper.)
                else:
                    sell['keys'] = first['currencies']['keys']
                    if 'metal' in first['currencies']:
                        sell['metal'] = first['currencies']['metal']
                    else:
                        sell['metal'] = 0

            #One listing is for a key, one isn't. Cheapest sell listing is too risky to match, try again with next listing...
            elif 'keys' in first['currencies'] or 'keys' in x['currencies']:
                return getSell(x)

            #Deal with lower tier items (not buy for keys, only ref)
            else:
                if 'metal' in first['currencies'] and 'metal' in x['currencies']:
                    if (first['currencies']['metal']) > (x['currencies']['metal']*1.1):
                        #Cheapest sell listing is too risky to match, try again with next listing...
                        return getSell(x)
                    else:
                        sell['metal'] = first['currencies']['metal']
                else:
                    return None
            return sell
        
        #Only 1 bot buy listing, match it.
        elif len(sellListings) == 1:
            x = sellListings.pop()
            if 'metal' in x['currencies']:
                sell['metal'] = x['currencies']['metal']
            if 'keys' in x['currencies']:
                sell['keys'] = x['currencies']['keys']
        else:
            return None

    #Call pricing functions with listings at the top of the stacks
    buy = getBuy(buyListings.pop())
    sell = getSell(sellListings.pop())

    #If there are no bot sell listings, then just sell for 1.2x the buy price. If there are no buy listings, bot won't price it
    if sell == None:
        key = math.ceil(buy['keys'] * 1.2)
        sell = {
            "keys": key,
            "metal": 0
        }

    sell['metal'] = math.floor(sell['metal']*100)/100
    buy['metal'] = math.floor(buy['metal']*100)/100


    #Buying for more than selling, get a cheaper buy price (sell price has priority)
    while buy['keys'] > sell['keys']:
        buy = getBuy(buyListings.pop())
    if buy['keys'] == sell['keys']:
        while buy['metal'] >= sell['metal']:
            buy = getBuy(buyListings.pop())
            
    #This was a solution to previous error. Leaving in for now just in case.
    if sell == {'keys': 0,'metal': 0}:
        print('ERROR GETTING PRICE FOR SKU: ' + sku)
        return None
    
    price = (Price(buy, sell, name, sku)).get_json()
    return price

@socketio.on('connect')
def connect():
    print('Client Connected')
    background_task('redis://localhost:6379')

@celery.task()
def background_task(url):
    print('called')
    local_socketio = SocketIO(app, logger=True, engineio_logger=True, message_queue=url)
    while True:
        f = json.load(open(config.pathToPricelist + '/pricelist.json', 'r'))
        for i in f:
            price = getPrice(i)
            local_socketio.emit('price', price)
            local_socketio.sleep(3)
        local_socketio.sleep(1800)

@socketio.on('disconnect')
def disconnect():
    print('Client disconnected')

@socketio.on('message')
def handle_message(data):
    print('Received: ' + data)

@app.route('/items/', methods=['GET'])
def items():
    return json.dumps(item)

@app.route('/items/<string:sku>', methods=['GET', 'POST'])
def itemprices(sku):
    price = getPrice(sku)
    print('Price requested for ' + tf2.getNameFromSku(sku) + ', returned ' + str(price))
    return json.dumps(price)


if __name__ == '__main__':
    socketio.run(app, debug=True)