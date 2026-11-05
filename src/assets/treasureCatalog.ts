/**
 * Things that can only be earned from missions: daily quests, the daily chest, neighbours'
 * requests and the chapters of the Village Charter. None of them is ever sold.
 *
 * Care items are used up looking after the Heart Tree. Ornaments are kept for good: they are
 * collected, and hung on (or set beside) the Heart Tree.
 */
import type { CareNeed } from '../types/forest'
import { TREASURE_SVGS } from './floraAssets'

export type TreasureKind = 'care' | 'ornament'

/**
 * Where an ornament goes on the Heart Tree: hung from the canopy, fixed to the trunk, set on
 * the ground beside it, perched on top, or slung from a low branch.
 */
export type OrnamentMount = 'hang' | 'trunk' | 'ground' | 'perch' | 'low'

export interface Treasure {
    id: string
    name: string
    kind: TreasureKind
    /** For reward lines and toasts. */
    emoji: string
    description: string
    /** Where it comes from, in a few words, for the collection. */
    from: string
    rarity: 'common' | 'uncommon' | 'rare'
    /** Care items: the need it meets. The salve meets any. */
    meets?: CareNeed | 'any'
    mount?: OrnamentMount
    iconSvg: string
}

const care = (id: string, name: string, emoji: string, meets: CareNeed | 'any', description: string, from: string, rarity: Treasure['rarity'] = 'common'): Treasure =>
    ({ id, name, kind: 'care', emoji, meets, description, from, rarity, iconSvg: TREASURE_SVGS[id] })
const ornament = (id: string, name: string, emoji: string, mount: OrnamentMount, description: string, from: string, rarity: Treasure['rarity']): Treasure =>
    ({ id, name, kind: 'ornament', emoji, mount, description, from, rarity, iconSvg: TREASURE_SVGS[id] })

export const CARE_ITEMS: Treasure[] = [
    care('spring_water', 'Spring Water', '💧', 'water', 'Cold, clear water from the hill spring.', 'Daily quests, and Maren'),
    care('leaf_mould', 'Leaf-mould Compost', '🍂', 'nourish', 'A year of fallen leaves, turned to dark, crumbly earth.', 'Daily quests, and Hollis'),
    care('pruning_twine', 'Pruning Twine', '🧶', 'tend', 'Jute twine for tying in a wandering branch.', 'Daily quests, and Ash'),
    care('beeswax_salve', 'Beeswax Salve', '🍯', 'any', 'Good for bark and blisters alike. Meets any need.', 'The daily chest, and Ida', 'uncommon'),
]

export const ORNAMENTS: Treasure[] = [
    // One for each chapter of the Village Charter, in chapter order
    ornament('carved_heart', 'Carved Heart', '🤍', 'trunk', 'Cut into the bark: the oldest way of saying this one is yours.', 'Charter, chapter 1', 'rare'),
    ornament('wishing_ribbons', 'Wishing Ribbons', '🎀', 'hang', 'Ribbons tied to a branch, one for every wish.', 'Charter, chapter 2', 'rare'),
    ornament('brass_bell', 'Brass Bell', '🔔', 'hang', 'Bought from a trader on the first market day.', 'Charter, chapter 3', 'rare'),
    ornament('string_of_lanterns', 'String of Lanterns', '🏮', 'hang', 'Paper lanterns that light the branches after dusk.', 'Charter, chapter 4', 'rare'),
    ornament('stone_lantern', 'Shrine Lantern', '🕯️', 'ground', 'A little stone shrine lantern, set at the roots for the seat of the shire.', 'Charter, chapter 5', 'rare'),
    ornament('owl', 'Old Owl', '🦉', 'perch', 'An owl has moved in. They only choose the oldest trees.', 'Charter, chapter 6', 'rare'),
    // From the neighbours, once they count you a friend (♥♥)
    ornament('birdhouse', 'Birdhouse', '🪺', 'trunk', 'Hollis knocked it together from an old apple crate.', 'Hollis, at ♥♥', 'uncommon'),
    ornament('flower_garland', 'Flower Garland', '💐', 'hang', 'Maren’s dried flowers, woven into a garland.', 'Maren, at ♥♥', 'uncommon'),
    ornament('rope_swing', 'Rope Swing', '🪢', 'low', 'Ash tied the knots. They will outlast us both.', 'Ash, at ♥♥', 'uncommon'),
    ornament('wind_chime', 'Wind Chime', '🎐', 'hang', 'Ida’s chime. It only rings when the wind means it.', 'Ida, at ♥♥', 'uncommon'),
    // Found in the daily chest
    ornament('firefly_jar', 'Firefly Jar', '✨', 'hang', 'Fireflies that never seem to mind the jar.', 'The daily chest', 'common'),
    ornament('paper_cranes', 'Paper Cranes', '🕊️', 'hang', 'A string of folded cranes, turning slowly.', 'The daily chest', 'common'),
]

export const TREASURES: Treasure[] = [...CARE_ITEMS, ...ORNAMENTS]

export function getTreasure(id: string): Treasure | undefined {
    return TREASURES.find((t) => t.id === id)
}

export const isCareItem = (id: string) => CARE_ITEMS.some((t) => t.id === id)
export const isOrnament = (id: string) => ORNAMENTS.some((t) => t.id === id)

/** The ornament each chapter of the charter brings, by the rank it reaches (1…6). */
export const CHARTER_ORNAMENTS = ['carved_heart', 'wishing_ribbons', 'brass_bell', 'string_of_lanterns', 'stone_lantern', 'owl']
/** What each resident brings: a care item with every request, and an ornament once, at ♥♥. */
export const RESIDENT_TREASURES: Record<string, { care: string; ornament: string }> = {
    hollis: { care: 'leaf_mould', ornament: 'birdhouse' },
    maren: { care: 'spring_water', ornament: 'flower_garland' },
    ash: { care: 'pruning_twine', ornament: 'rope_swing' },
    ida: { care: 'beeswax_salve', ornament: 'wind_chime' },
}
/** Hearts with a resident at which they bring their ornament. */
export const RESIDENT_ORNAMENT_HEARTS = 2
/** Ornaments the daily chest can hold. */
export const CHEST_ORNAMENTS = ['firefly_jar', 'paper_cranes']
/** The care item the chest holds when it holds no ornament. */
export const CHEST_CARE = 'beeswax_salve'

/** The care item that meets each need. */
export const CARE_FOR: Record<CareNeed, string> = { water: 'spring_water', nourish: 'leaf_mould', tend: 'pruning_twine' }
