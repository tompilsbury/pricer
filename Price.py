import time

class Price():
    def __init__(self, buy, sell, name, sku):
        self.buy = buy
        self.sell = sell
        self.name = name
        self.sku = sku
        self.time = int((time.time()) * 1000)

    def __str__(self):
        return str(self.get_json())
    
    def get_json(self):
        price = {
            "buy": self.buy,
            "sell": self.sell,
            "currency": None,
            "name": self.name,
            "sku": self.sku,
            "source": 'bptf',
            "time": self.time
        }
        return price
    