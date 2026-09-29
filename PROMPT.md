# Master Prompt: Obsidian Pomodoro Forest & Homestead

## Context & Vision
You are working on the **Obsidian Pomodoro Forest & Homestead** plugin. This plugin enhances the classic Pomodoro technique inside Obsidian by combining the focus-retention psychology of the **Forest** app (planting trees through focus sessions, withering if abandoned) with a **Homestead / Village building** gamification layer (spending focus currency on cabins, watermills, wells, and arranging customizable village plots). It seamlessly links with Obsidian notes, markdown tasks (`- [ ] task #pomodoro`), and daily notes, with full readiness for exporting to an online dashboard.

---

## High-Level Capabilities & Game Loop

### 1. Focus Session Lifecycle (The Forest Mechanic)
- **Seed Selection & Smart Tag Auto-Detection:**
  - When initiating a Pomodoro session, the user can manually pick a flora seed or let the plugin automatically detect it based on active note/task tags:
    - `#code`, `#dev` → **Classic Pine**
    - `#write`, `#writing` → **Cherry Blossom (Sakura)**
    - `#study`, `#reading` → **Ancient Oak**
    - `#zen`, `#meditate`, `#review` → **Zen Bonsai**
    - `#creative`, `#art` → **Autumn Maple**
    - `#sprint`, `#quick` → **Sunflower Grove**
- **Real-Time Dynamic Growth:**
  - The circular timer displays the plant growing in real time across 4 organic stages:
    - Stage 1 (0% - 25%): Seed in fertile soil
    - Stage 2 (25% - 50%): Tender green sprout
    - Stage 3 (50% - 75%): Young sapling
    - Stage 4 (75% - 100%): Full bloom mature tree
  - Accompanied by a gentle breathing scale animation while the timer is running.
- **Harvest & Celebration:**
  - Upon session completion:
    - A procedural pentatonic harp celebration chime plays (via native Web Audio API).
    - Floating celebration particles (petals, golden sparkles) drift across the timer.
    - Mature tree is recorded into today's Forest log with session metadata (note name, task text, duration, timestamp).
    - Sunlight (☀️) and Coins (🪙) are awarded with streak and homestead structure bonuses.
    - Linked markdown task count is incremented.
    - An optional Dataview-compatible entry is appended to today's Daily Note:
      `- 🌲 **Pomodoro Forest** (14:30): [[Task]] · *Cherry Blossom* · [duration:: 25m] [tree:: sakura] [sunlight:: +30] [coins:: +2] [status:: completed]`
- **Withered Tree Mechanic (Hardcore Mode):**
  - If a session is abandoned/reset halfway through (after >1 minute), a withered dead tree trunk is planted into today's grove, reinforcing commitment to deep work.

### 2. Procedural Web Audio Soundscapes (Zero Dependencies)
- Pure Web Audio API synthesizers:
  - **Chimes:** Soothing planting chime and joyful harvest chord.
  - **Snap:** Dry branch snap upon session abandonment.
  - **Ambient Focus Audio:** High-fidelity procedural rain, forest stream, and gentle breeze soundscapes generated in real-time with zero external audio assets.

### 3. Homestead Village Builder & Biomes
- **Interactive 5x5 Village Plot:**
  - Users arrange unlocked buildings, landmarks, paths, and trees.
  - Placed items show star level indicators (★, ★★, ★★★) and can be upgraded for higher perk bonuses.
- **Biomes:**
  - 🌿 **Emerald Meadow**: Lush green grass and vibrant wildflower soil.
  - 🌸 **Sakura Grove**: Delicate pink fallen petals and peaceful zen gravel.
  - 🍂 **Autumn Valley**: Warm golden amber earth with crisp seasonal foliage.
  - ❄️ **Alpine Frost**: Crisp mountain air and snow-dusted pine soil.
  - 🌌 **Twilight Sanctuary**: Mystical deep indigo soil with bioluminescent flora.
- **Village Structures & Perks:**
  - Cozy Cabin (+15% Sunlight boost)
  - River Watermill (Protects 1 missed streak day per month)
  - Village Well (+10% Coins boost)
  - Dutch Windmill (+20% Sunlight on 45m+ sessions)
  - Torii Sacred Gate (Zen focus state)
  - Glass Conservatory, Tea Gazebo, Footbridge, Campfire, Stone Lantern, Cobblestone Paths, and Babbling Brook.

### 4. Groves Timeline & Historical Archive
- **Date Navigation:** Back and forward timeline navigator to inspect any past day's forest.
- **Interactive Tree Cards:** Clicking any planted tree reveals session metadata and opens the linked Obsidian note in the active workspace.
- **Streak & Health Tracking:** Tracks daily streaks, lifetime focus hours, pomodoros finished, and tree health ratio.

### 5. Web Dashboard & Standalone HTML Export
- **JSON Payload:** Standardized universal JSON schema ready for cross-device syncing or cloud community leaderboards.
- **Standalone HTML Snapshot:** One-click generation and download of a complete, interactive, responsive HTML file showcasing the user's village, active biome, and recent harvests for viewing in any web browser.

### 6. Workspace View Modes
- **Sidebar Timer Panel:** Compact circular timer with flora avatar, quick species picker, and expandable tabs.
- **Full Homestead Workspace Tab (`VIEW_TYPE_HOMESTEAD`):** Command `Open Homestead Village (Full View)` opens the village plot in a full-sized editor tab.

---

## Architectural Architecture

```
src/
├── main.ts                     # Plugin lifecycle, view registration, ribbon & commands
├── HomesteadView.ts            # Full workspace leaf view for Homestead Village
├── TimerView.ts                # Sidebar leaf view for Timer & Forest tabs
├── types/
│   └── forest.ts               # PluginData, FloraSpecies, HomesteadBuilding, PlacedItem, Biomes
├── services/
│   ├── StorageManager.ts       # Atomic unified persistence (prevents settings/forest overwrites)
│   ├── ForestEngine.ts         # Session lifecycle, currencies, streaks, tag detection, daily notes
│   ├── SoundManager.ts         # Web Audio procedural chimes & ambient soundscapes (rain, stream, breeze)
│   ├── ConfettiEngine.ts       # Canvas celebration petal & sparkle particle engine
│   └── HtmlExportService.ts    # Standalone HTML village snapshot generator
├── stores.ts                   # Svelte stores backed by StorageManager & ForestEngine
├── Timer.ts                    # Pomodoro state machine with worker clock and forest hooks
├── Settings.ts                 # Settings tab safely saving via StorageManager
├── components/
│   ├── TimerViewComponent.svelte # Circular progress timer with dynamic growing plant avatar
│   └── forest/
│       └── ForestComponent.svelte # Grove view, Homestead builder, Nursery shop, Stats, Export
└── assets/
    ├── floraAssets.ts          # Cohesive vector SVGs for growth stages, species, buildings, biomes
    └── floraCatalog.ts         # Item metadata, costs, perks, categories
```

---

## Verification & Build
To build and validate the plugin:
```bash
npm run build
```
This runs TypeScript checking (`tsc -noEmit -skipLibCheck`) and esbuild production bundling (`node esbuild.config.mjs production`), generating `main.js`.
