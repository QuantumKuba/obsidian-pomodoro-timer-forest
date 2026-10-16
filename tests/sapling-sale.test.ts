import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeEngine } from './helpers'
import { FLORA_SPECIES } from '../src/assets/floraCatalog'
import { saplingSellValue } from '../src/services/Progression'

test('every species sells for at least a coin, and rarer ones for more', () => {
    for (const sp of FLORA_SPECIES) assert.ok(saplingSellValue(sp.id) >= 1, sp.id)
    const rarest = Math.max(...FLORA_SPECIES.map((s) => saplingSellValue(s.id)))
    assert.ok(rarest > saplingSellValue('classic_pine'))
    assert.equal(saplingSellValue('nope'), 0)
})

test('selling a sapling swaps it for coins', () => {
    const t = makeEngine((g) => {
        g.inventory['tree:classic_pine'] = 3
    })
    const coins = t.g.coins
    const price = saplingSellValue('classic_pine')
    assert.equal(t.engine.sellSapling('classic_pine'), price)
    assert.equal(t.g.inventory['tree:classic_pine'], 2)
    assert.equal(t.g.coins, coins + price)
})

test('a whole stack can be sold, and its inventory entry is removed', () => {
    const t = makeEngine((g) => {
        g.inventory['tree:classic_pine'] = 3
    })
    const coins = t.g.coins
    assert.equal(t.engine.sellSapling('classic_pine', 99), saplingSellValue('classic_pine') * 3)
    assert.equal('tree:classic_pine' in t.g.inventory, false)
    assert.equal(t.g.coins, coins + saplingSellValue('classic_pine') * 3)
})

test('there is nothing to sell without a spare sapling, and placed trees are safe', () => {
    const t = makeEngine((g) => {
        g.inventory = {}
        g.homestead = [{ id: 'p1', itemType: 'tree', itemId: 'classic_pine', gridX: 0, gridY: 0, level: 1 }]
    })
    const coins = t.g.coins
    assert.equal(t.engine.sellSapling('classic_pine'), 0)
    assert.equal(t.engine.sellSapling('sunflower', 2), 0)
    assert.equal(t.g.coins, coins)
    assert.equal(t.g.homestead.length, 1)
})
