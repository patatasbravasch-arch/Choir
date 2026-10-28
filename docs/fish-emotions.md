# Automatic Fish delivery

Version **1.1.6-staging.59** keeps restrained degrees and negative constraints intact: for example, `barely audible whisper` and `scared but not panicked` remain complete bracket directions. Negated instructions are not converted into positive markers, and saved narrator base directions use the same rules. This adds no planner calls and does not change the selected voice.

Available on **lunch-test** in version **1.1.6-staging.49**, merged from **emotion-fish-audio**. This feature targets S2/S2.1 and adds no drawer controls.

The existing planner chooses each passage's speaker and delivery. The Standard LLM writes a short free-form style including emotion and acting intensity in its casting response; Jev chooses emotion and intensity together in its existing emotion classification. Ordinary dialogue defaults to restrained, conversational delivery. Stronger reactions require support from the scene. Neither needs an additional model call for Fish.

When Choir prepares the TTS request, it converts the delivery into Fish bracket cues. For example, `Slightly amused, conversational` becomes `[Slightly amused][conversational] Please stay.` Jev distinguishes light amusement, clear delight and intense joy, as well as different degrees of anger, sadness and fear. Neutral choices explicitly request natural, conversational delivery so Automatic acting does not fall back to an expressive character base. S2 free-form descriptions remain accepted. Up to three distinct generated acting cues are used.

The spoken transcript in the chat is unchanged. The cues exist only in the speech request. Native Fish, Fish through OpenRouter, and the direct Fish endpoint share this formatting. An advertised native `voice_direction` is explicitly cleared so the relay does not add another direction over the injected cues. Grouped Fish dialogue carries the cues in each turn's text and clears each turn's separate style field.

Explicit bracket cues already present in a passage keep their position and take priority: Choir does not stack generated acting on them. Accent and pronunciation instructions remain persistent. Gemini characters use their existing delivery adapter and do not receive these injected Fish cues.

Existing delivery settings still apply: **Automatic acting** uses planned delivery; **Base style only** uses the saved base; **No tone directions** disables generated acting. Narrator defaults to base/steady narration. The selected voice ID is retained.

A new effective Fish request has a different cache key. Replay and download of an already saved recording keep its original audio. Replan, then use Play to apply changed delivery. These are performance instructions; the TTS model can still vary how strongly it interprets them.

Reference: [Fish Audio emotion control](https://docs.fish.audio/developer-guide/core-features/emotions).
