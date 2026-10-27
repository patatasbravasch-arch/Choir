# Choir drawer

Version: **1.1.6-staging.45**. Branch: **lunch-test**.

## Using the drawer

| Tab | What belongs here |
| --- | --- |
| Cast | Compact character rows. Edit opens one voice page with connection, voice, accent and delivery. Pronunciation and individual speed have a secondary page. Absent characters retain their settings under Other characters. |
| Sound | Music, ambience, effects, reading, playback speed/gaps and Customize mixer. |
| Saved | Recent message recordings, Replay, per-message download, Download all, retention and clearing chat audio. |
| Setup | Setup wizard, connections, planner and auto-plan/auto-play. Advanced settings holds buffering, filtering and cast import/export. |

Play/pause/resume, Plan latest and Open mixer stay available above every tab. A download icon appears there when the latest reply has a complete saved playback. Errors and Stop remain accessible. Tabs support arrow keys, Home and End.

**Cast removal:** optional characters have a remove icon beside Edit. Opening their editor shows the full **Remove** label beside the audition control. Narrator and persona cannot be removed. Removal clears remembered copies and voice choices on every connection and stops card discovery from immediately recreating the row. Exact-name duplicates are repaired on load/save, retaining the first saved voice, connection and preferences; different names and shared aliases do not trigger a merge. New names that collide with another cast entry are not saved.

**Sound → Customize mixer** controls visibility, quick-button order and **Buttons per row** (Automatic or 1–7). Follow narration, Message controls and Channel levels remain optional. Hidden controls keep their settings. Reset mixer layout preserves audio levels, limits, speeds and gaps. **Volume limits** sets ceilings for Master (1–100%) and Voices, Music, Ambience and Sound effects (1–300%). Lowering a ceiling immediately clamps higher levels and slider/number maxima. Preferences persist on this device, separately from chat casting. These controls add no polling or audio-processing loop.

**Saved → Download all** creates one ZIP containing a separate WAV for each complete saved playback in the current chat, including recordings older than the recent-message list. It reuses recorded mixes without new speech synthesis. Partial, expired, deleted or edited recordings are skipped. Each WAV retains the sounds, speed and mixer levels heard during that playback and uses `Choir - initials - chat ID - 001.wav` naming. The ZIP is limited to 256 MB; individual WAVs retain their 128 MB limit. Existing recordings without a mixed playback need one complete replay first.

**Setup → Set up Choir** reopens the redesigned five-step wizard. Voices are edited one role at a time, with accents and delivery available during setup. Playback starts with everyday controls and retention; More playback settings holds request limits and text filters. Review separates configured choices from passed tests. See [setup guide](../ONBOARDING.md). It also opens automatically on a fresh installation; completed or deliberately skipped setup does not reopen on every load. No additional collapse layers are used for ordinary settings. Only absent characters, large plan/JSON views and secondary tasks leave the main page.

## Accents and delivery

Open a character's editor in Cast. Enter an accent such as **Irish, light Dublin accent**, set its base delivery if desired, then audition the voice. Accent instructions now travel with that character's actual TTS connection on every request and preview.

Each character has three delivery choices:

- **Automatic acting:** use its base style plus the planner's direction for the line.
- **Base style only:** ignore planner emotions; keep the chosen base delivery.
- **No tone directions:** suppress acting instructions while keeping accent and pronunciation preferences.

Narrator defaults to **Base style only**. Its saved base style is respected; without one, Choir requests steady, neutral narration. Automatic acting remains available for expressive narrators. Voice auditions no longer force an unrelated cheerful Fish tag.

An accent request is a preference, not a guarantee. Choose and audition an appropriate voice. In particular, Google's current guidance recommends a regional or designed voice for a stable accent instead of trying to transform an existing voice through turn styling. The preview retains the accent request for compatible models, but a reliable permanent accent is a reason to add a regional/custom voice. [Google TTS prompting guidance](https://ai.google.dev/gemini-api/docs/speech-generation#prompting-guide)

### What is sent to each provider

| Selected connection/model | Choir delivery adapter |
| --- | --- |
| Native Fish S2/S2.1 with voice-direction support | Send plain delivery and accent instructions in `parameters.voice_direction`; Lumiverse converts them to a bracket cue. Choir does not add a second cue. |
| Older Fish relay without voice-direction support | Prefix the request text with one free-form `[direction]` cue. |
| Fish S1 | Emit only recognized, explicitly named legacy emotions in parentheses, up to three. S1 cannot turn a free-form Irish accent request into a new accent; choose an Irish voice. |
| Gemini 3.8 / Flash Lite | Send `parameters.speech_style`; the current Lumiverse relay maps it to speech metadata. The transcript remains speech text. |
| Older native Gemini | Use a natural-language delivery prompt around the transcript, as supported by the older preview models. |
| OpenRouter Fish / Gemini | Use that connection's delivery parameters (`instructions` for Fish; `speech_style` for current Gemini). Its relay handles provider conversion. |

Fish S2 uses free-form bracket directions; S1 uses a fixed parenthesis vocabulary. [Fish emotion controls](https://docs.fish.audio/developer-guide/core-features/emotions)

Gemini separates sustained performance metadata from momentary inline vocal sounds. Choir sends planner acting as turn-level delivery; it does not invent coughs, laughter or other vocal events. [Google speech generation](https://ai.google.dev/gemini-api/docs/speech-generation)

**Mixed providers work per character.** A Fish character and Gemini narrator use separate connections and adapters. They are never combined into one cross-provider synthesis call. Compatible same-provider dialogue retains each turn's own delivery and accent. Effective instructions also participate in audio cache keys and request-size limits.

## Custom voices: implementation options

No voice cloning or paid voice creation was performed for this preview. This work explores the options rather than adding a creation button that the current host cannot complete.

1. **Use an existing Fish custom voice now.** Create/select it in Fish, paste its ID in the character editor, or use My Fish voices. Its recorded accent provides the strongest starting point. Choir's accent/base delivery settings then refine its performance.
2. **Named voice presets inside Choir.** A useful next increment is a reusable library of name, provider/connection, voice ID, accent and base delivery. Apply a preset without copying character aliases or name pronunciation. Store entries by stable IDs, merge edits under the existing settings lock, and report unavailable connections rather than silently assigning another voice. This needs no running model or audio processing on the CPU.
3. **Fish voice design or cloning in the drawer.** Fish offers candidate generation from a description and persistent voice models from reference audio or designed candidates. Add a Lumiverse server-side connection API for preview/create/list/delete, then expose a deliberate create → audition → save flow in Cast. Keep provider keys in Lumiverse and retain the resulting ID in Choir. [Fish voice design](https://docs.fish.audio/features/voice-design), [Fish model creation](https://docs.fish.audio/api-reference/endpoint/model/create-model)
4. **Google regional library, voice design and replication.** Google now has a Voices API for prompted or replicated voices. The checked local Lumiverse Google adapter still lists prebuilt voices and sends `prebuilt_voice_config`; it does not expose Voices API creation/listing or custom-ID synthesis. Host support is required before Choir can offer this reliably. Replication also needs the provider's reference/consent flow. [Google Voices API](https://ai.google.dev/api/voices)

Recommended sequence: named presets first, then host-backed Fish creation, then Google custom/regional voices when the host can synthesize their IDs. Creation is a user action, never an automatic side effect of planning an NPC.

## Validation

Unit and browser coverage checks delivery routing, narrator defaults, retained accents, ZIP bytes/CRC/directory offsets and volume-limit normalization. Real Chromium checks use synthetic audio to verify compact desktop/touch pages, saved casting and layout preferences, live limits, current-chat bulk export, mixed WAV samples, partial/expired recording exclusion, setup, cancellation and retention. They do not evaluate the perceived quality of a provider's accent.

Validation covers 561 existing automated checks, three new archive/limit checks and all 12 Chromium programs. Updated UI assertions and the 34 mixer/setup regressions passed on rerun. The desktop/touch archive check also verifies an older recording outside the recent-message list and excludes edited audio without new TTS calls.
