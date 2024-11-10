const axios = require('axios');

/**
* Fetches an access token from the prices.tf API.
*
* @returns {Promise<string>} - A Promise that resolves to the access token string on success, or rejects with an error.
* @throws {Error} - Throws an error if there's a problem fetching the token.
*/
async function getApiToken() {
    const endpoint = 'https://api2.prices.tf/auth/access';
    const headers = {
        "accept": "application/json"
    };

    try {
        const response = await axios.post(endpoint, {}, { headers });
        if (response.status === 200) {
            return response.data.accessToken;
        } else {
            throw new Error(`ERROR getting prices.tf access token, response: ${response.status}`);
        }
    } catch (error) {
        console.error('Error fetching API token:', error);
        throw error; // Rethrow the error to propagate it to the caller
    }
}

/**
* Fetches buy and sell prices for a given item SKU from the prices.tf API.
*
* @param {string} sku - The item's SKU.
* @returns {Promise<{ buy: { keys: number, metal: number }, sell: { keys: number, metal: number } } | null>} - A Promise that resolves to an object containing buy and sell prices with `keys` and `metal` properties, or `null` if there's an error.
*/
async function getPricesTFPrice(sku) {
    try {
        const token = await getApiToken();

        const headers = {
            Authorization: `Bearer ${token}`,
        };
        const endpoint = `https://api2.prices.tf/prices/${sku}`;

        const response = await axios.get(endpoint, { headers });
        
        if (response.status === 200) {
            const buyKeys = response.data.buyKeys;
            const sellKeys = response.data.sellKeys;
            const buyMetal = Math.floor(response.data.buyHalfScrap * (1 / 18) * 100) / 100;
            const sellMetal = Math.floor(response.data.sellHalfScrap * (1 / 18) * 100) / 100;
            const price = {
                buy: {
                    keys: buyKeys,
                    metal: buyMetal
                },
                sell: {
                    keys: sellKeys,
                    metal: sellMetal
                }
            };
            return price;
        } else {
            console.error(`ERROR getting prices.tf price, response: ${response.status}`);
            return null;
        }
    } catch (error) {
        console.error("An error occurred while getting the prices.tf price: ", error);
        return null;
    }
}

module.exports = { getPricesTFPrice };
