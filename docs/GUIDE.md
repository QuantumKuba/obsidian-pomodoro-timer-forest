# Forest & Homestead: user guide

A short guide to how the game layer of **Pomodoro Timer Forest** works. For the exact numbers and data schema see the [technical spec](../FOREST_SPEC.md). The [README](../README.md) covers installation and the classic timer features (logging, task tracking, Dataview).

- [The loop in one minute](#the-loop-in-one-minute)
- [Opening things](#opening-things)
- [Growing trees](#growing-trees)
- [Rewards](#rewards)
- [Levels and unlocks](#levels-and-unlocks)
- [Building your village](#building-your-village)
- [Daily quests and achievements](#daily-quests-and-achievements)
- [Streaks, vitality and withering](#streaks-vitality-and-withering)
- [Smart seeds (tags)](#smart-seeds-tags)
- [The Grove journal](#the-grove-journal)
- [Sounds](#sounds)
- [Settings](#settings)
- [Export and sharing](#export-and-sharing)
- [Your data](#your-data)
- [Troubleshooting](#troubleshooting)

## The loop in one minute

1. **Start a focus session.** A seed is planted in the timer.
2. **Stay with it.** The plant grows through four stages as the minutes pass.
3. **Harvest.** You earn ☀️ Sunlight, 🪙 Coins and XP, and a sapling of the tree you grew.
4. **Spend and place.** Buy buildings, plant your saplings, upgrade things. Perks make the next session pay more.
5. **Come back tomorrow.** Fresh quests, a streak to keep, and a village that is happiest when you visit.

## Opening things

| What | How |
|---|---|
| Timer + village panel (right sidebar) | Ribbon icon **Pomodoro Timer Forest** (timer), or the command *Open Pomodoro Forest (Right Sidebar)* |
| Full-page village | Ribbon icon **Open Homestead Village** (trees), or the command *Open Homestead Village (Full View)* |
| Start / pause, reset, switch work/break | Commands *Start / Pause Timer*, *Reset Timer*, *Switch Timer Mode*, or click the timer |

Both the sidebar panel and the full page have four tabs: **Village**, **Grove**, **Market** and **Journey**.

## Growing trees

- Click the plant in the timer (while idle) to choose which seed to grow. Only species you have unlocked are listed.
- The plant moves through **seed → sprout → sapling → fully grown** at 0 / 25 / 50 / 75 % of the session, and the ring around it fills up.
- Finish the session and the tree is harvested: sound, petals, a reward card that itemises every bonus.
- **Giving up** (reset, or switching mode mid-session) after the first minute withers the tree, if *Withering* is on. The reset button asks you to confirm first.
- Breaks are rewarded too, so resting is part of the game.

## Rewards

| Source | Sunlight ☀️ | Coins 🪙 | XP |
|---|---|---|---|
| Focus session | about 1.2 per minute | 1 per 10 minutes | 1 per minute |
| First tree of the day | | | +10 |
| Reaching your daily goal | +40 | +5 | +20 |
| Ticking a task `[ ]` → `[x]` | | +3 (+2 if it was a 🍅 task) | +5 |
| Finishing a break | Tea Gazebo perk | | +3 |
| Each daily quest | 20–35 | 3–4 | 15–25 |
| Daily chest (all three quests) | +60 | +10 | +40, plus a sapling |

On top of that, your **streak** adds up to +20 % Sunlight, and building **perks** add more (see below).

**Tasks:** the plugin watches for a task changing from open to done while you work in a note. Each task pays once per day, up to 30 tasks a day. Pasting in tasks that are already checked pays nothing.

## Levels and unlocks

Everything you do earns XP. Levels unlock species, buildings, biomes and more land:

| Level | Unlocks (examples) |
|---|---|
| 1 | Classic Pine, Sunflower, Campfire, Cobblestone Path, Lantern, Bench |
| 2–4 | Oak, Lavender, Maple, Well, Brook, Footbridge, Tea Gazebo, Sakura Grove biome, 6×6 land |
| 5–8 | Cherry Blossom, Willow, Bamboo, Cabin, Torii Gate, Watermill, Autumn Valley and Alpine Frost biomes |
| 9–14 | Bonsai, Fairy Ring, Celestial Gold Tree, Conservatory, Windmill, Twilight Sanctuary biome, 8×8 land |

The full table lives in the [spec](../FOREST_SPEC.md#3-flora-catalog).

## Building your village

- **Inventory.** Every finished session gives you a sapling of the species you grew. Buildings you buy also go to your inventory. Open the *Village* tab, pick an item, then tap an empty tile.
- **Select** any placed item to see what it does, then **Upgrade**, **Move** or **Stow** it back into your inventory. Press `Esc` to cancel placing.
- **Perks** are real and scale with upgrades. Two copies of the same building don't stack; the strongest counts.

| Building | Perk |
|---|---|
| Cozy Cabin | + % Sunlight on every session |
| Village Well | + % Coins on every session |
| Dutch Windmill | + % Sunlight on sessions of 45 min or more |
| Stone Lantern | + % Sunlight for evening sessions (19:00–05:00) |
| Garden Bench | + Coins for every task you tick |
| Tea Gazebo | + Sunlight for every finished break |
| Torii Gate | + % daily quest rewards |
| Glass Conservatory | + % XP from everything |
| River Watermill | Streak shields for days you rest |
| Hearth Campfire | The village fades more slowly on days off |

- **Paths, brooks and bridges** shape the ground. Put a footbridge on a brook tile.
- **Biomes** change the ground, foliage and hills. **Land** grows from 5×5 up to 8×8.
- The sky follows your computer's clock: dawn, day, dusk and night, with lights and fireflies after dark.

## Daily quests and achievements

Each morning the *Journey* tab shows **three quests**, picked by date. They are things like *Focus for 75 minutes*, *Check off 3 tasks*, *Take a proper break*, *Focus on a specific task* or *Tend your village*. Finish all three to open the **daily chest**.

There are **18 achievements** (first tree, streaks, focus hours, tasks, breaks, full plot, and more), each with a reward and a progress bar.

## Streaks, vitality and withering

The game is meant to pull you back gently, not to punish you.

- **Streak:** consecutive days with at least one finished session. A missed day resets it, unless a River Watermill shield covers it.
- **Vitality (0–100 %):** shown as *Thriving / Healthy / Sleepy / Dormant*. It fades by a bit for each day without a session, never below 10 %, and one session lifts it again. It only changes how the village looks: fewer villagers, no chimney smoke, mist. **Nothing is ever destroyed.**
- **Withering:** abandoning a session leaves a withered tree in today's grove. You can turn this off in settings.

## Smart seeds (tags)

When a session starts, the plugin looks at the tags on the task you are tracking, on the task text, and on the note. The first tag that has a mapping to a species you have unlocked picks the seed:

| Tags | Seed |
|---|---|
| `#code` `#dev` | Classic Pine |
| `#write` `#writing` | Cherry Blossom |
| `#study` `#reading` | Ancient Oak |
| `#zen` `#meditate` | Zen Bonsai |
| `#creative` | Autumn Maple |
| `#sprint` | Sunflower Grove |

Mappings are stored in the plugin's `data.json` under `gamification.tagMappings` if you want to change them.

## The Grove journal

The *Grove* tab shows the trees you grew on any day as a small island. Use the arrows to browse past days, click a tree to see its task and note, then click the card to open the note. A four-week activity map at the bottom jumps you to any day.

## Sounds

- **Forest chimes** for planting, harvesting and levelling up, generated in the browser, with no audio files.
- **Ambient soundscapes** while you focus: rain, a forest stream, or a breeze. Choose one from the drop-down under the timer; when the timer is idle you get a short preview.

## Settings

Under *Settings → Pomodoro Timer Forest → Forest & Homestead*:

| Setting | What it does |
|---|---|
| Daily focus goal | Pomodoros that make a "full" day (default 4). Sizes the goal meter and quests. |
| Reward checked-off tasks | Coins and XP for ticking tasks. |
| Withering (hardcore mode) | Abandoned sessions leave a withered tree. |
| Celebration effects | Petals, sparkles and the reward card. |
| Forest chimes | Synthesized sound effects. |
| Log trees to daily note | Adds a Dataview-friendly line to today's daily note for every tree. |
| Low Animation FPS | Also stops the village animations. |

The village animations also stop when your system asks for reduced motion.

If daily-note logging is on, each tree adds a line like this:

```markdown
- 🌲 **Pomodoro Forest** (14:35): Draft RFC · [[Projects/Thesis]] · *Cherry Blossom* · [duration:: 25m] [tree:: sakura] [sunlight:: +44] [coins:: +2] [status:: completed]
```

## Export and sharing

In the *Journey* tab:

- **Download village snapshot (.html):** a single self-contained page with your animated village, stats and recent trees. Open it in any browser or share it.
- **Copy dashboard JSON** (also available as the command *Export Forest Data*): a structured summary (levels, streak, village layout, the last 30 days) for building your own dashboard. The schema is in the [spec](../FOREST_SPEC.md#7-web-dashboard-export-schema).

## Your data

Everything is stored locally in the plugin's `data.json` inside your vault (`.obsidian/plugins/pomodoro-timer-forest/`). The game makes no network requests and uses no external assets. Data from earlier versions is upgraded automatically, and past focus time is converted into starting XP.

## Troubleshooting

- **Nothing rewards me for ticking tasks.** Check that *Reward checked-off tasks* is on. Only tasks that change from `[ ]` to `[x]` while the note is open count, and each task counts once per day.
- **I can't hear the ambient sound.** Pick it from the drop-down under the timer. You should get a 5-second preview. Also check your system volume; browsers only play audio after you have interacted with the app.
- **A building or species is greyed out.** It unlocks at a higher village level; the card says which.
- **I want a fresh start.** Run the command *Reset Pomodoro Forest (Debug)*. This wipes your progress.
