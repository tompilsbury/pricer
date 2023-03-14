from eventlet import hubs, monkey_patch
monkey_patch()
hubs.use_hub('poll')
from flask import Flask
from flask_socketio import SocketIO
from flask_apscheduler import APScheduler
import time
import json
from tf2utilities.main import TF2
import traceback
from requests import get

from pricestf import getPricesTFPrice

#import config file
import config

tf2 = TF2(config.steamApiKey).schema

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret'
socketio = SocketIO(app, async_mode='eventlet', logger=True, engineio_logger=True, message_queue='redis://' + config.redisURL)


item = {
    "success": True,
    "currency": None,
    "items": [],
    }

#Config for bptf api requests
url = 'https://backpack.tf/api/classifieds/listings/snapshot'
params = {
    "token": config.bptfApiKey,
    "appid": 440
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
    if sku == '5021;6':
        keyPrice = getPricesTFPrice(sku)
        buy = keyPrice['buy']
        sell = keyPrice['sell']
        x = Price(buy, sell, name, sku)
        price = (x).get_json()

        return price

    #Make GET request to bptf listings snapshot api
    params['sku'] = name
    response = get(url, params=params)
    listings = response.json()['listings']

    #Initialise stacks of buy and sell listings
    #Do not append own bots listings or listings for USD
    sellListings = [i for i in listings if i['intent'] == 'sell' and 'userAgent' in i and i['steamid'] != config.botSteamID and 'usd' not in i['currencies']]
    buyListings = [i for i in listings if i['intent'] == 'buy' and 'userAgent' in i and i['steamid'] != config.botSteamID and 'usd' not in i['currencies']]
    
    #Reverse so best prices are at the tops of the stacks.
    sellListings.reverse()
    buyListings.reverse()

    def getBuy(first, x):
        #Initialise buy dict
        buy = {
            'keys': 0,
            'metal': 0    
        }

        if len(buyListings) > 1:
            y = buyListings.pop()

            '''
            IN THIS FUNCTION YOU HAVE 3 LISTINGS: first, x and y.
            first = most expensive buy listing.
            x = second most expensive buy listing.
            y = third most expensive buy listing
            I also refer to these as 1st, 2nd and 3rd respectively in other comments.

            The function looks at all of these to make the price relatively safe, while also being accurate.
            '''

            #If both listings are for >=1 key
            if 'keys' in first['currencies'] and 'keys' in x['currencies'] and 'keys' in y['currencies']:
                if (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    #All listings are for same amount of keys -> match key price
                    buy['keys'] = first['currencies']['keys']

                    #Handle ref price
                    if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            #All three listings are for same amount of ref -> match metal price
                            buy['metal'] = first['currencies']['metal']
                        elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                            if round( (x['currencies']['metal'] - y['currencies']['metal']), 2) > 0.11:
                                #1st and 2nd best buy listings are >3rd + 1 scrap. Therefore best listings are too risky to match, match 3rd.
                                buy['metal'] = y['currencies']['metal']
                            else:                             
                                #3rd listing has been overcut by 1 scrap -> match the overcut.
                                buy['metal'] = x['currencies']['metal']
                        elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            if round( (first['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                                #Best listing is > 2nd + 1scrap. Recall function
                                return getBuy(x,y)
                            else:
                                #2nd and 3rd listings have been overcut by 1 scrap -> match the overcut
                                buy['metal'] = first['currencies']['metal']
                        elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                            if round( (first['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                                #1st listing > 2nd listing + 1 scrap. Recall function
                                return getBuy(x,y)
                            elif round( (x['currencies']['metal'] - y['currencies']['metal']), 2) > 0.11:
                                #2nd listing > 3rd listing + 1 scrap. Recall function
                                return getBuy(x,y)
                            else:
                                #Could match first['currencies']['metal'], but match x for safety
                                buy['metal'] = x['currencies']['metal']

                    #This statement realistically should be impossible to satisfy. Leave in just in case (pricer is working well rn.)
                    elif 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if x['currencies']['metal'] - y['currencies']['metal'] > 0.11:
                            return getBuy(x,y)
                        else:
                            buy['metal'] = x['currencies']['metal']

                    #None of the listings are for any metal (and for same amount of keys). E.g 1st=23keys, 2nd=23keys, 3rd=23keys. -> buy['metal'] = 0
                    else:
                        buy['metal'] = 0
                
                elif (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) > (y['currencies']['keys']):
                    #1st and 2nd are for more keys than 3rd. Match 3rd price to be safe.
                    if 'metal' in y['currencies']:
                        buy['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        buy['keys'] = y['currencies']['keys']
                
                elif (first['currencies']['keys']) > (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    #Risky to match first. Recall function.
                    return getBuy(x,y)

                elif (first['currencies']['keys']) > (x['currencies']['keys']) and (x['currencies']['keys']) > (y['currencies']['keys']):
                    #Risky to match any of these. Recall function.
                    return getBuy(x,y)
                
                #Will this statement ever be called? We will never know...
                else:
                    if 'metal' in y['currencies']:
                        buy['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        buy['keys'] = y['currencies']['keys']
            
            elif 'keys' in first['currencies'] and 'keys' in x['currencies']:
                #1st and 2nd are for >1key, 3rd is not. Match 3rd price.
                buy['keys'] = 0
                buy['metal'] = y['currencies']['metal']
            elif 'keys' in first['currencies']:
                #1st is for >1key, other two are not. Recall function.
                return getBuy(x,y)
            else:
                #
                if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                    if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        #All three listings are for same amount of ref -> match metal price
                        buy['metal'] = first['currencies']['metal']
                    elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                        if round( (x['currencies']['metal'] - y['currencies']['metal']), 2) > 0.11:
                            #1st and 2nd best buy listings are >3rd + 1 scrap. Therefore best listings are too risky to match, match 3rd.
                            buy['metal'] = y['currencies']['metal']
                        else:                             
                            #3rd listing has been overcut by 1 scrap -> match the overcut.
                            buy['metal'] = x['currencies']['metal']
                    elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        if round( (first['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                            #Best listing is > 2nd + 1scrap. Recall function
                            return getBuy(x,y)
                        else:
                            #2nd and 3rd listings have been overcut by 1 scrap -> match the overcut
                            buy['metal'] = first['currencies']['metal']
                    elif (first['currencies']['metal']) > (x['currencies']['metal']) and (x['currencies']['metal']) > (y['currencies']['metal']):
                        if round( (first['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                            #1st listings > 2nd listing + 1 scrap. Recall function
                            return getBuy(x,y)
                        elif round( (x['currencies']['metal'] - y['currencies']['metal']), 2) > 0.11:
                            #2nd listings > 3rd listing + 1 scrap. Recall function
                            return getBuy(x,y)
                        else:
                            #Could match first['currencies']['metal'], but match x for safety
                            buy['metal'] = x['currencies']['metal']
                else:
                    buy['metal'] = 0

        #len(buyListings) <= 1 
        else:
            if 'metal' in first['currencies']:
                buy['metal'] = first['currencies']['metal']
            if 'keys' in first['currencies']:
                buy['keys'] = first['currencies']['keys']
            y = None
        return buy, x, y
            
    def getSell(first,x):
        #Initialise sell dict
        sell = {
            'keys': 0,
            'metal': 0    
        }

        if len(sellListings) > 1:
            y = sellListings.pop()

            '''
            IN THIS FUNCTION YOU HAVE 3 LISTINGS: first, x and y.
            first = cheapest sell listing.
            x = second cheapest sell listing.
            y = third cheapest sell listing
            I also refer to these as 1st, 2nd and 3rd respectively in other comments.

            The function looks at all of these to make the price relatively safe, while also being accurate.
            '''

            #If both listings are for >=1 key
            if 'keys' in first['currencies'] and 'keys' in x['currencies'] and 'keys' in y['currencies']:
                if (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    #All listings are for same amount of keys -> match key price
                    sell['keys'] = first['currencies']['keys']

                    #Handle ref price
                    if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            #All three listings are for same amount of ref -> match metal price
                            sell['metal'] = first['currencies']['metal']
                        elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                            if round( (y['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                                #1st and 2nd best sell listings are <3rd - 1 scrap. Therefore best listings are too risky to match, match 3rd.
                                sell['metal'] = y['currencies']['metal']
                            else:   
                                #3rd listing has been undercut by 1 scrap -> match the undercut.                          
                                sell['metal'] = x['currencies']['metal']
                        elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                            if round( (x['currencies']['metal'] - first['currencies']['metal']), 2) > 0.11:
                               #Best listing is < 2nd - 1scrap. Recall function
                               return getSell(x,y)
                            else:
                                #2nd and 3rd listings have been undercut by 1 scrap -> match the undercut
                                sell['metal'] = first['currencies']['metal']
                        elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                            if round( (x['currencies']['metal'] - first['currencies']['metal']), 2) > 0.11:
                                #1st listing < 2nd listing - 1 scrap. Recall function
                                return getSell(x,y)
                            elif round( (y['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                                #2nd listing < 3rd listing - 1 scrap. Recall function
                                return getSell(x,y)
                            else:
                                #Could match first['currencies']['metal'], but match x for safety
                                sell['metal'] = x['currencies']['metal']

                    #This statement realistically should be impossible to satisfy. Leave in just in case (pricer is working well rn.)
                    elif 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if y['currencies']['metal'] - x['currencies']['metal'] > 0.11:
                            return getSell(x,y)
                        else:
                            sell['metal'] = x['currencies']['metal']

                    #None of the listings are for any metal (and are for the same amount of keys). E.g 1st=23keys, 2nd=23keys, 3rd=23keys. -> sell['metal'] = 0
                    else:
                        sell['metal'] = 0
                
                elif (first['currencies']['keys']) == (x['currencies']['keys']) and (x['currencies']['keys']) < (y['currencies']['keys']):
                    #1st and 2nd are for less keys than 3rd. Match 3rd price to be safe.
                    if 'metal' in y['currencies']:
                        sell['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        sell['keys'] = y['currencies']['keys']
                
                elif (first['currencies']['keys']) < (x['currencies']['keys']) and (x['currencies']['keys']) == (y['currencies']['keys']):
                    #Risky to match first. Recall function.
                    return getSell(x,y)

                elif (first['currencies']['keys']) < (x['currencies']['keys']) and (x['currencies']['keys']) < (y['currencies']['keys']):
                    #Risky to match any of these. Recall function.
                    return getSell(x,y)
                
                #Will this statement ever be called? We will never know...
                else:
                    if 'metal' in y['currencies']:
                        sell['metal'] = y['currencies']['metal']
                    if 'keys' in y['currencies']:
                        sell['keys'] = y['currencies']['keys']
            
            elif 'keys' in x['currencies'] and 'keys' in y['currencies']:
                #1st is for <1key but other two aren't (so don't match first).
                if x['currencies']['keys'] < y['currencies']['keys']:
                    #Too risky to match any. Recall function
                    return getSell(x,y)
                else:
                    #2nd and 3rd are for same amount of keys. Match key price and check metal
                    sell['keys'] = x['currencies']['keys']
                    if 'metal' in x['currencies'] and 'metal' in y['currencies']:
                        if y['currencies']['metal'] - x['currencies']['metal'] > 0.11:
                            #3rd listing is for more than x + 0.11. Recall function.
                            return getSell(x,y)
                        else:
                            #2nd listing == 3rd listing OR 2nd listing == 3rd listing - 0.11. Match 2nd listing.
                            sell['metal'] = x['currencies']['metal']
                    else:
                        #Too risky to match any. Recall function.
                        return getSell(x,y)
            elif 'keys' in y['currencies']:
                #1st and 2nd are for <1key. 3rd is for more. Risky to match, recall function
                return getSell(x,y)
            else:
                #Handle ref price
                if 'metal' in first['currencies'] and 'metal' in x['currencies'] and 'metal' in y['currencies']:
                    if (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        #All three listings are for same amount of ref -> match metal price
                        sell['metal'] = first['currencies']['metal']
                    elif (first['currencies']['metal']) == (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                        if round( (y['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                            #1st and 2nd best sell listings are <3rd - 1 scrap. Therefore best listings are too risky to match, match 3rd.
                            sell['metal'] = y['currencies']['metal']
                        else:   
                            #3rd listing has been undercut by 1 scrap -> match the undercut.                          
                            sell['metal'] = x['currencies']['metal']
                    elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) == (y['currencies']['metal']):
                        if round( (x['currencies']['metal'] - first['currencies']['metal']), 2) > 0.11:
                            #Best listing is < 2nd - 1scrap. Recall function
                            return getSell(x,y)
                        else:
                            #2nd and 3rd listings have been undercut by 1 scrap -> match the undercut
                            sell['metal'] = first['currencies']['metal']
                    elif (first['currencies']['metal']) < (x['currencies']['metal']) and (x['currencies']['metal']) < (y['currencies']['metal']):
                        if round( (x['currencies']['metal'] - first['currencies']['metal']), 2) > 0.11:
                            #1st listing < 2nd listing - 1 scrap. Recall function
                            return getSell(x,y)
                        elif round( (y['currencies']['metal'] - x['currencies']['metal']), 2) > 0.11:
                            #2nd listing < 3rd listing - 1 scrap. Recall function
                            return getSell(x,y)
                        else:
                            #Could match first['currencies']['metal'], but match x for safety
                            sell['metal'] = x['currencies']['metal']
                else:
                    sell['metal'] = 0

        #len(sellListings) <= 1
        else:
            if 'metal' in first['currencies']:
                sell['metal'] = first['currencies']['metal']
            if 'keys' in first['currencies']:
                sell['keys'] = first['currencies']['keys']
            y = None
        return sell, x, y

    #Call pricing functions with listings at the top of the stacks
    if len(buyListings) >= 3:
        #3 bot buy listings or more, call getBuy function.
        firstBuy = buyListings.pop()
        buy, xBuy ,yBuy = getBuy(firstBuy, buyListings.pop())
        #The function returns the x and y listings so they can be reused later if the buy price > sell price.
    elif len(buyListings) == 2:
        buy = {
            'keys': 0,
            'metal': 0    
        }
        x = buyListings.pop()
        y = buyListings.pop()

        #Only two listings, match the best one.
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

        #Only one listing, match it.
        if 'keys' in x['currencies']:
            buy['keys'] = x['currencies']['keys']
        if 'metal' in x['currencies']:
            buy['metal'] = x['currencies']['metal']
    else:
        #If there are no bot buy listings, buy price will be obtained from prices.tf api
        buy = getPricesTFPrice(sku)['buy']

    if len(sellListings) >= 3:
        #3 bot sell listings or more, call getSell function
        firstSell = sellListings.pop()
        sell, xSell ,ySell = getSell(firstSell, sellListings.pop())
    elif len(sellListings) == 2:
        sell = {
            'keys': 0,
            'metal': 0    
        }
        x = sellListings.pop()

        #Only two sell listings. Match the cheapest one.
        if 'keys' in x['currencies']:
            sell['keys'] = x['currencies']['keys']
        else:
            sell['keys'] = 0
            
        if 'metal' in x['currencies']: 
            sell['metal'] = x['currencies']['metal']
        else:
            #Neither listing is selling for metal => sell['metal'] = 0
            sell['metal'] = 0
    elif len(buyListings) == 1:
        sell = {
            'keys': 0,
            'metal': 0    
        }
        x = sellListings.pop()

        #Only one sell listings. Match it.
        if 'keys' in x['currencies']:
            sell['keys'] = x['currencies']['keys']
        if 'metal' in x['currencies']:
            sell['metal'] = x['currencies']['metal']
    else:
        #If there are no bot sell listings, sell price will be obtained from prices.tf api
        sell = getPricesTFPrice(sku)['sell']
        print('test')

    #Buying for more than selling, get a cheaper buy price (sell price has priority)
    while buy['keys'] > sell['keys']:
        buy,xBuy,yBuy = getBuy(xBuy, yBuy)
    if buy['keys'] == sell['keys']:
        while buy['metal'] >= sell['metal']:
            buy, xBuy ,yBuy = getBuy(xBuy, yBuy)
            
    
    #Convert price to json object that the socket can emit.
    x = Price(buy, sell, name, sku)
    price = (x).get_json()
    return price

def background_task(url):
    local_socketio = SocketIO(app, logger=True, engineio_logger=True, message_queue=url)
    f = json.load(open(config.pathToPricelist + '/pricelist.json', 'r'))
    for i in f:
        try:
            price = getPrice(i)
            local_socketio.emit('price', price)
            print(f'Emitted {price}')
            local_socketio.sleep(3)
        except:
            print("ERROR GETTING PRICE FOR "+ str(i))
            traceback.print_exc()
        

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
    if sku == '5021;6':
        price = getPricesTFPrice(sku)
    else:
        price = getPrice(sku)
        print('Price requested for ' + tf2.getNameFromSku(sku) + ', returned ' + str(price))
    return json.dumps(price)

@app.route('/pricestf/<string:sku>')
def pricestf(sku):
    price = getPricesTFPrice(sku)
    return json.dumps(price)

if __name__ == '__main__':
    scheduler = APScheduler()
    scheduler.add_job(func=background_task, args=['redis://localhost:6379'], trigger='interval', id='job', minutes=1)
    scheduler.start()
    socketio.run(app, debug=True)