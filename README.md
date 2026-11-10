<div align="center">

<img src="assets/logo.svg" alt="Choir icon" width="96" />

# Choir

[![Version](https://img.shields.io/badge/version-1.1.9--staging.64-blue.svg)](https://github.com/patatasbravasch-arch/Choir/tree/lunch-test)
[![Platform](https://img.shields.io/badge/platform-Lumiverse%20Spindle-purple.svg)](https://docs.lumiverse.chat/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A Lumiverse Spindle extension that reads your story aloud with a voice for every character, plus sound effects, ambience and background music.

</div>

Choir works out who says each line of a reply, gives every speaker their own voice, and plays the result in order. Audio is cached on your device, so replays and small edits cost nothing extra.

## Features

- **A voice per character.** Cast the narrator, your persona and any number of characters, by hand or automatically. Use one TTS connection for everyone or a different one per character.
- **Three ways to find the speaker.** *Heuristic* runs on your device with no LLM call. *Jev* uses a Lumiverse Decision connection. *Standard LLM* casts a whole reply in one request. **Plan inside the reply** lets the model writing the reply do the casting itself.
- **Acting.** Each line gets a short delivery direction; the **Acting** control (Playback → Reading) turns every character's acting down or up.
- **Sound.** Sound effects and looping ambience from Freesound, and royalty-free background music from incompetech.
- **A floating mixer.** Play, pause, skip, seek, per-character volume and speed, and quick switches for automatic planning and playback.
- **Read-along.** Highlights the passage or word being spoken and can scroll the chat to follow it.
- **Skip what isn't story.** Trackers, status panels and reasoning are left out automatically; add your own tags, classes, IDs or text markers such as `[POV]`.
- **Downloads.** Save a played message as one WAV, or a whole chat as a ZIP.
- **Companion bridge.** `window.__CHOIR_API__` lets reading interfaces such as Cue plan and play paragraphs.

## Install

1. In Lumiverse, open **Extensions → Add → Install from source**.
2. Enter `https://github.com/patatasbravasch-arch/Choir` and pick a branch: `staging` for the tested release, `lunch-test` for the newest changes.
3. Enable **Choir** and grant its permissions when asked.

The repository includes built bundles in `dist/`, so no build step is needed. For a local copy on Windows:

```powershell
.\Install.ps1 -LumiverseDataDirectory "C:\path\to\Lumiverse\data"
```

On other systems, copy `spindle.json`, `package.json`, `dist/`, `assets/` and `icon.svg` into `data/extensions/choir/`, then use **Extensions → Add → Import local**.

## First setup

Choir speaks through the TTS connections saved in Lumiverse, so add one there first.

1. Open **Choir** from the drawer and choose **Set up Choir**. It walks you through the speech connection, the planner and the three lead voices; nothing is saved until you finish.
2. Open a chat, press **Plan latest**, then **Play**.
3. Optional: add a Freesound API key under **Playback → Soundscape** for sound effects and ambience.

New to Fish Audio or Freesound? See the [step-by-step setup guides](docs/setup-guides.md).

## Where things are

| You want to… | Look in |
|---|---|
| Change a character's voice, accent or base style | **Cast** → Edit |
| Turn acting down or up, highlight spoken text | **Playback → Reading** |
| Switch sound effects, ambience or music on | **Playback → Soundscape** |
| Choose the planner, or plan inside the reply | **Settings → Planner** |
| Skip tags, panels or text markers | **Settings → Text filters** |
| Speed up playback (prefetch, parallel requests) | **Settings → Performance** |
| Replay, download or delete saved audio | **Saved** |

## Documentation

- [Reference](docs/reference.md): every feature in detail, including the mixer, grouped speech, sound effects, retention, downloads and the companion bridge.
- [Setup guides](docs/setup-guides.md): Fish Audio and Freesound, with pictures.
- [Onboarding](ONBOARDING.md): storage, migration and compatibility.
- [Changelog](CHANGELOG.md): what changed in each release.

## Troubleshooting

- **Nothing new after an update:** restart Choir in Extensions, then hard-refresh the page.
- **"Unable to verify the first certificate":** start Lumiverse with `NODE_USE_SYSTEM_CA=1`; details are in the [reference](docs/reference.md#certificate-errors-when-planning-or-playing).
- **HTTP 524 from the relay:** try 1800 characters per request and 1 concurrent TTS request under **Settings → Performance**.
- **Sound effects skipped:** check the Freesound key; speech always continues without them.

## Development

Edit `src/`, then rebuild the committed bundles and run the tests:

```bash
npm ci
npm run build
npm test
```

The full run takes about 20 minutes. While iterating, run one file, for example `node --test tests/backend.test.mjs`. The `tests/*.chromium.mjs` scripts are optional real-browser checks that need Playwright, which is not a project dependency.

This is the **lunch-test** line of the original Choir repository. Changes are tested here before they move to `staging` and `main`.

Music by Kevin MacLeod ([incompetech.com](https://incompetech.com/music/royalty-free/)), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
