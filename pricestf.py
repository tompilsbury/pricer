import requests
import math


def getApiToken() -> str:
    endpoint = 'https://api2.prices.tf/auth/access'

    headers = {
        "accept": "application/json"
    }

    response = requests.post(endpoint, headers=headers)
    if response.status_code == 200:
        return response.json()['accessToken']
    else:
        print("ERROR getting prices.tf access token, response: " + response.json())


def getPricesTFPrice(sku):
    token = getApiToken()

    headers = {
        "Authorization": f"Bearer {token}"
    }
    endpoint = f'https://api2.prices.tf/prices/{sku}'

    response = requests.get(endpoint, headers=headers)
    if response.status_code == 200:
        jsonRes = response.json()

        buyKeys = jsonRes['buyKeys']
        sellKeys = jsonRes['sellKeys']
        buyMetal = math.floor(jsonRes['buyHalfScrap'] * (1/18)*100)/100 
        sellMetal = math.floor(jsonRes['sellHalfScrap'] * (1/18)*100)/100

        price = {'buy': {'keys': buyKeys, 'metal': buyMetal}, 'sell': {'keys': sellKeys, 'metal': sellMetal}}
        return price
    else:
        print("ERROR getting prices.tf price, response: " + response.json())
