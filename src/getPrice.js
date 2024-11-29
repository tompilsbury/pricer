const config = require('../config/config.json');
const strangeParts = require('../data/strangeParts');
const { parseSKU, stringify } = require('tf2-item-format/static');
const axios = require('axios');
const spells = require('../data/spells')
const { getPricesTFPrice } = require('./getPricesTFPrice')

const url = 'https://backpack.tf/api/classifieds/listings/snapshot';
const params = {
    token: config.bptfApiKey,
    appid: 440,
    sku: null
};

const botSteamIDs = new Set(config.botSteamID);

/**
* Checks if the given attributes contain invalid values.
*
* @param {Object} attributes - The attributes object to check.
* @returns {boolean} - `true` if the attributes are invalid, `false` otherwise.
*/
const hasInvalidAttributes = (attributes) => {
    if (!attributes) return false;
    const attributesStr = JSON.stringify(attributes);
    return attributesStr.includes('2014') || attributesStr.includes('2013') ||
           attributes.some(attr => strangeParts.hasOwnProperty(attr.float_value) || spells.hasOwnProperty(attr.defindex) || attr.defindex === '142');
};

/**
* Fetches buy and sell listings for a given item name from the API.
*
* @param {string} name - The name of the item to fetch listings for.
* @returns {Promise<[Listing[], Listing[]][]>} - A Promise that resolves to an array containing two arrays:
*     - The first array contains filtered buy listings.
*     - The second array contains filtered sell listings.
*/
async function apiCall(name) {
    params.sku = name;
    try {
        const response = await axios.get(url, { params });
        const listings = response.data['listings'];
        if (!listings) throw new Error("No listings found in API response.");

        // filterListings separates the listings into "buy" and "sell" based on the listing intent.
        // Also removes listings that aren't bots, are in the config's ignored steamids, are listed for real money, have additional attributes.
        const filterListings = (intent, listings) =>
            listings.filter(i => i.intent === intent && i.userAgent && !botSteamIDs.has(i.steamid) &&
                (!i.currencies || !i.currencies.usd) &&
                (intent === 'buy' ? !hasInvalidAttributes(i.item.attributes) : true)
            );
    
        return [filterListings('buy', listings), filterListings('sell', listings)];

    } catch (error) {
        console.error("Error in apiCall:", error.message);
        if (error.message === "No listings found in API response." && !name.startsWith("The ")) {
            console.log("Retrying with 'The' prefix...");
            return await apiCall("The " + name);
        } else {
            throw error;
        }
    }
}

/**
* Calculates the buy price based on the provided buy listings.
*
* FUNCTION NEEDS REWRITING TO IMPROVE READABILITY: reduce nested conditional statements
*
* @param {Object} first - The first buy listing.
* @param {Object} second - The second buy listing.
* @param {Listing[]} buyListings - An array of remaining buy listings.
* @returns {Promise<{ buy: { keys: number, metal: number }, second: Object, third: Object }>} - A Promise that resolves to an object containing:
*     - `buy`: An object with `keys` and `metal` properties representing the calculated buy price.
*     - `second`: The second buy listing after processing.
*     - `third`: The third buy listing after processing.
*/
async function calculateBuyPrice(first, second, buyListings) {
    const buy = { keys: 0, metal: 0 };
    let third = null;

    if (buyListings && buyListings.length > 1) {
        third = buyListings.pop();
        
        if (first?.currencies?.keys !== undefined &&
            second?.currencies?.keys !== undefined &&
            third?.currencies?.keys !== undefined) {

            if (first.currencies.keys === second.currencies.keys && second.currencies.keys === third.currencies.keys) {
                buy.keys = first.currencies.keys;

                const metals = [first.currencies.metal, second.currencies.metal, third.currencies.metal].filter(metal => metal !== undefined);

                if (metals.every(metal => metal === metals[0])) {
                    buy.metal = metals[0];
                } else if (metals[1] === metals[2]) {
                    if ((metals[1] - metals[0]) < 0.11) {
                        return await calculateBuyPrice(second, third, buyListings);
                    } else if ((metals[0] - metals[1]) <= 0.11) {
                        buy.metal = metals[0];
                    }
                }
                else if (metals[0] === metals[1]) {
                    if ((metals[1] - metals[2]) > 0.11) {
                        buy.metal = metals[2];
                    } else {
                        buy.metal = metals[1];
                    }
                }
                else {
                    if ((metals[1] - metals[0]) > 0.11 || (metals[1] - metals[2]) > 0.11) {
                        return await calculateBuyPrice(second, third, buyListings);
                    }
                    else {
                        buy.metal = metals[1];
                    }
                }
            } else if (first.currencies.keys === second.currencies.keys && second.currencies.keys > third.currencies.keys) {
                buy.keys = third.currencies.keys;
                buy.metal = third.currencies.metal || 0;
            } else {
                buy.keys = second.currencies.keys;
                buy.metal = second.currencies.metal || 0;
            }
        } else if (first?.currencies?.keys !== undefined && second?.currencies?.keys !== undefined) {
            buy.keys = 0;
            buy.metal = third?.currencies?.metal || 0;
        } else if (first?.currencies?.keys !== undefined) {
            return await calculateBuyPrice(second, third, buyListings);
        } else {
            const metals = [first?.currencies?.metal, second?.currencies?.metal, third?.currencies?.metal].filter(metal => metal !== undefined);
            if (metals.every(metal => metal === metals[0])) {
                buy.metal = metals[0];
            } else if (metals[1] === metals[2]) {
                if ((metals[1] - metals[0]) < 0.11) {
                    return await calculateBuyPrice(second, third, buyListings);
                } else if ((metals[0] - metals[1]) <= 0.11) {
                    buy.metal = metals[0];
                }
            }
            else if (metals[0] === metals[1]) {
                if ((metals[1] - metals[2]) > 0.11) {
                    buy.metal = metals[2];
                } else {
                    buy.metal = metals[1];
                }
            }
            else {
                if ((metals[1] - metals[0]) > 0.11 || (metals[1] - metals[2]) > 0.11) {
                    return await calculateBuyPrice(second, third, buyListings);
                }
                else {
                    buy.metal = metals[1];
                }
            }
        }
    } else if (buyListings && buyListings.length === 1) {
        if ('metal' in first.currencies) {
            buy.metal = first.currencies.metal;
        }
        if ('keys' in first.currencies) {
            buy.keys = first.currencies.keys;
        }
    } else {
        buy.keys = 0;
        buy.metal = 0;
    }
    return { buy, second, third };
}

/**
* Calculates the sell price based on the provided sell listings.
*
* FUNCTION NEEDS REWRITING TO IMPROVE READABILITY: reduce nested conditional statements
*
* @param {Object} first - The first sell listing.
* @param {Object} second - The second sell listing.
* @param {Listing[]} sellListings - An array of remaining sell listings.
* @returns {Promise<{ sell: { keys: number, metal: number }, second: Object, third: Object }>} - A Promise that resolves to an object containing:
*     - `sell`: An object with `keys` and `metal` properties representing the calculated sell price.
*     - `second`: The second sell listing after processing.
*     - `third`: The third sell listing after processing.
*/
async function calculateSellPrice(first, second, sellListings) {
    const sell = { keys: 0, metal: 0 };
    let third = null;

    if (sellListings.length > 1) {
        third = sellListings.pop();

        if (first?.currencies?.keys !== undefined &&
            second?.currencies?.keys !== undefined &&
            third?.currencies?.keys !== undefined) {

            if (first.currencies.keys === second.currencies.keys && second.currencies.keys === third.currencies.keys) {
                sell.keys = first.currencies.keys;

                const metals = [first.currencies.metal, second.currencies.metal, third.currencies.metal].filter(metal => metal !== undefined);
                if (metals.every(metal => metal === metals[0])) {
                    sell.metal = metals[0];
                } else if (metals[1] === metals[2]) {
                    if ((metals[1] - metals[0]) > 0.11) {
                        return await calculateSellPrice(second, third, sellListings);
                    } else if ((metals[1] - metals[0]) <= 0.11) {
                        sell.metal = metals[0];
                    }
                }
                else if (metals[0] === metals[1]) {
                    if ((metals[2] - metals[1]) > 0.11) {
                        sell.metal = metals[2];
                    } else {
                        sell.metal = metals[1];
                    }
                }
                else {
                    if ((metals[1] - metals[0]) > 0.11 || (metals[2] - metals[1]) > 0.11) {
                        return await calculateSellPrice(second, third, sellListings);
                    }
                    else {
                        sell.metal = metals[1];
                    }
                }
            } else if (first.currencies.keys === second.currencies.keys && second.currencies.keys < third.currencies.keys) {
                sell.keys = third.currencies.keys;
                sell.metal = third.currencies.metal || 0;
            } else {
                sell.keys = second.currencies.keys;
                sell.metal = second.currencies.metal || 0;
            }
        } else if (second?.currencies?.keys !== undefined && third?.currencies?.keys !== undefined) {
            if (second.currencies.keys < third.currencies.keys) {
                return await calculateSellPrice(second, third, sellListings);
            } else {
                sell.keys = second.currencies.keys;
                const metals = [second.currencies.metal, third.currencies.metal].filter(metal => metal !== undefined);
                const sortedMetals = metals.sort((a, b) => a - b);
                if ((sortedMetals[1] - sortedMetals[0]) > 0.11) {
                    return await calculateSellPrice(second, third, sellListings);
                } else {
                    sell.metal = sortedMetals[0];
                }
            }
        } else {
            const metals = [first.currencies.metal, second.currencies.metal, third.currencies.metal].filter(metal => metal !== undefined);
            if (metals.every(metal => metal === metals[0])) {
                sell.metal = metals[0];
            } else if (metals[1] === metals[2]) {
                if ((metals[1] - metals[0]) > 0.11) {
                    return await calculateSellPrice(second, third, sellListings);
                } else if ((metals[1] - metals[0]) <= 0.11) {
                    sell.metal = metals[0];
                }
            }
            else if (metals[0] === metals[1]) {
                if ((metals[2] - metals[1]) > 0.11) {
                    sell.metal = metals[2];
                } else {
                    sell.metal = metals[1];
                }
            }
            else {
                if ((metals[1] - metals[0]) > 0.11 || (metals[2] - metals[1]) > 0.11) {
                    return await calculateSellPrice(second, third, sellListings);
                }
                else {
                    sell.metal = metals[1];
                }
            }
        }
    } else {
        if ('metal' in first.currencies) {
            sell.metal = first.currencies.metal;
        }
        if ('keys' in first.currencies) {
            sell.keys = first.currencies.keys;
        }
        third = null;
    }

    return { sell, second, third };
}

/** 
* Calculates the buy price for an unusual item based on the provided buy listings.
*
* Unusual items have a separate buy calculation due to more aggressive pricing strategies.
*
* @param {Listing[]} buyListings - An array of buy listings.
* @param {string} sku - The item's SKU.
* @returns {Promise<{ keys: number, metal: number }>} - A Promise that resolves to an object representing the calculated buy price with `keys` and `metal` properties.
*/
async function getUnusualBuy(buyListings, sku) {
    let buy = { keys: 0, metal: 0 };

    const firstBuy = buyListings.pop();
    const secondBuy = buyListings.pop();

    if (firstBuy) {
        if ('keys' in firstBuy.currencies && 'keys' in secondBuy.currencies) {
            if (firstBuy.currencies.keys === secondBuy.currencies.keys) {
                buy.keys = firstBuy.currencies.keys;
                if ('metal' in firstBuy.currencies && 'metal' in secondBuy.currencies) {
                    // Safety net for buy listing
                    if (firstBuy.currencies.metal > secondBuy.currencies.metal * 1.3) {
                        buy.metal = secondBuy.currencies.metal;
                    } else {
                        buy.metal = firstBuy.currencies.metal;
                    }
                } else if ('metal' in firstBuy.currencies) {
                    if (firstBuy.currencies.metal >= 30) {
                        buy.metal = secondBuy.currencies.metal;
                    } else {
                        buy.metal = firstBuy.currencies.metal;
                    }
                }
            } else {
                buy.keys = secondBuy.currencies.keys;
                if ('metal' in secondBuy.currencies) {
                    buy.metal = secondBuy.currencies.metal;
                }
            }
        } else {
            buy.keys = 0;
            buy.metal = firstBuy.currencies.metal;
        }
        return buy;
    } else {
        console.log(`Could not find any buy listings for ${sku}, getting prices.tf price`);
        const buyPrice = await getPricesTFPrice(sku);
        if (buyPrice) {
            return buyPrice.buy;
        } else {
            console.log(`No buy price found for ${sku}, returning 0 keys 0 ref`);
            return buy;
        }
    }
}

/**
* Calculates the buy and sell prices for a given item SKU.
*
* @param {string} sku - The item's SKU.
* @returns {Promise<{ buy: { keys: number, metal: number }, sell: { keys: number, metal: number }, currency: string, name: string, sku: string, source: string, time: number }>} - A Promise that resolves to an object containing:
*     - `buy`: The calculated buy price.
*     - `sell`: The calculated sell price.
*     - `currency`: The currency used for the prices.
*     - `name`: The name of the item.
*     - `sku`: The item's SKU.
*     - `source`: The source of the price data.
*     - `time`: The timestamp when the prices were calculated.
*/
async function getPrice(sku) {
    const attributes = parseSKU(sku);
    const name = stringify(attributes);
    const dataFormat = {
        buy: {
            keys: 0,
            metal: 0
        },
        sell: {
            keys: 0,
            metal: 0
        },
        currency: null,
        name: null,
        sku: null,
        source: 'bptf',
        time: null
    };
    const [buyListings, sellListings] = await apiCall(name);
    const isUnusual = (sku.split(";"))[1] === "5";

    // "5021;6" is the SKU of a Mann. Co Supply Crate Key (currency). This price is volatile, so we use the safer Prices.tf price.
    if (sku === "5021;6") {
        const price = await getPricesTFPrice(sku);
        return {
            buy: price.buy,
            sell: price.sell,
            name,
            sku,
            time: Math.floor(Date.now() / 1000),
            source: 'bptf'
        };
    }

    // Reverse the arrays to get the more desirable listings (highest buy & lowest sell) to the back. 
    buyListings.reverse();
    sellListings.reverse();

    let buy = { keys: 0, metal: 0 };
    let sell = { keys: 0, metal: 0 };
    let xBuy, yBuy, xSell, ySell;

    // More agressive buy prices for unusuals to stay competitive.
    if (isUnusual) {
        const [firstBuy, secondBuy] = [buyListings.pop(), buyListings.pop()];
        buy = await getUnusualBuy([firstBuy, secondBuy], sku);
    } 
    
    else {
        if (buyListings.length >= 3) {
            const firstBuy = buyListings.pop();
            ({ buy, second: xBuy, third: yBuy } = await calculateBuyPrice(firstBuy, buyListings.pop(), buyListings));
        } 
        // Only one or two buy listings means we match the best one.
        else if (buyListings.length > 0) {
            const firstBuy = buyListings.pop();
            buy = {
                keys: 'keys' in firstBuy.currencies ? firstBuy.currencies.keys : 0,
                metal: 'metal' in firstBuy.currencies ? firstBuy.currencies.metal : 0
            };
        } 
        // No buy listings means we use prices.tf for safe pricing.
        else {
            buy = await getPricesTFPrice(sku).then(price => price.buy);
        }
    }

    if (sellListings.length >= 3) {
        const firstSell = sellListings.pop();
        ({ sell } = await calculateSellPrice(firstSell, sellListings.pop(), sellListings));
    } 
    // Only one or two sell listings means we match the best one.
    else if (sellListings.length > 0) {
        const firstSell = sellListings.pop();
        sell = {
            keys: 'keys' in firstSell.currencies ? firstSell.currencies.keys : 0,
            metal: 'metal' in firstSell.currencies ? firstSell.currencies.metal : 0
        };
    } 
    // No sell listings means we use prices.tf for safe pricing.
    else {
        sell = await getPricesTFPrice(sku).then(price => price.sell);
    }

    // Error handling. If a price was not found for whatever reason, then get prices.tf price.
    if (!buy || (buy.keys === 0 && buy.metal === 0)) {
        buy = await getPricesTFPrice(sku).then(price => price.buy);
    }
    if (!sell || (sell.keys === 0 && sell.metal === 0)) {
        sell = await getPricesTFPrice(sku).then(price => price.sell);
    }

    // Buying for more than selling -> keep calling calculateBuyPrice until we get a lower one.
    // Sell price gets priority as it is safer to have a less-competitive buy price than sell price (for profit).
    while (buy && sell && buy.keys > sell.keys) {
        ({ buy, second: xBuy, third: yBuy } = await calculateBuyPrice(xBuy, yBuy, buyListings));
    }
    if (buy && sell && buy.keys === sell.keys) {
        while (buy && sell && buy.metal >= sell.metal) {
            if (buyListings.length === 1) {
                const price = await getPricesTFPrice(sku);
                buy = price.buy;
                sell = price.sell;
            } else {
                ({ buy, second: xBuy, third: yBuy } = await calculateBuyPrice(xBuy, yBuy, buyListings));
            }
        }
    }

    // Populate the return object fields.
    dataFormat.buy = buy;
    dataFormat.sell = sell;
    dataFormat.name = name;
    dataFormat.sku = sku;
    dataFormat.time = Math.floor(Date.now() / 1000);
    return dataFormat;
}

module.exports = { getPrice }