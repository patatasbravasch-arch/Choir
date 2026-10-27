# Automatic Fish delivery

Available on **lunch-test** in version **1.1.6-staging.49**, merged from **emotion-fish-audio**. This feature targets S2/S2.1 and adds no drawer controls.

The existing planner chooses each passage's speaker and delivery. The Standard LLM writes a short free-form style in its casting response; Jev uses its existing emotion classification. Neither needs an additional model call for Fish.

When Choir prepares the TTS request, it converts the delivery into Fish bracket cues. For example, `sad; whispering` becomes `[sad][whispering] Please stay.` Jev's `cheerful` becomes `[happy]`, and `sigh` becomes `[sighing]`. S2 free-form descriptions remain accepted. Up to three distinct generated acting cues are used.

The spoken transcript in the chat is unchanged. The cues exist only in the speech request. Native Fish, Fish through OpenRouter, and the direct Fish endpoint share this formatting. An advertised native `voice_direction` is explicitly cleared so the relay does not add another direction over the injected cues. Grouped Fish dialogue carries the cues in each turn's text and clears each turn's separate style field.

Explicit bracket cues already present in a passage keep their position and take priority: Choir does not stack generated acting on them. Accent and pronunciation instructions remain persistent. Gemini characters use their existing delivery adapter and do not receive these injected Fish cues.

Existing delivery settings still apply: **Automatic acting** uses planned delivery; **Base style only** uses the saved base; **No tone directions** disables generated acting. Narrator defaults to base/steady narration. The selected voice ID is retained.

A new effective Fish request has a different cache key. Replay and download of an already saved recording keep its original audio. Use a new Play after replanning to apply changed delivery.

Reference: [Fish Audio emotion control](https://docs.fish.audio/developer-guide/core-features/emotions).
