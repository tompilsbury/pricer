from requests import get, post
from math import floor



def getApiToken() -> str:
    endpoint = 'https://api2.prices.tf/auth/access'

    headers = {
        "accept": "application/json"
    }

    response = post(endpoint, headers=headers)
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

    response = get(endpoint, headers=headers)
    if response.status_code == 200:
        jsonRes = response.json()

        buyKeys = jsonRes['buyKeys']
        sellKeys = jsonRes['sellKeys']
        buyMetal = floor(jsonRes['buyHalfScrap'] * (1/18)*100)/100 
        sellMetal = floor(jsonRes['sellHalfScrap'] * (1/18)*100)/100

        price = {'buy': {'keys': buyKeys, 'metal': buyMetal}, 'sell': {'keys': sellKeys, 'metal': sellMetal}}
        return price
    else:
        print("ERROR getting prices.tf price, response: " + response.json())
        return None

