# Forest & Homestead: user guide

A short guide to how the game layer of **Pomodoro Timer Forest** works. For the exact numbers and data schema see the [technical spec](../FOREST_SPEC.md). The [README](../README.md) covers installation and the classic timer features (logging, task tracking, Dataview).

- [The loop in one minute](#the-loop-in-one-minute)
- [Opening things](#opening-things)
- [Growing trees](#growing-trees)
  - [Done early? Harvest early](#done-early-harvest-early)
- [Rewards](#rewards)
- [Levels and unlocks](#levels-and-unlocks)
- [Building your village](#building-your-village)
  - [Garden plots and crops](#garden-plots-and-crops)
  - [Villagers and hens](#villagers-and-hens)
- [Daily quests and achievements](#daily-quests-and-achievements)
- [Streaks, vitality and withering](#streaks-vitality-and-withering)
- [Smart seeds (tags)](#smart-seeds-tags)
- [The Grove journal](#the-grove-journal)
- [Sounds](#sounds)
- [Settings](#settings)
- [Export and sharing](#export-and-sharing)
- [Your data](#your-data)
  - [Uninstalling without losing your progress](#uninstalling-without-losing-your-progress)
  - [Using more than one device](#using-more-than-one-device)
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
| Timer + village panel (right sidebar) | Ribbon icon **Toggle timer panel** (timer), or the command *Open timer panel in the right sidebar* |
| Full-page village | Ribbon icon **Open homestead village** (trees), or the command *Open homestead village (full view)* |
| Start / pause, reset, switch work/break | Commands *Start / pause timer*, *Reset timer*, *Switch timer mode (work / break)*, or click the timer |

Both the sidebar panel and the full page have four tabs: **Village**, **Grove**, **Market** and **Journey**.

## Growing trees

- Click the plant in the timer (while idle) to choose which seed to grow. Only species you have unlocked are listed.
- The plant moves through **seed → sprout → sapling → fully grown** at 0 / 25 / 50 / 75 % of the session, and the ring around it fills up.
- Finish the session and the tree is harvested: sound, petals, a reward card that itemises every bonus.
- **Giving up** (reset, or switching mode mid-session) after the first minute withers the tree, if *Withering* is on. The reset button asks you to confirm first.
- Breaks are rewarded too, so resting is part of the game.

### Done early? Harvest early

Planned 25 minutes but the task took 10? You don't have to sit out the rest of the timer.

When you **tick off the task you are focusing on** during a focus session (in its note, or with the Tasks plugin), the timer panel offers to end the session early. If the panel is hidden you get a notice instead; click it to open the timer.

- **After 5 minutes of focus** (or half the session, for sessions shorter than 10 minutes), *Harvest early* grows a **young tree** for today's grove and pays **75 % of the usual rate for the minutes you focused**, plus your streak and building bonuses.
- **Before that**, *End session* stops the timer without a tree. Nothing withers either way: once the task is done, stopping is finishing, not giving up. Reset and mode switching don't wither the tree any more either.
- **Past the halfway mark** the session also counts as a 🍅 on the task (with task tracking on) and your break starts. Shorter ones go straight back to a fresh focus session for your next task.
- **Keep going** instead and nothing changes: pick your next task from the list and the tree finishes growing as usual.

Finishing a session is always worth more than harvesting early. An early harvest gives **no sapling** for your village and doesn't count toward your **daily goal**, *Grow trees* quests or trees-grown achievements. It does keep your **streak**, adds to your focus minutes (and *Focus for N minutes* quests), and wakes the village a little. Because every minute pays less than it would in a full session, ticking off lots of tiny tasks never beats focusing properly.

Unchecking the task takes the offer back. Switching to another task does the same, and the timer carries on with that task. Turn the feature off with *Early harvest when the task is done* in settings. The command *Harvest focus session early (focused task is done)* does the same as the button.

## Rewards

| Source | Sunlight ☀️ | Coins 🪙 | XP |
|---|---|---|---|
| Focus session | about 1.2 per minute | 1 per 10 minutes | 1 per minute |
| [Early harvest](#done-early-harvest-early) (task done before the timer) | 75 % of the above, for the minutes focused | | |
| First tree of the day | | | +10 |
| Reaching your daily goal | +40 | +5 | +20 |
| Ticking a task `[ ]` → `[x]` | | +3 (+2 if it was a 🍅 task, or the timer's task mid-session) | +5 |
| Finishing a break | Tea Gazebo perk | | +3 |
| Harvesting a [crop](#garden-plots-and-crops) | | 2–15, by crop | 3–18, by crop |
| Each daily quest | 20–35 | 3–4 | 15–25 |
| Daily chest (all three quests) | +60 | +10 | +40, plus a sapling |

On top of that, your **streak** adds up to +20 % Sunlight, and building **perks** add more (see below).

**Tasks:** the plugin watches for a task changing from open to done while you work in a note. Each task pays once per day, up to 30 tasks a day. Pasting in tasks that are already checked pays nothing.

## Levels and unlocks

Everything you do earns XP. Levels unlock species, buildings, biomes and more land:

| Level | Unlocks (examples) |
|---|---|
| 1 | Classic Pine, Sunflower, Campfire, Cobblestone Path, Lantern, Bench |
| 2–4 | Oak, Lavender, Maple, Well, Brook, Footbridge, Tea Gazebo, Garden Plot, Hay Bale, Scarecrow, Chicken Coop, tomatoes, Sakura Grove biome, 6×6 land |
| 5–8 | Cherry Blossom, Willow, Bamboo, Cabin, Torii Gate, Watermill, wheat and pumpkins, Autumn Valley and Alpine Frost biomes |
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
| Friendly Scarecrow | Crops grow + % faster |
| Chicken Coop | + Coins with your first tree of the day (fresh eggs) |

- **Paths, brooks and bridges** shape the ground. Put a footbridge on a brook tile.
- **Biomes** change the ground, foliage and hills. **Land** grows from 5×5 up to 8×8.
- The sky follows your computer's clock: dawn, day, dusk and night, with lights and fireflies after dark.

### Garden plots and crops

A **Garden Plot** (market, level 2, up to six) is a tile of tilled soil with a crop on it. Crops grow with your **focus minutes**, not with the clock:

- Every minute of a focus session (or an early harvest) grows every plot by a minute. A **Friendly Scarecrow** makes that faster.
- Every task you tick off **waters** the garden: each crop grows 5 more minutes.
- A ripe crop shows a gold marker. Click the plot, or **🧺 Harvest** above the village, to pick it. The plot is sown again right away.
- Crops **never wilt**. A ripe crop waits for you as long as it takes, and a plot left alone just pauses.

| Crop | Level | Focus minutes | Harvest |
|---|---|---|---|
| 🥕 Carrots | 1 | 50 | 2 Coins, 3 XP |
| 🍅 Tomatoes | 3 | 100 | 5 Coins, 6 XP |
| 🌾 Golden Wheat | 5 | 150 | 8 Coins, 10 XP |
| 🎃 Pumpkins | 8 | 250 | 15 Coins, 18 XP |

Select a plot to choose its crop. Switching crops keeps the minutes already grown, and stowing a plot picks a ripe crop first. Planting and harvesting both count for the *Tend your village* quest.

### Villagers and hens

Villagers come out as your village gets livelier and gains buildings. They walk around what you build, keep to paths and bridges where they can, stop by the well, the bench or a ripe garden plot, and gather at the campfire after dark. A **Chicken Coop** adds hens that potter around it.

Click a villager and they'll tell you how today is going. They cheer when you finish a tree, a quest or a level.

With *Low animation frame rate* on, or when your system asks for reduced motion, everyone stands still instead.

## Daily quests and achievements

Each morning the *Journey* tab shows **three quests**, picked by date. They are things like *Focus for 75 minutes*, *Check off 3 tasks*, *Take a proper break*, *Focus on a specific task* or *Tend your village*. Finish all three to open the **daily chest**.

There are **20 achievements** (first tree, streaks, focus hours, tasks, breaks, harvests, full plot, and more), each with a reward and a progress bar.

## Streaks, vitality and withering

The game is meant to pull you back gently, not to punish you.

- **Streak:** consecutive days with at least one finished session. A missed day resets it, unless a River Watermill shield covers it.
- **Vitality (0–100 %):** shown as *Thriving / Healthy / Sleepy / Dormant*. It fades by a bit for each day without a session, never below 10 %, and one session lifts it again. It only changes how the village looks: fewer villagers, no chimney smoke, mist. **Nothing is ever destroyed.**
- **Withering:** abandoning a session leaves a withered tree in today's grove. You can turn this off in settings. Ending a session because its task is done never withers: see [Harvest early](#done-early-harvest-early).

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

Under *Settings → Pomodoro Timer Forest → Forest & homestead*:

| Setting | What it does |
|---|---|
| Daily focus goal | Pomodoros that make a "full" day (default 4). Sizes the goal meter and quests. |
| Reward checked-off tasks | Coins and XP for ticking tasks. |
| Early harvest when the task is done | Offer to end a session early when you tick off its task (on by default). |
| Withering (hardcore mode) | Abandoned sessions leave a withered tree. |
| Celebration effects | Petals, sparkles and the reward card. |
| Forest chimes | Synthesized sound effects. |
| Log trees to daily note | Adds a Dataview-friendly line to today's daily note for every tree. |
| Low animation frame rate | Also pauses the village animations. |

The village animations also stop when your system asks for reduced motion.

If daily-note logging is on, each tree adds a line like this:

```markdown
- 🌲 **Pomodoro Forest** (14:35): Draft RFC · [[Projects/Thesis]] · *Cherry Blossom* · [duration:: 25m] [tree:: sakura] [sunlight:: +44] [coins:: +2] [status:: completed]
```

An early harvest logs the same line with `[status:: early]` and the minutes actually focused.

## Export and sharing

In the *Journey* tab:

- **Download village snapshot (.html):** a single self-contained page with your village, stats and recent trees. The scenery is animated; villagers stand still in a snapshot. Open it in any browser or share it.
- **Copy dashboard JSON** (also available as the command *Copy forest data as JSON (for a web dashboard)*): a structured summary (levels, streak, village layout, the last 30 days) for building your own dashboard. The schema is in the [spec](../FOREST_SPEC.md#7-web-dashboard-export-schema).

## Your data

Everything is stored locally in the plugin's `data.json` inside your vault (`.obsidian/plugins/pomodoro-timer-forest/`, or your vault's config folder if you renamed it). It holds your village, XP, streaks, quests, achievements and the plugin's settings. The game makes no network requests and uses no external assets. Data from earlier versions is upgraded automatically, and past focus time is converted into starting XP.

### Uninstalling without losing your progress

**Uninstalling the plugin deletes its folder, and `data.json` with it. Your progress is gone for good.** Disabling the plugin is safe: the file stays where it is.

If you might come back one day, keep a copy of the save file:

1. **Before you uninstall,** copy `.obsidian/plugins/pomodoro-timer-forest/data.json` to somewhere outside the plugin folder (your documents, a cloud drive, a note in the vault).
2. **When you return,** install the plugin again but don't enable it yet. Put the saved `data.json` into `.obsidian/plugins/pomodoro-timer-forest/`, then enable the plugin. If you already enabled it, put the file there and restart Obsidian.

The plugin is still under active development, so the save format can change between versions. Older saves are upgraded automatically when they are loaded, but nothing guarantees that a file from a much older version will load perfectly in a much newer one. Note which plugin version the backup came from (the `version` in `manifest.json`), and if a restore looks wrong, try it on that version first.

*Copy dashboard JSON* and *Download village snapshot* are for sharing, not backups: they cannot be loaded back into the plugin.

### Using more than one device

The plugin does not sync anything itself. Your whole game is that one `data.json`, so whatever syncs your vault (Obsidian Sync, the Git plugin, Syncthing…) carries your progress between devices, with no manual export or import. Make sure your sync setup includes `.obsidian/plugins/pomodoro-timer-forest/data.json`. Some setups skip the config folder or plugin settings by default, and Git users should check the file is not in `.gitignore`.

What the plugin does to play well with your sync tool:

- When the sync tool updates `data.json` while Obsidian is open, the new progress is loaded right away, without a restart.
- It never saves over a newer `data.json` it has not loaded yet. The synced file wins.
- Opening Obsidian does not rewrite the file. Only real progress does, so pulls don't conflict with a file that merely got opened.
- Pending progress is saved before the app goes to the background, so the sync tool can pick it up.
- If the file is damaged or contains merge-conflict markers, the plugin pauses with a notice instead of starting a fresh game over it. Keep one version of the file in your sync tool, then reload the plugin.

For the smoothest experience, let the sync finish before you play on the other device, and keep the same plugin version on every device.

## Troubleshooting

- **Nothing rewards me for ticking tasks.** Check that *Reward checked-off tasks* is on. Only tasks that change from `[ ]` to `[x]` while the note is open count, and each task counts once per day.
- **I can't hear the ambient sound.** Pick it from the drop-down under the timer. You should get a 5-second preview. Also check your system volume; browsers only play audio after you have interacted with the app.
- **A building or species is greyed out.** It unlocks at a higher village level; the card says which.
- **I want a fresh start.** Run the command *Reset forest progress (debug)*. This wipes your progress.
