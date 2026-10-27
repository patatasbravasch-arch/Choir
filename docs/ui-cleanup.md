# UI-CLEANUP preview

Version: **1.1.6-staging.41**. Branch: **UI-CLEANUP**. Based on staging `bc38705`.

## Using the drawer

| Tab | What belongs here |
| --- | --- |
| Play | Play/pause/resume the latest reply, plan it again, open the mixer, sound switches, speed, voice gaps and reading follow/highlights. The speech plan stays here. |
| Cast | Character voices, accents, base delivery and automatic casting. Absent characters keep their voices in Other characters. |
| Recordings | Saved messages, Replay, Download, retention and clearing saved chat audio. |
| Settings | Setup wizard, connections, planner, mixer customization, filtering and request/buffering settings. |

The setup wizard remains available under **Settings → Set up Choir**. Status, errors and an active Stop control stay visible across tabs. Tab navigation supports arrow keys, Home and End. Automatic casting, storage and ordinary settings no longer require opening their own nested disclosure. Large speech-plan/JSON views and absent characters still collapse where useful.

**Settings → Customize mixer** keeps control visibility and ordering, and adds **Buttons per row** (Automatic or 1–7). The mixer grows for wider rows on desktop; on narrow screens buttons wrap earlier to remain usable. Preview mixer opens it without leaving Settings. Choices persist on this device separately from the chat cast. Reset layout preserves levels, speeds and gaps. This uses CSS layout and event handlers; it adds no polling or recurring animation.

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

Automated coverage includes delivery routing, narrator defaults, disabled acting with retained accents, legacy model syntax, multilingual request budgets, keyboard tab navigation, mixer row layout/persistence/reset and mixed-provider requests. Existing playback, download, retention, casting, setup and settings-merge checks are also run. Browser audio checks use synthetic audio, so they verify requests, timing and files rather than making a claim about how convincing a provider's Irish accent sounds.

Validation completed with **561 automated checks passing** and **all 11 Chromium test programs passing**, including desktop/touch layouts, setup, playback, download and retention. The new browser coverage checks mixed Fish/Gemini requests and separate Gemini turn accents in a grouped request. Scene levels remain scrollable when additional button rows use the available height.

The branch was also installed through the real local Lumiverse extension manager. Drawer navigation, the setup wizard, narrator delivery defaults, accent editing and mixer layout persistence were checked there. Live provider audio quality was not evaluated. Screenshots and the detailed local-installation report accompany the task.
