from flask import Flask
from flask_socketio import SocketIO
from flask_apscheduler import APScheduler
import time
import json
import math
from urllib import parse, request
from tf2utilities.main import TF2
import eventlet
import traceback


#import config file
import config


tf2 = TF2(config.steamApiKey).schema

eventlet.monkey_patch(socket=True)


app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret'
socketio = SocketIO(app, async_mode='eventlet', logger=True, engineio_logger=True, message_queue='redis://' + config.redisURL)

item = {
    "success": True,
    "currency": None,
    "items": [],
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
    def get_dbObject(self):
        obj = {
            self.sku: {
                "buy": self.buy,
                "sell": self.sell,
                "name": self.name,
            }
        }
        return obj
        

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
            if i['steamid'] == config.botSteamID:
                continue
            elif 'usd' in i['currencies']:
                continue
            else:
                sellListings.append(i)
        elif 'userAgent' in i:
            if i['steamid'] == config.botSteamID:
                continue
            elif 'usd' in i['currencies']:
                continue
            else:
                buyListings.append(i)
    
    #Reverse so best prices are at the tops of the stacks.
    sellListings.reverse()
    buyListings.reverse()
    def getBuy(first, x):
        #Initialise buy dict
        buy = {
            'keys': 0,
            'metal': 0    
        }
        #Check if listing is from the bot. If it is, look at next one

        if len(buyListings) > 1:
            y = buyListings.pop()

            #If both listings are for >=1 key
            if 'keys' in first['currencies'] and 'keys' in x['currencies'] and 'keys' in y['currencies']:
                if (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    buy['keys'] = first['currencies']['keys']

                    #Handle ref price
                    if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            buy['metal'] = first['currencies']['metal']
                        elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                            buy['metal'] = y['currencies']['metal']
                        elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            return getBuy(x,y)
                        elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                            return getBuy(x,y)
                    else:
                        buy['metal'] = 0
                
                elif (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) > (y['currencies']['keys']):
                    if 'metal' in y['currencies']:
                        buy['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        buy['keys'] = y['currencies']['keys']
                
                elif (first['currencies']['keys']) > (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    return getBuy(x,y)

                elif (first['currencies']['keys']) > (x['currencies']['keys']) and (x['currencies']['keys']) > (y['currencies']['keys']):
                    return getBuy(x,y)
                
                else:
                    if 'metal' in y['currencies']:
                        buy['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        buy['keys'] = y['currencies']['keys']
            
            elif 'keys' in first['currencies'] and 'keys' in x['currencies']:
                buy['keys'] = 0
                buy['metal'] = y['currencies']['metal']
            elif 'keys' in first['currencies']:
                return getBuy(x,y)
            else:
                if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                    if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        buy['metal'] = first['currencies']['metal']
                    elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                        buy['metal'] = y['currencies']['metal']
                    elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        return getBuy(x,y)
                    elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                        return getBuy(x,y)
                else:
                    buy['metal'] = 0

        #len(buyListings) < 1
        else:
            if 'metal' in first['currencies']:
                buy['metal'] = first['currencies']['metal']
            if 'keys' in first['currencies']:
                buy['keys'] = first['currencies']['keys']
        return buy
            
    def getSell(first,x):
        #Initialise sell dict
        sell = {
            'keys': 0,
            'metal': 0    
        }
        #Check if listing is from the bot. If it is, look at next one

        if len(sellListings) > 1:
            y = sellListings.pop()

            #If both listings are for >=1 key
            if 'keys' in first['currencies'] and 'keys' in x['currencies'] and 'keys' in y['currencies']:
                if (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    sell['keys'] = first['currencies']['keys']

                    #Handle ref price
                    if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            sell['metal'] = first['currencies']['metal']
                        elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                            sell['metal'] = y['currencies']['metal']
                        elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            return getSell(x,y)
                        elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                            return getSell(x,y)
                    else:
                        sell['metal'] = 0
                
                elif (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) < (y['currencies']['keys']):
                    if 'metal' in y['currencies']:
                        sell['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        sell['keys'] = y['currencies']['keys']
                
                elif (first['currencies']['keys']) < (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    return getSell(x,y)

                elif (first['currencies']['keys']) < (x['currencies']['keys']) and (x['currencies']['keys']) < (y['currencies']['keys']):
                    return getSell(x,y)
                
                else:
                    if 'metal' in y['currencies']:
                        sell['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        sell['keys'] = y['currencies']['keys']
            
            elif 'keys' in x['currencies'] and 'keys' in y['currencies']:
                if x['currencies']['keys'] < y['currencies']['keys']:
                    return getSell(x,y)
                else:
                    sell['keys'] = x['currencies']['keys']
                    if 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if x['currencies']['metal'] > y['currencies']['metal']*1.05:
                            return getSell(x,y)
                        else:
                            sell['metal'] = x['currencies']['metal']
                    else:
                        return getSell(x,y)
            elif 'keys' in y['currencies']:
                return getSell(x,y)
            else:
                #Handle ref price
                if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                    if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        sell['metal'] = first['currencies']['metal']
                    elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                        sell['metal'] = y['currencies']['metal']
                    elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        return getSell(x,y)
                    elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                        return getSell(y, sellListings.pop())
                else:
                    sell['metal'] = 0

        #len(sellListings) < 1
        else:
            print('HERE')
            if 'metal' in first['currencies']:
                sell['metal'] = first['currencies']['metal']
            if 'keys' in first['currencies']:
                sell['keys'] = first['currencies']['keys']
        return sell

    #Call pricing functions with listings at the top of the stacks
    if len(buyListings) >= 3:
        firstBuy = buyListings.pop()
        buy = getBuy(firstBuy, buyListings.pop())
    elif len(buyListings) == 2:
        buy = {
            'keys': 0,
            'metal': 0    
        }
        x = buyListings.pop()
        y = buyListings.pop()
        if 'keys' in x['currencies'] and 'keys' in y['currencies']:
            buy['keys'] = x['currencies']['keys']
        else:
            buy['keys'] = 0
            
        if 'metal' in x['currencies']: 
            buy['metal'] = x['currencies']['metal']
        else:
            #Neither listing is selling for metal => buy['metal'] = 0
            buy['metal'] = 0
    elif len(buyListings) == 1:
        buy = {
            'keys': 0,
            'metal': 0    
        }
        x = buyListings.pop()
        if 'keys' in x['currencies']:
            buy['keys'] = x['currencies']['keys']
        if 'metal' in x['currencies']:
            buy['metal'] = x['currencies']['metal']
    else:
        print("ERROR GETTING PRICE FOR " + sku)
        return

    if len(sellListings) >= 3:
        firstSell = sellListings.pop()
        sell = getSell(firstSell, sellListings.pop())
    elif len(sellListings) == 2:
        sell = {
            'keys': 0,
            'metal': 0    
        }
        x = sellListings.pop()
        if 'keys' in x['currencies']:
            sell['keys'] = x['currencies']['keys']
        else:
            sell['keys'] = 0
            
        if 'metal' in x['currencies']: 
            sell['metal'] = x['currencies']['metal']
        else:
            #Neither listing is selling for metal => buy['metal'] = 0
            sell['metal'] = 0
    elif len(buyListings) == 1:
        sell = {
            'keys': 0,
            'metal': 0    
        }
        x = sellListings.pop()
        if 'keys' in x['currencies']:
            sell['keys'] = x['currencies']['keys']
        if 'metal' in x['currencies']:
            sell['metal'] = x['currencies']['metal']
    else:
        #If there are no bot sell listings, then just sell for 1.2x the buy price. If there are no buy listings, bot won't price it
        key = math.ceil(buy['keys'] * 1.2)
        sell = {
            "keys": key,
            "metal": 0
        }

    sell['metal'] = math.floor(sell['metal']*100)/100
    buy['metal'] = math.floor(buy['metal']*100)/100


    #Buying for more than selling, get a cheaper buy price (sell price has priority)
    while buy['keys'] > sell['keys']:
        buy = getBuy(buyListings.pop(), buyListings.pop())
    if buy['keys'] == sell['keys']:
        while buy['metal'] >= sell['metal']:
            buy = getBuy(buyListings.pop(), buyListings.pop())
            
    #This was a solution to previous error. Leaving in for now just in case.
    if sell == {'keys': 0,'metal': 0}:
        print('ERROR GETTING PRICE FOR SKU: ' + sku)
        return None
    
    x = Price(buy, sell, name, sku)
    price = (x).get_json()
    return price

def background_task(url):
    print('called')
    local_socketio = SocketIO(app, logger=True, engineio_logger=True, message_queue=url)
    f = json.load(open(config.pathToPricelist + '/pricelist.json', 'r'))
    for i in f:
        try:
            price = getPrice(i)
            local_socketio.emit('price', price)
            local_socketio.sleep(3)
        except:
            print("ERROR GETTING PRICE FOR "+ str(i))
            traceback.print_exc()
        

    
#schedule.every(60).seconds.do(background_task)


@socketio.on('connect')
def connect():
    print('Client Connected')


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
    scheduler = APScheduler()
    scheduler.add_job(func=background_task, args=['redis://localhost:6379'], trigger='interval', id='job', minutes=30)
    scheduler.start()
    socketio.run(app, debug=True)