# Obsidian Pomodoro Forest & Homestead: Technical Specification (PRD)

## 1. System Architecture

```
                      +-----------------------------+
                      |   Obsidian App / Workspace   |
                      +--------------+--------------+
                                     |
                         +-----------v-----------+
                         | PomodoroTimerPlugin   | (Plugin Lifecycle & Commands)
                         +-----------+-----------+
                                     |
              +----------------------+----------------------+
              |                                             |
   +----------v----------+                       +----------v----------+
   |   StorageManager    |                       |     Timer Engine    |
   | (Atomic data.json)  |                       | (clock.worker.ts)   |
   +----------+----------+                       +----------+----------+
              |                                             |
   +----------v----------+                                  |
   |    Forest Engine    |<---------------------------------+
   | (Gamification/Flora)|  (On start: seed, tick: grow, complete: harvest, abort: wither)
   +----+------+----+----+
        |      |    |
        |      |    +------------------------+
        |      |                             |
   +----v------+---v----+               +----v--------------------+
   |   SoundManager     |               |     ConfettiEngine      |
   | (Web Audio Chimes, |               | (Canvas Petals, Stars & |
   |  Rain, Stream, Wind)|              |  Sparkles Celebration)  |
   +--------------------+               +-------------------------+
              |
   +----------v---------------------------------------------+
   |               Svelte Component Layer                   |
   | - TimerViewComponent (Dial + Growth Preview + Canvas)  |
   | - ForestComponent (Grove + Homestead + Nursery + Stats)|
   | - HomesteadView (Full Workspace Leaf Tab)              |
   | - HtmlExportService (Web Snapshot Generator)           |
   +--------------------------------------------------------+
```

### Key Principles
1. **Single Source of Truth:** `StorageManager` encapsulates reading and writing `data.json`. Neither `Settings` nor `Forest` touches `plugin.saveData()` directly. This prevents data wipes.
2. **Offline-First & Zero Dependencies:** Everything operates strictly inside the vault with pure vector SVGs and native Web Audio synthesis. No external network requests or heavy binary assets required.
3. **Decoupled Growth State:** The active timer drives a normalized progress metric `growthProgress` (0.0 to 1.0) derived by the `Timer` store, allowing visual components to render exact growth stages reactively.
4. **Export Readiness:** `HtmlExportService` and `generateExportPayload()` produce standardized JSON schemas and self-contained HTML bundles that can be rendered independently in any web browser or uploaded to an online dashboard.

---

## 2. Core Game Loop

The loop is designed to pull you back daily without punishing you for resting.

| Action | Sunlight ☀️ | Coins 🪙 | XP | Other |
|---|---|---|---|---|
| Finish a focus session (25m) | ~30 (1.2/min) | ~2 (1 per 10m) | 1/min | +1 sapling of the species grown, +12 vitality |
| First tree of the day | | | +10 | |
| Reach the daily goal (setting, default 4) | +40 | +5 | +20 | |
| Streak bonus | +2% per streak day (max +20%) | | | |
| Check off a markdown task `[ ]`→`[x]` | | 3 (+2 if it had 🍅) | 5 | +2 vitality, max 30 rewarded/day, each task once/day |
| Finish a break | Tea Gazebo perk | | 3 | |
| Daily quest (3/day, deterministic by date) | 20–35 | 3–4 | 15–25 | Auto-claimed |
| Daily chest (all 3 quests) | 60 | 10 | 40 | + random unlocked sapling |
| Achievement (18) | varies | varies | varies | |
| Level up | 25 × level | 3 × level | | Unlocks species, buildings, biomes, land |

- **Sunlight** comes from focus; **Coins** mostly from tasks and quests. Tasks are worth ticking off.
- **Levels**: total XP to reach level *L* is `50·(L−1)·L` (L2 = 100, L5 = 1000, L10 = 4500).
- **Vitality (0–100)** fades 15 per day with zero sessions, never below 10, slowed by the Hearth Campfire. It changes how the village looks: villagers, chimney smoke, fireflies, butterflies, saturation and mist. **Nothing is ever destroyed.**
- **Streak**: breaks after a missed day unless the River Watermill has shields left this month.
- **Withering** (setting): giving up a work session after the first minute leaves a withered tree in today's grove. The UI asks for confirmation first.
- **Village building**: every finished session puts a sapling of the tree you grew into your inventory. Purchases also go into inventory and are then placed on a tile. Items can be moved, stowed back to inventory and upgraded. Paths, brooks and decorations can be bought repeatedly. Land expands from 5×5 to 8×8.

## 3. Flora Catalog

| Species ID | Name | Category | Level | Cost (☀️ / 🪙) | Charm |
|---|---|---|---|---|---|
| `classic_pine` | Classic Pine | Tree | 1 | Free | 2 |
| `sunflower` | Sunflower Grove | Flower | 1 | 60 / 5 | 2 |
| `ancient_oak` | Ancient Oak | Tree | 2 | 120 / 10 | 3 |
| `lavender` | Lavender Field | Flower | 3 | 150 / 12 | 2 |
| `autumn_maple`| Autumn Maple | Tree | 4 | 220 / 18 | 3 |
| `sakura` | Cherry Blossom | Tree | 5 | 260 / 22 | 4 |
| `willow` | Weeping Willow | Tree | 6 | 300 / 25 | 4 |
| `bamboo` | Bamboo Grove | Zen | 7 | 350 / 30 | 3 |
| `bonsai` | Zen Bonsai | Zen | 9 | 450 / 40 | 5 |
| `mushroom_circle` | Fairy Ring | Rare | 11 | 600 / 55 | 6 |
| `golden_tree` | Celestial Gold Tree | Rare | 14 | 1000 / 90 | 10 |

Placed trees can be nurtured up to ★★★ (40·lvl ☀️ / 4·lvl 🪙) and render larger.

## 4. Homestead Structures, Perks & Biomes

Perks scale with level: `base + perLevel × (level − 1)`. Upgrade cost: `0.6 × price × currentLevel`. Repeat copies of the same building do not stack; the strongest one counts.

| Structure | Lvl | Cost | Unique | Max ★ | Perk (base / per level) |
|---|---|---|---|---|---|
| Hearth Campfire (starter) | 1 | 120 / 10 | ✓ | 5 | Village fades 20% (+10%) slower |
| Cobblestone Path | 1 | 15 / 1 | | 1 | — (ground tile) |
| Stone Lantern | 1 | 60 / 6 | | 3 | +10% (+5%) Sunlight 19:00–05:00 |
| Garden Bench | 1 | 80 / 8 | | 3 | +1 (+1) Coin per task |
| Babbling Brook | 2 | 25 / 2 | | 1 | — (water tile) |
| Village Well | 2 | 200 / 20 | ✓ | 5 | +10% (+5%) Coins per session |
| Wooden Footbridge | 3 | 120 / 12 | | 1 | — (sits on water) |
| Tea Gazebo | 4 | 320 / 30 | ✓ | 5 | +5 (+3) Sunlight per finished break |
| Cozy Cabin | 5 | 450 / 45 | ✓ | 5 | +10% (+5%) Sunlight per session |
| Torii Gate | 6 | 400 / 40 | ✓ | 5 | +20% (+10%) quest rewards |
| River Watermill | 8 | 700 / 65 | ✓ | 3 | 1 (+1) streak shield per month |
| Glass Conservatory | 10 | 850 / 80 | ✓ | 5 | +15% (+10%) XP |
| Dutch Windmill | 12 | 800 / 80 | ✓ | 5 | +20% (+10%) Sunlight on 45m+ sessions |

Land: 6×6 at level 3 (300/30), 7×7 at level 7 (700/70), 8×8 at level 12 (1400/140).

### Biomes (unlocked by level)
- 🌿 **Emerald Meadow** (1): lush green turf with wildflowers.
- 🌸 **Sakura Grove** (3): pink petals on soft grass.
- 🍂 **Autumn Valley** (5): amber earth with fallen leaves.
- ❄️ **Alpine Frost** (8): snowy ground and rocks.
- 🌌 **Twilight Sanctuary** (12): indigo moss that always glows.

### Visuals
The village and the daily grove render as an isometric floating island (`src/render/VillageScene.ts`). The sky follows the real time of day: dawn, day, dusk and night, with sun/moon, stars and drifting clouds. After dusk, lit windows and lanterns cast glows. Windmill sails, the watermill wheel, chimney smoke, flames, water and trees are animated with CSS. Villagers wander between open tiles. All animation stops with *Low animation frame rate* or `prefers-reduced-motion`.

## 5. Smart Tag Auto-Detection Rules
When a focus session starts, the plugin collects hashtags from the tracked task, its text, and the note (frontmatter + inline tags). The first tag mapped to an unlocked species picks the seed (and counts toward the "#tagged" quest):
- `#code`, `#dev`, `#programming` $\to$ `classic_pine`
- `#write`, `#writing`, `#draft`, `#blog` $\to$ `sakura`
- `#study`, `#reading`, `#research` $\to$ `ancient_oak`
- `#zen`, `#meditate`, `#review` $\to$ `bonsai`
- `#creative`, `#design`, `#art` $\to$ `autumn_maple`
- `#sprint`, `#quick`, `#urgent` $\to$ `sunflower`

---

## 6. Dataview-Compatible Daily Note Format
When enabled in settings, completing a Pomodoro appends the following structured inline-field markdown to the daily note:
```markdown
- 🌲 **Pomodoro Forest** (14:35): [[Task Name]] · *Cherry Blossom* · [duration:: 25m] [tree:: sakura] [sunlight:: +30] [coins:: +2] [status:: completed]
```
Users can query their entire focus history across daily notes via Dataview:
```dataview
TABLE duration, tree, sunlight, coins
FROM "Daily Notes"
WHERE tree
SORT file.name DESC
```

---

## 7. Web Dashboard Export Schema
```json
{
  "$schema": "https://obsidian-pomodoro-forest.dev/schemas/v1/export.json",
  "exportTimestamp": 1727617000000,
  "pluginVersion": "2.0.0",
  "activeBiome": "sakura_garden",
  "streak": {
    "current": 14,
    "longest": 21,
    "lastCheckInDate": "2026-09-29"
  },
  "lifetimeStats": {
    "totalFocusMinutes": 2450,
    "totalPomodoros": 98,
    "treesGrown": 94,
    "treesWithered": 4
  },
  "homestead": [
    { "id": "b_1", "itemType": "building", "itemId": "cabin", "gridX": 2, "gridY": 2, "level": 2 },
    { "id": "t_1", "itemType": "tree", "itemId": "sakura", "gridX": 1, "gridY": 2, "level": 1 }
  ],
  "dailyLogsSummary": [
    {
      "date": "2026-09-29",
      "totalMinutes": 75,
      "completedPomodoros": 3,
      "trees": [
        {
          "id": "tree_101",
          "speciesId": "sakura",
          "plantedAt": "2026-09-29T10:30:00.000Z",
          "durationMinutes": 25,
          "status": "mature",
          "taskText": "Draft Architecture RFC"
        }
      ]
    }
  ]
}
```
