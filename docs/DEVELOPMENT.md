# Development

How to build, test and release **Pomodoro Timer Forest**. For how the game works under the hood (numbers, data schema, the board format) read the [technical spec](../FOREST_SPEC.md); [PROMPT.md](../PROMPT.md) holds the original design brief.

## Build

```bash
npm install
npm run dev     # watch build
npm run build   # type-check and production bundle
```

The build writes `main.js` next to `manifest.json` and `styles.css`. To try it in a vault, copy (or symlink) those three files into `<your vault>/.obsidian/plugins/pomodoro-timer-forest/` and reload the plugin.

## Tests

```bash
npm test               # every tests/*.test.ts
npm test -- hyperfocus # only the files whose name contains "hyperfocus"
```

Each test file is bundled with esbuild first (the sources import Svelte, `styles.css` and the `obsidian` module, which only exists inside Obsidian; the README screenshot stub stands in for it) and then run with Node's built-in test runner.

## README images

The screenshots in `docs/images/` are rendered from the plugin's real components and renderer, using a sample level-14 village. Regenerate them with:

```bash
node scripts/readme-images/build.mjs
```

It needs Google Chrome. Set `CHROME=/path/to/chrome` if it isn't in the default macOS location.

## Releasing

1. Bump the version: `npm version <x.y.z> --no-git-tag-version`. This also updates `manifest.json` and `versions.json`.
2. Commit, then tag and push: `git tag <x.y.z> && git push origin <x.y.z>`.
3. If the tag push didn't start it, run the workflow by hand: `gh workflow run release.yml --ref <x.y.z>`.

The [release workflow](../.github/workflows/release.yml) checks that the tag equals the manifest version, runs the tests, builds the plugin from the lockfile, attests `main.js`, `manifest.json` and `styles.css`, and publishes the GitHub release with generated notes.
