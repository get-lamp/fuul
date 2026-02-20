type NFT = {
    code: string
    name: string
    price: number
}

type PricingRule = {
    type: string,
    code: string,
    enabled: boolean,
}

type Cart = Record<string, number>
type RulesByNFT = Record<string, PricingRule[]>
type CheckoutItem = {code: string, name: string, price: number, qty: number, discount: number, rules: PricingRule[] }


export class OpenSeasIntegration {
    // Integration with OpenSeas external service

    public getNFTs(codes: string[] = []) : NFT[] {
        // I included filtering, since I decided getting the price on demand, instead of caching it and risking it
        // becoming stale. The list of NFTs could be very long, so it makes sense asking just for what we need.
        return [
            {code: 'APE', name: 'Bored Apes', price: 75},
            {code: 'PUNK', name: 'Crypto Punks', price: 60},
            {code: 'AZUKI', name: 'Azuki', price: 30},
            {code: 'MEEBIT', name: 'Meebits', price: 4}
        ].filter((nft : NFT) => {
            if (codes.length > 0 ){ return codes.includes(nft.code); }
            else return true
        })
    }
}

export class RulesDatabase {
    // Having the rules on a database allows business decisions without redeploying.

    private get(codes: string[] = []) : PricingRule[] {
        // I'm assuming a pricing table with a simple schema where (type, products) tuples are unique.
        // when enabled == false, checkout should ignore the rule
        return [
            {type: 'three-for-two', code: 'APE', enabled: true},
            {type: 'three-for-two', code: 'AZUKI', enabled: true},
            {type: 'bulk', code: 'PUNK', enabled: true},
            {type: 'bulk', code: 'AZUKI', enabled: true},
        ].filter((rule : PricingRule) => {
            if (rule.enabled && codes.length > 0 ){ return codes.includes(rule.code); }
            else return true
        })
    }

    public getByNFT(codes: string[] = []){
        // The checkout implementation takes advantage of having the rules indexed by NFT code.
        // This integration layer is the right place for indexing the database result.
        const data : RulesByNFT = {}

        this.get(codes).map((rule) => {
            if(!data[rule.code]){data[rule.code] = []}
            data[rule.code].push(rule)
        });

        return data
    }
}


export class Checkout {

    prices: OpenSeasIntegration
    rules: RulesDatabase
    cart : Cart = {};
    // Map to discount type handlers
    // New discount types need to register a handler here
    pricing: Record<string, (item: CheckoutItem) => number> = {
        'three-for-two': threeForTwoDiscount,
        'bulk': bulkDiscount
    }

    constructor() {
        this.rules = new RulesDatabase()
        this.prices = new OpenSeasIntegration()
    }

    public scan(code: string) {
        this.cart[code] = (this.cart[code] ?? 0) + 1
    }

    public remove(code: string) {
        if(code in this.cart){
            this.cart[code] -= this.cart[code] > 0 ? 1 : 0;
        }
    }

    public total(): number {

        // if empty cart, bail out
        if (Object.keys(this.cart).length < 1) {return 0}

        // get rules from database. Just the ones applicable to the NFTs in the cart
        const rules = this.rules.getByNFT(Object.keys(this.cart))

        // get latest prices for the NFTs in the cart
        const prices : NFT[] = this.prices.getNFTs(Object.keys(this.cart))

        // CheckoutItem joins: quantity from cart, prices from OpenSeas, rules from database
        // The idea is to give enough context to the discount logic to implement different types of discount
        let list : CheckoutItem[] = prices.map(nft => {
            return {
                code: nft.code,
                name: nft.name,
                price: nft.price,
                qty: this.cart[nft.code],
                discount: 0,
                rules: rules[nft.code] ?? [] // might not be an applicable rule for this NFT
            }
        });

        // Discount system is orthogonal to the checkout.
        // This call can be bypassed safely
        // applyDiscount() modifies list[n].discount in place
        this.applyDiscount(list);

        return list.map((item : CheckoutItem) : number => {
            // Calculate the cost of each
            // discount is expressed as the amount to be deducted from the cost.
            // There's a lot of ways to do it, but this one gives the discount handlers logic the most freedom.
            return (item.price * item.qty) - item.discount;
        }).reduce((prev, curr) : number => {
            // Calculate the grand total
            return prev + curr
        });
    }

    private applyDiscount(list : CheckoutItem[]) : CheckoutItem[]{
        // CheckoutItem is grouped by NFTs. Each row, has its price and quantity. It also contains its amount of
        // discount initialized to zero.

        // CheckoutItem is intended to pass as much context as possible to the discount handlers, to allow for
        // different rule types, but this implementation still constrains the discount logic to be centered on a given
        // NFT, bot in respect to its applicability and its effects.

        // Rules that need to scope multiple NFTs or the state of the cart itself, would need to have this function
        // modified to share data between discount handlers. The examples didn't seem to warrant this more complex
        // solution. If this kind of rule were a requirements, I think I would redesign the discount handler functions.

        for (let item of list) {

            // CheckoutItem.rules is populated with the rules applicable to this NFT
            for (let rule of item.rules) {

                // The discount handler is called by rule-type
                let discount = this.pricing[rule.type](item);

                // overlap between rules, as in 3-for-2 & bulk applied to AZUKI, is resolved by picking the discount
                // most favorable to the customer.
                // The handler might not return a discount > 0. Handlers can apply arbitrary applicability rules, in
                // addition to the NFT being of a certain type.
                if(discount != 0 && item.discount < discount) {
                    item.discount = discount
                }
            }
        }

        return list
    }

}

function threeForTwoDiscount(item: CheckoutItem) : number{
    // Rule: For every 2 items purchased, get 1 free
    if (item.qty >= 2) {
        return (Math.trunc(item.qty / 2) * item.price)
    }
    return 0
}

function bulkDiscount(item: CheckoutItem) : number {
    // Rule: Buy 3 or more items, price per unit reduces 20%
    if (item.qty >= 3) {
        return item.qty * item.price * .2
    }
    return 0
}
