const axios = require('axios');

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

// getApiToken()
// console.log(getApiToken());
// getPricesTFPrice('205;11;kt-2').then(price => {
//     console.log(price);
// });

// getPricesTFPrice('205;11;kt-2')
module.exports = { getPricesTFPrice };
