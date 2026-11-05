/**
 * Short, icon-led perk labels for the marketing images. The amounts come from the real
 * catalog (perkAmount), so they follow any rebalance; an unknown perk kind just shows
 * no tag rather than a wrong one. The plugin itself uses the long form (perkText).
 */
import { ICONS } from '../../src/assets/floraAssets'
import { perkAmount } from '../../src/services/Progression'
import type { HomesteadBuilding } from '../../src/types/forest'

export function perkTag(b: HomesteadBuilding, level = 1): string {
    if (!b.perk) return ''
    const v = perkAmount(b, level)
    const { sunlight: sun, coin, flame } = ICONS
    const tags: Record<string, string> = {
        sunlight_pct: `${sun} +${v}% per session`,
        coins_pct: `${coin} +${v}% per session`,
        long_session_sunlight_pct: `${sun} +${v}% on 45m+`,
        night_sunlight_pct: `${sun} +${v}% in the evening`,
        break_sunlight: `${sun} +${v} per break`,
        task_coins: `${coin} +${v} per task`,
        first_tree_coins: `${coin} +${v} first tree`,
        streak_shield: `${flame} ${v} streak shield`,
        vitality_keep_pct: `${flame} fades ${v}% slower`,
        xp_pct: `+${v}% XP`,
        quest_bonus_pct: `+${v}% quest rewards`,
        crop_growth_pct: `crops +${v}% faster`,
    }
    return tags[b.perk.kind] || ''
}

export const stars = (n: number) => (n > 1 ? `<span class="stars">${'★'.repeat(n)}</span>` : '')
