import { expect, test, vi} from 'vitest';
import {Checkout, OpenSeasIntegration, RulesDatabase, PricingRule, CheckoutList} from './index';

test('RulesDatabase returns all pricing rules', () => {

    const rdb = new RulesDatabase()

    expect(rdb.get()).toStrictEqual([
        {type: 'three-for-two', code: 'APE', enabled: true},
        {type: 'three-for-two', code: 'AZUKI', enabled: true},
        {type: 'bulk', code: 'PUNK', enabled: true},
        {type: 'bulk', code: 'AZUKI', enabled: true},
    ]);

});

test('RulesDatabase.getByNFT returns all rules indexed by NFTs', () => {

    const rdb = new RulesDatabase()

    expect(rdb.getByNFT()).toStrictEqual({
        APE: [{type: 'three-for-two', code: 'APE', enabled: true}],
        AZUKI: [{type: 'three-for-two', code: 'AZUKI', enabled: true}, {type: 'bulk', code: 'AZUKI', enabled: true}],
        PUNK: [{type: 'bulk', code: 'PUNK', enabled: true}],
    });

});

test('OpenSeasIntegration returns all prices', () => {

    const osi = new OpenSeasIntegration()

    expect(osi.getNFTs()).toStrictEqual([
        {code: 'APE', name: 'Bored Apes', price: 75},
        {code: 'PUNK', name: 'Crypto Punks', price: 60},
        {code: 'AZUKI', name: 'Azuki', price: 30},
        {code: 'MEEBIT', name: 'Meebits', price: 4}
    ]);

});

test('OpenSeasIntegration returns filtered prices', () => {

    const osi = new OpenSeasIntegration()

    expect(osi.getNFTs(['AZUKI', 'MEEBIT'])).toStrictEqual([
        {code: 'AZUKI', name: 'Azuki', price: 30},
        {code: 'MEEBIT', name: 'Meebits', price: 4}
    ]);
});


test('Checkout.scan adds NFTs to cart', () => {
    const co = new Checkout()

    expect(co.cart).toStrictEqual({})

    for (let code of ['APE', 'PUNK', 'AZUKI', 'MEEBIT']){
        co.scan(code)
    }

    expect(co.cart).toStrictEqual({
        'APE': 1,
        'PUNK': 1,
        'AZUKI': 1,
        'MEEBIT': 1
    })


})

test('Checkout.remove removes NFTs from cart', () => {

    const co = new Checkout()

    co.cart = {'APE': 3, 'PUNK': 2, 'AZUKI': 1, 'MEEBIT': 0}

    for (let code of ['APE', 'PUNK', 'AZUKI', 'MEEBIT']){
        co.remove(code)
    }

    expect(co.cart).toStrictEqual({'APE': 2, 'PUNK': 1, 'AZUKI': 0, 'MEEBIT': 0})
})

test('Checkout.remove does not affect zero quantities or NFTs not contained in the cart', () => {

    const co = new Checkout()

    co.cart = {'APE': 0}

    for (let code of ['APE', 'PUNK']){
        co.remove(code)
    }

    expect(co.cart).toStrictEqual({'APE': 0})
})

test('Checkout.total with empty cart returns zero without external calls', () => {
    const co = new Checkout()
    const openSeas= vi.spyOn(co.prices, 'getNFTs');
    expect(co.total()).toBe(0);
    expect(openSeas).not.toHaveBeenCalled()
})

test('Checkout.total returns price without discount', () => {
    const co = new Checkout()
    co.scan('APE')
    co.scan('PUNK')
    expect(co.total()).toBe(135);
})

test('Checkout.total applies discounts', () => {
    /*
    Items: APE, PUNK, MEEBIT
    Total: 139 ETH

    Items: APE, PUNK, APE
    Total: 210 ETH (Or is it 135?)

    Items: PUNK, PUNK, PUNK, APE, PUNK
    Total: 267 ETH

    Items: APE, PUNK, APE, APE, MEEBIT, PUNK, PUNK
    Total: 298 ETH

    Items: AZUKI, AZUKI, AZUKI
    Total: ??? ETH
     */

    const testCases = [
        {
            items: [{code: 'APE', qty: 1}, {code: 'PUNK', qty: 1}, {code: 'MEEBIT', qty: 1}],
            total: 139
        },
        {
            items: [{code: 'APE', qty: 2}, {code: 'PUNK', qty: 1}],
            total: 135
        },
        {
            items: [{code: 'APE', qty: 1}, {code: 'PUNK', qty: 4}],
            total: 267
        },
        {
            items: [{code: 'APE', qty: 3}, {code: 'PUNK', qty: 3}, {code: 'MEEBIT', qty: 1}],
            total: 298
        },
        {
            items: [{code: 'AZUKI', qty: 3}],
            total: 60
        },
    ]

    for (let testCase of testCases) {

        const co = new Checkout()

        for (let nft of testCase.items) {
            for (let i=0; i < nft.qty; i++) {
                co.scan(nft.code)
            }
        }

        expect(co.total()).toBe(testCase.total);
    }

})