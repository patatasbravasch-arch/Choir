# Gemini speech in Choir

Reviewed against the complete [Google AI Studio TTS guide](https://aistudio.google.com/docs/speech-generation) on 2026-10-28, including single- and multi-speaker requests, metadata and vocal events, streaming, formats, voice catalogues, languages, model selection, migration, prompting and limitations.

## Voice identity and delivery

Google recommends letting a selected voice carry the character's identity. Keep turn styles short; choose a regional voice or design one for permanent traits such as accent. Avoid long persona blocks and repeated instructions to preserve timbre. Test an empty style first. Native multi-speaker generation supports two prebuilt voices; custom voices require separate turns. Streaming returns raw PCM by default, while unary requests return WAV.

## What Choir sends

Choir's existing Jev/LLM planning step supplies the speaker and delivery. The Gemini adapter keeps sustained delivery in `speech_style`, which Lumiverse converts to per-turn `speech_metadata.style`. No extra emotion-generation request is needed. Text remains the transcript, including explicit documented vocal events such as `<sigh>` and `<short pause>` at their original positions.

An empty base style on a Gemini 3.8 narrator now produces an explicitly empty `speech_style`. This overrides the relay's conversational default without adding Choir's former neutral-narration fallback. A saved base style, accent or pronunciation remains active. Automatic acting and base-only mode still behave independently for every character, including mixed Fish/Gemini casts.

Bare documented vocal tags survive the story HTML filter; arbitrary tags, attributes and hidden panels retain the existing filtering. Tags stay intact across request boundaries and do not count as visible words during read-along matching. For mixed casts, Fish S2 receives corresponding bracket cues; unsupported providers receive the words without the Gemini vocal tags. Choir does not invent vocal events or listener backchannels.

## Grouping and custom voices

Compatible prebuilt Gemini turns can share one request with separate speaker/voice mappings and styles. Passage loudness matching applies to the returned clip as a whole. Different connections, custom IDs, incompatible channel levels/speeds, and an added voice gap can require separate requests.

Add a custom or regional voice ID with its description under Cast tools. Choir recognizes `voice_...` and temporary `voicekey_...` IDs as Gemini when migrating older unscoped catalogues, including OpenRouter catalogue filtering. This does not create or replicate a voice: the selected Lumiverse provider must support the ID. Google documents seven-day expiry for stateless voice keys. Provider acceptance of a real custom voice must be checked with that connection; synthetic catalogue tests do not establish it.

## Relay work and future improvements

The installed Lumiverse adapter uses `generateContent`; the current guide's primary examples use Interactions. Choir supplies an internal `parameters.turns` list, which the relay translates to Google's request body. A working native grouped request does not need an API migration solely because the examples use another envelope.

The remaining opportunities involve the Lumiverse relay and audio transport: query Google's extended regional voice catalogue, support voice design/replication through an appropriate UI, and consume streaming PCM for earlier playback. Choir currently prepares complete clips; it does not claim live PCM streaming or automatic custom-voice creation.

## Validation

Regression coverage exercises vocal-event preservation through parsing, chunking, planning and provider adaptation; empty narrator metadata; fixed per-speaker voices; grouping with loudness matching; separate custom-voice turns; and Gemini catalogue routing. Browser fixtures use synthetic audio, so these checks establish request and playback behavior rather than a subjective voice-quality score.

Version 1.1.6-staging.60 passed 617 unit/DOM regression tests, seven Gemini Chromium scenarios, four mixed/grouped request-inspector Chromium scenarios, and eight installed-relay tests. Live localhost playback was not rechecked for this version because browser origin approval failed with a service rate limit.
