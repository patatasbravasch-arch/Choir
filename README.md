<div align="center">

<img src="assets/logo.svg" alt="Choir icon" width="96" />

# Choir

[![Version](https://img.shields.io/badge/version-1.1.6--staging.30-blue.svg)](https://github.com/patatasbravasch-arch/Choir/tree/staging)
[![Platform](https://img.shields.io/badge/platform-Lumiverse%20Spindle-purple.svg)](https://docs.lumiverse.chat/)
[![Tests](https://img.shields.io/badge/tests-447%20tests-blue.svg)](tests/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An installable Lumiverse Spindle extension for multi-voice narration, dialogue attribution, sound effects, ambience and background music.

</div>

Version **1.1.6-staging.30** brings the tested `lunch-test` changes into staging: guided setup with a Fish Audio key guide, chat-wide name pronunciation, cast restoration and NPC category fixes, OpenRouter Fish voice selection, reading skip controls and music planning for mood changes within a reply. It also includes playback speed and voice gaps from PR #4, with **Normal**, **Fast** and **Very fast** mixer buttons and individual speeds inside each character's **Edit** drawer. **Match Abyssal Constellation** in Advanced Settings optionally themes the mixer. Saved voice styles are bounded automatically, and unverifiable card suggestions no longer block playback.

Version **1.1.6-lunch-test.9** adds **Match Abyssal Constellation** in **Advanced Settings**, beside **Floating audio mixer**. It applies the existing Abyssal mixer's deep blue panels, pale blue controls, gold heading and static constellation decoration. The choice applies immediately and is saved with mixer preferences across reloads. It starts unchecked, affects only the mixer and its launcher, and uses the host theme's Abyssal fonts when available.

Version **1.1.6-lunch-test.8** simplifies the mixer speed buttons to **Normal**, **Fast** and **Very fast**, without numerical labels. Their speeds and saved choices are unchanged, with smaller desktop buttons and the existing touch target size on phones.

Version **1.1.6-lunch-test.7** gives the mixer three playback speed buttons: **Normal (1×)**, **Fast (1.5×)** and **Very fast (2×)**. Individual voice speeds live inside each character's **Edit** drawer, including NPCs, and are available before planning. The gap control stays in **Speech & Planner → Playback** alongside the detailed global speed control. Existing speeds and gaps are preserved; character speeds still replace the global speed, and **Use global** clears an individual override.

Version **1.1.6-lunch-test.6** trims saved and imported voice delivery styles to 600 characters before validation, including lead voices, NPCs on every connection and captured defaults. Older hidden style fields no longer block planning, playback or saving defaults. Character cards and story text are unchanged.

Version **1.1.6-lunch-test.5** prevents a bad character suggestion from blocking playback. Card evidence tolerates differences in formatting, spacing and quote characters; discarded instruction headings do not need evidence. Suggestions without matching evidence are skipped. The existing cast and recognized profiles remain available when none can be verified, using the existing analysis cache without additional analysis requests.

Version **1.1.6-lunch-test.4** integrates the playback controls from PR #4: global playback speed, per-character speed that replaces the global value, and a gap between voices. These settings live beside mixer levels, persist across reloads, and appear in both the mixer and settings drawer. Typing a speed above the slider maximum expands its range. Speech keeps its pitch; music, ambience, effects and auditions retain normal speed. Dialogue with different character speeds uses separate clips, and a nonzero gap separates speakers even when grouping is enabled. Saved shared recordings rebuild when those controls require a split, using existing attribution without another planner request. Ordinary speed changes reuse cached audio. Changes to an already playing shared clip take effect on the next Play; simultaneous unison voices keep the first speaker's rate so they stay aligned. Excluded opening speakers do not introduce an initial gap, and Pause, Next and Stop control pending gaps.

Version **1.1.6-lunch-test.3** excludes instruction headings such as **NARRATIVE GUIDELINES** and **Writing Instructions** from automatic character discovery, including JSON/XML profiles and cached Planner LLM results. Mentioning "main character" inside those sections no longer makes the heading a lead. Remove any previously saved false character once; the updated detector will not add it back. Existing saved cast rows are preserved until explicitly removed.

Version **1.1.6-lunch-test.2** retains saved cast editors when a voice catalogue is unavailable and restores saved Fish voice IDs through OpenRouter. An empty Fish preset list still offers community selection and pasted IDs. Supporting profiles explicitly labelled NPC are kept out of automatic lead discovery; **Move to NPC cast / Move to lead cast** in each character editor preserves that character's voice and pronunciation and remembers the category on reload. Narrator and persona rows cannot be removed with the character delete buttons; use **No voice** to omit them from playback. Music planning now explicitly checks for sustained mood changes within a message, including frightening scenes becoming romantic, and can place up to three music cues at their spoken trigger words. Existing saved plans keep their music cues until replanned.

This is the **staging branch of the original Choir repository**, using the original `choir` identifier and settings. Version **1.1.6-staging.29** plans each reply with one compact casting request: on a benchmark of real replies, Standard LLM attribution rose from 86% to 99.8%, failed plans disappeared, and planning uses about a tenth of the tokens. Version **1.1.6-staging.28** skips non-story blocks: one short Planner LLM check per reply finds reasoning, trackers, recaps and choice menus that are not part of the story, and Choir no longer reads them aloud. Version **1.1.6-staging.27** removes the legacy direct Gemini key route; Choir speaks only through Lumiverse TTS connections, and settings saved in the old Gemini mode switch back automatically. Version **1.1.6-staging.26** removes every direct `fetch()` from the backend, which Lumiverse now refuses to load: Jev, Freesound and Incompetech requests go through Spindle's CORS proxy only, and Freesound previews are downloaded by that proxy as checked audio instead of by the browser. Version **1.1.6-staging.25** improves Jev attribution. Quoted words nobody says aloud (a quoted term, written text, words only reported) are read by the narrator, while quoted thoughts stay with the thinker. A speaker outside the cast is named by a second Jev question over the names the story uses, so the line gets its own NPC voice instead of the LLM fallback; speakers the story never names keep the previous behaviour. On a benchmark of 2,000 dialogue lines from real chats, overall Jev accuracy rose from 94% to 97% with unchanged accuracy for cast lines. Version **1.1.6-staging.24** declutters the settings drawer: **Speech & Planner** is grouped into Voices, Planner, Sound and Reading, set-and-forget interface toggles move to **Advanced Settings**, and long help texts become short tooltips. Choir preserves connection-specific voice selections when cards split into individual leads, bounds card profiles independently, and checks unstructured card content with a cached Planner LLM analysis. Unison excludes listeners, handles common speech verbs, and mixes all participants in main and Cue playback. Cached unison respects changed NPC policies and mixer levels. Connection-list failures retain the selected adapter, and saved clip controls wait for their voice catalogues. Native Fish/Google/OpenRouter grouping retains the supplied Lumiverse relay patch.


Version **1.1.6-staging.23** identifies individual leads across formatted headings, named XML profiles and JSON casts. Freeform cards, scenario titles and content outside recognized profiles use a bounded Planner LLM card analysis in Standard LLM and Jev modes, cached until the card changes. Each lead keeps its own profile, aliases, voice and connection. Card titles are not treated as an individual speaker when they describe several people. Local heuristic mode stays local and needs recognizable profiles or manually configured speakers.

Explicit collective dialogue, such as **“they said in unison,”** retains one text turn with a `unison` list of 2–5 participants. In the main player and Cue, Choir synthesizes each participant with their assigned voice, aligns the audible starts, and overlaps the audio into one cached WAV clip with individual mixer levels and peak protection. The speech tag itself remains narrator text. Each unison voice needs a short TTS request; replay and level changes reuse the separate cached voice tracks. Unison is a boundary between otherwise grouped dialogue clips. Ambiguous collective identities need clearer names or planner attribution.

With grouping enabled, message controls show **Audio clips** instead of sections. A narrator–character–narrator passage sharing one multi-speaker request has one Play button with the speaker order, and all three text turns show the same shared cache entry. Selecting that clip plays its entire grouped recording; selecting a longer message's individual clip generates only that clip. Unison controls explicitly show simultaneous voices and the number of short voice calls. Turning grouping off restores section playback.

Heuristic attribution accepts hyphenated character names and aliases, including decorated card titles such as `Gabrielle - Debug`.

The floating mixer’s panel, launcher, text, tabs, sliders, volume fields and button states update immediately when you edit the theme or switch between light and dark mode. Enabled switches use the theme's success color, Silent uses its warning color, and No voice uses its primary color.

## Install staging

Install this repository with the **staging** branch selected in Lumiverse. It
includes these setup and reading features:

- **Set up Choir**: the five-step setup helper, updated for Lumiverse-managed
  connections, with Fish Audio API-key and Freesound tutorials. Setup edits stay
  in a draft until Finish; existing chat casts keep their voices.
- **Say name as** in character and NPC editors: phonetic spelling such as
  `Eliza → Eh-Lee-Zah` is used whenever any voice speaks the name in that chat.
  **Test pronunciation** auditions a sentence containing the actual name.
  Story text and highlights retain the original spelling. Changing the rule
  regenerates affected speech and reuses other audio, including on saved Replay
  and companion playback. Provider pronunciation can vary; listen and adjust.
- **Reading → Skip tags and blocks**: visible custom tag/class/ID exclusions,
  automatic non-story filtering, and **Preview text to read** for local filtering
  of the latest reply without an LLM request.

See [Onboarding](ONBOARDING.md) for storage, migration, compatibility and tests.

## Overview

Choir separates narration and character dialogue from chat messages, assigns distinct voices to each speaker, and plays the story with synchronized audio. It runs inside Lumiverse staging, caches speech passages in IndexedDB, and exposes a floating voice mixer.

## Key features

- **Multi-voice casting.** Cast distinct voices for the Narrator, player persona, and any number of characters or NPCs. Choose voices manually or let the planner cast them automatically.
- **Dual connection modes.** Use one TTS connection across the whole cast, or assign different providers to individual characters.
- **Choice of attribution engine.** Heuristic mode classifies narration and clear dialogue locally, without LLM requests. Ambiguous dialogue stops with guidance to choose Jev or LLM. Jev uses your Decision connection, or a saved Jev API key through TypeSafe's Decision API (`https://api.typesafe.ai/v1/systemone`, model `jev-latest`); saved endpoints ending in `/v1/classify` use that API too. Jev reads quoted terms and written text with the narrator and names new speakers from the names in the story; LLM fallback, which requires the explicit opt-in, handles speakers the story never names. Standard LLM mode casts each whole reply with one compact request to your selected planner connection. The planner answers one short row per quoted line with its speaker and delivery, writes NOT_SPOKEN for quoted words nobody says aloud, and names new NPCs. Choir maps aliases to cast names, asks once more only for lines it missed, and gives a still-missing line the previous speaker. If a provider blocks the whole reply, Choir casts it in parallel parts of about 1,200 characters without the earlier chat; the plan fails only if every part is blocked.
- **Foley sound effects.** Your planner LLM picks the moments that should be audible and writes an English Freesound search for each, in any story language. Choir places effects at complete sentence or clause boundaries, with pre-fetching and volume balancing. Quiet looping ambience beds such as rain, a tavern crowd or wind play under the narration of sustained scenes.
- **Narrator controls.** Use the mixer's Narrator **Silent** button to mute audio or **No voice** to skip narration and synthesis. Cue's narrator controls remain supported.
- **Companion extension bridge.** Exposes `window.__CHOIR_API__` so reading interfaces like Cue Living Novel can request speech turn planning and seamless paragraph playback.
- **Floating voice mixer.** A draggable sound icon expands into a transport with master and individual speaker volume controls, mute toggles, seeking, and skip buttons. The drawer’s **Open mixer / Close mixer** button opens and collapses the same panel, staying in sync with its floating control.
- **Read-along.** Highlight the passage or the words being spoken in the chat message, and optionally scroll the chat to follow the narration.
- **Passage caching.** Completed audio chunks cache immediately in local IndexedDB. Edits and reloads reuse matching attribution and audio without repurchasing tokens or quota.

### Mixer and saved settings

Click the small draggable speaker icon to open the compact player. The small **Plan latest** icon beside Previous plans the latest assistant reply without starting audio. The central **Play** button plays the latest reply, planning it first when needed, and pauses or resumes active playback. Previous and Next move between spoken blocks; the playback bar seeks within the current audio part. Master stays visible above the compact **Auto-plan**, **Auto-play**, **SFX**, **Ambience** and **Music** switches. Their labels stay fixed; green means on and muted gray means off. Each switch also exposes its state to screen readers and in its tooltip. **Auto-play new replies** starts speech when a new assistant reply finishes; **Plan latest** prepares a plan, then **Play** starts it. Expand **Channel levels** for three tabs: **Main cast** for the current lead voices, **NPCs** for supporting voices, and **Scene audio** for **SFX**, **Ambience** and **Music**. Speakers come from the current plan, saved recording or Cue paragraph. Scene audio keeps all three volume controls available even when their sound is off, so you can set levels before enabling playback. The menu starts collapsed and remembers whether you leave it open. The tabs work on desktop and mobile and remember your selected group through playback and reload. Empty cast groups show a short message. Arrow keys, Home and End also change tabs. On desktop, use the larger volume slider or type an exact percentage beside it. Double-click a volume slider to reset it to **100%**. On phones and touch devices, use full-width **− / +** controls for 5% steps or enter an exact **0–300%** channel value (**0–100%** for Master). Mute and skip sit beside each speaker name. The mixer fits the screen, and long channel groups scroll below their tabs. All volume controls stay synchronized and save automatically. Hidden speakers retain their saved levels, and speakers with **No voice** remain listed so you can turn them back on. The **speaker** icon controls **Silent** (mute playback), and the **microphone** icon controls **No voice** (skip synthesis and playback). Active buttons change icon and highlight; each has an accessible label, a tooltip and a short legend. **No voice** skips that character's playback and new synthesis while retaining text and cached audio.

The compact **SFX** button below Auto-plan stays synchronized with **Sound effects** in the drawer and saves automatically. Turning it off skips effects in Choir and Cue, including cached playback, while speech continues, and retains its level in Scene audio. When enabled, the SFX level in **Channel levels** ranges from **0–300%**, default **100%**, and saves with the mixer. At 100%, effects retain the existing quiet 45% gain; 300% triples that level. Speaker levels also range from **0–300%**. Speech and SFX amplification works with **Match passage loudness** on or off. Old SFX voice-channel volume and mute preferences no longer override the switch.

The compact **Ambience** button beside SFX stays synchronized with **Ambience** in the drawer and saves automatically. On keeps background beds looping across Cue paragraphs until a replacement, a stop cue or Stop. Off stops active and loading beds without interrupting speech, prevents later beds from starting, and retains its level in Scene audio. The **Ambience** level in **Channel levels** ranges from **0–300%**, with **100%** as the default background level. Raise it above 100% when a clip is too quiet; 300% gives three times the previous maximum volume. Changes apply immediately in Choir and Cue, including cached playback, and save with the mixer.

**Music** in the drawer, beside **Ambience**, is off by default. On, the planner LLM also picks the mood of the scene: one to three incompetech feels, one or two genres and a few English keywords such as instruments or the setting. The backend loads Kevin MacLeod's [incompetech](https://incompetech.com/music/royalty-free/) catalog once, ranks its tracks and lets your Decision model choose among the top eight, as it does for Freesound; a slow or failed choice keeps the best-ranked track. The track streams directly from incompetech and loops quietly under the speech on its own layer, crossfading, pausing and stopping like ambience, also in Cue and cached replay. **Loop music** is an optional global setting that appears beside **Music** while music is on. It keeps the chosen track looping after speech ends and through later replies without a new music cue, then crossfades when the next track is ready. Explicit music stop cues, Stop, turning music off, changing chats, and unloading Choir end the track. Turning the loop option off while idle also stops it. Music needs no Freesound key. Its **Music** level is always available beside SFX and Ambience in **Scene audio** with the same **0–300%** range. While a track plays, the drawer shows its credit: `"Title" Kevin MacLeod (incompetech.com) · CC BY 4.0`. The music is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Plans made before turning music on have no music; plan the reply again to add it.

**Highlight spoken text** under **Reading** in **Speech & Planner** is off by default. **Passage** lights up the dialogue line or narration run Choir is speaking. **Word by word** grows the highlight from the start of that passage to the current word. Providers return no word timings, so word mode estimates the position from the audio progress and the text, with longer pauses at punctuation. The highlight is drawn over the chat message without changing it, survives re-rendering, and clears when playback stops. Text that Choir cannot find in the rendered message stays unhighlighted. **Follow narration**, also off by default, scrolls the chat when a new passage, or in word mode the current line, leaves view. Scrolling the chat yourself with the mouse wheel, touch or keyboard pauses following. A **↑ Back to narration** or **↓ Back to narration** button then appears at the bottom of the chat; click it to return to the spoken line and keep following without stopping playback. Otherwise following resumes at the next Play. Browsers without the CSS Custom Highlight API play speech without highlighting or following.

A single-character card title with a scenario suffix is saved as a lead alias when its name matches the existing lead. Duplicate NPC rows and duplicate single-provider voice choices are removed across saved TTS routes. Older attribution plans resolve the alias to the lead voice; recordings that used the title as a separate speaker are corrected on normal message playback, regenerating affected speech. Scenario titles that do not match a lead and cards with separate named character profiles retain their cast identities.

Cast and connection changes save automatically with Saving / Saved / Save failed feedback. A **Retry save** button appears only after saving fails; normal edits need no Save button. **Speech & Planner** settings, including advanced preferences and ignored tags, are shared across every chat. Opening an existing chat uses the latest global preferences instead of its older saved preferences. Each chat retains its own cast, voice assignments and NPC policy. Provider API keys are managed in Lumiverse connections; legacy Jev session keys are not saved. Saved plans and completed audio survive navigation and provider failures. Connection defaults such as speed and output format are included in the audio cache identity; changing them regenerates only affected speech without asking the planner again. Companion paragraph playback applies the same pronunciation, accent, style and voice fallback settings as the main player. Stop also cancels its pending sound-effect choices.

Saved audio follows the **Audio retention** setting in Advanced Settings. **This session only** stays in memory. **1**, **7** and **30 days** remove a recording after its expiry. **Indefinitely** audio is never reclaimed automatically, even when the device is full; Choir reports the storage limit instead and asks you to delete a message or chat, or choose a shorter retention period. A completed full replay also trims older passage generations from that message. It keeps the current plan, the immediately previous recording, audio for speakers set to **No voice**, and clips from other sections, so one voice, route, connection-mode or text change can be undone without paying for the same speech again, while older generations are discarded.

Click **Set default** beside **Lead Cast** or **NPC Cast** to open the corresponding tab of the cast defaults popup. It contains only lead roles (**Narrator**, **`{{user}}`** and **`{{char}}`**) and **NPC cast** settings. Each lead role has its own TTS connection and voice, including **Let the LLM decide**. NPCs can **Do not generate NPC speech**, **Use one voice for everyone**, **Choose from preferred voices**, or **Let the LLM decide**. The preferred pool limits automatic NPC choices without restricting the lead cast. **Save default** supplies voices for new chats; existing chats keep their casts until you click **Apply default** beside that cast group. Applying a cast default keeps all global Speech & Planner preferences. Names, aliases, pronunciation instructions and individual NPC identities are not copied into defaults. Reopen the popup to edit the saved default, or choose **Use current chat settings** to start from the active cast. Cancel discards the draft. Existing defaults migrate their cast choices automatically.

Choir removes complete tabbed interface panels and phone widgets before Jev, heuristic or LLM attribution, including status, notifications and expandable notes. Detection uses grouped radio controls with matching labels and tab content, ARIA tabs and panels, or a checkbox/radio with a matching label and a local CSS `:checked` rule, within a styled UI surface. It keeps ordinary HTML story text and surrounding narration, including a story `<div>` that contains a panel. Interface controls, SVG/canvas decorations and explicitly hidden content are excluded too. This filter is local and makes no additional Jev or LLM request. Incomplete or ambiguous layouts are retained conservatively; precise exclusions can handle them.

**Skip tags and blocks** is available under **Reading** in the drawer. Tabbed panels and interface controls are skipped automatically, and your custom exclusions remain editable. **Preview text to read** shows local filtering of the latest reply; it makes no LLM request and does not run the optional non-story LLM check. It accepts tag names and simple class/ID selectors separated by commas, spaces or new lines. For example, `summary, private-note, .kb-msg-toast, #phone-panel, div.custom-panel` skips those elements with their nested contents. Tag names also accept angle brackets. Names are case insensitive, and class selectors match complete class tokens. Supported selectors are `tag`, `.class`, `#id`, `tag.class`, and `tag#id`; compound CSS expressions are not accepted. An unfinished explicitly ignored block is skipped to its container's end or the end of the message. Existing tracker and reasoning exclusions still apply. Bracketed status headers are skipped as well: any `[…]` block containing `|`, and any line made only of `[…]`, `【…】` or `〔…〕` blocks. Brackets inside a sentence are still read. With **Skip non-story blocks** under **Reading → Skip tags and blocks** (on by default), LLM and Jev modes also ask the Planner LLM connection once per reply which lines are reasoning, trackers, recaps, choice menus or other non-story blocks, and skip them; if the check fails, the whole reply is read. Changing this list stops old playback and requires a fresh plan when the spoken text changed; unaffected cached audio remains reusable. Old plans or recordings containing newly filtered content cannot replay that content; normal Play rebuilds attribution and reuses unaffected cached speech. Entirely filtered Cue paragraphs produce no speech. If you previously entered `div` to skip a panel, remove it to preserve ordinary div-based narration; complete tabbed panels need no custom entry.

For cards such as **Adrian and Ethan**, Choir reads explicit per-character headings or named XML sections and creates separate lead entries. Each person receives a separately bounded profile, so a long first profile cannot hide the next. Automatically cast voices are saved separately and kept across replies and reloads, including when NPC speech is disabled. Plain story titles are not split without explicit character profiles. If Cue encounters ambiguous dialogue from several leads before a message has been planned, it asks for Jev/LLM attribution or a named speaker instead of speaking all lines in the first character’s voice.

In **Standard LLM** mode, **Let LLM choose** sends the start of the active character's and persona's descriptions and the unused voices with their descriptions to your selected planner. It chooses a voice that fits each speaker and saves that choice for later replies and reloads. A missing choice, or one that does not match the speaker's gender preference, becomes the first unused catalogue voice of that gender. NPCs use character cues from the story. To request a new choice, select **Let LLM choose** again, then plan or play a message where that character speaks. Cached attribution cannot substitute the first catalogue voice for this choice. Existing voice assignments stay fixed until you change them.

Added Fish Audio and Gemini voice IDs are kept on the connection where you added them, including after reloads and provider switches. Existing additional voices are matched to their known provider or saved assignment. Voices without gender metadata remain available under gender filters and are labelled **Gender unknown**; the planner can use their descriptions. GPT TTS uses the host's built-in catalogue, with a local built-in list as a fallback. If an older plan saved a voice from the wrong provider, select **Let LLM choose** again and plan the message to replace that assignment.

The mixer's **Auto-plan** switch creates plans for new assistant replies. **Show Auto-plan in chat toolbar** in **Advanced Settings** adds a synchronized toolbar control. The setting is off by default, saves automatically, and uses your chosen planner engine; Jev and LLM planning may incur costs. The mixer's **Auto-play** button stays synchronized with **Auto-play new replies** in the drawer, saves automatically, and plays available plans. Auto-play never creates a missing plan or requests a new LLM voice choice. Enable both switches to automatically plan and play new replies. With only Auto-plan on, replies are planned silently. With only Auto-play on, replies without a usable saved plan are skipped. Turning Auto-plan off cancels pending automatic planning while already planned speech can continue. Turning Auto-play off stops automatic speech generation and playback while planning can finish silently. These switches do not cancel manually requested work; **Stop** cancels all work.

Automatic replies wait for the completed message or regenerated swipe to appear in the chat. Replies received while planning, playing, or using Cue queue until Choir is available. Duplicate completion events do not replay a generation. **Stop**, turning both automation switches off, changing chats, or disabling Choir cancels waiting replies. Edited, swiped, or deleted messages discard their pending automation. The removed **Mute narrator (dialogue only)** drawer setting is represented by Narrator **No voice** in the mixer if previously enabled, so you can turn narration back on there.

The drawer's **Stop** button cancels planning, speech generation, and playback, including paused audio, while keeping completed cached passages. Saved-settings feedback sits above the aligned action buttons. **Test planner** follows the selected engine: heuristic tests run locally; Jev and LLM tests use their selected connections. Heuristic mode still uses your TTS provider when you play speech. Select actual voices for the current chat; voices saved in **Set default** only reach an existing cast after **Apply default**. For one-character dialogue with a named persona, select that persona in the Lumiverse chat persona picker. If planning stops, Choir names the missing voice or shows the first quote it could not attribute.

Advanced **Max characters per request** accepts a whole number from **80 to 10000**, default **1800**. Larger chunks reduce request count but can delay initial playback. If the Lumiverse relay returns HTTP 524, try **1800** characters and **1** concurrent TTS request; smaller requests and less parallel work may help them finish before the relay timeout. A persistent 524 needs investigation on the relay or provider side. Invalid edits are shown and are not saved. The limit applies to individual speech requests, so longer replies are split automatically.

For faster playback, try **2 Prefetch passages** and **2 Concurrent TTS requests** if your provider allows parallel requests. Prefetch counts audible clips across ambience/music markers; **0** disables lookahead. Choir and companion paragraphs both respect the concurrency limit and prioritize current speech. More lookahead can generate audio you do not finish. Speed changes reuse the audio and do not accelerate synthesis; a provider that generates one second of speech per second cannot sustain 2× playback indefinitely. Very small chunks can worsen this by paying request overhead more often.

**Match passage loudness** measures audio during prefetch and reuses that measurement for cached blobs. Quiet provider padding at the beginning/end does not make otherwise identical speech louder. Internal pauses and audio timing remain intact; gain is bounded and peaks retain headroom. This is RMS level matching, so voices with different timbres can still sound different in perceived loudness.

**Planner LLM connection** stays visible for every planner engine. Selecting a connection does not make heuristic attribution use an LLM; it also supplies optional sound-cue planning.

**Group speech requests** in **Speech & Planner** is optional and off by default. It combines compatible adjacent speech instead of requesting each turn separately. Moderate opening passages can use up to **1200 characters** with SFX off or **900 characters** with SFX on. A long opening turn still starts with a **600-character** clip, then later clips use up to **2400 characters** with SFX off or **900 characters** with SFX on, always within your Max characters setting and the provider limits. A dialogue–narration–dialogue passage within these limits can be one Fish S2/Gemini request with each assigned voice preserved. With a plan, a short line beside the checkbox shows its speech-batch count; hover it for the selected connection's voice support. Cached batches need no new TTS call. Single-voice providers such as the current OpenAI adapter still need separate calls for different voice IDs. SFX, ambience and music cue markers interrupt grouping at their playback boundaries. Existing concurrency and prefetch settings still bound the queue; completed clips are cached and reused.

Grouping can combine up to **two prebuilt Gemini voices** or **five Fish S2 voices** on the same connection. Gemini custom voices remain separate. Different connections, delivery parameters or speaker levels start new clips. Providers without multi-speaker support can still combine consecutive passages with the same speaker, voice and delivery. Grouped clips share one audio level. Master changes immediately; individual level and Silent changes apply on the next Play, which separates unequal levels. Changing **No voice** stops grouped playback; Play rebuilds it without the excluded character. Previous/Next move between the grouped clips, while read-along estimates the turn position within each clip.

Fish/Google/OpenRouter connections require a Lumiverse relay that advertises `capabilities.multiSpeaker` and accepts `parameters.turns`. Older relays safely retain separate speakers. The [relay patch](patches/lumiverse-multi-speaker.patch) adds this support for Fish S2, Google AI Studio/Vertex Gemini 3.8, and supported Fish/Gemini models on OpenRouter without changing stored connections or credentials. OpenRouter dialogue is sent as an ordered input array with text, voice and optional instructions per turn. Its Fish models use Fish voice IDs; names such as Puck belong to Gemini. The relay must be patched on the server serving each Lumiverse instance, including hosted instances. It has been applied to the local testing instance. Apply it from a compatible Lumiverse checkout with `git apply --check /path/to/Choir/patches/lumiverse-multi-speaker.patch`, then `git apply /path/to/Choir/patches/lumiverse-multi-speaker.patch` and restart Lumiverse. Run the supplied [relay tests](patches/relay-dialogue.test.ts) with Bun from that checkout. Relay changes may need to be reapplied after updating Lumiverse. Provider contracts: [OpenRouter multi-speaker TTS](https://openrouter.ai/docs/guides/overview/multimodal/tts#multi-speaker-input), [Fish dialogue API](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech) and [Gemini speech generation](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation).

Choir also applies limits per voice route: Fish Audio uses up to the 10,000-character application ceiling, including delivery tags; [OpenAI speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create) is capped at 4,096 characters. Gemini uses a conservative local budget of 6,000 UTF-8 bytes for text and delivery instructions, reserving space under its [8,192-token input limit](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts); multilingual text may therefore use shorter chunks. Unknown providers retain the previous 2,000-character cap. These policies also apply to companion paragraph playback.

## Installation

### From GitHub

1. In Lumiverse, open **Extensions -> Add -> Install from source**.
2. Enter `https://github.com/patatasbravasch-arch/Choir` and select the `staging` branch.
3. Enable **Choir** in your extension list.

### Local copy

1. Copy the repository into your Lumiverse data directory under `extensions/choir`:

   ```text
   Lumiverse/
     data/
       extensions/
         choir/
           spindle.json
           dist/
             backend.js
             frontend.js
           src/
   ```

2. Open **Extensions -> Add -> Import local** as an admin or owner.
3. Enable **Choir** and grant permissions if prompted.

The extension includes pre-built bundles in `dist/`. No build step is required to run it.

## Configuration

Open **Choir** from the drawer or its input-bar action.

### TTS connections

Choir speaks only through the TTS connections saved in Lumiverse.

1. Under **Lumiverse connection**, choose any saved connection on your host, including Google AI Studio/Vertex Gemini, OpenAI, Fish Audio, ElevenLabs, or local servers.
2. Set the style handling parameter supported by your model, such as `instructions`, `instruct`, or `prompt`.
3. Pick an LLM connection for planning.

For a Fish Audio speaker, open its cast editor and click **Paste voice ID** beside the voice selector. Paste the ID, optionally describe its timbre, age, accent or delivery, then click **Use this voice**. Choir saves and selects it without generating speech. Use the small preview button to audition it through that speaker's Fish connection. Opening the ID editor also shows the currently selected ID. The Advanced Settings catalogue remains available for bulk entries in `ID | description` format. A valid ID does not resolve provider or gateway failures by itself. Speech failures identify the selected provider, connection, model and voice, and preserve any JSON, plain-text or HTML error details returned by Lumiverse or its gateway. A bare HTTP 502 does not establish whether the voice or the upstream service caused the failure. Completed speech remains cached; retrying playback generates only the missing passages.

When a Fish Audio speaker is left on **Let LLM choose**, **Voices the planner picks from** decides where its voice comes from. **Fish community library** (the default) has the planner describe the voice it wants — gender, age, up to four tone words and the story's language — and Choir searches the public Fish library for it. It skips duplicates, voices already in the chat's cast and voices also tagged with the opposite gender, and lets the Decision model pick from the top 10 results. If that choice fails or takes more than 5 seconds, Choir uses the top result. The chosen voice is saved to that character, so each character is searched only once, and it appears in the voice list as an additional voice; you can still change it by hand. **My Fish voices** keeps the previous behaviour and uses only your own Fish models. **Both** offers your own voices and the community search. Jev planning asks the Decision model for the speaker's gender, age and story language before searching. Celebrity and character voices are not filtered out.

### Foley sound effects

1. Check **Sound effects** and/or **Ambience** under **Sound** in Speech & Planner.
2. In Advanced Settings, add your Freesound API key.
3. After attribution, Choir makes one small request to your Planner LLM connection, in every planner mode. The model picks concrete sounds that happen in the scene, such as doors, footsteps, weather, fire or weapons, and anchors each to the words where it happens. It skips voices, music and imagined sounds. Each search is 1 to 3 English words naming the sound the way Freesound files are named, such as `door slam` or `egg crack`; when a search finds nothing, Choir retries without its last word. Choir then searches Freesound and plays the clips at balanced background levels.

Freesound ranks results by their words, so its top result can be the wrong sound, such as a bottle smashing when a character only picks one up. Choir therefore shows a Decision model the top eight results, with their names, tags and lengths, and the story text around the anchor, and plays the clip it picks. Choir uses your Lumiverse Decision connection, the one selected for Jev or the default, in every planner mode. On hosts without Decision connections, it uses a saved Jev API key. Without either, or when the choice fails or takes longer than 5 seconds, Choir plays Freesound's top result. A chosen clip is cached by its search, so later cues with the same search reuse it.

The same request also picks up to three ambience entries for sustained environments. A bed starts right before its anchor words and loops quietly under the speech until the next bed, an explicit stop, or the end of the message, crossfading over about 1.5 seconds. Beds use Freesound sounds of 10 to 120 seconds, never delay speech while they download, pause with the speech, and follow Next, Previous and resume to the bed in effect at the new position.

No sound request is made while both effects and ambience are off or no Freesound key is set, unless **Music** is on; with only one enabled, the request still runs and only that kind plays. The choices are saved with the plan, so replays and reloads reuse them. A malformed or empty sound-choice response gets one correction request with a larger output budget; provider errors and cancellation do not trigger that retry. If choices still fail, speech continues and the warning stays in the status area at the top of the drawer beside playback errors. DeepSeek uses its [JSON output mode](https://api-docs.deepseek.com/guides/json_mode/), including custom connections whose model ID starts with `deepseek` or `deepseek/`. Playback uses the saved choices and never starts a new sound-effect LLM request. To add effects to an older plan, or retry failed choices, select **Plan latest** or the message's **Plan** button. Passages that gain an effect are synthesized again.

Effects and beds play in both Choir's chat player and companion paragraph playback. SFX anchors keep a subject with its verb: an interior action-word anchor backs up to the preceding sentence or clause punctuation, while an explicitly anchored action group such as "and slid his hand" stays at that conjunction. With no clear punctuation boundary, the effect moves to the sentence start. This placement check is local and needs no extra LLM request. Older recordings with SFX rebuild their cuts from saved attribution on Play or Replay; matching speech clips and sound files remain reusable. Background beds keep their exact anchors. Cue requests a paragraph through Choir's bridge; Choir chooses the sounds once per paragraph, searches Freesound, and plays the preview audio. In Cue, a bed keeps running across consecutive paragraphs of the same chat until another bed, a stop, Stop or cancellation. Turning off **Sound effects (Foley cues)** or **Ambient sound** disables that kind in both players, including saved replays. Muting the narrator keeps effects available.

A valid Freesound API key is required for uncached effects and beds. Missing keys, failed searches, and unavailable or invalid previews show **SFX skipped** in Choir while speech continues. Browser playback or decode errors for a background bed show **Ambience skipped** in the same status area. Failed layers are released, so later playback can retry, while speech continues. Failed sounds are not cached as silence; retry playback after correcting the key or service problem. Freesound searches use its [current search API](https://freesound.org/docs/api/resources_apiv2.html) and token authentication. Completed chat audio, including effects and beds, survives reloads under your selected retention policy.

## Companion bridge

Choir mounts a global API on `window.__CHOIR_API__` for companion overlays:

```typescript
interface ChoirBridge {
  version: 1;
  isAvailable(): boolean;
  getConfig(): ChoirConfig;
  isNarratorMuted(): boolean;
  setNarratorMuted(muted: boolean): void;
  setSoundEnabled(on: boolean): void;
  getMusic(): { title: string; credit: string } | null;
  openDrawer(): void;
  stop(): void;
  planParagraph(text: string, speaker?: string): { segments: SpeechBatch[] };
  playParagraph(options: PlayParagraphOptions): Promise<{ played: number; warnings?: string[] }>;
}
```

Companion interfaces listen for the `choir-available-v1` event on `window` to bind controls. `setSoundEnabled` turns sound effects, ambience and background music on or off together, like the drawer toggles, and saves the chat setting. `getMusic` returns the playing incompetech track with its CC BY 4.0 credit; `choir-music-v1` fires on `window` with the same value, or `null`, whenever the track changes or stops. In paragraph playback the playing track carries on into later paragraphs; the sound request names it and asks for new music only when the mood or setting clearly changes.

Paragraph plans may contain `kind: 'sfx'` audio parts when effects are enabled and `kind: 'ambience'` or `kind: 'music'` markers where a bed starts or stops. `playParagraph` handles those parts internally, retains speech when an effect or bed fails, and reports optional SFX warnings alongside the actual number of played audio parts; ambience and music markers are not counted. The bridge remains version 1.

## Development

Install dependencies and run test suites:

```bash
npm ci
npm test
npm run test:ui
```

If the environment prevents spawning test workers, use `node --test --test-isolation=none --test-concurrency=1 tests/*.test.mjs tests/*.browser.mjs` after building.

`npm test` validates core parsing, Jev integration, sound effect, ambience and music cue validation, music ranking, and cast validation. `npm run test:ui` executes browser-environment DOM, mixer, and companion bridge integration tests.

With Playwright and Chromium installed, `npm run test:fluidity:chromium` measures transitions at 0.75–4× with deterministic synthesis delays, checks configured gaps/concurrency, and injects slow decoding to catch loudness work at handoff. It uses synthetic audio and makes no live provider calls.
