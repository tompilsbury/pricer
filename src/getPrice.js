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
}

async function minusOneScrap(metal1, metal2) {
    return new Promise((resolve, reject) => {
        answer = Math.round((metal1 - metal2) * 100) / 100
        resolve(answer);
    })
}

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
    // time: Math.floor(Date.now() / 1000)
    time: null
};

async function apiCall(name) {
    return new Promise(async (resolve, reject) => {
        try {
            // const attributes = parseSKU(sku);
            // const name = stringify(attributes)
            params.sku = name;
            axios.get(url, { params })
            .then((response) => {
                const listings = response.data['listings'];
                if (!listings) {
                    throw new Error("No listings found in API response.");
                }
                const buyListings = listings.filter(i => 
                    i.intent === 'buy' && 
                    i.userAgent && 
                    config.botSteamID.indexOf(i.steamid) === -1 &&
                    (!i.currencies || !i.currencies.usd) &&
                    (!i.item.attributes || JSON.stringify(i.item.attributes).indexOf('2014') === -1) &&
                    (!i.item.attributes || JSON.stringify(i.item.attributes).indexOf('2013') === -1) &&
                    (!i.item.attributes || 
                        !i.item.attributes.some(attr =>
                            strangeParts.hasOwnProperty(attr.float_value)
                        )
                    ) &&
                    (!i.item.attributes || 
                        i.item.attributes.some(attr =>
                            !spells.hasOwnProperty(attr.defindex)
                        )
                    )
                );
                const sellListings = listings.filter(i => 
                    i.intent === 'sell' && 
                    i.userAgent && 
                    config.botSteamID.indexOf(i.steamid) === -1 &&
                    (!i.currencies || !i.currencies.usd) &&
                    (!i.item.attributes || 
                        !i.item.attributes.some(attr =>
                            spells.hasOwnProperty(attr.defindex)
                        )
                    )
                );
                resolve([buyListings, sellListings]);
            })
            .catch((error) => {
                console.error("Error in apiCall:", error);
                throw error;
            })
        } catch (error) {
            console.error("Error in apiCall:", error);
            throw error;
        }
    })
    
}


async function getBuy(first, second, buyListings) {
    return new Promise(async (resolve, reject) => {

        // Initialise buy price object
        const buy = {
            keys: 0,
            metal: 0    
        };
        let third = null;
        if (buyListings && buyListings.length > 1) {

            third = buyListings.pop();

            // If all listings are for >=1 key
            //console.log(first)
            if ('keys' in first.currencies && 'keys' in second.currencies && 'keys' in third.currencies) {
                if (first.currencies.keys === second.currencies.keys && second.currencies.keys === third.currencies.keys) {
                    // All listings are for the same amount of keys -> match key price
                    buy.keys = first.currencies.keys;

                    // Handle metal price
                    if ('metal' in first.currencies && 'metal' in second.currencies && 'metal' in third.currencies) {
                        if (first.currencies.metal === second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                            // All three listings have the same metal and key price -> match price
                            buy.metal = first.currencies.metal;
                        }
                        else if (first.currencies.metal === second.currencies.metal && second.currencies.metal > third.currencies.metal) {
                            if (Math.round((second.currencies.metal - third.currencies.metal) * 100) / 100 > 0.11) {
                                // 1st and 2nd best buy listings are >3rd + 1 scrap. Therefore best listings are too risky to match, match 3rd.
                                buy.metal = third.currencies.metal;
                            } else {
                                // 3rd listing has been overcut by 1 scrap -> match the overcut.
                                buy.metal = second.currencies.metal;
                            }
                        }
                        else if (first.currencies.metal > second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                            if (Math.round((first.currencies.metal - second.currencies.metal) * 100) / 100 > 0.11) {
                                // Best listing is > 2nd + 1scrap. Recall function
                                return resolve(await getBuy(second, third, buyListings));
                            } else {
                                // 2nd and 3rd listings have been overcut by 1 scrap -> match the overcut
                                buy.metal = first.currencies.metal;
                            }
                        }
                        else if (first.currencies.metal > second.currencies.metal && second.currencies.metal > third.currencies.metal) {
                            if (Math.round((first.currencies.metal - second.currencies.metal) * 100) / 100 > 0.11) {
                                // 1st listing > 2nd listing + 1 scrap. Recall function
                                return resolve(await getBuy(second, third, buyListings));
                            }
                            else if (Math.round((second.currencies.metal - third.currencies.metal) * 100) / 100 > 0.11) {
                                // 2nd listing > 3rd listing + 1 scrap. Recall function
                                return resolve(await getBuy(second, third, buyListings));
                            }
                            else {
                                // Could match first listing, but match second for safety
                                buy.metal = second.currencies.metal;
                            }
                        }
                    }
                    // This statement realistically should be impossible to satisfy. Leave in just in case (pricer is working well rn.)
                    else if ('metal' in second.currencies && 'metal' in third.currencies) {
                        if (Math.round((second.currencies.metal - third.currencies.metal) * 100) / 100 > 0.11) {
                            return resolve(await getBuy(second, third, buyListings));
                        } else {
                            buy.metal = second.currencies.metal;
                        }
                    }
                    else {
                        // None of the listings are for any metal (and for the same amount of keys). E.g 1st=23keys, 2nd=23keys, 3rd=23keys. -> buy['metal'] = 0
                        buy.metal = 0;
                    }
                }
                else if (first.currencies.keys === second.currencies.keys && second.currencies.keys > third.currencies.keys) {
                    // 1st and 2nd are for more keys than 3rd. Match 3rd price to be safe.
                    if ('metal' in third.currencies) {
                        buy.metal = third.currencies.metal;
                    };
                    if ('keys' in third.currencies) {
                        buy.keys = third.currencies.keys;
                    }
                }
                else if ((first.currencies.keys > second.currencies.keys && second.currencies.keys === third.currencies.keys) || (first.currencies.keys > second.currencies.keys && second.currencies.keys > third.currencies.keys)) {
                    // Risky to match any of these. Recall function.
                    return resolve(await getBuy(second, third, buyListings));
                } 
                else {
                    if ('metal' in third.currencies) {
                        buy.metal = third.currencies.metal;
                    }
                    if ('keys' in third.currencies) {
                        buy.keys = third.currencies.keys;
                    }
                }
            }
            else if ('keys' in first.currencies && 'keys' in second.currencies) {
                // 1st and 2nd are for >1key, 3rd is not. Match 3rd price.
                buy.keys = 0;
                buy.metal = third.currencies.metal;
            }
            else if ('keys' in first.currencies) {
                // 1st is for >1key, other two are not. Recall function.
                return resolve(await getBuy(second, third, buyListings));
            }
            else {
                if ('metal' in first.currencies && 'metal' in second.currencies && 'metal' in third.currencies) {
                    if (first.currencies.metal === second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                        // All three listings are for same amount of ref -> match metal price
                        buy.metal = first.currencies.metal;
                    }
                    else if (first.currencies.metal === second.currencies.metal && second.currencies.metal > third.currencies.metal) {
                        if (Math.round((second.currencies.metal - third.currencies.metal) * 100) / 100 > 0.11) {
                            // 1st and 2nd best buy listings are >3rd + 1 scrap. Therefore best listings are too risky to match, match 3rd.
                            buy.metal = third.currencies.metal
                        }
                        else {
                            // 3rd listing has been overcut by 1 scrap -> match the overcut.
                            buy.metal = second.currencies.metal 
                        }
                    }
                    else if (first.currencies.metal > second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                        if (Math.round((first.currencies.metal - second.currencies.metal) * 100) / 100 > 0.11) {
                            // Best listing is > 2nd + 1scrap. Recall function
                            return resolve(await getBuy(second, third, buyListings));
                        }
                        else {
                            // 2nd and 3rd listings have been overcut by 1 scrap -> match the overcut
                            buy.metal = first.currencies.metal; 
                        }
                    }
                    else if (first.currencies.metal > second.currencies.metal && second.currencies.metal > third.currencies.metal) {
                        if (Math.round((first.currencies.metal - second.currencies.metal) * 100) / 100 > 0.11 || Math.round((second.currencies.metal - third.currencies.metal) * 100) / 100 > 0.11) {
                            // 1st listings > 2nd listing + 1 scrap. Recall function
                            return resolve(await getBuy(second, third, buyListings));
                        } 
                        else {
                            buy.metal = second.currencies.metal;
                        }
                    }
                }
                else {
                    buy.metal = 0
                }
            }
        }
        // buyListings.length <= 1 
        else if (buyListings && buyListings.length === 1) {
            if ('metal' in first.currencies) {
                buy.metal = first.currencies.metal;
            }
            if ('keys' in first.currencies) {
                buy.keys = first.currencies.keys;
            }
        }
        else {
            buy.keys = 0
            buy.metal = 0
        }

        resolve({ buy, second, third });
    });
}   

async function getSell(first, second, sellListings) {
    return new Promise(async (resolve, reject) => {
        // Initialise sell obj
        const sell = {
            keys: 0,
            metal: 0
        };
        let third = null;

        if (sellListings.length > 1) {
            third = sellListings.pop();

            // If both listings are for >=1 key
            if ('keys' in first.currencies && 'keys' in second.currencies && 'keys' in third.currencies) {
                if (first.currencies.keys === second.currencies.keys && second.currencies.keys === third.currencies.keys) {
                    // All listings are for same amount of keys -> match key price
                    sell.keys = first.currencies.keys;

                    // Handle ref price
                    if ('metal' in first.currencies && 'metal' in second.currencies && 'metal' in third.currencies) {
                        if (first.currencies.metal === second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                            // All three listings are for same amount of ref -> match metal price
                            sell.metal = first.currencies.metal;
                        } else if (first.currencies.metal === second.currencies.metal && second.currencies.metal < third.currencies.metal) {
                            if (await minusOneScrap(third.currencies.metal, second.currencies.metal) > 0.11) {
                                // 1st and 2nd best sell listings are <3rd - 1 scrap. Therefore best listings are too risky to match, match 3rd.
                                sell.metal = third.currencies.metal;
                            } else {
                                // 3rd listing has been undercut by 1 scrap -> match the undercut.
                                sell.metal = second.currencies.metal;
                            }
                        } else if (first.currencies.metal < second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                            if (await minusOneScrap(second.currencies.metal, first.currencies.metal) > 0.11) {
                                // Best listing is < 2nd - 1scrap. Recall function
                                return resolve(await getSell(second, third, sellListings));
                            } else {
                                // 2nd and 3rd listings have been undercut by 1 scrap -> match the undercut
                                sell.metal = first.currencies.metal;
                            }
                        } else if (first.currencies.metal < second.currencies.metal && second.currencies.metal < third.currencies.metal) {
                            if ((await minusOneScrap(second.currencies.metal, first.currencies.metal) > 0.11) || (await minusOneScrap(third.currencies.metal, second.currencies.metal) > 0.11)) {
                                return resolve(await getSell(second, third, sellListings));
                            }
                        } else {
                            // Could match first['currencies']['metal'], but match x for safety
                            sell.metal = second.currencies.metal;
                        }
                    } else if ('metal' in first.currencies && 'metal' in third.currencies) {
                        if (await minusOneScrap(third.currencies.metal, second.currencies.metal) > 0.11) {
                            return resolve(await getSell(second, third, sellListings));
                        } else {
                            sell.metal = second.currencies.metal;
                        }
                    } else {
                        // None of the listings are for any metal (and are for the same amount of keys). E.g 1st=23keys, 2nd=23keys, 3rd=23keys. -> sell['metal'] = 0
                        sell.metal = 0;
                    }
                } else if (first.currencies.keys === second.currencies.keys && second.currencies.keys < third.currencies.keys) {
                    // 1st and 2nd are for less keys than 3rd. Match 3rd price to be safe.
                    if ('metal' in third.currencies) {
                        sell.metal = third.currencies.metal;
                    }
                    if ('keys' in third.currencies) {
                        sell.keys = third.currencies.keys;
                    }
                } else if ((first.currencies.keys < second.currencies.keys && second.currencies.keys === third.currencies.keys) || (first.currencies.keys < second.currencies.keys && second.currencies.keys < third.currencies.keys)) {
                    return resolve(await getSell(second, third, sellListings));
                } else {
                    if ('metal' in third.currencies) {
                        sell.metal = third.currencies.metal;
                    }
                    if ('keys' in third.currencies) {
                        sell.keys = third.currencies.keys;
                    }
                }
            } else if ('keys' in second.currencies && 'keys' in third.currencies) {
                // 1st is for <1key but other two aren't (so don't match first).
                if (second.currencies.keys < third.currencies.keys) {
                    return resolve(await getSell(second, third, sellListings));
                } else {
                    // 2nd and 3rd are for same amount of keys. Match key price and check metal
                    sell.keys = second.currencies.keys;
                    if ('metal' in second.currencies && 'metal' in third.currencies) {
                        if (await minusOneScrap(third.currencies.metal, second.currencies.metal) > 0.11) {
                            // 3rd listing is for more than x + 0.11. Recall function.
                            return resolve(await getSell(second, third, sellListings));
                        } else {
                            // 2nd listing == 3rd listing OR 2nd listing == 3rd listing - 0.11. Match 2nd listing.
                            sell.metal = second.currencies.metal;
                        }
                    } else {
                        // Too risky to match any. Recall function.
                        return resolve(await getSell(second, third, sellListings));
                    }
                }
            } else if ('keys' in third.currencies) {
                // 1st and 2nd are for <1key. 3rd is for more. Risky to match, recall function
                return resolve(await getSell(second, third, sellListings));
            } else {
                // Handle ref price
                if ('metal' in first.currencies && 'metal' in second.currencies && 'metal' in third.currencies) {
                    if (first.currencies.metal === second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                        // All three listings are for same amount of ref -> match metal price
                        sell.metal = first.currencies.metal;
                    } else if (first.currencies.metal === second.currencies.metal && second.currencies.metal < third.currencies.metal) {
                        if (await minusOneScrap(third.currencies.metal, second.currencies.metal) > 0.11) {
                            // 1st and 2nd best sell listings are <3rd - 1 scrap. Therefore best listings are too risky to match, match 3rd.
                            sell.metal = third.currencies.metal;
                        } else {
                            // 3rd listing has been undercut by 1 scrap -> match the undercut.  
                            sell.metal = second.currencies.metal;
                        }
                    } else if (first.currencies.metal < second.currencies.metal && second.currencies.metal === third.currencies.metal) {
                        if (await minusOneScrap(second.currencies.metal, first.currencies.metal) > 0.11) {
                            // Best listing is < 2nd - 1scrap. Recall function
                            return resolve(await getSell(second, third, sellListings));
                        } else {
                            // 2nd and 3rd listings have been undercut by 1 scrap -> match the undercut
                            sell.metal = first.currencies.metal;
                        }
                    } else if (first.currencies.metal < second.currencies.metal && second.currencies.metal < third.currencies.metal) {
                        if ((await minusOneScrap(second.currencies.metal, first.currencies.metal) > 0.11) || (await minusOneScrap(third.currencies.metal, second.currencies.metal) > 0.11)) {
                            // 1st listing < 2nd listing - 1 scrap OR 2nd listing < 3rd listing - 1 scrap. Recall function
                            return resolve(await getSell(second, third, sellListings)); 
                        } else {
                            // Could match first['currencies']['metal'], but match 2nd for safety
                            sell.metal = second.currencies.metal;
                        }
                    } else {
                        sell.metal = 0;
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
        resolve({ sell, second, third });
    });
}

async function getUnusualBuy(buyListings) {
    return new Promise(async (resolve, reject) => {
        let buy = { keys: 0, metal: 0 };

        const firstBuy = buyListings.pop();
        const secondBuy = buyListings.pop();

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
        resolve(buy)
    })
}

async function getPrice(sku) {
    const attributes = parseSKU(sku);
    const name = stringify(attributes)
    const [buyListings, sellListings] = await apiCall(name);
    const isUnusual = (sku.split(";"))[1] === "5";

    buyListings.reverse();
    sellListings.reverse();
    
    let buy = { keys: 0, metal: 0 };
    let sell = { keys: 0, metal: 0 }
    let xBuy, yBuy, xSell, ySell;

    if (isUnusual) {
        buy = await getUnusualBuy(buyListings);
    } else {
        if (buyListings.length >= 3) {
            const firstBuy = buyListings.pop();
            ({ buy, second: xBuy, third: yBuy } = await getBuy(firstBuy, buyListings.pop(), buyListings));
        } else if (buyListings.length === 2) {
            buy = {
                keys: 0,
                metal: 0
            };
            const firstBuy = buyListings.pop();
            const secondBuy = buyListings.pop();

            if ('keys' in firstBuy.currencies && 'keys' in secondBuy.currencies) {
                buy.keys = firstBuy.currencies.keys;
            } else {
                buy.keys = 0;
            }

            if ('metal' in firstBuy.currencies) {
                buy.metal = firstBuy.currencies.metal;
            } else {
                buy.metal = 0;
            }
        } else if (buyListings.length === 1) {
            buy = {
                keys: 0,
                metal: 0
            };
            const firstBuy = buyListings.pop();

            if ('keys' in firstBuy.currencies) {
                buy.keys = firstBuy.currencies.keys;
            }
            if ('metal' in firstBuy.currencies) {
                buy.metal = firstBuy.currencies.metal;
            }
        } else {
            buy = await getPricesTFPrice(sku).then(price => price.buy);
        }
    }

    if (sellListings.length >= 3) {
        const firstSell = sellListings.pop();
        ({ sell, second: xSell, third: ySell } = await getSell(firstSell, sellListings.pop(), sellListings));
    } else if (sellListings.length === 2) {
        sell = {
            keys: 0,
            metal: 0
        };
        const first = sellListings.pop();

        if ('keys' in first.currencies) {
            sell.keys = first.currencies.keys;
        } else {
            sell.keys = 0;
        }

        if ('metal' in first.currencies) {
            sell.metal = first.currencies.metal;
        } else {
            sell.metal = 0;
        }
    } else if (sellListings.length === 1) {
        sell = {
            keys: 0,
            metal: 0
        };
        const first = sellListings.pop();

        if ('keys' in first.currencies) {
            sell.keys = first.currencies.keys;
        }
        if ('metal' in first.currencies) {
            sell.metal = first.currencies.metal;
        }
    } else {
        sell = await getPricesTFPrice(sku).then(price => price.sell);
    }

    while (buy && buy.keys > sell.keys) {
        ({ buy, second: xBuy, third: yBuy } = await getBuy(xBuy, yBuy, buyListings));
    }
    if (buy && sell && buy.keys === sell.keys) {
        while (buy && sell && buy.metal >= sell.metal) {
            if (buyListings.length === 1) {
                const price = await getPricesTFPrice(sku);
                buy = price.buy;
                sell = price.sell;
            } else {

                ({ buy, second: xBuy, third: yBuy } = await getBuy(xBuy, yBuy, buyListings));
            }
        }
    }

    dataFormat.buy = buy;
    dataFormat.sell = sell;
    dataFormat.name = name;
    dataFormat.sku = sku;
    dataFormat.time = Math.floor(Date.now() / 1000);
    return dataFormat
}

module.exports = { getPrice };