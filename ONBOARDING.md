# First-time setup (lunch-test)

Choir opens a five-step native Spindle modal on first enablement for the current
Lumiverse user: Welcome, Connections, TTS & Voices, Optional Features, Review.
The host supplies the backdrop, focus trap, close button, Escape handling, theme,
and viewport bounds via `ctx.ui.showModal()`.

**Set up Choir** in the Choir drawer/settings opens it manually, even
after completion or skipping. Only one instance is allowed, including during
asynchronous startup and saving. Closing or **Skip for now** remembers deferral
and discards the configuration draft. Extension teardown discards the draft
without marking a new installation as skipped.

## Persistence and compatibility

All writes use existing `ctx.settings` storage, scoped by the host to the
extension and current user:

| Key | Purpose |
| --- | --- |
| `onboarding:state` | Version, `completed`, and `deferred`; independent of chats. |
| `settings:global` | Choir's existing shared Speech & Planner preferences. |
| `settings:captured-defaults` | Existing version 2 lead-voice, NPC-policy, and route-aware voice-catalogue defaults for future chats. |

The wizard reads existing preferences and captured defaults before opening.
New installations start with heuristic attribution and all optional features
off. Existing users keep their choices in the draft. Nothing is applied before
Finish. Saving merges shared preferences, preserves unknown default fields,
writes completion last, and attempts to restore previous values after any
failure. Incomplete rollback is reported explicitly. Storage has no multi-key
transaction; simultaneous saves from different browser sessions remain subject
to the host's last-write behavior.

The wizard never writes `chat:*`, cached plans, recordings, mixer preferences,
or companion-bridge state. The normal chat-loading path reloads shared
preferences and applies cast defaults only to chats without a saved cast.
Shared preferences still affect all chats, exactly as the existing settings
panel does. Existing chat voice and NPC assignments stay independent.

Legacy Jev keys stay in the existing page-session input and are
excluded from settings and onboarding records. The Freesound key uses the
existing Choir preference storage. No keys are logged, included in review
summaries, or copied into the completion flag; wizard errors redact entered keys.

## Connections and testing

The wizard reuses Choir's authenticated API wrapper and existing connection
lists. It never creates, edits, or deletes host-managed connections. Use the
Lumiverse **Connect** panel to configure credentials and native models, then
reopen setup and refresh. Model selection picks an existing connection.
All speech uses Lumiverse TTS connections, including Fish Audio and Google.
Connection-manager navigation is explained
in the UI because Spindle does not offer a documented connection-manager
activation action on the supported host.

Voice catalogues, provider-family detection, pronunciation/accent/style
parameters, native synthesis, audio playback, and planner
tests use existing Choir functions. Private Fish IDs retain the existing
route-aware default catalogue behavior. Jev uses host Decision connections;
the existing session-key fallback is offered only when the backend reports no
Decision API. Heuristic tests run locally and make no LLM request.

Lead voices offer **Let the LLM choose** with the Standard LLM planner, or
**Let Choir choose (Jev)** with the Jev classifier. These save the existing empty
voice-ID convention, so normal planning selects and remembers a voice using
Choir's existing logic. Local heuristic attribution requires explicit voices.
Automatic voices cannot be auditioned until a voice has been resolved; choose a
specific voice for a setup audition. No planner request is made by selecting
the automatic option or by finishing setup.

Opening, navigating, discovering connections, refreshing catalogues, and saving
make no paid synthesis, planning, or voice-design requests. **Test planner
connection**, each **Test … voice**, and **Test final playback** are explicit
actions and may incur provider charges. Tests are cancellable, results are
invalidated by choice changes, and successful speech feedback requires both
synthesis and playback. Ready in Review indicates configured prerequisites;
untested connections are labelled separately.

Sound effects and ambience require Freesound and an LLM for cues; music needs an
LLM but no Freesound key. Automatic NPC casting requires Jev or LLM.
Automation only takes effect for subsequent replies, and can incur charges.

**How to connect Fish Audio** on Connections links to the official account,
API key and quick-start pages. It explains creating a key, adding a Fish Audio
connection in Lumiverse's Connect → TTS panel, refreshing the wizard, and
testing a voice. It distinguishes an API key from a voice ID. The helper does
not collect Fish credentials or create connections.

The Reading card preserves **Skip non-story blocks**, **Skip tags and blocks**,
highlighting and follow preferences. These use the same global settings as the
drawer. The drawer's **Preview text to read** applies local markup filtering to
the latest assistant reply, without making an LLM request. It does not preview
the optional LLM non-story check.

## Name pronunciation

Open a character or NPC editor and enter a phonetic spelling in **Say name as**,
such as `Eh-Lee-Zah` for `Eliza`. This is a per-chat cast preference. Every voice
uses the rule when speaking that complete name, including the narrator and
companion paragraph playback. Titles and other aliases are not changed.
**Test pronunciation** speaks a short sentence containing the actual name and
uses the selected voice; it may incur the usual speech provider charge.

The story, planner input, attribution and reading highlights retain the original
spelling. Only outgoing speech text is changed. Rules apply in a single pass,
prefer longer names, accept possessives, and avoid replacing substrings of other
names. Request splitting measures the respelled speech and keeps mapped names
intact. Pronunciation depends on the model; listen to the test and adjust the
spelling as needed. This does not require a Fish phoneme dictionary.

Clear older mappings such as `Eliza: Eh-Lee-Zah`, `Eliza is pronounced
“Eh-Lee-Zah”`, or a hyphenated spelling seed the new control. Other old
instructions stay in **Speaking instruction** (provider dependent). Explicitly
clearing **Say name as** restores the written spelling. Name rules are not saved
as generic cast defaults for other chats, but are included in cast export/import.

Editing a rule stops active speech. Passage cache keys use the outgoing text,
so only affected speech is regenerated; attribution and unaffected audio remain
reusable. Saved recordings also store the spoken spelling per passage. Explicit
Replay refreshes affected passages without requesting another plan, including
legacy recordings that did not store pronunciation metadata.

**How to get a Freesound API key** under Optional Features provides a compact,
expandable walkthrough: sign in/create an account, request a credential for
your Choir setup, copy **Client secret/Api key**, then paste it and choose sound
features and a cue LLM before finishing. Links open Freesound's official site,
application page, and [token authentication instructions](https://freesound.org/docs/api/authentication.html#token-authentication)
in a separate tab so the wizard draft remains open. Choir searches sounds and
uses previews with token authentication; no OAuth setup is needed. The guide
does not send a request, change settings, or enable features when expanded.

## Verification

Run `npm run build`, `npm test`, and `npm run test:ui`. The normal test commands
include `tests/setup.test.mjs` and `tests/setup.browser.mjs` alongside existing
coverage. Setup tests cover detection, navigation, duplicate prevention,
validation, failure/retry/rollback, skipping/reopening, dismissal cancellation,
secret redaction, existing-user compatibility, native synthesis/playback, and
future-chat inheritance through the generated frontend bundle.

The checked-in `dist/frontend.js` and `dist/backend.js` must be rebuilt for GitHub
installation. No new dependency is required.

Official references: [Spindle modals](https://docs.lumiverse.chat/frontend-api/ui-placement/#modal-free-no-permission-needed)
and [frontend events](https://docs.lumiverse.chat/frontend-api/events/).
