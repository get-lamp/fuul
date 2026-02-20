type NFT = {
    code: string
    name: string
    price: number
}

export type PricingRule = {
    type: string,
    code: string,
    enabled: boolean,
}

type Cart = Record<string, number>
type RulesByNFT = Record<string, PricingRule[]>
export type CheckoutItem = NFT | {qty: number, discount: number, rules: PricingRule[] }


export class OpenSeasIntegration {
    // Normally we'd have some sort of integration layer for interfacing external services

    public getNFTs(codes: string[] = []) : NFT[] {
        // I included filtering, since I decided for getting the price on demand,
        // instead of caching it and risking it becoming stale.
        // The list of NFTs could be very long, so it makes sense asking just for what we need.
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

    public get(codes: string[] = []) : PricingRule[] {
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

        // get rules
        const rules = this.rules.getByNFT(Object.keys(this.cart))

        // get latest prices for the NFTs in the cart
        const prices : NFT[] = this.prices.getNFTs(Object.keys(this.cart))

        let list : CheckoutItem[] = prices.map(nft => {
            return {
                code: nft.code,
                name: nft.name,
                price: nft.price,
                qty: this.cart[nft.code],
                discount: 0,
                rules: rules[nft.code] ?? []
            }
        });

        this.applyDiscount(list);

        return list.map(item => {
            return (item.price * item.qty) - item.discount;
        }).reduce((prev, curr) : number => {
            return prev + curr
        });
    }

    private applyDiscount(list : CheckoutItem[]) : CheckoutItem[]{

        for (let item of list) {
            for (let rule of item.rules) {
                let discount = this.pricing[rule.type](item);
                if(discount != 0) {
                    item.discount = discount;
                    break
                }
            }
        }

        return list
    }

}



function threeForTwoDiscount(item: CheckoutItem) : number{
    if (item.qty >= 2) {
        return (Math.trunc(item.qty / 2) * item.price)
    }
    return 0
}

function bulkDiscount(item: CheckoutItem) : number {
    if (item.qty >= 3) {
        return item.qty * item.price * .2
    }
    return 0
}
