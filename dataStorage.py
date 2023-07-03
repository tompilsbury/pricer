import pickle
import os
from Price import Price

class dataStoring():
    def __init__(self, fileName):
        self.fileName = fileName
        self.data = []

        if not os.path.exists(fileName):
            open(fileName, 'w').close()

    def __str__(self):
        self.loadAllData()
        return str(self.data)
    
    def loadAllData(self):
        self.data = []
        with open(self.fileName, 'rb') as file:
            while True:
                try:
                    self.data.extend(pickle.load(file))
                except EOFError:
                    break
        return self.data
    
    def storeData(self, priceObject: Price):
        try:
            self.loadAllData()
            self.data.append(priceObject)
            with open(self.fileName, 'wb') as file:
                pickle.dump(self.data, file)
        except Exception as e:
            print(e)

    def clearData(self):
        try:
            with open('testPickle', 'wb') as file:
                pickle.dump([], file)
                print("FILE CLEARED")
        except Exception as e:
            print(e)

    def loadSkuData(self, sku: str):
        try:
            self.loadAllData()
            skuData = [price for price in self.data if price.sku == sku]
            
            return skuData
        except Exception as e:
            print(e)