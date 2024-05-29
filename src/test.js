const { getPrice } = require('./getPrice')

async function main() {
    const price = await getPrice('5704;6');
    console.log(price)
}

main();