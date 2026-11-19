// chests.js — drop rates + ouverture de coffres
// 5 types de coffres, 5 raretés, drop tables.

const CHEST_TYPES = ['commun', 'rare', 'epique', 'mythique', 'legendaire'];

const CHEST_PRICES = {
  commun: 10,
  rare: 30,
  epique: 80,
  mythique: 200,
  legendaire: 500,
};

// Drop rates par coffre : { commun, rare, epique, mythique, legendaire }
const DROP_RATES = {
  commun:     { commun: 70, rare: 21, epique: 6,  mythique: 2,  legendaire: 1 },
  rare:       { commun: 67, rare: 23, epique: 7,  mythique: 2,  legendaire: 1 },
  epique:     { commun: 65, rare: 21, epique: 8,  mythique: 4,  legendaire: 2 },
  mythique:   { commun: 64, rare: 21, epique: 8,  mythique: 4,  legendaire: 3 },
  legendaire: { commun: 60, rare: 21, epique: 10, mythique: 5,  legendaire: 4 },
};

// Quantité d'items par coffre
const CHEST_QUANTITIES = {
  commun: 1, rare: 2, epique: 3, mythique: 4, legendaire: 5,
};

// Items par rareté : liste pondérée
const ITEMS_BY_RARITY = {
  commun:     [{ item: 'pivot', weight: 50 }, { item: 'diagonale', weight: 50 }],
  rare:       [{ item: 'clock', weight: 100 }],
  epique:     [{ item: 'tp', weight: 100 }],
  mythique:   [{ item: 'ds', weight: 100 }],
  legendaire: [{ item: 'hamer', weight: 100 }],
};

function pickRarity(rates) {
  const total = Object.values(rates).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [rarity, pct] of Object.entries(rates)) {
    if (r < pct) return rarity;
    r -= pct;
  }
  return 'commun';
}

function pickItem(rarity) {
  const table = ITEMS_BY_RARITY[rarity];
  const total = table.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  for (const entry of table) {
    if (r < entry.weight) return entry.item;
    r -= entry.weight;
  }
  return table[0].item;
}

// Tire le contenu d'un coffre (sans appliquer)
function openChest(chestType) {
  if (!CHEST_TYPES.includes(chestType)) throw new Error('Type de coffre inconnu: ' + chestType);
  const rates = DROP_RATES[chestType];
  const qty = CHEST_QUANTITIES[chestType];
  const items = [];
  for (let i = 0; i < qty; i++) {
    const rarity = pickRarity(rates);
    const item = pickItem(rarity);
    items.push({ item, rarity });
  }
  return { chestType, items };
}

// Applique les items d'un coffre à un user (transaction)
async function grantChestRewards(client, userId, items) {
  // items = [{ item: 'pivot', rarity: 'commun' }, ...]
  for (const { item } of items) {
    // Insert ou update dans user_inventory
    await client.query(`
      INSERT INTO user_inventory (user_id, ability_type, quantity)
      VALUES ($1, $2, 1)
      ON CONFLICT (user_id, ability_type)
      DO UPDATE SET quantity = user_inventory.quantity + 1
    `, [userId, item]);
  }
}

module.exports = {
  CHEST_TYPES, CHEST_PRICES, DROP_RATES, CHEST_QUANTITIES, ITEMS_BY_RARITY,
  pickRarity, pickItem, openChest, grantChestRewards,
};
