import { characterCardRoleDiscovery, namePronunciation, namePronunciationTarget, namePronunciations, respellNames, mergeSettingsChanges, reconcileCastDuplicates } from './core.js';
import { createSetupWizard, saveSetupSettings, ONBOARDING_KEY } from './setup.js';
import { ABYSSAL_THEME_CSS } from './abyssal-theme.js';
import { randomUuid, sha256Hex, GEMINI_VOICES, OPENAI_VOICES, additionalVoices, apiErrorMessage, MAX_SPEECH_CHARS, MAX_CHANNEL_VOLUME, speechProviderFamily, speechRequestLimits, normalizeName, normalizeVoiceCatalogue, characterCardRoles, validateCardRoles, reconcileCardCast, unisonSpeakers, speechSourceUnits, mixUnisonAudio, speechDownloadWav, transcriptFromMessage, readableText, readAlongIndex, locatePassages, spokenLength, validateCastConfig, validatePlan, npcCastActor, parsePlanJson, speechBatches, groupedSpeechBatches, audioBytes, fastClassifyPlan, resolvePlannerMode, attributionPlan, restoreAttribution, passageKey, mixerVolume, loudnessGain, castExport, castImport, applySoundCues, cueOffset, sfxCueOffset, transcriptLines, withoutLines } from './core.js';
import { normalizeSpeedSliderMax, normalizePlaybackRate, normalizeVoiceGap, speakerPlaybackRate, effectivePlaybackRate, browserPlaybackRate, PLAYBACK_RATE_LIMITS, VOICE_GAP_LIMITS } from './core.js';
import { speechLookaheadEnd, backendRequestKind, LIMITED_SPEECH_PEAK, softClipCurve, spaceSoundEffects } from './core.js';
import { createPlayedAudioCapture, playedAudioFilename, createWavArchive } from './played-audio.js';
import { characterDeliveryMode, voiceDelivery, normalizeMixerColumns, normalizeMixerVolumeLimits } from './delivery.js';
import { createDrawerNavigation, DRAWER_UI_CSS } from './drawer-ui.js';

const CHOIR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12a4.16 4.16 0 0 1-5.62 3.89 3.78 3.78 0 0 1-2.38-3.39 3.42 3.42 0 0 1 2.34-3.38l3.79-1.42a2.89 2.89 0 0 0 1.87-2.7 2 2 0 1 0-4 0v14a2 2 0 1 1-4 0"/><path d="M20 2v4"/><path d="M22 4h-4"/></svg>`;
const ICON_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-2px"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const ICON_NEXT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m8 7 7 5-7 5z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/><path d="M17 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_PREVIOUS = ICON_NEXT.replace('<path d="m8','<g transform="translate(24 0) scale(-1 1)"><path d="m8').replace('</svg>','</g></svg>');
const ICON_TRANSPORT_PLAY = ICON_NEXT.replace('<path d="m8 7 7 5-7 5z"','<path d="m9 7 7 5-7 5z"').replace('<path d="M17 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>','');
const ICON_TRANSPORT_PAUSE = ICON_NEXT.replace('<path d="m8 7 7 5-7 5z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/><path d="M17 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>','<path d="M9 8v8M15 8v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>');
const ICON_PAUSE = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-2px"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const ICON_SEARCH = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
const ICON_SPARKLE = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>`;
const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const ICON_SOUND = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>`;
const ICON_MUTED = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6M22 9l-6 6"/></svg>`;
const ICON_MIC = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>`;
const ICON_MIC_OFF = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 2 20 20M9 9v3a3 3 0 0 0 5 2M9 5V5a3 3 0 0 1 6 0v6M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8"/></svg>`;
const ICON_STOP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
const ICON_PLAN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 6 1 1 2-2M10 6h11M3 12l1 1 2-2M10 12h11M3 18l1 1 2-2M10 18h11"/></svg>`;
const ICON_DOWNLOAD = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 15v5h14v-5"/></svg>`;

export async function setup(ctx) {
  // A host remount or extension update must not leave a second floating mixer behind.
  for(const previous of document.querySelectorAll('[data-choir-mixer]')){previous.dispatchEvent(new document.defaultView.Event('choir:replace'));previous.remove();}
  const tab = ctx.ui.registerDrawerTab({id:'ensemble',title:'Choir',shortName:'Choir',iconSvg:CHOIR_ICON_SVG,
    description:'Cast and play your story with multiple voices',keywords:['tts','audio','choir','voices','narrator']});
  const root=document.createElement('div');
  tab.root.append(root);
  const placementUnsubs=[];
  if(tab.onActivate)placementUnsubs.push(tab.onActivate(()=>tab.root.replaceChildren(root)));
  const cleanupPlacements=()=>{
    placementUnsubs.splice(0).forEach(fn=>fn());
    root.remove();tab.destroy();
  };
  if (!ctx.settings || !ctx.messages?.getRecent || !ctx.messages?.getContent || !ctx.state) {
    const message=document.createElement('p');message.setAttribute('role','alert');
    message.textContent='Choir needs a newer Lumiverse staging build for its message and settings APIs. Update Lumiverse staging, then reload the page. The Choir drawer is available, but playback cannot start on this build.';
    message.style.padding='18px';root.append(message);
    return cleanupPlacements;
  }
    const removeStyle = ctx.dom.addStyle(`
    .ensemble-tts{padding:16px;max-width:820px;margin:auto;font:inherit;line-height:1.5;color:inherit}
    .ensemble-tts .et-header{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid rgba(128,128,128,0.2)}
    .ensemble-tts .et-title-group{display:flex;align-items:center;gap:10px}
    .ensemble-tts h2{font-size:1.25em;font-weight:600;margin:0;letter-spacing:-0.01em}
    .ensemble-tts .et-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;grid-column:1/-1;min-width:0}
    .ensemble-tts .et-save-state{font-size:11px;opacity:.75;text-align:right;overflow-wrap:anywhere}
    .ensemble-tts .et-toolbar button{white-space:nowrap}
    .choir-auto-plan-action{display:inline-flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;cursor:pointer;font:inherit;font-size:12px;color:inherit;background:transparent;border:1px solid #8884;border-radius:6px;padding:4px 8px}
    .choir-auto-plan-action[aria-pressed="true"]{background:#c4b5fd20;border-color:#c4b5fd80}
    .choir-auto-plan-action:disabled{opacity:.45;cursor:default}
    .choir-auto-plan-action:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    .ensemble-tts h3{font-size:0.95em;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;opacity:0.85;margin:20px 0 8px}
    .ensemble-tts .et-section-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin:20px 0 8px}
    .ensemble-tts .et-section-header h3{margin:0}
    .ensemble-tts .et-subhead{font-size:.8em;font-weight:600;opacity:.6;margin:14px 0 6px}
    .ensemble-tts [data-et="defaultStatus"]:empty{display:none}
    .ensemble-tts:not(:has([data-et="enableMusic"]:checked)) [data-et="loopMusicWrap"]{display:none}
    .ensemble-tts .et-section-header .et-btn-group{flex-wrap:wrap}
    .ensemble-tts label{display:grid;gap:4px;font-size:0.85em;font-weight:500}
    .ensemble-tts input,.ensemble-tts select,.ensemble-tts textarea{width:100%;box-sizing:border-box;background:rgba(128,128,128,0.06);color:inherit;border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:7px 10px;font:inherit;font-size:0.95em;transition:border-color 0.15s ease}
    .ensemble-tts input:focus,.ensemble-tts select:focus,.ensemble-tts textarea:focus{outline:none;border-color:rgba(128,128,128,0.6)}
    .et-default-overlay{position:fixed;inset:0;z-index:99999;background:#0009;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
    .ensemble-tts.et-default-dialog{width:100%;max-width:580px;max-height:85vh;margin:0;background:var(--lumiverse-bg-surface,#1e1e24);color:var(--lumiverse-text,#e0e0e0);border:1px solid #8886;border-radius:12px;box-sizing:border-box;display:flex;flex-direction:column;box-shadow:0 16px 48px #0008}
    .et-default-dialog .et-default-body{overflow:auto;min-height:0;padding:8px 2px}
    .et-default-dialog .et-default-tabs,.et-default-dialog .et-default-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    .et-default-dialog [role="tab"][aria-selected="true"]{background:#8885}
    .et-default-dialog input,.et-default-dialog select{min-width:0}
    .et-default-dialog button{min-height:36px}
    .et-default-dialog [hidden]{display:none!important}
    .et-default-dialog [role="tabpanel"]{display:grid;gap:12px}
    .et-npc-policy{display:grid;gap:10px;margin:10px 0}
    .ensemble-tts select option{background:Canvas;color:CanvasText}
    .ensemble-tts textarea{resize:vertical;min-height:80px}
    .ensemble-tts button{background:rgba(128,128,128,0.12);color:inherit;border:1px solid rgba(128,128,128,0.3);border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;font-size:0.9em;font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:background 0.15s ease,opacity 0.15s ease}
    .ensemble-tts button:hover:not(:disabled){background:rgba(128,128,128,0.22)}
    .ensemble-tts button:disabled{opacity:0.45;cursor:not-allowed}
    .ensemble-tts .et-btn-primary{background:rgba(128,128,128,0.24);font-weight:600;border-color:rgba(128,128,128,0.5)}
    .ensemble-tts .et-btn-subtle{font-size:0.8em;padding:3px 8px}
    .ensemble-tts .et-btn-danger{font-size:0.8em;padding:3px 8px;opacity:0.75}
    .ensemble-tts .et-btn-danger:hover{opacity:1}
    .ensemble-tts .et-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
    .ensemble-tts .et-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
    .ensemble-tts .et-check{display:inline-flex;gap:6px;align-items:center;cursor:pointer;font-size:0.85em}
    .ensemble-tts .et-check input{width:auto;margin:0;cursor:pointer}
    .ensemble-tts .et-card{padding:10px 12px;border:1px solid rgba(128,128,128,0.25);border-radius:8px;background:rgba(128,128,128,0.03);margin:8px 0}
    .ensemble-tts .et-cast-row{padding:6px 10px;margin:4px 0}
    .ensemble-tts .et-cast-header{display:flex;align-items:center;justify-content:space-between;position:relative;gap:8px;min-height:28px}
    .ensemble-tts .et-cast-header strong{position:absolute;left:50%;transform:translateX(-50%);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.9em;max-width:calc(100% - 110px)}
    .ensemble-tts .et-cast-header strong[title]{cursor:pointer}
    .ensemble-tts .et-cast-name-input{position:absolute;left:50%;transform:translateX(-50%);font:inherit;font-weight:bold;text-align:center;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.25);border-radius:4px;color:inherit;padding:1px 6px;max-width:180px;outline:none;z-index:2}
    .ensemble-tts .et-cast-editor{margin-top:10px;padding-top:10px;border-top:1px solid rgba(128,128,128,0.2)}
    .ensemble-tts .et-status{white-space:pre-wrap;padding:8px 12px;border-radius:6px;background:rgba(128,128,128,0.08);font-size:0.88em;margin:8px 0}
    .ensemble-tts .et-credit{opacity:.75}
    .ensemble-tts [hidden]{display:none!important}
    .ensemble-tts .et-error{color:#ef7878}
    .ensemble-tts .et-transcript{font:inherit;white-space:pre-wrap;max-height:160px;overflow:auto;font-size:0.9em;opacity:0.9}
    .ensemble-tts .et-plan-block{padding:7px 0;margin:0;border:0;border-bottom:1px solid #8883;border-radius:0;background:none}
    .ensemble-tts .et-plan-heading{display:flex;gap:8px;justify-content:space-between;align-items:baseline;font-size:0.85em}
    .ensemble-tts .et-plan-heading small{font-size:0.85em;opacity:0.75;text-align:right}
    .ensemble-tts .et-plan-delivery{display:block;font-size:.82em;margin:4px 0;overflow-wrap:anywhere}
    .ensemble-tts .et-tts-request{padding:10px 0;border-bottom:1px solid #8883;overflow-wrap:anywhere}
    .ensemble-tts .et-tts-request textarea{font-family:monospace;font-size:12px;white-space:pre-wrap;margin-top:6px;resize:vertical}
    .ensemble-tts details{margin:10px 0;border:1px solid rgba(128,128,128,0.2);border-radius:6px;padding:8px 12px}
    .ensemble-tts details summary{cursor:pointer;font-size:0.88em;font-weight:500;opacity:0.8;user-select:none}
    .ensemble-tts details[open] summary{margin-bottom:10px}
    .ensemble-tts .et-message{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
    .ensemble-tts .et-message .et-btn-group{flex-wrap:wrap}
    .ensemble-tts .et-btn-group{display:flex;gap:6px;align-items:center}
    .choir-mixer[hidden],.choir-mixer.cm-hidden{display:none !important}
    ::highlight(choir-speaking){background-color:var(--lumiverse-primary-020,rgba(147,112,219,.25))}
    .choir-follow-resume{position:fixed;z-index:50;transform:translateX(-50%);padding:8px 14px;border-radius:999px;border:1px solid color-mix(in srgb,var(--lumiverse-primary-deep-contrast,#fff) 16%,transparent);background:var(--lumiverse-primary-deep,#121824);color:var(--lumiverse-primary-deep-contrast,#fff);font:600 12px/1.2 system-ui,sans-serif;box-shadow:0 6px 18px #0006;cursor:pointer}
    .choir-follow-resume[hidden]{display:none}
    .choir-follow-resume:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    /* Inherit live Lumiverse tokens: theme edits need no mixer remount or saved palette. */
    .choir-mixer{--cm-accent:var(--lumiverse-primary,#c4b5fd);--cm-accent-text:var(--lumiverse-primary-text,var(--cm-accent));--cm-accent-contrast:var(--lumiverse-primary-contrast,#1a142a);--cm-bg:var(--lumiverse-bg,#121824);--cm-bg-elevated:var(--lumiverse-bg-elevated,#1d2435);--cm-text:var(--lumiverse-text,#f1f3fa);--cm-muted:var(--lumiverse-text-muted,#a6afc2);--cm-dim:var(--lumiverse-text-dim,#566177);--cm-line:var(--lumiverse-border,#ffffff12);--cm-border-hover:var(--lumiverse-border-hover,#ffffff25);--cm-hover:var(--lumiverse-bg-hover,#ffffff10);--cm-fill:var(--lumiverse-fill-subtle,#ffffff04);--cm-accent-soft:var(--lumiverse-primary-010,color-mix(in srgb,var(--cm-accent) 10%,transparent));--cm-accent-line:var(--lumiverse-primary-050,color-mix(in srgb,var(--cm-accent) 50%,transparent));--cm-success:var(--lumiverse-success,#3fb950);--cm-warning:var(--lumiverse-warning,#f3cb84);position:fixed;z-index:10000;display:flex;flex-direction:column;box-sizing:border-box;max-width:calc(100vw - 24px);max-height:min(640px,calc(100dvh - 24px));overflow:hidden;background:linear-gradient(150deg,var(--cm-bg-elevated),var(--cm-bg) 65%),var(--lumiverse-bg-deep,#121824);color:var(--cm-text);border:1px solid var(--cm-line);box-shadow:0 16px 48px #0007,0 2px 8px #0004;font:13px/1.4 system-ui,sans-serif;color-scheme:inherit;isolation:isolate}
    .choir-mixer *{box-sizing:border-box}
    .choir-mixer button{appearance:none;cursor:pointer;border:0;background:transparent;color:inherit;padding:0;font:inherit;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s,color .15s}
    .choir-mixer button:hover:not(:disabled){background:var(--cm-hover)}
    .choir-mixer button:disabled{opacity:.32;cursor:default}
    .choir-mixer button:focus-visible,.choir-mixer input:focus-visible{outline:2px solid var(--cm-accent);outline-offset:3px}
    .choir-mixer svg{display:block;flex-shrink:0}
    .choir-mixer .cm-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-bottom:1px solid var(--cm-line);cursor:grab;touch-action:none;user-select:none;flex-shrink:0}
    .choir-mixer .cm-header:active{cursor:grabbing}
    .choir-mixer .cm-brand{display:flex;align-items:center;gap:9px;min-width:0}
    .choir-mixer .cm-brand-icon{width:24px;height:24px;border-radius:7px;background:var(--cm-accent-soft);color:var(--cm-accent-text);display:grid;place-items:center}
    .choir-mixer .cm-brand-icon svg{width:16px;height:16px}
    .choir-mixer .cm-brand strong{font-size:13px;font-weight:650;letter-spacing:-.02em}
    .choir-mixer .cm-brand small{display:block;font-size:9px;color:var(--cm-muted);line-height:1.2}
    .choir-mixer .cm-close{width:24px;height:24px;border-radius:6px;color:var(--cm-muted)}
    .choir-mixer .cm-body{display:flex;flex-direction:column;min-height:0}
    .choir-mixer .cm-player{padding:6px 10px;border-bottom:1px solid var(--cm-line);flex-shrink:0}
    .choir-mixer .cm-now{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;min-width:0}
    .choir-mixer .cm-now>div{min-width:0}
    .choir-mixer .cm-caption{display:block;color:var(--cm-muted);font-size:9px;letter-spacing:.09em;text-transform:uppercase;margin-bottom:1px}
    .choir-mixer .cm-speaker{font-size:12px;font-weight:550;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .choir-mixer .cm-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    .choir-mixer .cm-activity{display:flex;align-items:center;gap:3px;height:20px;color:var(--cm-accent-text);flex-shrink:0}
    .choir-mixer .cm-activity i{display:block;width:3px;height:6px;border-radius:3px;background:currentColor;opacity:.35}
    .choir-mixer[data-play-state="playing"] .cm-activity i{opacity:1;animation:choir-level .9s ease-in-out infinite alternate}
    .choir-mixer .cm-activity i:nth-child(2){height:15px;animation-delay:-.5s!important}
    .choir-mixer .cm-activity i:nth-child(3){height:10px;animation-delay:-.2s!important}
    .choir-mixer .cm-activity i:nth-child(4){height:18px;animation-delay:-.7s!important}
    .choir-mixer .cm-transport{display:flex;align-items:center;justify-content:center;gap:10px;position:relative;height:36px;margin-bottom:4px;padding:0 26px}
    .choir-mixer .cm-transport button{width:28px;height:28px;border-radius:50%;color:var(--cm-text)}
    .choir-mixer .cm-transport button[data-choir-action="playback"]{width:36px;height:36px;color:var(--cm-accent-contrast);background:var(--cm-accent);box-shadow:0 3px 12px var(--cm-accent-soft)}
    .choir-mixer .cm-transport button[data-choir-action="playback"]:hover:not(:disabled){background:var(--lumiverse-primary-hover,var(--cm-accent))}
    .choir-mixer .cm-transport button[data-choir-action="playback"] svg{width:20px;height:20px}
    .choir-mixer .cm-transport button[data-choir-action="stop"]{position:absolute;right:0;width:24px;height:24px;border-radius:6px;color:var(--cm-muted)}
    .choir-mixer .cm-transport button[data-choir-action="plan-latest"]{position:absolute;left:0;width:24px;height:24px;border-radius:6px;color:var(--cm-muted)}
    .choir-mixer .cm-seek{display:flex;align-items:center;gap:9px;width:100%;font:10px/1.4 system-ui,sans-serif;color:var(--cm-muted);font-variant-numeric:tabular-nums}
    .choir-mixer .cm-seek input{flex:1}
    .choir-mixer .cm-seek span{white-space:nowrap}
    .choir-mixer .cm-master{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px;margin:0;padding:5px 10px;color:var(--cm-text);font-size:10px;border-bottom:1px solid var(--cm-line);flex-shrink:0}
    .choir-mixer .cm-master .cm-percent,.choir-mixer .cm-channel-head .cm-percent{display:none}
    .choir-mixer .cm-playback-tuning{display:flex;flex-direction:column;flex-shrink:0;min-width:0}
    .choir-mixer .cm-speed-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:6px 10px;border-bottom:1px solid var(--cm-line)}
    .choir-mixer .cm-speed-options button{min-width:0;min-height:30px;padding:4px 2px;border:1px solid var(--cm-border-hover);border-radius:5px;background:var(--cm-fill);font-size:10px}
    .choir-mixer .cm-speed-options button[aria-pressed="true"]{background:var(--cm-accent);border-color:var(--cm-accent);color:var(--cm-accent-contrast)}
    .choir-mixer .cm-tuning{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--cm-line);font-size:10px}
    .choir-mixer .cm-channel-speed{margin-top:7px;padding:0;border:0}
    .choir-mixer .cm-channel-speed .cm-inherited{opacity:.6}
    .choir-mixer .cm-use-global{grid-column:2;justify-self:end;width:auto;padding:3px 6px;border:1px solid var(--cm-line);border-radius:4px;color:var(--cm-muted);font-size:10px}
    .ensemble-tts .et-mixer-layout p{margin:7px 0;font-size:.85em;opacity:.8}
    .ensemble-tts .cm-customize-row{display:flex;align-items:center;gap:6px;min-height:36px}
    .ensemble-tts .cm-customize-row label{display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer}
    .ensemble-tts .cm-customize-row input{width:auto;margin:0}
    .ensemble-tts .cm-customize-row button{min-width:32px;padding:5px 8px}
    @media(pointer:coarse){.ensemble-tts .cm-customize-row{min-height:44px}.ensemble-tts .et-mixer-layout button,.ensemble-tts [data-et="customizeMixer"],.choir-mixer .cm-use-global{min-width:44px;min-height:44px}}
    .choir-message-controls{position:relative;display:inline-flex;flex-wrap:nowrap;align-items:center;gap:4px;max-width:100%;margin-top:4px;color:inherit}
    .choir-message-controls[hidden],.choir-message-controls [hidden],.choir-download[hidden]{display:none!important}
    .choir-message-controls[data-at-swipe]{margin:0 0 0 6px;padding-left:6px;border-left:1px solid var(--lumiverse-border,#8886)}
    .choir-message-icon{display:inline-grid;place-items:center;flex-shrink:0;width:28px;height:28px;min-width:28px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;cursor:pointer}
    .choir-message-icon:hover:not(:disabled),.choir-message-controls summary:hover{background:var(--lumiverse-fill-subtle,#8882)}
    .choir-message-icon:focus-visible,.choir-message-controls summary:focus-visible{outline:2px solid var(--lumiverse-accent,currentColor);outline-offset:2px}
    .choir-message-icon:disabled{opacity:.4;cursor:default}
    .choir-message-status:empty{display:none!important}
    .choir-message-controls details{flex-shrink:0;font:12px system-ui}
    .choir-message-controls summary{display:flex;align-items:center;min-height:28px;padding:0 5px;border-radius:6px;cursor:pointer;list-style:none}
    .choir-message-controls summary::-webkit-details-marker{display:none}
    .choir-message-controls summary:before{content:'▸';margin-right:4px}
    .choir-message-controls details[open]>summary:before{content:'▾'}
    .choir-message-controls details>div,.choir-section-list{box-sizing:border-box;position:absolute;right:0;top:100%;z-index:30;display:flex;flex-wrap:wrap;gap:6px;width:min(300px,calc(100vw - 20px));max-height:40vh;overflow:auto;padding:10px;border:1px solid var(--lumiverse-border,#8886);border-radius:8px;background:var(--lumiverse-bg-elevated,#252830);color:var(--lumiverse-text,#e5e9f0);box-shadow:0 4px 18px #0005}
    .choir-section-list[data-portal]{position:fixed;inset:auto;margin:0;z-index:2147483000;font:12px system-ui}
    .choir-section-list[hidden]{display:none}
    .choir-message-controls details>div[popover]{position:fixed;inset:auto;margin:0}
    .choir-message-controls details>div[popover]:not(:popover-open){display:none}
    @media(pointer:coarse){.choir-message-icon{width:44px;height:44px;min-width:44px}.choir-message-controls summary{min-width:44px;min-height:44px}.choir-message-controls details button,.choir-section-list button{min-height:44px}}
    .ensemble-tts .et-character-speed{grid-column:1/-1}
    .ensemble-tts .et-character-speed .cm-inherited>input,.ensemble-tts .et-character-speed .cm-inherited .cm-volume-entry{opacity:.55}
    .ensemble-tts .et-tuning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:10px;margin:4px 0 6px}
    .ensemble-tts .et-tuning{--cm-accent:var(--lumiverse-primary,#c4b5fd);--cm-accent-contrast:var(--lumiverse-primary-contrast,#1a142a);--cm-text:var(--lumiverse-text,#f1f3fa);--cm-muted:var(--lumiverse-text-muted,#a6afc2);--cm-line:var(--lumiverse-border,#ffffff12);--cm-border-hover:var(--lumiverse-border-hover,#ffffff25);--cm-hover:var(--lumiverse-bg-hover,#ffffff10);--cm-fill:var(--lumiverse-fill-subtle,#ffffff04);display:flex;flex-direction:column;gap:7px;min-width:0;margin:0;padding:10px 12px;border:1px solid var(--cm-line);border-radius:8px;background:var(--cm-fill)}
    .ensemble-tts .et-tuning-head{display:flex;flex-direction:column;gap:2px;min-width:0}
    .ensemble-tts .et-tuning-title{font-size:.9em;font-weight:600;color:var(--cm-text)}
    .ensemble-tts .et-tuning-hint{font-size:.78em;line-height:1.35;color:var(--cm-muted)}
    .ensemble-tts .et-tuning-slot{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;min-width:0}
    .ensemble-tts .et-tuning-slot>.cm-volume,.ensemble-tts .et-tuning-slot .cm-volume-steps{display:contents}
    .ensemble-tts .et-tuning-slot .cm-volume-steps>button{display:none}
    .ensemble-tts .et-tuning-slot .cm-volume-entry{display:flex;align-items:center;gap:2px;box-sizing:border-box;width:76px;height:28px;padding:0 6px;border:1px solid var(--cm-border-hover);border-radius:6px;background:var(--lumiverse-input-bg,var(--cm-fill))}
    .ensemble-tts .et-tuning-slot .cm-volume-entry:focus-within{border-color:var(--cm-accent)}
    .ensemble-tts .et-tuning-slot .cm-volume-entry input{appearance:textfield;-moz-appearance:textfield;box-sizing:border-box;width:100%;min-width:0;height:100%;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:inherit;font:12px system-ui,sans-serif;text-align:right;outline:none}
    .ensemble-tts .et-tuning-slot .cm-volume-entry input::-webkit-inner-spin-button,.ensemble-tts .et-tuning-slot .cm-volume-entry input::-webkit-outer-spin-button{appearance:none;margin:0}
    .ensemble-tts .et-tuning-slot .cm-volume-entry span{flex-shrink:0;font-size:11px;color:var(--cm-muted)}
    .ensemble-tts .et-tuning-slot input[type="range"]{appearance:none;-webkit-appearance:none;display:block;box-sizing:border-box;width:100%;min-width:0;height:18px;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;cursor:pointer;--choir-level:100%;--cm-track:linear-gradient(to right,var(--cm-accent) 0%,var(--cm-accent) var(--choir-level),var(--cm-border-hover) var(--choir-level),var(--cm-border-hover) 100%)}
    .ensemble-tts .et-tuning-slot input[type="range"]::-webkit-slider-runnable-track{height:4px;border-radius:3px;background:var(--cm-track)}
    .ensemble-tts .et-tuning-slot input[type="range"]::-moz-range-track{height:4px;border-radius:3px;background:var(--cm-track)}
    .ensemble-tts .et-tuning-slot input[type="range"]::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;box-sizing:border-box;width:14px;height:14px;margin-top:-5px;border:1px solid var(--cm-accent-contrast);border-radius:50%;background:var(--cm-accent);box-shadow:0 1px 4px #0006}
    .ensemble-tts .et-tuning-slot input[type="range"]::-moz-range-thumb{box-sizing:border-box;width:14px;height:14px;border:1px solid var(--cm-accent-contrast);border-radius:50%;background:var(--cm-accent);box-shadow:0 1px 4px #0006}
    .ensemble-tts .et-tuning-slot input[type="range"]:focus-visible,.ensemble-tts .et-tuning-slot input[type="number"]:focus-visible{outline:2px solid var(--cm-accent);outline-offset:3px}
    .ensemble-tts .et-tuning-reset{height:28px;padding:0 10px;border:1px solid var(--cm-border-hover);border-radius:6px;background:var(--cm-fill);color:var(--cm-muted);font:inherit;font-size:.8em;white-space:nowrap;cursor:pointer;box-shadow:none;width:auto}
    .ensemble-tts .et-tuning-reset:hover{color:var(--cm-text);background:var(--cm-hover)}
    .ensemble-tts .et-tuning-reset:focus-visible{outline:2px solid var(--cm-accent);outline-offset:2px}
  .ensemble-tts .et-tuning-max{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:0;font-size:.78em;color:var(--cm-muted)}
  .ensemble-tts .et-tuning-max-entry{display:flex;align-items:center;gap:2px;box-sizing:border-box;width:76px;height:26px;padding:0 6px;border:1px solid var(--cm-border-hover);border-radius:6px;background:var(--lumiverse-input-bg,var(--cm-fill));color:var(--cm-text)}
  .ensemble-tts .et-tuning-max-entry:focus-within{border-color:var(--cm-accent)}
  .ensemble-tts .et-tuning-max-entry input{appearance:textfield;-moz-appearance:textfield;box-sizing:border-box;width:100%;min-width:0;height:100%;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;color:inherit;font:12px system-ui,sans-serif;text-align:right;outline:none}
  .ensemble-tts .et-tuning-max-entry input::-webkit-inner-spin-button,.ensemble-tts .et-tuning-max-entry input::-webkit-outer-spin-button{appearance:none;margin:0}
  .ensemble-tts .et-tuning-max-entry span{flex-shrink:0;font-size:11px;color:var(--cm-muted)}
    .choir-mixer .cm-auto-plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(max(64px,calc((100% - (var(--cm-columns,3) - 1)*3px)/var(--cm-columns,3))),1fr));gap:3px;padding:4px 6px;border-bottom:1px solid var(--cm-line);flex-shrink:0}
    .choir-mixer .cm-auto-plan button{min-width:0;min-height:30px;padding:4px;border:1px solid var(--cm-line);border-radius:5px;font-size:10px;color:var(--cm-muted);background:var(--cm-fill);white-space:normal;overflow-wrap:anywhere}
    .choir-mixer .cm-auto-plan button[aria-pressed="true"]{background:var(--lumiverse-success-015,color-mix(in srgb,var(--cm-success) 15%,transparent));border-color:var(--lumiverse-success-050,color-mix(in srgb,var(--cm-success) 50%,transparent));color:color-mix(in srgb,var(--cm-success) 65%,var(--cm-text))}
    .choir-mixer .cm-percent{font-size:10px;text-align:right;font-variant-numeric:tabular-nums;color:var(--cm-muted)}
    .choir-mixer .cm-levels,.choir-mixer .cm-levels-body{display:flex;flex-direction:column;min-height:0}
    .choir-mixer .cm-levels-body{overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
    .choir-mixer .cm-channels-title{display:flex;align-items:center;gap:6px;width:100%;padding:7px 10px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;text-align:left;color:var(--cm-muted);flex-shrink:0}
    .choir-mixer .cm-channels-title span:last-child{margin-left:auto}
    .choir-mixer .cm-channels{padding:0 6px;min-height:0;flex-shrink:0}
    .choir-mixer .cm-channel-tabs{position:sticky;top:0;z-index:1;background:linear-gradient(var(--cm-bg),var(--cm-bg)),var(--lumiverse-bg-deep,#121824);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;padding:2px 6px 5px;flex-shrink:0;min-width:0}
    .choir-mixer .cm-channel-tab{min-width:0;min-height:26px;padding:4px 3px;border:1px solid var(--cm-border-hover);border-radius:6px;font-size:10px;white-space:nowrap}
    .choir-mixer .cm-channel-tab span{overflow:hidden;text-overflow:ellipsis}
    .choir-mixer .cm-channel-tab[aria-selected="true"]{background:var(--cm-accent-soft);border-color:var(--cm-accent-line);color:var(--cm-accent-text)}
    .choir-mixer .cm-empty{margin:0;padding:12px 6px;color:var(--cm-muted);font-size:11px}
    .choir-mixer .cm-channel{padding:4px;border-bottom:1px solid var(--cm-line);border-radius:6px;min-width:0}
    .choir-mixer .cm-channel:last-child{border-bottom:0}
    .choir-mixer .cm-channel[aria-current="true"]{background:var(--cm-accent-soft)}
    .choir-mixer .cm-channel-head{display:flex;align-items:center;gap:5px;margin-bottom:2px;min-width:0}
    .choir-mixer .cm-channel-dot{width:5px;height:5px;border-radius:50%;background:var(--cm-dim);flex-shrink:0}
    .choir-mixer .cm-channel[aria-current="true"] .cm-channel-dot{background:var(--cm-accent);box-shadow:0 0 0 3px var(--cm-accent-soft)}
    .choir-mixer .cm-channel-name{font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
    .choir-mixer .cm-channel[data-no-voice="true"] .cm-channel-name{color:var(--cm-muted)}
    .choir-mixer .cm-channel[data-enabled="false"] .cm-channel-name{color:var(--cm-muted)}
    .choir-mixer .cm-channel-controls{display:grid;grid-template-columns:minmax(0,1fr);align-items:center}
    .choir-mixer .cm-toggle{width:24px;height:24px;border:1px solid var(--cm-line);border-radius:5px;background:var(--cm-fill);font-size:10px;font-weight:500;color:var(--cm-muted);white-space:nowrap}
    .choir-mixer .cm-toggle svg{width:16px;height:16px}
    .choir-mixer .cm-volume{display:grid;grid-template-columns:minmax(0,1fr) 56px;align-items:center;gap:6px;min-width:0}
    .choir-mixer .cm-volume-steps{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:4px;min-width:0}
    .choir-mixer .cm-volume-steps button{height:44px;border:1px solid var(--cm-border-hover);border-radius:8px;background:var(--cm-fill);font-size:22px}
    .choir-mixer .cm-volume-steps>button{display:none}
    .choir-mixer .cm-volume-entry{display:flex;align-items:center;gap:1px;min-width:0;border:1px solid var(--cm-border-hover);border-radius:6px;background:var(--lumiverse-input-bg,var(--cm-fill));height:28px;padding:0 4px}
    .choir-mixer .cm-volume-entry input{appearance:textfield;min-width:0;width:100%;height:100%;padding:0;border:0;background:transparent;color:inherit;text-align:center;font:12px system-ui;outline-offset:0}
    .choir-mixer .cm-volume-entry input::-webkit-inner-spin-button,.choir-mixer .cm-volume-entry input::-webkit-outer-spin-button{appearance:none;margin:0}
    .choir-mixer .cm-volume-entry span{font-size:11px;color:var(--cm-muted)}
    .choir-mixer .cm-toggle[data-kind="silent"][aria-pressed="true"]{background:var(--lumiverse-warning-015,color-mix(in srgb,var(--cm-warning) 15%,transparent));border-color:var(--lumiverse-warning-050,color-mix(in srgb,var(--cm-warning) 50%,transparent));color:color-mix(in srgb,var(--cm-warning) 65%,var(--cm-text))}
    .choir-mixer .cm-toggle[data-kind="no-voice"][aria-pressed="true"]{background:var(--cm-accent-soft);border-color:var(--cm-accent-line);color:var(--cm-accent-text)}
    .choir-mixer .cm-legend{display:block;padding:6px 10px;margin:0;font-size:9px;color:var(--cm-muted);border-top:1px solid var(--cm-line);flex-shrink:0}
    .choir-mixer .cm-legend span{display:flex;align-items:center;gap:5px}.choir-mixer .cm-legend svg{width:13px;height:13px}
    .choir-mixer input[type="range"]{appearance:none;-webkit-appearance:none;display:block;width:100%;min-width:0;height:28px;margin:0;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;--choir-level:100%;--cm-track:linear-gradient(to right,var(--cm-accent) 0%,var(--cm-accent) var(--choir-level),var(--cm-border-hover) var(--choir-level),var(--cm-border-hover) 100%)}
    .choir-mixer input[type="range"]::-webkit-slider-runnable-track{height:4px;border-radius:3px;background:var(--cm-track)}
    .choir-mixer input[type="range"]::-moz-range-track{height:4px;border-radius:3px;background:var(--cm-track)}
    .choir-mixer input[type="range"]::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;box-sizing:border-box;width:16px;height:16px;border-radius:50%;margin-top:-6px;border:1px solid var(--cm-accent-contrast);background:var(--cm-accent);box-shadow:0 1px 4px #0006}
    .choir-mixer input[type="range"]::-moz-range-thumb{box-sizing:border-box;width:16px;height:16px;border-radius:50%;border:1px solid var(--cm-accent-contrast);background:var(--cm-accent);box-shadow:0 1px 4px #0006}
    .choir-mixer .cm-seek input[type="range"]{height:24px}
    .choir-mixer .cm-seek input[type="range"]::-webkit-slider-runnable-track{height:3px}
    .choir-mixer .cm-seek input[type="range"]::-moz-range-track{height:3px}
    .choir-mixer .cm-seek input[type="range"]::-webkit-slider-thumb{width:12px;height:12px;margin-top:-4.5px;border:0}
    .choir-mixer .cm-seek input[type="range"]::-moz-range-thumb{width:12px;height:12px;border:0}
    .choir-mixer input[type="range"]:disabled{opacity:.4;cursor:default}
    .choir-mixer [hidden]{display:none!important}
    .choir-mixer[data-collapsed="true"]{max-width:44px;box-shadow:0 6px 20px #0005,0 0 0 1px var(--cm-line);color:var(--cm-accent-text)}
    .choir-mixer[data-collapsed="true"] .cm-header{padding:0;border:0}
    .choir-mixer[data-collapsed="true"] button{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;touch-action:none;color:inherit}
    @keyframes choir-level{to{transform:scaleY(.35)}}
    @media(prefers-reduced-motion:reduce){.choir-mixer .cm-activity i{animation:none!important}.choir-mixer button{transition:none}}
    @media(pointer:coarse){.choir-mixer .cm-transport{height:44px;gap:6px;padding:0}.choir-mixer .cm-transport button,.choir-mixer .cm-transport button[data-choir-action]{position:static;min-width:44px;min-height:44px}.choir-mixer .cm-auto-plan button,.choir-mixer .cm-channels-title,.choir-mixer .cm-channel-tab{min-width:44px;min-height:44px}}
    @media(pointer:coarse),(max-width:600px){.choir-mixer{max-height:calc(100dvh - 24px)}.choir-mixer .cm-header{padding:7px 12px}.choir-mixer .cm-player{padding:6px 12px}.choir-mixer .cm-now{margin-bottom:4px}.choir-mixer .cm-master,.choir-mixer .cm-tuning{padding:6px 12px}.choir-mixer .cm-auto-plan{gap:3px;padding:6px}.choir-mixer .cm-auto-plan button{padding:4px 3px}.choir-mixer .cm-channels-title{padding:8px 12px}.choir-mixer .cm-volume{grid-template-columns:minmax(0,1fr)}.choir-mixer .cm-volume>input[type="range"]{display:none}.choir-mixer .cm-volume-steps{grid-template-columns:44px minmax(0,1fr) 44px}.choir-mixer .cm-volume-steps>button{display:inline-flex}.choir-mixer .cm-volume-entry{height:44px}.choir-mixer .cm-volume-entry input{font-size:16px}.choir-mixer .cm-channel-head{gap:5px}.choir-mixer .cm-toggle{width:44px;height:44px}.choir-mixer .cm-toggle svg{width:19px;height:19px}}
    @media(pointer:coarse),(max-width:600px){.choir-mixer .cm-speed-options button{min-height:44px}}
    @media(max-height:480px){.choir-mixer .cm-header{padding:4px 10px}.choir-mixer .cm-body{overflow:auto;overscroll-behavior:contain}.choir-mixer .cm-player{padding:4px 10px}.choir-mixer .cm-caption{display:none}.choir-mixer .cm-transport{margin-bottom:0}.choir-mixer .cm-master,.choir-mixer .cm-tuning{padding:4px 10px}.choir-mixer .cm-auto-plan{padding:4px 8px}.choir-mixer .cm-levels{flex-shrink:0}.choir-mixer .cm-levels-body{overflow:visible}}
    .ensemble-tts .et-task-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;margin:16px 0 4px;padding:3px;background:var(--lumiverse-fill-subtle,#ffffff05);border:1px solid var(--lumiverse-border,#ffffff18);border-radius:10px}
    .ensemble-tts .et-task-tabs button{min-width:0;min-height:42px;padding:8px 3px;border:0;background:transparent;border-radius:7px;font-size:.86em;color:inherit}
    .ensemble-tts .et-task-tabs button[aria-selected="true"]{background:var(--lumiverse-primary-020,#c4b5fd26);color:var(--lumiverse-primary-text,#d8ccff);font-weight:700;box-shadow:inset 0 -2px var(--lumiverse-primary,#c4b5fd)}
    .ensemble-tts .et-task-tabs button:focus-visible{outline:2px solid var(--lumiverse-primary,#c4b5fd);outline-offset:2px}
    .ensemble-tts .et-task-panel{min-width:0;padding:2px 0 12px}
    .ensemble-tts .et-task-panel[hidden]{display:none!important}
    .ensemble-tts .et-task-panel>.et-hint{margin:10px 0 14px;line-height:1.5}
    .ensemble-tts .et-task-panel h3{font-size:1em}
    .ensemble-tts .et-task-panel>label{display:flex;flex-direction:column;gap:6px;margin:12px 0}
    .ensemble-tts .et-task-panel>.et-row{margin:12px 0}
    .ensemble-tts .et-task-panel>.et-subhead{margin-top:22px;padding-top:14px;border-top:1px solid var(--lumiverse-border,#ffffff18)}
    .ensemble-tts .et-header .et-toolbar:has(button:not([hidden]):not(:disabled)){margin-top:8px}
    .ensemble-tts .et-toolbar:has(>[data-et="stop"]:disabled):has(>[data-et="save"][hidden]){display:none}
  ${ABYSSAL_THEME_CSS}\n${DRAWER_UI_CSS}`);
  root.innerHTML = `<div class="ensemble-tts">
    <div class="et-header">
      <div class="et-title-group">
        <h2>Choir</h2>
      </div>
      <span class="et-save-state" data-et="saveState" role="status" aria-live="polite">Settings saved per chat</span>
      <div class="et-toolbar">
        <button data-et="latest">Plan latest</button>
        <button data-et="stop" disabled title="Stop planning, speech generation, and playback">${ICON_STOP} Stop</button>
        <button data-et="save" class="et-btn-primary" hidden>Retry save</button>
        <button data-et="showMixer">Open mixer</button>
        <button data-et="customizeMixer" aria-expanded="false">Customize mixer</button>
        <button data-et="setupWizard">Set up Choir</button>
      </div>
    </div>
    <section data-et="mixerLayout" class="et-card et-mixer-layout" aria-label="Mixer layout" hidden><h3>Mixer layout</h3><div data-et="mixerLayoutOptions"></div><div class="et-row"><button data-et="closeMixerLayout">Done</button></div></section>
    <p data-et="latestNotice" role="status" hidden>Already planned. Plan latest again to redo it.</p>
    <div data-et="feedback" role="group" aria-label="Choir status and errors">
      <div class="et-status" role="status" aria-live="polite" data-et="status">Open a chat to begin.</div>
      <div class="et-status" data-et="statusActions" hidden></div>
      <div class="et-status" data-et="sfxStatus" role="status" aria-live="polite" hidden></div>
      <small class="et-credit" data-et="musicCredit" hidden></small>
    </div>
    <section data-choir-page="cast"><div class="et-section-header">
      <h3>Cast</h3>
      <div class="et-btn-group"><button data-et="captureDefaults" class="et-btn-subtle" disabled>Set default</button><button data-et="applyDefaults" class="et-btn-subtle" disabled>Apply default</button><button data-et="add" class="et-btn-subtle">+ Add character</button></div>
    </div>
    <div data-et="fixed"></div>

    <div data-et="npcs"></div>
    <section data-et="otherCast" hidden><span data-et="otherCastCount" hidden>0</span><div data-et="otherCastRows"></div></section>
    <h4 class="et-subhead">Automatic casting</h4><p class="et-hint">Voice selection for characters discovered in the story.</p><div data-et="npcPolicyRoot" class="et-npc-policy"></div>
    <p data-et="defaultStatus" role="status" aria-live="polite" style="font-size:.85em;opacity:.8"></p>
    </section><section data-choir-page="settings">
    <div class="et-section-header">
      <h3>Speech & Planner</h3>
      <div class="et-row" style="margin:0">
        <button data-et="testPlanner" class="et-btn-subtle">Test planner</button>
        <button data-et="testTts" class="et-btn-subtle">Test TTS</button>
        <button data-et="load" class="et-btn-subtle">Reload</button>
      </div>
    </div>
    <h4 class="et-subhead">Voices</h4>
    <div class="et-grid">
      <label hidden>Voice connections<select data-et="connectionMode"><option value="several">Several TTS · per character</option><option value="one">One TTS · whole cast</option></select></label>
      <label>Lumiverse connection<select data-et="connection"></select></label>
      <label>Style handling<select data-et="styleParam"><option value="">Ignore style</option><option value="instructions">instructions (OpenAI)</option><option value="instruct">instruct</option><option value="prompt">prompt</option></select></label>
      <label data-et="fishVoiceSourceWrap" hidden>Voices the planner picks from<select data-et="fishVoiceSource"><option value="community">Fish community library</option><option value="own">My Fish voices</option><option value="both">Both</option></select></label>
    </div>
    <h4 class="et-subhead">Planner</h4>
    <div class="et-grid">
      <label>Planner engine<select data-et="plannerMode"><option value="llm">Standard LLM Connection</option><option value="jev">Jev System 1 (TypeSafe AI)</option><option value="heuristic">Heuristic (local only)</option></select></label>
      <label data-et="llmPlannerBox">Planner LLM connection<select data-et="planner"><option value="">Default LLM connection</option></select></label>
      <label data-et="jevPlannerBox" hidden>Decision connection<select data-et="decisionConnection"><option value="">Default Decision connection</option></select></label>
      <input data-et="jevKey" type="hidden">
      <input data-et="jevEndpoint" type="hidden">
    </div>
    <p data-et="plannerHint" role="note" style="font-size:.85em;opacity:.75;margin:6px 0 0" hidden></p>
    <div class="et-row">
      <label class="et-check" title="Combine compatible passages into fewer TTS calls; grouped clips share one level."><input data-et="batchSpeech" type="checkbox"> Group speech requests</label>
      <small data-et="groupingStatus" role="status" style="opacity:.75;flex-basis:100%;line-height:1.5" hidden></small>
    </div>
    </section><section data-choir-page="play"><h4 class="et-subhead">Sound</h4>
    <div class="et-row">
      <label class="et-check" title="Foley cues from Freesound (key in Playback → Soundscape)"><input data-et="enableSfx" type="checkbox" checked> Sound effects</label>
      <label class="et-check" title="Ambient background sound from Freesound"><input data-et="enableAmbience" type="checkbox" checked> Ambience</label>
      <label class="et-check" title="Kevin MacLeod's incompetech tracks, CC BY 4.0"><input data-et="enableMusic" type="checkbox"> Music</label>
      <label class="et-check" data-et="loopMusicWrap" title="Keep the track playing between replies until another music cue replaces it. Stop, music off, or changing chats ends playback."><input data-et="loopMusic" type="checkbox"> Loop music</label>
    </div>
    <h4 class="et-subhead">Playback</h4>
    <div class="et-tuning-grid">
      <section class="et-tuning">
        <div class="et-tuning-head"><span class="et-tuning-title">Playback speed</span><span class="et-tuning-hint">Speaks voices faster or slower with the pitch kept. Type any speed from 0.07× to 16×, the browser maximum. Sound effects and ambience stay at normal speed.</span></div>
        <div class="et-tuning-slot" data-et="playbackSpeedSlot"></div>
        <label class="et-tuning-max" title="Top end of every speed slider, from 1× to 16×. Typed speeds are not limited by it.">Slider maximum<span class="et-tuning-max-entry"><input data-et="speedSliderMax" type="number" min="1" max="16" step="0.25" inputmode="decimal"><span aria-hidden="true">×</span></span></label>
      </section>
      <section class="et-tuning">
        <div class="et-tuning-head"><span class="et-tuning-title">Gap between voices</span><span class="et-tuning-hint">Silence between consecutive spoken blocks. Sound effects and ambience are not counted.</span></div>
        <div class="et-tuning-slot" data-et="voiceGapSlot"></div>
      </section>
    </div>
    <h4 class="et-subhead">Reading</h4>
    <div class="et-row">
      <label class="et-check" style="display:inline-flex">Highlight spoken text<select data-et="readAlong" style="width:auto"><option value="off">Off</option><option value="passage">Passage</option><option value="word">Word by word</option></select></label>
      <label class="et-check" title="Scroll the chat to the passage being read. Scrolling yourself pauses this until the next Play."><input data-et="followNarration" type="checkbox"> Follow narration</label>
      <label class="et-check"><input data-et="auto" type="checkbox"> Auto-play new replies</label>
      <label class="et-check" hidden><input data-et="useStyle" type="checkbox" checked> Delivery styles</label>
      <label class="et-check" title="Inspect final Choir TTS request bodies after planning. Keeps the last 20 attempted calls in memory for this chat; no credentials or saved debug logs."><input data-et="paranoidMode" type="checkbox"> Paranoid mode · inspect TTS requests</label>
      <label class="et-check" hidden><input data-et="useFastClassifier" type="checkbox"> Fast Attribution (0ms instant for narration & 1-on-1 dialogue)</label>
    </div>
    </section><section data-choir-page="settings"><details>
      <summary>Skip tags and blocks</summary>
      <p class="et-hint">Automatic filtering skips interface panels. Add tags, classes or IDs below to exclude other blocks from speech across all chats.</p>
      <label>Custom skip rules<textarea data-et="ignoredTags" rows="2" placeholder="summary, .status-panel, #phone-panel" aria-label="Skip tags and blocks"></textarea></label>
      <small>Separate entries with commas or spaces. For example, &lt;summary&gt;, .status-panel or #phone-panel. Text inside matching blocks is skipped too.</small>
      <label class="et-check"><input data-et="skipMeta" type="checkbox" checked> Skip non-story blocks</label>
      <div class="et-row"><button data-et="previewReading" class="et-btn-subtle">Preview text to read</button></div>
      <small>The preview applies tag and interface filtering. Optional non-story checking runs when you plan a reply.</small>
      <pre data-et="readingPreview" role="status" hidden style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font:inherit;font-size:.85em"></pre>
    </details>

    <section>
      <h4 class="et-subhead">Performance &amp; storage</h4>
      <div class="et-grid" style="margin-top:10px">
        <label title="Changes existing saved audio in this chat and the default for new recordings. Other chats keep their saved deadlines.">Audio retention<select data-et="retention"><option value="session">This session only</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="forever">Indefinitely</option></select></label>
        <label>Concurrent TTS requests<select data-et="concurrency"><option value="1">1 (sequential)</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
        <label>Max characters per request<input data-et="chunk" type="number" min="80" max="10000" value="1800" aria-describedby="choir-chunk-hint"></label>
        <label>Planner output tokens<input data-et="plannerTokens" type="number" min="1024" max="32768" step="1024" value="8192"></label>
        <label>Prefetch speech clips<input data-et="prefetch" type="number" min="0" max="4" value="1"></label>
        <label class="et-check"><input data-et="allowLlmFallback" type="checkbox"> Allow LLM fallback after Jev fails (extra cost)</label>
        <label class="et-check" title="Balances speech clips. Grouped Gemini dialogue is balanced as a whole; other providers keep voices separate while matching is on."><input data-et="normalizeLoudness" type="checkbox" checked> Match passage loudness</label>
        <label hidden>Lumiverse API base<input data-et="apiBase" value="/api/v1"></label>
        <label>Freesound API key (Foley)<input data-et="freesoundApiKey" type="password" placeholder="Freesound token"></label>
      </div>
      <p id="choir-chunk-hint" style="font-size:.85em;opacity:.75">Shorter chunks can reduce the first wait, but many short requests can cause gaps at faster speeds.</p>
      <p style="font-size:.85em;opacity:.75">For smoother playback, try 2 prefetched speech clips and 2 concurrent TTS requests if your provider allows it. Effects and speech already saved before playback do not use speech lookahead slots. Prefetch 0 disables lookahead. More lookahead may generate speech you do not finish; changing playback speed does not speed up synthesis.</p>
      <div class="et-row">
        <label class="et-check"><input data-et="sectionButtons" type="checkbox"> Show message play controls</label>
        <label class="et-check"><input data-et="enableMixer" type="checkbox"> Floating audio mixer</label>
        <label class="et-check" title="Use the Abyssal Constellation appearance for the mixer."><input data-et="abyssalMixerTheme" type="checkbox"> Match Abyssal Constellation</label>
        <label class="et-check"><input data-et="showAutoPlanAction" type="checkbox"> Show Auto-plan in chat toolbar</label>
      </div>
      <label data-et="extraVoicesWrap" style="margin-top:10px"><span data-et="extraVoicesLabel">Additional voices & community models (ID | description)</span><textarea data-et="extraVoices" rows="2" placeholder="voice_id | description (e.g. Fish Audio community model ID or Gemini voice)"></textarea></label>
      <p data-et="geminiVoiceHint" hidden style="font-size:.85em;opacity:.75">For a lasting accent or character voice, choose a regional voice or create one in <a href="https://aistudio.google.com/generate-speech" target="_blank" rel="noopener noreferrer">Google AI Studio</a> and add its ID above. Custom voices use separate turns; grouped Gemini dialogue supports two prebuilt voices. Temporary voice keys expire after 7 days.</p>
    </section></section>
    <section data-et="planDetails" hidden><h4 data-et="planSummary">Speech plan</h4>
    <div data-et="preview"></div>
    <details>
      <summary>Edit attribution JSON</summary>
      <textarea data-et="planJson" rows="6" spellcheck="false" style="margin-top:8px"></textarea>
      <button data-et="apply" style="margin-top:8px">Apply JSON</button>
    </details></section>
    <section data-et="ttsInspector" hidden>
      <p class="et-hint">Exact request bodies from Choir to the Lumiverse TTS relay, after attribution, voice selection, pronunciation and tone injection. For grouped speech, parameters.turns contains each speaker's text and voice. The relay may format the provider request further.</p>
      <div class="et-row"><label>Show<select data-et="ttsInspectorView"><option value="prepared">Prepared requests</option><option value="sent">Attempted calls (0)</option></select></label><button data-et="refreshTtsInspector">Refresh view</button><button data-et="clearTtsLog">Clear call log</button></div>
      <p data-et="ttsInspectorNote" class="et-hint"></p>
      <div data-et="ttsRequests"></div>
    </section>
    <details hidden><summary>Import / export cast</summary><p>Exports include routes and preferences, never credentials. Imported routes must exist on this host.</p>
      <textarea data-et="castJson" aria-label="Cast JSON"></textarea><button data-et="exportCast">Export cast</button><button data-et="importCast">Validate and import cast</button>
    </details>
    <details><summary>Recent messages &amp; saved audio</summary>
    <div class="et-row">
      <button data-et="deleteChatAudio" class="et-btn-danger">Clear chat audio</button>
    </div>
    <div data-et="messages"></div>
    </details>
  </div>`;
  const $ = name => root.querySelector(`[data-et="${name}"]`);
  const drawerNavigation=createDrawerNavigation(root);
  for(const button of root.querySelectorAll('button'))button.type='button';
  const pending = new Map();
  let audioNamespace,audioNamespaceError;
  for(let attempt=0;attempt<2;attempt++){
    try{
      audioNamespace=await ctx.settings.get('audio:namespace');
      if(!audioNamespace){audioNamespace=randomUuid();await ctx.settings.set('audio:namespace',audioNamespace);}
      audioNamespaceError=null;break;
    }catch(error){
      audioNamespaceError=error;
      if(attempt===0)await new Promise(resolve=>setTimeout(resolve,150));
    }
  }
  let audioDatabase,audioDatabaseHandle;
  const sessionAudio=new Map();
  const paragraphAudioCache=new Map(),foleyCache=new Map(),volatilePolicies=new Map(),transcriptCache=new Map();
  let audioInvalidations=null,paragraphPlaybackScope=null;
  const audioExpired=record=>record?.expiresAt!=null && record.expiresAt<=Date.now();
  function recordingWithRetention(record,retention){
    const createdAt=record.createdAt ?? Date.now();
    return {...record,createdAt,retention,expiresAt:retention==='forever' || retention==='session'?null:createdAt+Number(retention)*86400000};
  }
  function volatileScope(snapshot){return {chatId:snapshot.audioScope?.chatId ?? chatId,messageId:snapshot.audioScope?.messageId || null};}
  function volatileKey(key,snapshot){const scope=volatileScope(snapshot);return JSON.stringify([scope.chatId,scope.messageId,key]);}
  const sameAudioScope=(entry,scope)=>entry.chatId===scope.chatId && (!entry.messageId || !scope.messageId || entry.messageId===scope.messageId);
  function invalidateVolatileAudio(change,broadcast=true){
    if(change.kind==='policy')volatilePolicies.set(change.chatId,change.retention);
    let stopParagraph=paragraphPlaybackScope && ['delete','chat'].includes(change.kind) && sameAudioScope(paragraphPlaybackScope,change);
    for(const cache of [paragraphAudioCache,foleyCache])for(const [key,entry] of cache){
      if(change.kind==='prune'){if(!audioExpired(entry))continue;}
      else{
        if(entry.chatId!==change.chatId)continue;
        if(change.kind==='delete' && !sameAudioScope(entry,change))continue;
        if(change.kind==='policy'){
          Object.assign(entry,recordingWithRetention(entry,change.retention));
          if(!audioExpired(entry))continue;
        }
      }
      cache.delete(key);
      if(['policy','prune'].includes(change.kind) && paragraphPlaybackScope && sameAudioScope(entry,paragraphPlaybackScope))stopParagraph=true;
    }
    if(stopParagraph)stop(false);
    if(broadcast && change.kind!=='prune')try{audioInvalidations?.postMessage(change);}catch{}
  }
  function invalidateRecordingAudio(key){const [,targetChat,messageId]=JSON.parse(key);invalidateVolatileAudio({kind:'delete',chatId:targetChat,messageId});}
  function readVolatileAudio(cache,key){
    const entry=cache.get(key);
    if(entry && (audioExpired(entry) || entry.signal?.aborted)){cache.delete(key);return;}
    return entry;
  }
  function loadVolatileAudio(cache,key,sourceKey,snapshot,signal,load,limit){
    const cached=readVolatileAudio(cache,key);if(cached)return cached.promise;
    const scope=volatileScope(snapshot),retention=volatilePolicies.get(scope.chatId) ?? snapshot.retention ?? 'forever';
    const entry={...recordingWithRetention({createdAt:Date.now()},retention),...scope,sourceKey,signal};
    entry.promise=Promise.resolve().then(load).then(value=>{
      signal?.throwIfAborted();
      // Deletion/expiry removes the pending entry too: late work cannot put it back.
      if(cache.get(key)!==entry || audioExpired(entry))throw abortError();
      entry.signal=null;return value;
    }).catch(error=>{if(cache.get(key)===entry)cache.delete(key);throw error;});
    cache.set(key,entry);
    if(cache.size>limit)cache.delete(cache.keys().next().value);
    return entry.promise;
  }
  function openRecordingDatabase(){
    if(!audioDatabase){
      const opening=new Promise((resolve,reject)=>{
        const request=indexedDB.open('choir-recordings',2);
        let settled=false;
        const fail=error=>{if(settled)return;settled=true;reject(error);};
        request.onupgradeneeded=()=>{for(const name of ['recordings','recording-state'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
        request.onsuccess=()=>{if(settled){try{request.result.close();}catch{}return;}settled=true;resolve(request.result);};
        request.onerror=()=>fail(request.error || new Error('Device audio storage could not be opened.'));
        request.onblocked=()=>fail(new Error('Close other Lumiverse tabs to enable recording storage.'));
      });
      audioDatabase=opening;
      opening.then(db=>{
        // A failed open is forgotten in the rejection handler, so a later call can retry.
        if(audioDatabase!==opening){db.close();return;}
        audioDatabaseHandle=db;
        const forget=()=>{if(audioDatabaseHandle===db){audioDatabaseHandle=null;audioDatabase=null;}};
        db.onversionchange=()=>{db.close();forget();};
        db.onclose=forget;
      },()=>{if(audioDatabase===opening)audioDatabase=null;});
    }
    return audioDatabase;
  }
  // A request error bubbles to the transaction before transaction.error is
  // guaranteed to be populated. The event target always carries the request's
  // error, so use it first and never reject with null.
  const recordingFailure=(event,fallback)=>event?.target?.error || event?.target?.transaction?.error || event?.currentTarget?.error || fallback;
  function runRecordingTransaction(db,operation,key,value){
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['recordings','recording-state'],'readwrite');
      const store=transaction.objectStore('recordings'),state=transaction.objectStore('recording-state');
      let result,failure;const sessionChanges=new Map(),invalidatedKeys=new Set();
      const stateKey=(kind,recordKey)=>JSON.stringify([kind,...JSON.parse(recordKey).slice(0,kind==='generation'?3:2)]);
      const guard=callback=>(...args)=>{try{callback(...args);}catch(error){failure=error;transaction.abort();}};
      const remove=recordKey=>{
        invalidatedKeys.add(recordKey);
        store.delete(recordKey);sessionChanges.set(recordKey,null);
        const marker=stateKey('generation',recordKey),request=state.get(marker);
        request.onsuccess=guard(()=>state.put((request.result || 0)+1,marker));
      };
      // Read policy and invalidation markers in the same transaction as the
      // audio write. A stale tab cannot race a newer policy or a deletion.
      const inspect=(recordKey,callback)=>{
        const requests=[store.get(recordKey),state.get(stateKey('generation',recordKey)),state.get(stateKey('epoch',recordKey)),state.get(stateKey('policy',recordKey))];
        let remaining=requests.length;
        for(const request of requests)request.onsuccess=guard(()=>{if(!--remaining)callback(requests[0].result,{generation:requests[1].result || 0,epoch:requests[2].result || 0,policyRevision:requests[3].result?.revision || 0},requests[3].result);});
      };
      const sameStamp=(record,stamp)=>record?.recordingState?record.recordingState.generation===stamp.generation && record.recordingState.epoch===stamp.epoch:!stamp.generation && !stamp.epoch;
      const put=(recordKey,incoming,existing,stamp,policy,policyChange=false)=>{
        if(!sameStamp(incoming,stamp)){
          sessionAudio.delete(recordKey);failure=new Error('This audio was deleted or expired during playback. Play the message again to save a new recording.');return;
        }
        const changedPolicy=(incoming.recordingState?.policyRevision || 0)!==stamp.policyRevision;
        const retention=(policyChange || changedPolicy?policy?.retention:null) || existing?.retention || incoming.retention || 'forever';
        const base={...incoming,createdAt:existing?.createdAt ?? incoming.createdAt ?? Date.now()};
        let updated=recordingWithRetention(base,retention);
        const previous=existing || incoming;
        if(!policyChange && previous.retention===retention && (previous.expiresAt===null || Number.isFinite(previous.expiresAt)))updated.expiresAt=previous.expiresAt;
        updated.recordingState=stamp;
        if(audioExpired(previous) || audioExpired(updated)){remove(recordKey);return;}
        if(retention==='session'){store.delete(recordKey);sessionChanges.set(recordKey,updated);result=updated;return;}
        // Retain a fallback only after the shared deletion markers validated it.
        sessionAudio.set(recordKey,updated);store.put(updated,recordKey);sessionChanges.set(recordKey,null);result=updated;
      };
      if(['get','begin','put','delete'].includes(operation)){
        inspect(key,(existing,stamp,policy)=>{
          if(operation==='delete'){remove(key);return;}
          if(operation==='put'){put(key,value,existing,stamp,policy);return;}
          let record=existing || sessionAudio.get(key);
          if(record && !sameStamp(record,stamp)){sessionChanges.set(key,null);record=null;}
          if(record && audioExpired(record)){remove(key);stamp={...stamp,generation:stamp.generation+1};record=null;}
          if(record){
            if(policy && (record.recordingState?.policyRevision || 0)!==stamp.policyRevision)record=recordingWithRetention(record,policy.retention);
            if(audioExpired(record)){remove(key);stamp={...stamp,generation:stamp.generation+1};record=null;}
          }
          result=record?{...record,recordingState:stamp}:operation==='begin'?{recordingState:stamp}:undefined;
        });
      }else{
        const targetChat=key?JSON.parse(key)[1]:null,seen=new Set();
        if(operation==='listChat')result=[];
        if(operation==='policy'){
          const marker=stateKey('policy',key),request=state.get(marker);
          request.onsuccess=guard(()=>state.put({retention:value.retention,revision:(request.result?.revision || 0)+1},marker));
        }
        if(operation==='deleteChat'){
          const marker=stateKey('epoch',key),request=state.get(marker);
          request.onsuccess=guard(()=>state.put((request.result || 0)+1,marker));
        }
        const policyRecord=(recordKey,record)=>{
          seen.add(recordKey);sessionChanges.set(recordKey,null);
          if(audioExpired(record)){remove(recordKey);return;}
          inspect(recordKey,(existing,stamp)=>put(recordKey,record,existing,stamp,{retention:value.retention},true));
        };
        const cursorRequest=store.openCursor();
        cursorRequest.onsuccess=guard(()=>{
          const cursor=cursorRequest.result;
          if(cursor){
            let identity;try{identity=JSON.parse(cursor.key);}catch{}
            if(identity?.[0]===audioNamespace){
              if(operation==='listChat' && identity[1]===targetChat){seen.add(cursor.key);if(!audioExpired(cursor.value) && cursor.value.playedAudio?.blob?.size)result.push(identity[2]);}
              else if(operation==='deleteChat' && identity[1]===targetChat){cursor.delete();sessionChanges.set(cursor.key,null);}
              else if(operation==='policy' && identity[1]===targetChat)policyRecord(cursor.key,cursor.value);
              else if(audioExpired(cursor.value))remove(cursor.key);
            }
            cursor.continue();return;
          }
          for(const [sessionKey,record] of sessionAudio){
            const identity=JSON.parse(sessionKey);if(identity[0]!==audioNamespace)continue;
            if(operation==='listChat' && identity[1]===targetChat && !seen.has(sessionKey) && !audioExpired(record) && record.playedAudio?.blob?.size)result.push(identity[2]);
            else if(operation==='deleteChat' && identity[1]===targetChat)sessionChanges.set(sessionKey,null);
            else if(operation==='policy' && JSON.parse(sessionKey)[1]===targetChat && !seen.has(sessionKey))policyRecord(sessionKey,record);
            else if(operation==='prune' && audioExpired(record))sessionChanges.set(sessionKey,null);
          }
        });
      }
      transaction.oncomplete=()=>{for(const [sessionKey,record] of sessionChanges)if(record)sessionAudio.set(sessionKey,record);else sessionAudio.delete(sessionKey);if(operation!=='delete')for(const key of invalidatedKeys)invalidateRecordingAudio(key);if(failure)reject(failure);else resolve(result);};
      transaction.onerror=event=>reject(failure || recordingFailure(event,new Error('Recording storage failed.')));
      transaction.onabort=event=>reject(failure || recordingFailure(event,new Error('Recording storage failed.')));
    });
  }
  function recordingInUse(key){
    for(const entry of [activePlayback,planSource])if(entry && recordingKey(entry.chatId,entry.messageId)===key)return true;
    return Boolean(chatId && messagePlaybackId && recordingKey(chatId,messagePlaybackId)===key);
  }
  // Only the selected retention policy may end a recording's life. Indefinite
  // audio (expiresAt === null) and unexpired timed audio are never removed here.
  function purgeExpiredRecordings(db,keepKey){
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(['recordings','recording-state'],'readwrite');
      const store=transaction.objectStore('recordings'),state=transaction.objectStore('recording-state'),removedKeys=[];
      let removed=0;
      const request=store.openCursor();
      request.onsuccess=()=>{
        const cursor=request.result;
        if(cursor){
          let identity;try{identity=JSON.parse(cursor.key);}catch{}
          const record=cursor.value;
          const expired=record?.expiresAt!=null && record.expiresAt<=Date.now();
          if(identity?.[0]===audioNamespace && cursor.key!==keepKey && !recordingInUse(cursor.key) && expired){
            store.delete(cursor.key);removedKeys.push(cursor.key);removed++;
            const marker=JSON.stringify(['generation',...identity]),generation=state.get(marker);generation.onsuccess=()=>state.put((generation.result || 0)+1,marker);
          }
          cursor.continue();
        }
      };
      transaction.oncomplete=()=>{for(const key of removedKeys){sessionAudio.delete(key);invalidateRecordingAudio(key);}resolve(removed);};
      transaction.onerror=event=>reject(recordingFailure(event,new Error('Recording storage cleanup failed.')));
      transaction.onabort=event=>reject(recordingFailure(event,new Error('Recording storage cleanup failed.')));
    });
  }
  function recordingStore(operation,key,value) {
    // Storage is optional for playback. A suspended IndexedDB request may still
    // finish later, so keep it running while bounding how long the UI waits.
    const pending=accessRecordingStore(operation,key,value);
    if(!['get','begin','listChat'].includes(operation))void pending.then(()=>{
      if(operation==='delete')invalidateRecordingAudio(key);
      else if(operation==='deleteChat' || operation==='policy')invalidateVolatileAudio({kind:operation==='deleteChat'?'chat':'policy',chatId:JSON.parse(key)[1],retention:value?.retention});
      else if(operation==='prune')invalidateVolatileAudio({kind:'prune'});
      if(!disposed && !busy)void refreshMessageDownloads();
    },()=>{});
    let timer;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Device audio storage is taking too long. Audio remains available in this session; pending saves continue in the background.')),5000);});
    return Promise.race([pending,deadline]).finally(()=>clearTimeout(timer));
  }
  async function accessRecordingStore(operation,key,value) {
    if(operation==='listChat' && (audioNamespaceError || !globalThis.indexedDB))return [...sessionAudio].flatMap(([recordKey,record])=>{const identity=JSON.parse(recordKey);return identity[0]===audioNamespace && identity[1]===JSON.parse(key)[1] && !audioExpired(record) && record.playedAudio?.blob?.size?[identity[2]]:[];});
    if(operation==='delete')sessionAudio.delete(key);
    if(operation==='deleteChat')for(const sessionKey of [...sessionAudio.keys()])if(JSON.parse(sessionKey)[1]===JSON.parse(key)[1])sessionAudio.delete(sessionKey);
    if(operation==='put') {
      value={...recordingWithRetention(value,value.retention || 'forever'),...(value.expiresAt===null || Number.isFinite(value.expiresAt)?{expiresAt:value.expiresAt}:{})};
      if(!audioExpired(value))sessionAudio.set(key,value);
    }
    if((audioNamespaceError || !globalThis.indexedDB) && ['get','begin','put'].includes(operation)){
      if(operation==='put'){if(!audioExpired(value))sessionAudio.set(key,value);if(value.retention==='session')return value;}
      else{const record=sessionAudio.get(key);if(record && !audioExpired(record))return record;if(operation==='get' && record)sessionAudio.delete(key);}
    }
    if(audioNamespaceError)throw new Error(`Audio storage settings could not be loaded: ${audioNamespaceError.message}`);
    if(!globalThis.indexedDB)throw new Error('Device audio storage is unavailable in this browser.');
    let db;
    try{db=await openRecordingDatabase();}catch(error){
      const fallback=sessionAudio.get(key);
      if(['get','begin'].includes(operation) && fallback && !audioExpired(fallback))return fallback;
      if(operation==='put' && !audioExpired(value)){sessionAudio.set(key,value);if(value.retention==='session')return value;}
      throw error;
    }
    try{return await runRecordingTransaction(db,operation,key,value);}
    catch(error){
      error ||= new Error('Recording storage failed.');
      if(error?.name==='InvalidStateError' || error?.name==='TransactionInactiveError'){
        // The browser or another tab closed the connection. Reopen once instead of
        // disabling saved audio for the rest of the session.
        audioDatabaseHandle=null;audioDatabase=null;
        db=await openRecordingDatabase();
        return runRecordingTransaction(db,operation,key,value);
      }
      if(operation==='put' && error?.name==='QuotaExceededError'){
        let removed=0;
        try{removed=await purgeExpiredRecordings(db,key);}
        catch(purgeError){
          if(purgeError?.name==='InvalidStateError' || purgeError?.name==='TransactionInactiveError')throw purgeError;
        }
        if(removed){
          try{
            const result=await runRecordingTransaction(db,operation,key,value);
            status(`Storage was full. Removed ${removed} expired recording${removed===1?'':'s'}; audio kept indefinitely was not touched.`);
            return result;
          }catch(retryError){
            if(retryError?.name!=='QuotaExceededError')throw retryError;
            error=retryError;
          }
        }
        throw new Error(`Device audio storage is full.${removed?` ${removed} expired recording${removed===1?' was':'s were'} removed, but the new audio still did not fit.`:' Choir does not delete audio saved with “Indefinitely” retention automatically.'} Clear saved audio for another message or chat, or choose a shorter retention period. (${error.message})`);
      }
      throw error;
    }
  }
  const recordingKey=(chat,message)=>JSON.stringify([audioNamespace,chat,message]);
  const unsubs = [];
  let autoPlanAction=null,autoPlanActionKey='';
  let autoPlanMount=null;
  const toolbarAutoPlan=document.createElement('button');toolbarAutoPlan.type='button';toolbarAutoPlan.className='choir-auto-plan-action';toolbarAutoPlan.dataset.choirAction='auto-plan-toolbar';
  toolbarAutoPlan.innerHTML=`${ICON_SPARKLE}<span></span>`;toolbarAutoPlan.onclick=()=>run(toggleAutoPlan);
  const messageStatuses=new Map(),messageSections=new Set(),seekControls=new Set();let messagePlaybackId=null,messageOperation=null;
  let disposed=false, loadVersion=0, revision=0, visibleStops=0, voicesLoading=Promise.resolve(), config, chatId=null, plan=null, planSource=null, planAttribution=null, planningSource=null, busy=false;
  const ttsRequestLog=[];let ttsRequestSequence=0;
  unsubs.push(()=>{ttsRequestLog.length=0;});
  let activeCharacterCard=null,activePersonaName='',activeCardKey='';
  const autoReplyQueue=new Map(),seenAutoGenerations=new Set();let autoReplyTimer=null,autoReplyActive=null;
  let voices=[...GEMINI_VOICES], nativeConnections=[], nativeProviders=[], castRows=[], npcRows=[], voiceIdEditorCount=0;
  const voiceCatalogues=new Map();let voiceCatalogueRevision=0;
  let controller=null, currentAudio=null, finishAudio=null, objectUrl=null;
  const paragraphPrefetchControllers=new Set();
  const defaults = () => ({planner:'',connection:'',decisionConnection:'',styleParam:'',apiBase:'/api/v1',chunk:1800,batchSpeech:false,concurrency:1,plannerTokens:8192,
    prefetch:1,normalizeLoudness:true,skipMeta:true,allowLlmFallback:false,sectionButtons:false,paranoidMode:false,connectionMode:'several',enableMixer:false,singleVoices:{},
    extraVoices:'',ignoredTags:'',useStyle:true,auto:false,autoPlan:false,showAutoPlanAction:false,muteNarrator:false,enableSfx:true,enableAmbience:true,enableMusic:false,loopMusic:false,freesoundApiKey:'',npcPolicy:{mode:'llm',route:'',voice:'',voices:[]},fishVoiceSource:'community',plannerMode:'llm',useFastClassifier:false,useJev:false,jevApiKey:'',jevEndpoint:'https://api.typesafe.ai/v1',planBatchChars:3600,planBatchUnits:24,retention:'forever',readAlong:'off',followNarration:false,casts:{},fixed:[
      {speaker:'Narrator',voice:'Charon',style:'Clear, measured narration'},
      {speaker:'Persona',voice:'',style:''},
      {speaker:'Character',voice:'',style:''} ]});
  const withoutSecrets=c=>({...c,jevApiKey:''});
  const planKey=async(chat,message)=>`plan:${await sha256Hex(JSON.stringify([chat,message]))}`;
  let readAlongStop=null,followContainer=null,followPaused=false,followGroup=null,followRange=null,followWord=false;
  const followResume=document.createElement('button');followResume.type='button';followResume.className='choir-follow-resume';followResume.hidden=true;
  document.body.append(followResume);unsubs.push(()=>followResume.remove());
  let currentSpeaker='', currentGroupLevel=null,currentGroupNames=[], audioContext, currentGain, currentNormalize=1, activePlayback,advancePlayback,skipAudio,audioReady=false,generationPolicyChanged,mixerPlaybackSegments=null,bedsPaused=false;
  // Speech takes the playback speed; the silence before a spoken block is held here so Pause and skips reach it.
  let currentAudioSpeech=false,currentSpeedSpeaker='',voiceGapHold=null;
  // Keep the launcher unobtrusive on every load, including existing expanded preferences.
  const savedMixer=await ctx.settings.get('ui:mixer').catch(()=>null);
  const mixerLayoutDefaults={speedPresets:true,speedSlider:false,gapSlider:false,voiceSpeeds:false,channelLevels:true,'auto-plan':true,'auto-play':true,sfx:true,ambience:true,music:true,follow:false,'message-controls':false};
  const quickButtonKeys=['auto-plan','auto-play','sfx','ambience','music','follow','message-controls'];
  function normalizeMixer(saved){
    const mixerState={master:1,sfx:1,ambience:1,music:1,levelsCollapsed:true,channelTab:'',channels:{},x:20,y:80,enabled:saved?(saved.enabled??true):Boolean(config?.enableMixer),abyssalTheme:false,playbackRate:PLAYBACK_RATE_LIMITS.fallback,voiceGapMs:VOICE_GAP_LIMITS.fallback,...structuredClone(saved||{})};
    mixerState.layout=Object.fromEntries(Object.entries(mixerLayoutDefaults).map(([key,value])=>[key,typeof mixerState.layout?.[key]==='boolean'?mixerState.layout[key]:value]));
    mixerState.quickButtonOrder=[...new Set([...(Array.isArray(mixerState.quickButtonOrder)?mixerState.quickButtonOrder:[]),...quickButtonKeys])].filter(key=>quickButtonKeys.includes(key));
    mixerState.quickButtonColumns=normalizeMixerColumns(mixerState.quickButtonColumns);
    mixerState.volumeLimits=normalizeMixerVolumeLimits(mixerState.volumeLimits);
    mixerState.master=Math.min(mixerState.volumeLimits.master,Math.max(0,Number(mixerState.master)||0));
    for(const kind of ['music','ambience','sfx'])mixerState[kind]=Math.min(mixerState.volumeLimits[kind],Math.max(0,Number(mixerState[kind])||0));
    for(const channel of Object.values(mixerState.channels))channel.volume=Math.min(mixerState.volumeLimits.voices,Math.max(0,Number(channel.volume??1)||0));
    // Global speed and gap are mixer state, saved in ui:mixer beside the channel levels, so they work with or without a chat open.
    mixerState.speedSliderMax=normalizeSpeedSliderMax(mixerState.speedSliderMax);mixerState.playbackRate=normalizePlaybackRate(mixerState.playbackRate);mixerState.voiceGapMs=normalizeVoiceGap(mixerState.voiceGapMs);
    // Solo is no longer exposed; old solo preferences must not silently mute other voices.
    for(const channel of Object.values(mixerState.channels))delete channel.solo;
    // Dedicated effect levels replace legacy voice-channel preferences.
    delete mixerState.channels.SFX;delete mixerState.channels.sfx;
    return mixerState;
  }
  let mixerState={...normalizeMixer(savedMixer),collapsed:true};
  const mixerBaseline=structuredClone(mixerState);
  const replaceBaseline=(baseline,value)=>{const copy=structuredClone(value);for(const key of Object.keys(baseline))delete baseline[key];Object.assign(baseline,copy);};
  const withSettingsLock=write=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request(`choir-settings:${audioNamespace || 'default'}`,write):write();
  const mixer=document.createElement('section');mixer.className='choir-mixer';mixer.dataset.choirMixer='';mixer.setAttribute('aria-label','Choir voice mixer');
  const mixerHeader=document.createElement('div');mixerHeader.className='cm-header';mixerHeader.title='Drag to move';
  const mixerTitle=document.createElement('div');mixerTitle.className='cm-brand';mixerTitle.innerHTML=`<span class="cm-brand-icon" aria-hidden="true">${ICON_SOUND}</span><span><strong>Choir</strong><small>Voice mixer</small></span>`;
  const collapse=document.createElement('button');collapse.type='button';collapse.className='cm-close';collapse.setAttribute('aria-label','Collapse or reopen voice mixer');
  mixerHeader.append(mixerTitle,collapse);
  const mixerBody=document.createElement('div'), speakerLabel=document.createElement('p'), channelsRoot=document.createElement('div');mixerBody.className='cm-body';channelsRoot.className='cm-channels';speakerLabel.className='cm-speaker';speakerLabel.setAttribute('aria-live','polite');
  const player=document.createElement('div');player.className='cm-player';
  const nowPlaying=document.createElement('div');nowPlaying.className='cm-now';
  const nowText=document.createElement('div'),playbackCaption=document.createElement('span');playbackCaption.className='cm-caption';nowText.append(playbackCaption,speakerLabel);
  const activity=document.createElement('span');activity.className='cm-activity';activity.setAttribute('aria-hidden','true');activity.innerHTML='<i></i><i></i><i></i><i></i>';nowPlaying.append(nowText,activity);
  function showVolume(input,readout,value){const percent=Math.round(Number(value)*100);readout.textContent=`${percent}%`;input.style.setProperty('--choir-level',`${percent/Number(input.max)}%`);input.setAttribute('aria-valuetext',`${percent} percent`);}
  function makeMixerVolume(name,value,readout,onValue,maxVolume=1){
    const root=document.createElement('div');root.className='cm-volume';
    let maxPercent=maxVolume*100;
    if(maxVolume>1)root.title=`Increase above 100% if the audio is too quiet (up to ${maxPercent}%).`;
    const range=document.createElement('input');range.type='range';range.min='0';range.max=String(maxVolume);range.step='0.01';range.setAttribute('aria-label',`${name} volume`);
    range.title='Drag to adjust, use arrow keys for 1% steps, or double-click to reset to 100%.';
    const steps=document.createElement('div');steps.className='cm-volume-steps';
    const minus=document.createElement('button'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label',`Decrease ${name} volume`);plus.setAttribute('aria-label',`Increase ${name} volume`);
    const entry=document.createElement('div');entry.className='cm-volume-entry';const number=document.createElement('input');number.type='number';number.min='0';number.max=String(maxPercent);number.step='1';number.inputMode='numeric';number.setAttribute('aria-label',`${name} volume percent`);
    const unit=document.createElement('span');unit.textContent='%';unit.setAttribute('aria-hidden','true');entry.append(number,unit);steps.append(minus,entry,plus);root.append(range,steps);
    let percent=Math.max(0,Math.min(maxPercent,Math.round(Number(value)*100)));
    const sync=()=>{range.value=percent/100;number.value=String(percent);showVolume(range,readout,percent/100);minus.disabled=percent===0;plus.disabled=percent===maxPercent;};
    const change=(next,save)=>{percent=Math.max(0,Math.min(maxPercent,Math.round(next)));sync();onValue(percent/100);if(save)void persistMixer();};
    range.oninput=()=>change(Number(range.value)*100,false);range.onchange=()=>persistMixer();
    range.ondblclick=()=>change(100,true);
    number.oninput=()=>{if(number.value.trim() && Number.isFinite(Number(number.value)))change(Number(number.value),true);};
    number.onblur=sync;number.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();number.blur();}};
    minus.onclick=()=>change(percent-5,true);plus.onclick=()=>change(percent+5,true);root.setVolumeMaximum=(maximum,value)=>{maxVolume=maximum;maxPercent=maximum*100;range.max=String(maximum);number.max=String(maxPercent);percent=Math.max(0,Math.min(maxPercent,Math.round(value*100)));sync();};sync();return root;
  }
  const masterLabel=document.createElement('div');masterLabel.className='cm-master';masterLabel.textContent='Master';
  const masterReadout=document.createElement('span');masterReadout.className='cm-percent';masterReadout.setAttribute('aria-hidden','true');const masterVolume=makeMixerVolume('Master',mixerState.master,masterReadout,value=>{mixerState.master=value;applyVolume();},mixerState.volumeLimits.master);masterLabel.append(masterVolume,masterReadout);
  // Same slider, step buttons and entry as the volume rows. The slider shows min..max; typed values and buttons reach hardMin..hardMax, and the readout always shows the true value.
  function makeMixerTuning(name,{min,max,hardMin=min,hardMax=max,step,nudge,fallback,decimals,unit,text,title,onValue,onCommit,onReset}){
    const root=document.createElement('div');root.className='cm-volume';root.title=title;
    const range=document.createElement('input');range.type='range';range.min=String(min);range.max=String(max);range.step=String(step);range.setAttribute('aria-label',name);
    range.title=`Drag or use arrow keys to adjust, or double-click to reset to ${text(fallback)}.`;
    const steps=document.createElement('div');steps.className='cm-volume-steps';
    const minus=document.createElement('button'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';
    minus.setAttribute('aria-label',`Decrease ${name.toLowerCase()}`);plus.setAttribute('aria-label',`Increase ${name.toLowerCase()}`);
    const entry=document.createElement('div');entry.className='cm-volume-entry';const number=document.createElement('input');number.type='number';number.min=String(hardMin);number.max=String(hardMax);number.step=String(step);number.inputMode='decimal';number.setAttribute('aria-label',`${name} value`);
    const suffix=document.createElement('span');suffix.textContent=unit;suffix.setAttribute('aria-hidden','true');entry.append(number,suffix);steps.append(minus,entry,plus);root.append(range,steps);
    let current=fallback;
    const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));
    // Typed values and buttons land on the step grid inside hardMin..hardMax. NaN keeps the current value.
    const quantize=value=>{const numeric=Number(value);if(!Number.isFinite(numeric))return current;return Number((hardMin+Math.round((clamp(numeric,hardMin,hardMax)-hardMin)/step)*step).toFixed(decimals));};
    // An entry keeps its text only while the user types in it. Any other change, such as the drawer slider, repaints it even if the entry still has focus.
    let typing=false;
    const paint=()=>{
      // The slider can only show min..max, so a value beyond it pins the thumb at the end and the fill at 100%.
      const shown=clamp(current,min,max);
      range.value=String(shown);
      // Inside the slider's range the thumb's value is the one the browser kept, so thumb and readout always agree.
      const actual=Number(range.value);if(current>=min && current<=max && Number.isFinite(actual))current=actual;
      if(!typing)number.value=current.toFixed(decimals);
      range.style.setProperty('--choir-level',`${(shown-min)/(max-min)*100}%`);range.setAttribute('aria-valuetext',text(current));
      minus.disabled=current<=hardMin;plus.disabled=current>=hardMax;
    };
    const change=(next,commit)=>{current=quantize(next);paint();onValue(current);if(commit)onCommit();};
    range.oninput=()=>{typing=false;change(range.value,false);};range.onchange=()=>onCommit();
    // Double-click resets to the default, unless the control supplies its own reset (a character that follows the master speed).
    const reset=()=>{typing=false;return onReset?onReset():change(fallback,true);};
    range.ondblclick=reset;
    number.oninput=()=>{if(number.value.trim() && Number.isFinite(Number(number.value))){typing=true;change(number.value,true);}};
    number.onblur=()=>{typing=false;paint();};number.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();number.blur();}};
    minus.onclick=()=>{typing=false;change(current-nudge,true);};plus.onclick=()=>{typing=false;change(current+nudge,true);};
    // A row that follows another value shows it dimmed and says how to set its own value.
    const setInherited=(flag,inheritedHint,ownHint)=>{root.classList.toggle('cm-inherited',Boolean(flag));root.title=flag?inheritedHint:ownHint;};
    paint();
    // The slider's top end can move (the user's slider maximum). Typed values keep their own hardMin..hardMax.
    const setSliderMax=value=>{max=Math.max(min+step,Number(value)||max);range.max=String(max);paint();};
    return {root,set(value){const next=quantize(value);if(next!==current)typing=false;current=next;paint();},reset,setInherited,setSliderMax};
  }
  // Speed and gap are mixer state saved in ui:mixer beside the channel levels, so they work with or without a chat open.
  // The slider shows a practical part of the speed range. Typed values and the step buttons reach every speed the browser plays.
  // The slider's top end is the user's choice (settings card), from 1× up to the 16× browser maximum.
  const SPEED_SLIDER={min:0.25,max:mixerState.speedSliderMax};
  const SPEED_CONTROL={...SPEED_SLIDER,hardMin:PLAYBACK_RATE_LIMITS.min,hardMax:PLAYBACK_RATE_LIMITS.max,step:PLAYBACK_RATE_LIMITS.step,fallback:PLAYBACK_RATE_LIMITS.fallback,nudge:0.05,decimals:2,unit:'×',text:value=>`${value.toFixed(2)}×`};
  const GAP_CONTROL={...VOICE_GAP_LIMITS,nudge:50,decimals:0,unit:'ms',text:value=>`${value} ms`};
  const SPEED_TITLE='Speaks Choir voices faster or slower with the pitch kept. Drag between 0.25× and the slider maximum set in Choir settings. Type any speed from 0.07× to 16×, the browser maximum. Sound effects and ambience stay at normal speed.';
  const GAP_TITLE='Silence between consecutive spoken blocks. Sound effects and ambience are not counted.';
  // A typed speed above the slider's top end raises it, so dragging continues from the typed speed instead of jumping back.
  const stretchSpeedSlider=value=>{if(value>mixerState.speedSliderMax)setSpeedSliderMax(Math.ceil(value));};
  const refreshSpeechGrouping=()=>{updateGroupingStatus();if(config?.batchSpeech)refreshSectionControls();};
  const setSpeed=value=>{stretchSpeedSlider(value);mixerState.playbackRate=value;syncVoiceControls();applyPlaybackRate();refreshSpeechGrouping();};
  const setGap=value=>{mixerState.voiceGapMs=value;syncVoiceControls();refreshSpeechGrouping();};
  const saveMixerValue=()=>void persistMixer();
  // Mixer controls use the same saved values as their drawer counterparts.
  const speedSettings=makeMixerTuning('Playback speed in settings',{...SPEED_CONTROL,title:SPEED_TITLE,onValue:setSpeed,onCommit:saveMixerValue});
  const gapSettings=makeMixerTuning('Gap between voices in settings',{...GAP_CONTROL,title:GAP_TITLE,onValue:setGap,onCommit:saveMixerValue});
  const speedMixer=makeMixerTuning('Playback speed in mixer',{...SPEED_CONTROL,title:SPEED_TITLE,onValue:setSpeed,onCommit:saveMixerValue});
  const gapMixer=makeMixerTuning('Gap between voices in mixer',{...GAP_CONTROL,title:GAP_TITLE,onValue:setGap,onCommit:saveMixerValue});
  const mixerTuningRow=(label,control)=>{const row=document.createElement('div');row.className='cm-tuning';const name=document.createElement('span');name.textContent=label;row.append(name,control.root);return row;};
  const speedMixerRow=mixerTuningRow('Speed',speedMixer),gapMixerRow=mixerTuningRow('Gap',gapMixer);
  // A character's own speed replaces the master speed for that character. Without one (no key, or null) it follows the master speed.
  const speakerSpeedRows=[];
  function paintSpeakerSpeeds(){
    const master=voiceRate();
    for(let index=speakerSpeedRows.length-1;index>=0;index--)if(!speakerSpeedRows[index].speed.root.isConnected)speakerSpeedRows.splice(index,1);
    for(const row of speakerSpeedRows){
      const name=row.inMixer?`${row.speaker} speed in mixer`:`${row.speaker} speed`;
      row.speed.root.querySelector('input[type="range"]').setAttribute('aria-label',name);
      row.speed.root.querySelector('input[type="number"]').setAttribute('aria-label',`${name} value`);
      row.followButton.setAttribute('aria-label',`Follow playback speed for ${row.speaker}${row.inMixer?' in mixer':''}`);
      const custom=speakerPlaybackRate(mixerState.channels,row.speaker);
      const shown=custom ?? master;
      row.speed.set(shown);
      row.speed.setInherited(custom===null,
        `Follows master speed (${shown.toFixed(2)}×). Change to set a custom speed for ${row.speaker}.`,
        `Custom speed for ${row.speaker}, used instead of the global speed. Double-click or choose Use global to follow the global speed again.`);
      row.followButton.hidden=custom===null;
    }
  }
  // Clears the custom speed entirely, so the character follows the master speed again.
  function followMasterSpeed(speaker){if(Object.hasOwn(mixerState.channels,speaker))delete mixerState.channels[speaker].speed;paintSpeakerSpeeds();applyPlaybackRate();refreshSpeechGrouping();saveMixerValue();}
  function attachDrawerTuning(slotName,control,label,defaultText){
    const slot=$(slotName);if(!slot)return;
    const reset=document.createElement('button');reset.type='button';reset.className='et-tuning-reset';reset.textContent='Reset';reset.title=`Reset ${label} to ${defaultText}`;reset.setAttribute('aria-label',`Reset ${label}`);reset.onclick=()=>control.reset();
    slot.replaceChildren(control.root,reset);
  }
  attachDrawerTuning('playbackSpeedSlot',speedSettings,'playback speed',SPEED_CONTROL.text(SPEED_CONTROL.fallback));
  attachDrawerTuning('voiceGapSlot',gapSettings,'gap between voices',GAP_CONTROL.text(GAP_CONTROL.fallback));
  speedSettings.root.querySelector('input[type="range"]').dataset.et='playbackRate';speedSettings.root.querySelector('input[type="number"]').dataset.et='playbackRateEntry';
  gapSettings.root.querySelector('input[type="range"]').dataset.et='voiceGapMs';gapSettings.root.querySelector('input[type="number"]').dataset.et='voiceGapMsEntry';
  // Moves the top end of the global settings slider and each character's slider.
  function setSpeedSliderMax(value){
    mixerState.speedSliderMax=normalizeSpeedSliderMax(value);
    for(const control of [speedSettings,speedMixer,...speakerSpeedRows.map(row=>row.speed)])control.setSliderMax(mixerState.speedSliderMax);
    const field=$('speedSliderMax');if(field && document.activeElement!==field)field.value=String(mixerState.speedSliderMax);
  }
  const sliderMaxField=$('speedSliderMax');
  if(sliderMaxField){
    sliderMaxField.value=String(mixerState.speedSliderMax);
    sliderMaxField.onchange=()=>{setSpeedSliderMax(sliderMaxField.value);sliderMaxField.value=String(mixerState.speedSliderMax);saveMixerValue();};
  }
  const speedOptions=document.createElement('div');speedOptions.className='cm-speed-options';speedOptions.setAttribute('role','group');speedOptions.setAttribute('aria-label','Playback speed');
  const speedButtons=[['Normal',1],['Fast',1.5],['Very fast',2]].map(([label,rate])=>{
    const button=document.createElement('button');button.type='button';button.dataset.playbackRate=String(rate);button.setAttribute('aria-label',label);button.textContent=label;
    button.onclick=()=>{setSpeed(rate);saveMixerValue();};speedOptions.append(button);return button;
  });
  const playbackTuning=document.createElement('div');playbackTuning.className='cm-playback-tuning';playbackTuning.append(speedOptions,speedMixerRow,gapMixerRow);
  const mixerPlay=document.createElement('button');mixerPlay.type='button';mixerPlay.dataset.choirAction='playback';
  $('drawerPlay').onclick=()=>mixerPlay.click();
  $('drawerAutoPlan').onchange=()=>run(toggleAutoPlan);
  $('drawerDownload').onclick=()=>{const latest=latestReply();if(latest)run(()=>downloadSpeech(latest.id));};
  $('downloadAll').onclick=()=>run(downloadAllSpeech);
  mixerPlay.onclick=()=>{if(voiceGapHold){voiceGapHold.paused?voiceGapHold.resume():voiceGapHold.pause();pauseBeds(voiceGapHold.paused);updateTransport();return;}if(currentAudio){if(currentAudio.paused){currentAudio.play().then(updateTransport).catch(e=>status(e.message,true));pauseBeds(false);}else{currentAudio.pause();pauseBeds(true);updateTransport();}}else if(!busy && !controller){mixerPlay.disabled=true;status('Loading playback…');run(async()=>{const latest=latestReply();if(!latest)throw new Error('No assistant reply in the active chat.');if(plan && planSource?.chatId===chatId && planSource.messageId===latest.id && sameSpeech(planSource.content,ctx.messages.getContent(latest.id)))await play({resume:true});else await playMessage(latest.id);});}};
  const mixerPlanLatest=document.createElement('button');mixerPlanLatest.type='button';mixerPlanLatest.dataset.choirAction='plan-latest';mixerPlanLatest.innerHTML=ICON_PLAN;mixerPlanLatest.title='Plan latest reply without starting audio';mixerPlanLatest.setAttribute('aria-label','Plan latest reply');mixerPlanLatest.onclick=()=>run(planLatest);
  const mixerNext=document.createElement('button');mixerNext.type='button';mixerNext.innerHTML=ICON_NEXT;mixerNext.title='Next spoken block';mixerNext.setAttribute('aria-label','Next spoken block');mixerNext.disabled=true;mixerNext.onclick=()=>advancePlayback?.();
  const mixerPrevious=document.createElement('button');mixerPrevious.type='button';mixerPrevious.innerHTML=ICON_PREVIOUS;mixerPrevious.title='Previous spoken block';mixerPrevious.setAttribute('aria-label','Previous spoken block');mixerPrevious.disabled=true;mixerPrevious.onclick=()=>advancePlayback?.(-1);
  mixerNext.dataset.choirAction='next';mixerPrevious.dataset.choirAction='previous';
  const mixerStop=document.createElement('button');mixerStop.type='button';mixerStop.dataset.choirAction='stop';mixerStop.innerHTML=ICON_STOP;mixerStop.title='Stop playback';mixerStop.setAttribute('aria-label','Stop');mixerStop.onclick=()=>stop();
  const transport=document.createElement('div');transport.className='cm-transport';transport.append(mixerPlanLatest,mixerPrevious,mixerPlay,mixerNext,mixerStop);
  const mixerSeek=makeSeekControl(),legend=document.createElement('small');legend.className='cm-legend';legend.innerHTML=`<span>${ICON_MUTED} Silent = mute</span><span>${ICON_MIC_OFF} No voice = skip & don’t generate</span>`;
  const levels=document.createElement('div'),levelsBody=document.createElement('div');levels.className='cm-levels';levelsBody.className='cm-levels-body';levelsBody.id=`choir-channel-levels-${randomUuid()}`;
  const channelTabs=document.createElement('div');channelTabs.className='cm-channel-tabs';channelTabs.setAttribute('role','tablist');channelTabs.setAttribute('aria-label','Mixer channels');
  channelsRoot.id=`${levelsBody.id}-panel`;channelsRoot.setAttribute('role','tabpanel');channelsRoot.tabIndex=0;
  const channelsTitle=document.createElement('button');channelsTitle.type='button';channelsTitle.className='cm-channels-title';channelsTitle.setAttribute('aria-label','Channel levels');channelsTitle.setAttribute('aria-controls',levelsBody.id);
  const levelsArrow=document.createElement('span');levelsArrow.setAttribute('aria-hidden','true');const levelsTitle=document.createElement('span');levelsTitle.textContent='Channel levels';channelsTitle.append(levelsArrow,levelsTitle);
  const channelCount=document.createElement('span');channelCount.setAttribute('aria-hidden','true');channelsTitle.append(channelCount);
  function showChannelLevels(){const collapsed=Boolean(mixerState.levelsCollapsed);levelsBody.hidden=collapsed;channelsTitle.setAttribute('aria-expanded',String(!collapsed));levelsArrow.textContent=collapsed?'▸':'▾';}
  channelsTitle.onclick=()=>{mixerState.levelsCollapsed=!mixerState.levelsCollapsed;showChannelLevels();positionMixer();persistMixer();};showChannelLevels();
  const autoPlanRow=document.createElement('div');autoPlanRow.className='cm-auto-plan';
  const mixerAutoPlan=document.createElement('button');mixerAutoPlan.type='button';mixerAutoPlan.dataset.choirAction='auto-plan';mixerAutoPlan.setAttribute('aria-label','Auto-plan new replies');mixerAutoPlan.onclick=()=>run(toggleAutoPlan);
  const mixerAutoPlay=document.createElement('button');mixerAutoPlay.type='button';mixerAutoPlay.dataset.choirAction='auto-play';mixerAutoPlay.setAttribute('aria-label','Auto-play new replies');mixerAutoPlay.onclick=()=>run(toggleAutoPlay);
  const mixerSfx=document.createElement('button');mixerSfx.type='button';mixerSfx.dataset.choirAction='sfx';mixerSfx.setAttribute('aria-label','Sound effects');mixerSfx.title='Enable or disable Freesound effects in Choir and Cue. Speech continues separately.';mixerSfx.onclick=()=>run(()=>{if(!chatId)throw new Error('Open a chat first.');$('enableSfx').checked=!$('enableSfx').checked;scheduleSettingsSave();syncSfxPlayback();});
  const mixerAmbience=document.createElement('button');mixerAmbience.type='button';mixerAmbience.dataset.choirAction='ambience';mixerAmbience.setAttribute('aria-label','Ambient sound');mixerAmbience.onclick=()=>run(()=>{if(!chatId)throw new Error('Open a chat first.');$('enableAmbience').checked=!$('enableAmbience').checked;scheduleSettingsSave();syncAmbiencePlayback();});
  const mixerMusic=document.createElement('button');mixerMusic.type='button';mixerMusic.dataset.choirAction='music';mixerMusic.setAttribute('aria-label','Background music');mixerMusic.onclick=()=>run(()=>{if(!chatId)throw new Error('Open a chat first.');$('enableMusic').checked=!$('enableMusic').checked;scheduleSettingsSave();syncMusicPlayback();});
  const mixerFollow=document.createElement('button');mixerFollow.type='button';mixerFollow.dataset.choirAction='follow';mixerFollow.setAttribute('aria-label','Follow narration');mixerFollow.onclick=()=>run(()=>{if(!chatId)throw new Error('Open a chat first.');$('followNarration').checked=!$('followNarration').checked;scheduleSettingsSave();syncNarrationFollow();});
  const mixerMessages=document.createElement('button');mixerMessages.type='button';mixerMessages.dataset.choirAction='message-controls';mixerMessages.setAttribute('aria-label','Show message play controls');mixerMessages.onclick=()=>{if(!chatId)return;$('sectionButtons').checked=!$('sectionButtons').checked;$('sectionButtons').dispatchEvent(new document.defaultView.Event('change'));};
  autoPlanRow.append(mixerAutoPlan,mixerAutoPlay,mixerSfx,mixerAmbience,mixerMusic,mixerFollow,mixerMessages);
  const mixerQuickButtons=new Map(quickButtonKeys.map((key,index)=>[key,[mixerAutoPlan,mixerAutoPlay,mixerSfx,mixerAmbience,mixerMusic,mixerFollow,mixerMessages][index]]));
  const customizePanel=$('mixerLayoutOptions'),layoutPanel=$('mixerLayout');layoutPanel.id=`choir-mixer-layout-${randomUuid()}`;$('customizeMixer').setAttribute('aria-controls',layoutPanel.id);
  const showMixerLayout=open=>{layoutPanel.hidden=!open;$('customizeMixer').setAttribute('aria-expanded',String(open));drawerNavigation.showMixer(open);if(open)refreshMixerLayoutEditor();};
  const layoutBar=document.createElement('div');layoutBar.className='et-pagebar';const layoutTitle=layoutPanel.querySelector('h3');layoutTitle.textContent='Customize mixer';$('closeMixerLayout').textContent='←';$('closeMixerLayout').setAttribute('aria-label','Back to playback');layoutBar.append($('closeMixerLayout'),layoutTitle);layoutPanel.prepend(layoutBar);
  $('customizeMixer').onclick=()=>showMixerLayout(layoutPanel.hidden);
  $('closeMixerLayout').onclick=()=>{showMixerLayout(false);$('customizeMixer').focus();};
  layoutPanel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();showMixerLayout(false);$('customizeMixer').focus();}});
  const layoutChecks=new Map(),quickLayoutRows=new Map();
  const layoutHint=document.createElement('p');layoutHint.textContent='Choose what appears. Hiding a control keeps its setting. Playback and Master stay available.';customizePanel.append(layoutHint);
  const previewMixer=document.createElement('button');previewMixer.type='button';previewMixer.textContent='Preview mixer';previewMixer.onclick=()=>{if(mixerState.collapsed || !config?.enableMixer)$('showMixer').click();};customizePanel.append(previewMixer);
  const layoutCheck=(key,label,parent)=>{
    const row=document.createElement('div');row.className='cm-customize-row';const field=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=mixerState.layout[key];check.setAttribute('aria-label',`Show ${label}`);check.dataset.choirLayout=key;
    check.onchange=()=>{mixerState.layout[key]=check.checked;applyMixerLayout();void persistMixer();};field.append(check,document.createTextNode(label));row.append(field);parent.append(row);layoutChecks.set(key,check);return row;
  };
  const layoutOptions=document.createElement('div');layoutOptions.className='cm-customize-options';customizePanel.append(layoutOptions);
  for(const [key,label] of [['speedPresets','speed presets'],['speedSlider','global speed slider'],['gapSlider','gap between voices'],['voiceSpeeds','individual voice speeds'],['channelLevels','Channel levels']])layoutCheck(key,label,layoutOptions);
  const quickHeading=document.createElement('p');quickHeading.textContent='Quick buttons · arrows change order.';const quickLayoutList=document.createElement('div');quickLayoutList.className='cm-customize-quick';customizePanel.append(quickHeading,quickLayoutList);
  const columnsLabel=document.createElement('label'),columnsSelect=document.createElement('select');columnsLabel.className='et-inline-field';columnsLabel.textContent='Buttons per row';columnsSelect.dataset.choirMixerColumns='';columnsSelect.setAttribute('aria-label','Mixer buttons per row');option(columnsSelect,'0','Automatic (up to 3)');for(let number=1;number<=7;number++)option(columnsSelect,String(number),String(number));columnsLabel.append(columnsSelect);customizePanel.insertBefore(columnsLabel,quickLayoutList);
  const columnsHint=document.createElement('small');columnsHint.textContent='Applies to visible quick buttons. Narrow screens wrap earlier to keep buttons readable.';customizePanel.insertBefore(columnsHint,quickLayoutList);
  columnsSelect.onchange=()=>{mixerState.quickButtonColumns=normalizeMixerColumns(columnsSelect.value);applyMixerLayout();void persistMixer();};
  const quickLabels={'auto-plan':'Auto-plan','auto-play':'Auto-play',sfx:'SFX',ambience:'Ambience',music:'Music',follow:'Follow narration','message-controls':'Message controls'};
  for(const key of quickButtonKeys){
    const row=layoutCheck(key,quickLabels[key],quickLayoutList),up=document.createElement('button'),down=document.createElement('button');up.type=down.type='button';up.textContent='↑';down.textContent='↓';up.setAttribute('aria-label',`Move ${quickLabels[key]} earlier`);down.setAttribute('aria-label',`Move ${quickLabels[key]} later`);
    const move=offset=>{const order=mixerState.quickButtonOrder,index=order.indexOf(key),next=index+offset;if(next<0 || next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];refreshMixerLayoutEditor();applyMixerLayout();void persistMixer();(offset<0?up:down).disabled?layoutChecks.get(key).focus():(offset<0?up:down).focus();};up.onclick=()=>move(-1);down.onclick=()=>move(1);row.append(up,down);quickLayoutRows.set(key,{row,up,down});
  }
  const resetMixerLayout=document.createElement('button');resetMixerLayout.type='button';resetMixerLayout.className='cm-reset-layout';resetMixerLayout.textContent='Reset mixer layout';resetMixerLayout.onclick=()=>{mixerState.layout={...mixerLayoutDefaults};mixerState.quickButtonOrder=[...quickButtonKeys];mixerState.quickButtonColumns=0;refreshMixerLayoutEditor();applyMixerLayout();void persistMixer();};customizePanel.append(resetMixerLayout);
  const volumeLimits=drawerNavigation.volumePage;volumeLimits.classList.add('et-volume-limits');volumeLimits.setAttribute('aria-label','Volume limits');
  for(const [kind,label] of [['master','Master'],['voices','Voices'],['music','Music'],['ambience','Ambience'],['sfx','Sound effects']]){
    const field=document.createElement('label'),name=document.createElement('span'),number=document.createElement('input'),unit=document.createElement('span');name.textContent=label;number.type='number';number.min='1';number.max=kind==='master'?'100':'300';number.step='1';number.value=String(Math.round(mixerState.volumeLimits[kind]*100));number.setAttribute('aria-label',`${label} maximum percent`);number.dataset.choirVolumeLimit=kind;unit.textContent='%';field.append(name,number,unit);volumeLimits.append(field);
    number.onchange=()=>{mixerState.volumeLimits=normalizeMixerVolumeLimits({...mixerState.volumeLimits,[kind]:Number(number.value)/100});number.value=String(Math.round(mixerState.volumeLimits[kind]*100));mixerState.master=Math.min(mixerState.master,mixerState.volumeLimits.master);for(const effect of ['music','ambience','sfx'])mixerState[effect]=Math.min(mixerState[effect],mixerState.volumeLimits[effect]);for(const channel of Object.values(mixerState.channels))channel.volume=Math.min(channel.volume,mixerState.volumeLimits.voices);masterVolume.setVolumeMaximum(mixerState.volumeLimits.master,mixerState.master);applyVolume();renderMixer();refreshSectionControls();void persistMixer();};
  }
  function refreshMixerLayoutEditor(){columnsSelect.value=String(mixerState.quickButtonColumns);for(const [key,check] of layoutChecks)check.checked=mixerState.layout[key];mixerState.quickButtonOrder.forEach((key,index)=>{const item=quickLayoutRows.get(key);item.up.disabled=index===0;item.down.disabled=index===quickButtonKeys.length-1;quickLayoutList.append(item.row);});}
  function applyMixerLayout(){
    autoPlanRow.style.setProperty('--cm-columns',String(mixerState.quickButtonColumns || 3));
    speedOptions.hidden=!mixerState.layout.speedPresets;speedMixerRow.hidden=!mixerState.layout.speedSlider;gapMixerRow.hidden=!mixerState.layout.gapSlider;
    levels.hidden=!mixerState.layout.channelLevels;
    for(const key of mixerState.quickButtonOrder){const button=mixerQuickButtons.get(key);button.hidden=!mixerState.layout[key];autoPlanRow.append(button);}
    autoPlanRow.hidden=!quickButtonKeys.some(key=>mixerState.layout[key]);
    renderMixer();
  }
  refreshMixerLayoutEditor();
  speedOptions.hidden=!mixerState.layout.speedPresets;speedMixerRow.hidden=!mixerState.layout.speedSlider;gapMixerRow.hidden=!mixerState.layout.gapSlider;
  levelsBody.append(channelTabs,channelsRoot,legend);levels.append(channelsTitle,levelsBody);
  player.append(nowPlaying,transport,mixerSeek.root);mixerBody.append(player,masterLabel,playbackTuning,autoPlanRow,levels);mixer.append(mixerHeader,mixerBody);document.body.append(mixer);
  unsubs.push(()=>{autoPlanAction?.destroy();autoPlanAction=null;toolbarAutoPlan.remove();});
  function refreshAutoPlanControls(){
    $('drawerAutoPlan').checked=Boolean(config?.autoPlan);$('drawerAutoPlan').disabled=!chatId;
    mixerAutoPlan.textContent='Auto-plan';
    mixerAutoPlan.setAttribute('aria-pressed',String(Boolean(config?.autoPlan)));mixerAutoPlan.disabled=!chatId;
    mixerAutoPlan.title='Plan new assistant replies with the selected engine. Jev and LLM planning can incur costs. Auto-play is controlled separately.';
    mixerAutoPlay.textContent='Auto-play';
    mixerAutoPlay.setAttribute('aria-pressed',String(Boolean(config?.auto)));mixerAutoPlay.disabled=!chatId;
    mixerSfx.textContent='SFX';mixerSfx.setAttribute('aria-pressed',String(config?.enableSfx!==false));mixerSfx.disabled=!chatId;
    mixerAmbience.textContent='Ambience';mixerAmbience.setAttribute('aria-pressed',String(config?.enableAmbience!==false));mixerAmbience.disabled=!chatId;
    mixerMusic.textContent='Music';mixerMusic.setAttribute('aria-pressed',String(config?.enableMusic===true));mixerMusic.disabled=!chatId;
    mixerFollow.textContent='Follow';mixerFollow.setAttribute('aria-pressed',String(Boolean(config?.followNarration)));mixerFollow.disabled=!chatId;mixerFollow.title=`Follow narration is ${config?.followNarration?'on':'off'}. Scroll the chat to the spoken passage. Scrolling yourself pauses following; toggle off and on to resume.`;
    mixerMessages.textContent='Messages';mixerMessages.setAttribute('aria-pressed',String(Boolean(config?.sectionButtons)));mixerMessages.disabled=!chatId;mixerMessages.title=`Message play controls are ${config?.sectionButtons?'on':'off'}. Show or hide Play and Sections beside each message. Download appears when a complete played recording is available.`;
    for(const button of [mixerAutoPlan,mixerAutoPlay,mixerSfx,mixerAmbience,mixerMusic])button.title=`${button.textContent} is ${button.getAttribute('aria-pressed')==='true'?'on':'off'}. ${button===mixerAutoPlan?'Create plans for new replies. Jev and LLM planning can incur costs. Auto-play controls speech separately.':button===mixerAutoPlay?'Play available plans automatically. Enable Auto-plan too to plan new replies.':button===mixerSfx?'Play scene sound effects.':button===mixerAmbience?'Loop scene ambience under speech.':'Play background music under speech. Replan an existing reply to add music.'}`;
    toolbarAutoPlan.querySelector('span').textContent=mixerAutoPlan.textContent;toolbarAutoPlan.title=mixerAutoPlan.title;
    toolbarAutoPlan.setAttribute('aria-label',mixerAutoPlan.textContent);toolbarAutoPlan.setAttribute('aria-pressed',String(Boolean(config?.autoPlan)));toolbarAutoPlan.disabled=!chatId;
    if(config?.showAutoPlanAction){
      // Input bar actions populate Extras and the customizable action catalog;
      // mount the opt-in shortcut in the chat's visible action row as well.
      autoPlanMount??=ctx.ui.mount?.('chat_actions');
      if(autoPlanMount && toolbarAutoPlan.parentElement!==autoPlanMount)autoPlanMount.append(toolbarAutoPlan);
    }else toolbarAutoPlan.remove();
    const key=config?.showAutoPlanAction?`${Boolean(chatId)}:${Boolean(config.autoPlan)}`:'';
    if(key===autoPlanActionKey)return;
    autoPlanAction?.destroy();autoPlanAction=null;autoPlanActionKey=key;
    if(key){autoPlanAction=ctx.ui.registerInputBarAction({id:'choir_auto_plan',label:`Auto-plan ${config.autoPlan?'On':'Off'}`,subtitle:mixerAutoPlan.title,iconSvg:ICON_SPARKLE,enabled:Boolean(chatId)});autoPlanAction.onClick(()=>run(toggleAutoPlan));}
  }
  function toggleAutoPlan(){
    if(!chatId)throw new Error('Open a chat first.');
    config=capture();config.autoPlan=!config.autoPlan;scheduleSettingsSave();refreshAutoPlanControls();
  }
  function toggleAutoPlay(){
    if(!chatId)throw new Error('Open a chat first.');
    $('auto').checked=!$('auto').checked;scheduleSettingsSave();
  }
  function syncNarrationFollow(){followResume.hidden=true;if(config?.followNarration){followPaused=false;if(!followContainer && followRange){const node=followRange.startContainer;followContainer=scrollParent(node.nodeType===1?node:node.parentElement);}if(followContainer)followLine(followRect(),followContainer);}refreshAutoPlanControls();}
  let mixerWriteQueue=null,mixerDirty=false;
  const persistMixer=(changed=true)=>{
    if(changed)mixerDirty=true;
    if(!mixerDirty)return mixerWriteQueue || Promise.resolve();
    const snapshot=structuredClone(mixerState);
    const write=()=>withSettingsLock(async()=>{
      if(JSON.stringify(snapshot)===JSON.stringify(mixerBaseline)){if(JSON.stringify(snapshot)===JSON.stringify(mixerState))mixerDirty=false;return;}
      const latest=await ctx.settings.get('ui:mixer');
      await ctx.settings.set('ui:mixer',normalizeMixer(latest?mergeSettingsChanges(normalizeMixer(latest),mixerBaseline,snapshot):snapshot));
      replaceBaseline(mixerBaseline,snapshot);
      if(JSON.stringify(snapshot)===JSON.stringify(mixerState))mixerDirty=false;
    });
    const operation=mixerWriteQueue?mixerWriteQueue.catch(()=>{}).then(write):write();mixerWriteQueue=operation;
    return operation.then(()=>{if(mixerWriteQueue===operation)mixerWriteQueue=null;},error=>{if(mixerWriteQueue===operation)mixerWriteQueue=null;status(`Mixer preferences could not be saved: ${error.message}`,true);});
  };
  const mixerInput=event=>{if(mixer.contains(event.target) || event.target.closest?.('.et-tuning,.et-character-speed'))mixerDirty=true;};
  mixer.addEventListener('input',mixerInput);root.addEventListener('input',mixerInput);
  unsubs.push(()=>{mixer.removeEventListener('input',mixerInput);root.removeEventListener('input',mixerInput);});
  const effectVolume=kind=>mixerVolume(mixerState.master,kind,{[kind]:{volume:mixerState[kind]}});
  function applyVolume(){
    const isEffect=currentSpeaker==='SFX' || currentSpeaker==='sfx';
    const volume=isEffect?effectVolume('sfx'):Math.min(mixerState.master*mixerState.volumeLimits.voices,currentGroupLevel!==null?mixerState.master*currentGroupLevel:mixerVolume(mixerState.master,currentSpeaker,mixerState.channels));
    const sfxScale=isEffect?(config?.enableSfx===false?0:0.45):1;
    if(currentGain)currentGain.gain.value=volume*currentNormalize*sfxScale;
    else if(currentAudio)currentAudio.volume=Math.max(0, Math.min(1, volume*sfxScale));
    for(const layer of [...Object.values(beds),...fadingBeds])if(layer)bedVolume(layer);
  }
  // Ambience and music each loop one bed under speech; a replaced bed fades out while the next fades in.
  const BED_LEVEL={ambience:0.25,music:0.2},BED_NAME={ambience:'Ambience',music:'Music'},AMBIENCE_FADE_MS=1500,AMBIENCE_FILTER='duration:[10 TO 120]',fadingBeds=new Set(),beds={ambience:null,music:null};
  const bedVolume=layer=>{if(layer.audio){const volume=effectVolume(layer.kind)*BED_LEVEL[layer.kind]*layer.level;if(layer.gain)layer.gain.gain.value=volume;else layer.audio.volume=volume;syncPlayedAudio();}};
  const bedEnabled=kind=>kind==='music'?config?.enableMusic===true:config?.enableAmbience!==false;
  const continuousMusic=()=>config?.enableMusic===true && config?.loopMusic===true;
  const musicLabel=entry=>[...entry.feels,...entry.genres].join(', ') || entry.keywords.join(', ');
  const isBed=segment=>segment?.kind==='ambience' || segment?.kind==='music';
  let announcedMusic;
  // While a replacement loads, the fading track is still the one heard.
  const currentMusic=()=>{const title=(beds.music?.audio?beds.music:[...fadingBeds].findLast(layer=>layer.kind==='music' && layer.audio))?.title;return title?{title,credit:`"${title}" Kevin MacLeod (incompetech.com) · CC BY 4.0`}:null;};
  function showMusicCredit(){
    if(disposed)return;const music=currentMusic();$('musicCredit').hidden=!music;$('musicCredit').textContent=music?.credit || '';
    // A replacement that is still loading keeps the previous announcement.
    if(music?.title!==announcedMusic && (music || !beds.music)){announcedMusic=music?.title;globalThis.dispatchEvent?.(new (globalThis.CustomEvent || CustomEvent)('choir-music-v1',{detail:music}));}
  }
  function fadeBed(layer,to,done){
    clearInterval(layer.timer);const from=layer.level,start=Date.now();
    layer.timer=setInterval(()=>{const progress=Math.min(1,(Date.now()-start)/AMBIENCE_FADE_MS);layer.level=progress<1?from+(to-from)*progress:to;bedVolume(layer);if(progress===1){clearInterval(layer.timer);done?.();}},50);
  }
  function dropBed(layer){clearInterval(layer.timer);layer.loading.abort();if(layer.audio){layer.audio.onerror=layer.audio.onplay=layer.audio.onpause=null;layer.audio.pause();if(layer.kind==='music'){layer.audio.removeAttribute('src');layer.audio.load();}}layer.mediaSource?.disconnect();layer.gain?.disconnect();if(layer.url)URL.revokeObjectURL(layer.url);fadingBeds.delete(layer);syncPlayedAudio();if(layer.kind==='music')showMusicCredit();}
  function failBed(layer,error,badFile=false){
    if(beds[layer.kind]!==layer || layer.loading.signal.aborted)return;
    const retained=layer.kind==='music' && continuousMusic() && !layer.audio?[...fadingBeds].findLast(bed=>bed.kind==='music' && bed.audio):null;
    beds[layer.kind]=retained || null;if(retained){fadingBeds.delete(retained);fadeBed(retained,1);}dropBed(layer);showMusicCredit();updateTransport();
    // A file that cannot load must not be replayed from a cache; a play blocked by autoplay rules is no bad file.
    if(badFile){dropVolatileSource(`${layer.kind}:${layer.key}`);layer.purge?.();}
    const detail=error?.name==='NotAllowedError'?'Browser blocked background audio. Click Play to retry.':error?.message || 'Background audio could not play.';
    const warning=`${BED_NAME[layer.kind]} skipped (${layer.query}): ${detail} Speech continues.`;
    const previous=$('sfxStatus').hidden?'':$('sfxStatus').textContent;
    showFoleyStatus(previous && !previous.includes(warning)?`${previous}\n${warning}`:warning);
  }
  function playBed(layer){
    try{layer.audio.play().then(syncPlayedAudio).catch(error=>failBed(layer,error));syncPlayedAudio();}catch(error){failBed(layer,error);}
  }
  // Music uses the host's file API so the same sound can feed the speakers
  // and the saved mix. Cross-origin media would otherwise be silent in Web Audio.
  function followBed(entry,load,kind='ambience',purge){
    if(!bedEnabled(kind)){stopBeds(kind);updateTransport();return;}
    if(kind==='music' && !entry && continuousMusic())return;
    const key=entry && !entry.stop?foleyKey(entry):'';
    if(key===(beds[kind]?.key || ''))return;
    const waitForMusic=kind==='music' && continuousMusic() && key;
    if(beds[kind]){const old=beds[kind];fadingBeds.add(old);if(waitForMusic)clearInterval(old.timer);else fadeBed(old,0,()=>dropBed(old));}
    if(kind==='music' && !key)for(const old of fadingBeds)if(old.kind==='music')fadeBed(old,0,()=>dropBed(old));
    if(waitForMusic)for(const old of [...fadingBeds])if(old.kind==='music' && !old.audio)dropBed(old);
    // A carried bed keeps loading after the paragraph that started it is cancelled.
    const layer=beds[kind]=key?{kind,key,entry,query:entry.query || musicLabel(entry),feels:entry.feels,purge,level:0,loading:new AbortController()}:null;showMusicCredit();updateTransport();
    if(layer)load(layer.loading.signal).then(async source=>{
      if(beds[kind]!==layer)return;
      const audioBlob=kind==='music'?await musicAudioBlob(source,layer.loading.signal):source.blob || source;
      if(beds[kind]!==layer || layer.loading.signal.aborted)return;
      layer.title=source.title;layer.source=kind==='music'?{title:source.title,url:source.url?.startsWith('blob:')?undefined:source.url,blob:audioBlob}:audioBlob;
      layer.audio=new Audio(layer.url=URL.createObjectURL(audioBlob));layer.audio.loop=true;
      if(source.offset>0)layer.audio.onloadedmetadata=()=>{if(layer.audio.duration>0 && Number.isFinite(layer.audio.duration))layer.audio.currentTime=source.offset%layer.audio.duration;};
      layer.audio.onplay=layer.audio.onpause=syncPlayedAudio;
      try{
        const output=playbackOutput();
        if(output){layer.mediaSource=audioContext.createMediaElementSource(layer.audio);layer.gain=audioContext.createGain();layer.mediaSource.connect(layer.gain);layer.gain.connect(output);layer.audio.volume=1;}
      }catch(error){playedCapture?.fail(`Background audio could not be included: ${error.message}`);}
      bedVolume(layer);
      if(waitForMusic)for(const old of fadingBeds)if(old.kind==='music')fadeBed(old,0,()=>dropBed(old));
      layer.audio.onerror=()=>failBed(layer,new Error(kind==='music'?'Browser could not play the incompetech track.':'Browser could not decode the Freesound ambience preview.'),true);
      if(!bedsPaused)playBed(layer);
      if(beds[kind]===layer){fadeBed(layer,1);showMusicCredit();}
    }).catch(error=>failBed(layer,error));
  }
  const fadeOutBeds=()=>{for(const kind in beds)if(kind!=='music' || !continuousMusic())followBed(null,null,kind);};
  // The bed in effect at a batch comes from the closest marker of its kind before it.
  const bedIndex=(batches,index,kind)=>{while(index>=0 && batches[index].kind!==kind)index--;return index;};
  // A message can inherit continuous music without having a new music cue.
  // Save that bed as an opening marker so Replay can restore it on its own.
  function retainCarriedMusic(segments,cached,snapshot){
    const firstSpeech=segments.findIndex(segment=>!segment.kind);
    if(firstSpeech<0 || segments.slice(0,firstSpeech).some(segment=>segment.kind==='music'))return cached;
    const playing=(beds.music?.audio?beds.music:[...fadingBeds].findLast(layer=>layer.kind==='music' && layer.audio));
    const savedIndex=cached?.segments?.findIndex(segment=>segment.kind==='music' && segment.carried===true) ?? -1;
    const live=continuousMusic() && playing?.entry && playing.source;
    const segment=live?{kind:'music',speaker:'Music',music:structuredClone(playing.entry),carried:true,passageIndex:segments[firstSpeech].passageIndex ?? firstSpeech}:savedIndex>=0?cached.segments[savedIndex]:null;
    if(!segment)return cached;
    const track=live?{...playing.source,offset:playing.audio.currentTime || 0}:cached.blobs?.[savedIndex] || cached.passages?.[cacheKey(segment,snapshot)];
    if(!track)return cached;
    segments.unshift(segment);
    return {...cached,passages:{...cached?.passages,[cacheKey(segment,snapshot)]:track}};
  }
  // Cue bed loads outlive the paragraph hand-off and end only with a real stop.
  let bedPrefetch=new AbortController();
  function stopBeds(kind){if(!kind){bedPrefetch.abort();bedPrefetch=new AbortController();}for(const layer of [...Object.values(beds),...fadingBeds])if(layer && (!kind || layer.kind===kind))dropBed(layer);for(const name in beds)if(!kind || name===kind)beds[name]=null;if(!kind)bedsPaused=false;showMusicCredit();}
  function pauseBeds(paused){bedsPaused=paused;for(const layer of [...Object.values(beds),...fadingBeds])if(layer?.audio){if(paused)layer.audio.pause();else playBed(layer);}syncPlayedAudio();}
  function positionMixer(){
    const collapsed=Boolean(mixerState.collapsed);
    const isEnabled=Boolean(config?.enableMixer),expanded=isEnabled && !collapsed;
    $('showMixer').textContent=expanded?'Close mixer':'Open mixer';
    $('showMixer').setAttribute('aria-expanded',String(expanded));
    mixer.dataset.collapsed=String(collapsed);mixerBody.hidden=collapsed;mixerTitle.hidden=collapsed;
    mixer.style.width=collapsed?'44px':`${Math.max(280,(mixerState.quickButtonColumns || 3)*68+16)}px`;mixer.style.padding='0';mixer.style.borderRadius=collapsed?'50%':'12px';
    mixer.style.borderWidth=collapsed?'0':'1px';
    collapse.innerHTML=collapsed?ICON_SOUND:ICON_CLOSE;
    collapse.setAttribute('aria-label',collapsed?'Open Choir voice mixer':'Collapse Choir voice mixer');
    collapse.setAttribute('aria-expanded',String(!collapsed));collapse.title=collapsed?'Choir voice mixer · click to open, drag to move':'Collapse voice mixer';
    const doc=root?.ownerDocument || (typeof document!=='undefined'?document:null);
    const view=doc?.defaultView || (typeof window!=='undefined'?window:null);
    if(!doc || !view)return;
    mixerState.x=Math.max(0,Math.min(Number(mixerState.x)||0,Math.max(0,(view?.innerWidth || 1024)-mixer.offsetWidth-10)));
    mixerState.y=Math.max(0,Math.min(Number(mixerState.y)||0,Math.max(0,(view?.innerHeight || 768)-mixer.offsetHeight-10)));
    mixer.style.left=`${mixerState.x}px`;mixer.style.top=`${mixerState.y}px`;
    mixer.hidden = !isEnabled;
    mixer.style.display = isEnabled ? 'flex' : 'none';
  }
  let suppressMixerClick=false;
  collapse.onclick=event=>{if(suppressMixerClick && event.detail!==0){suppressMixerClick=false;return;}suppressMixerClick=false;mixerState.collapsed=!mixerState.collapsed;positionMixer();persistMixer();};
  let drag;
  mixerHeader.addEventListener('pointerdown',event=>{suppressMixerClick=false;if(event.button!==0 || (!mixerState.collapsed && event.target.closest('button')))return;drag={x:event.clientX,y:event.clientY,left:mixerState.x,top:mixerState.y,moved:false};(event.target.closest('button') || mixerHeader).setPointerCapture?.(event.pointerId);});
  mixerHeader.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved && Math.hypot(dx,dy)<5)return;drag.moved=true;mixerState.x=drag.left+dx;mixerState.y=drag.top+dy;positionMixer();});
  const endDrag=()=>{if(drag){suppressMixerClick=drag.moved;drag=null;persistMixer();}};
  mixerHeader.addEventListener('pointerup',endDrag);mixerHeader.addEventListener('pointercancel',endDrag);
  const docWin=root?.ownerDocument?.defaultView || (typeof window!=='undefined'?window:null);
  const resizeMixer=()=>positionMixer();docWin?.addEventListener('resize',resizeMixer);
  unsubs.push(()=>{docWin?.removeEventListener('resize',resizeMixer);mixer.remove();audioContext?.close().catch(()=>{});});
  function voiceRate(){return normalizePlaybackRate(mixerState.playbackRate);}
  function voiceGapSetting(){return normalizeVoiceGap(mixerState.voiceGapMs);}
  // The silence goes before a spoken block only when an earlier spoken block precedes it. Sound effects and ambience are skipped over.
  function gapBefore(items,index){
    if(!items?.[index] || items[index].kind)return 0;
    for(let i=index-1;i>=0;i--)if(items[i] && !items[i].kind && !playbackExcluded(items[i]))return voiceGapSetting();
    return 0;
  }
  // Keep the quick speed buttons and drawer controls in step with saved playback settings.
  function syncVoiceControls(){
    const rate=voiceRate(),gap=voiceGapSetting();
    speedSettings.set(rate);gapSettings.set(gap);speedMixer.set(rate);gapMixer.set(gap);
    for(const button of speedButtons)button.setAttribute('aria-pressed',String(Number(button.dataset.playbackRate)===rate));
    paintSpeakerSpeeds();
  }
  // Browsers accept only their own playback range, so the speed is first clamped into it. A browser that still refuses it plays at normal speed instead of stopping the block.
  function setAudioRate(audio,rate){
    try{audio.playbackRate=browserPlaybackRate(rate);}
    catch{try{audio.playbackRate=1;}catch{}}
  }
  // Speed reaches the spoken block that is playing; sound effects, ambience and previews keep normal speed.
  function applyPlaybackRate(){if(currentAudio)setAudioRate(currentAudio,currentAudioSpeech?playbackRateFor(currentSpeedSpeaker):1);}
  // A character's own speed when it has one, otherwise the playback speed.
  function playbackRateFor(speaker){return effectivePlaybackRate(voiceRate(),mixerState.channels,speaker);}
  // The speaker whose speed a block uses: the first speaker of a unison or dialogue block, otherwise the block's speaker.
  function primarySpeaker(item,fallback){return item?.unison?.[0]?.speaker ?? item?.turns?.[0]?.speaker ?? fallback;}
  // A held gap counts as playback that has not started yet, so Next and Previous keep its paused state.
  const heldPaused=()=>voiceGapHold?voiceGapHold.paused:Boolean(currentAudio?.paused);
  // The silence before a spoken block. Its countdown runs in real time and only while playback runs, so Pause holds it.
  function startVoiceGap(ms,paused,finish){
    let remaining=ms,since=0,timer=null;
    const hold={
      paused,
      run(){if(hold.paused || timer!==null)return;since=Date.now();timer=setTimeout(()=>{timer=null;remaining=0;finish();},remaining);},
      pause(){if(hold.paused)return;hold.paused=true;if(timer!==null){clearTimeout(timer);timer=null;remaining=Math.max(0,remaining-(Date.now()-since));}},
      resume(){if(!hold.paused)return;hold.paused=false;hold.run();},
      cancel(){if(timer!==null){clearTimeout(timer);timer=null;}}
    };
    hold.run();
    return hold;
  }
  function renderMixer(){
    const doc=root?.ownerDocument || (typeof document!=='undefined'?document:null);
    if(!doc)return;
    updateGroupingStatus();
    refreshAutoPlanControls();
    syncVoiceControls();
    const focused=doc.activeElement,focusLabel=channelsRoot.contains(focused)?focused.getAttribute('aria-label'):null,focusTabKey=channelTabs.contains(focused)?focused.dataset.channelKey:null,scrollTop=channelsRoot.scrollTop;
    updateNextControls();
    channelsRoot.replaceChildren();speakerLabel.replaceChildren();
    if(currentSpeaker){const prefix=doc.createElement('span');prefix.className='cm-sr-only';prefix.textContent='Speaking: ';speakerLabel.append(prefix,doc.createTextNode(currentSpeaker));}else speakerLabel.textContent='Ready to play';
    const speakers=new Set((mixerPlaybackSegments ?? plan?.segments ?? []).flatMap(speechMembers).filter(segment=>!segment.kind && segment.speaker).map(segment=>segment.speaker));
    for(const speaker of speakers){
      if(!Object.hasOwn(mixerState.channels,speaker))Object.defineProperty(mixerBaseline.channels,speaker,{value:{volume:1,mute:false},writable:true,enumerable:true,configurable:true});
      const channel=Object.hasOwn(mixerState.channels,speaker)?mixerState.channels[speaker]:{volume:Math.min(1,mixerState.volumeLimits.voices),mute:false};channel.volume=Math.min(channel.volume,mixerState.volumeLimits.voices);Object.defineProperty(mixerState.channels,speaker,{value:channel,writable:true,enumerable:true,configurable:true});
      const row=doc.createElement('div');row.className='cm-channel';row.dataset.speaker=speaker;row.dataset.kind='voice';row.dataset.channelGroup='cast';row.dataset.noVoice=String(speakerExcluded(speaker));
      row.setAttribute('aria-current',String(currentSpeaker===speaker || currentGroupNames.includes(speaker)));const name=doc.createElement('span');name.className='cm-channel-name';name.textContent=speaker;name.title=speaker;
      const head=doc.createElement('div');head.className='cm-channel-head';
      const dot=doc.createElement('span');dot.className='cm-channel-dot';dot.setAttribute('aria-hidden','true');
      const readout=doc.createElement('span');readout.className='cm-percent';readout.setAttribute('aria-hidden','true');head.append(dot,name,readout);
      const controls=doc.createElement('div');controls.className='cm-channel-controls';
      const volume=makeMixerVolume(speaker,channel.volume,readout,value=>{channel.volume=value;applyVolume();updateGroupingStatus();if(config?.batchSpeech)refreshSectionControls();},mixerState.volumeLimits.voices);
      const silent=doc.createElement('button');silent.type='button';silent.className='cm-toggle';silent.dataset.kind='silent';silent.innerHTML=channel.mute?ICON_MUTED:ICON_SOUND;silent.setAttribute('aria-label',`${speaker} silent`);silent.setAttribute('aria-pressed',String(Boolean(channel.mute)));silent.title='Silent: mute playback. Audio can still be generated and cached.';silent.onclick=()=>{channel.mute=!channel.mute;applyVolume();renderMixer();if(config?.batchSpeech)refreshSectionControls();persistMixer();};
      controls.append(volume);head.append(silent);
      const noVoice=doc.createElement('button');noVoice.type='button';noVoice.className='cm-toggle';noVoice.dataset.kind='no-voice';noVoice.innerHTML=speakerExcluded(speaker)?ICON_MIC_OFF:ICON_MIC;noVoice.setAttribute('aria-label',`${speaker} no voice`);noVoice.setAttribute('aria-pressed',String(speakerExcluded(speaker)));noVoice.title='No voice: skip this character, including cached playback. No new audio is generated; text and saved audio stay available.';noVoice.onclick=()=>run(()=>setSpeakerExcluded(speaker,!speakerExcluded(speaker)));head.append(noVoice);
      row.append(head,controls);
      if(mixerState.layout.voiceSpeeds){
        const speed=makeMixerTuning(`${speaker} speed in mixer`,{...SPEED_CONTROL,max:mixerState.speedSliderMax,title:SPEED_TITLE,onValue:value=>{stretchSpeedSlider(value);channel.speed=value;paintSpeakerSpeeds();applyPlaybackRate();refreshSpeechGrouping();},onCommit:saveMixerValue,onReset:()=>followMasterSpeed(speaker)});
        const tuning=mixerTuningRow('Speed',speed),followButton=document.createElement('button');tuning.classList.add('cm-channel-speed');followButton.type='button';followButton.className='cm-use-global';followButton.textContent='Use global';followButton.onclick=()=>followMasterSpeed(speaker);tuning.append(followButton);speakerSpeedRows.push({speaker,speed,followButton,inMixer:true});row.append(tuning);
      }
      channelsRoot.append(row);
    }
    for(const [kind,name,enabled] of [['sfx','SFX',config?.enableSfx!==false],['ambience','Ambience',config?.enableAmbience!==false],['music','Music',config?.enableMusic===true]]){
      const row=doc.createElement('div');row.className='cm-channel';row.dataset.kind=kind;row.dataset.speaker=name;row.dataset.channelGroup='scene';row.dataset.enabled=String(enabled);row.title=enabled?`${name} is on.`:`${name} is off. Use its button above to turn it on.`;row.setAttribute('aria-current',String(kind==='sfx' && currentSpeaker==='SFX'));
      const head=doc.createElement('div');head.className='cm-channel-head';const dot=doc.createElement('span');dot.className='cm-channel-dot';dot.setAttribute('aria-hidden','true');
      const label=doc.createElement('span');label.className='cm-channel-name';label.textContent=name;
      const readout=doc.createElement('span');readout.className='cm-percent';readout.setAttribute('aria-hidden','true');head.append(dot,label,readout);
      const controls=doc.createElement('div');controls.className='cm-channel-controls';const volume=makeMixerVolume(name,mixerState[kind],readout,value=>{mixerState[kind]=value;applyVolume();},mixerState.volumeLimits[kind]);
      controls.append(volume);row.append(head,controls);channelsRoot.append(row);
    }
    const rows=[...channelsRoot.querySelectorAll('.cm-channel')],groups=[['cast','Cast'],['scene','Scene audio']],keys=groups.map(([key])=>key);
    const legacySpeaker=mixerState.channelTab?.startsWith('voice:')?mixerState.channelTab.slice(6):'';
    const selected=keys.includes(mixerState.channelGroup)?mixerState.channelGroup:['main','npcs'].includes(mixerState.channelGroup) || legacySpeaker?'cast':mixerState.channelTab?'scene':'cast';
    mixerState.channelGroup=selected;channelTabs.replaceChildren();
    groups.forEach(([key,label],index)=>{
      const active=key===selected,tabId=`${levelsBody.id}-tab-${key}`;
      const tab=doc.createElement('button');tab.type='button';tab.className='cm-channel-tab';tab.id=tabId;tab.dataset.channelKey=key;tab.setAttribute('role','tab');tab.setAttribute('aria-label',label);tab.setAttribute('aria-controls',channelsRoot.id);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;tab.textContent=label;
      const select=next=>{mixerState.channelGroup=keys[next];levelsBody.scrollTop=0;channelsRoot.scrollTop=0;renderMixer();void persistMixer();};tab.onclick=()=>select(index);
      tab.onkeydown=event=>{const next=event.key==='ArrowRight'?(index+1)%groups.length:event.key==='ArrowLeft'?(index+groups.length-1)%groups.length:event.key==='Home'?0:event.key==='End'?groups.length-1:null;if(next===null)return;event.preventDefault();select(next);channelTabs.children[next]?.focus({preventScroll:true});};
      if(active)channelsRoot.setAttribute('aria-labelledby',tabId);
      channelTabs.append(tab);
    });
    for(const row of rows)row.hidden=row.dataset.channelGroup!==selected;
    const visibleRows=rows.filter(row=>!row.hidden);
    if(!visibleRows.length){const empty=doc.createElement('p');empty.className='cm-empty';empty.textContent='Plan the latest reply to see its voices.';channelsRoot.append(empty);}
    channelCount.textContent=String(visibleRows.length);legend.hidden=selected==='scene' || !visibleRows.length;
    paintSpeakerSpeeds();positionMixer();
    if(focusTabKey)[...channelTabs.children].find(tab=>tab.dataset.channelKey===focusTabKey)?.focus({preventScroll:true});
    channelsRoot.scrollTop=scrollTop;if(focusLabel)[...channelsRoot.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===focusLabel)?.focus({preventScroll:true});
  }
  function updateNextControls(){
    const available=Boolean(advancePlayback && skipAudio && activePlayback?.chatId===chatId);
    mixerNext.disabled=!available;mixerPrevious.disabled=!available;updateTransport();
    updateSeekControls();
  }
  function updateTransport(){
    const latest=latestReply(),paused=voiceGapHold?voiceGapHold.paused:(!currentAudio || currentAudio.paused),label=currentAudio?(paused?'Resume Choir audio':'Pause Choir audio'):'Play latest reply';
    mixerPlay.innerHTML=(paused?ICON_TRANSPORT_PLAY:ICON_TRANSPORT_PAUSE).replace(/<circle[^>]*\/>/,'');mixerPlay.title=label;mixerPlay.setAttribute('aria-label',label);mixerPlay.disabled=currentAudio?!audioReady:busy || Boolean(controller) || !chatId || !latest;
    $('drawerPlay').textContent=currentAudio?(paused?'Resume':'Pause'):'Play';$('drawerPlay').setAttribute('aria-label',label);$('drawerPlay').disabled=mixerPlay.disabled;
    $('currentMessageLabel').textContent=Number.isInteger(latest?.index_in_chat)?`Message ${String(latest.index_in_chat+1).padStart(3,'0')}`:'Latest reply';$('drawerDownload').disabled=busy;
    mixerPlanLatest.disabled=busy || Boolean(controller) || !chatId || !latest;
    mixerStop.disabled=!controller && !currentAudio && !paragraphPrefetchControllers.size && !autoReplyQueue.size && !beds.ambience && !beds.music;
    $('stop').disabled=mixerStop.disabled;
    mixer.dataset.playState=currentAudio?(paused?'paused':'playing'):busy?'loading':'idle';playbackCaption.textContent=currentAudio?(paused?'Paused':'Now playing'):busy?(planningSource?'Planning speech':'Preparing audio'):'Playback';
  }
  function speakerExcluded(speaker){return normalizeName(speaker)==='narrator' && Boolean(config?.muteNarrator) || [...(config?.fixed || []),...Object.values(config?.casts || {}).flat()].some(actor=>normalizeName(actor.speaker)===normalizeName(speaker) && actor.excluded) || config?.npcPolicy?.mode==='skip' && Object.values(config.casts || {}).flat().some(actor=>normalizeName(actor.speaker)===normalizeName(speaker));}
  function playbackExcluded(segment){return (segment.unison?segment.unison.every(member=>speakerExcluded(member.speaker)):speakerExcluded(segment.speaker)) || segment.kind==='sfx' && config?.enableSfx===false || segment.kind==='ambience' && config?.enableAmbience===false || segment.kind==='music' && config?.enableMusic!==true;}
  // Background markers have no standalone playback duration. Keep the display
  // in audible clips while cache, resume and navigation retain plan indexes.
  function audioProgress(items,index){
    let current=0,total=0;
    for(let i=0;i<items.length;i++){
      if(isBed(items[i]) || playbackExcluded(items[i]))continue;
      total++;if(i<=index)current++;
    }
    return `${current}/${total}`;
  }
  function syncAmbiencePlayback(){if(!$('enableAmbience').checked)stopBeds('ambience');showFoleyStatus();updateTransport();}
  function syncMusicPlayback(){if(!$('enableMusic').checked)stopBeds('music');updateTransport();}
  function syncSfxPlayback(){showFoleyStatus();generationPolicyChanged?.();if(config?.enableSfx===false && currentSpeaker==='SFX')skipAudio?.();applyVolume();}
  function stopGroupedForSpeaker(speaker){
    if(!controller || !mixerPlaybackSegments?.some(segment=>(segment.dialogue || segment.unison) && speechMembers(segment).some(turn=>normalizeName(turn.speaker)===normalizeName(speaker))))return false;
    stop(false);status('Speaker selection changed. Play again to rebuild grouped speech with the selected voices.');return true;
  }
  async function setSpeakerExcluded(speaker,excluded){
    if(!chatId)return;
    const legacyNarratorMute=normalizeName(speaker)==='narrator' && Boolean(config.muteNarrator);
    if(legacyNarratorMute)config.muteNarrator=false;
    for(const actor of [...config.fixed,...Object.values(config.casts).flat()])if(normalizeName(actor.speaker)===normalizeName(speaker))actor.excluded=excluded;
    for(const entry of [...castRows,...npcRows])if(normalizeName(entry.read().speaker)===normalizeName(speaker))entry.setExcluded(excluded);
    if(!stopGroupedForSpeaker(speaker)){generationPolicyChanged?.();if(excluded && currentSpeaker===speaker)advancePlayback?.();}
    if(legacyNarratorMute && plan)renderPreview();renderMixer();void refreshCacheStatus();await persistConfig(chatId,config,legacyNarratorMute);
  }
  function makeSeekControl(messageId){
    const root=document.createElement('div');root.className='cm-seek';root.hidden=true;
    const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='0';slider.step='0.1';slider.value='0';slider.disabled=true;slider.setAttribute('aria-label','Seek in current spoken block');
    const time=document.createElement('span');root.append(slider,time);
    const control={root,slider,time,messageId};seekControls.add(control);
    slider.oninput=()=>{const audio=currentAudio;if(disposed || root.hidden || slider.disabled || !audio || !activePlayback || (messageId && messageId!==activePlayback.messageId) || !Number.isFinite(audio.duration))return;const seconds=Math.max(0,Math.min(Number(slider.value),Math.max(0,audio.duration-0.05)));if(Math.abs(seconds-audio.currentTime)>0.05)playedCapture?.markDiscontinuous();audio.currentTime=seconds;savePosition(audio.currentTime);updateSeekControls();};
    return control;
  }
  function updateSeekControls(){
    const audio=currentAudio,available=Boolean(audio && skipAudio && activePlayback?.chatId===chatId);
    const duration=available && Number.isFinite(audio.duration)?audio.duration:0,seconds=available?audio.currentTime || 0:0;
    const clock=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
    for(const control of seekControls){
      const visible=available && (!control.messageId || control.messageId===activePlayback.messageId);control.root.hidden=!visible;control.slider.disabled=!visible || duration<=0;
      control.slider.max=String(duration);control.slider.value=String(Math.min(seconds,duration));control.time.textContent=`${clock(seconds)} / ${clock(duration)}`;
      control.slider.style.setProperty('--choir-level',`${duration?Math.min(seconds/duration,1)*100:0}%`);
      const part=(activePlayback?.chunk ?? 0)+1;control.slider.title=`${currentSpeaker || 'Current block'}${part>1?` · part ${part}`:''}`;control.slider.setAttribute('aria-valuetext',`${clock(seconds)} of ${clock(duration)}${part>1?`, part ${part}`:''}`);
    }
  }
  $('showMixer').onclick=()=>{const close=Boolean(config?.enableMixer) && !mixerState.collapsed;config.enableMixer=true;if($('enableMixer'))$('enableMixer').checked=true;mixerState.enabled=true;mixerState.collapsed=close;positionMixer();persistMixer();scheduleSettingsSave();};
  if($('enableMixer'))$('enableMixer').onchange=()=>{config.enableMixer=$('enableMixer').checked;mixerState.enabled=config.enableMixer;positionMixer();scheduleSettingsSave();persistMixer();};
  const applyMixerTheme=()=>{const enabled=mixerState.abyssalTheme===true;mixer.dataset.abyssalTheme=String(enabled);$('abyssalMixerTheme').checked=enabled;};
  $('abyssalMixerTheme').onchange=()=>{mixerState.abyssalTheme=$('abyssalMixerTheme').checked;applyMixerTheme();void persistMixer();};
  applyMixerTheme();
  positionMixer();
  function status(text,error=false) {
    if(disposed)return;
    for(const name of ['status','statusActions']) {$(name).textContent=text;$(name).classList.toggle('et-error',error);}
    for(const node of messageStatuses.get(messagePlaybackId) || []){node.textContent=text;node.title=text;}
  }
  const abortError = () => new DOMException('Stopped','AbortError');
  const scope = c => `native:${c.connection}`;
  const detectProvider = routeOrConfig => {
    const route = typeof routeOrConfig === 'string' ? routeOrConfig : scope(routeOrConfig);
    const connectionId = route.startsWith('native:') ? route.slice(7) : route;
    const conn = nativeConnections.find(c => c.id === connectionId);
    return speechProviderFamily(conn?.provider,conn?.model) || 'generic';
  };
  function extraVoiceRoutes(id) {
    return Object.hasOwn(config.extraVoiceRoutes || {},id) && Array.isArray(config.extraVoiceRoutes[id])?config.extraVoiceRoutes[id]:[];
  }
  function rememberExtraVoiceRoute(id,route) {
    const routes=extraVoiceRoutes(id);
    config.extraVoiceRoutes={...config.extraVoiceRoutes,[id]:[...new Set([...routes,route])]};
  }
  // Voices outside a connection's catalogue (pasted IDs, community picks) live in Additional voices on their route.
  function addExtraVoice(id,description,route) {
    rememberExtraVoiceRoute(id,route);
    const lines=$('extraVoices').value.split('\n').filter(line=>line.trim() && line.split('|')[0].trim()!==id);
    lines.push(description?`${id} | ${description}`:id);$('extraVoices').value=config.extraVoices=lines.join('\n');
    const existing=(voiceCatalogues.get(route) || []).find(item=>item.id===id);
    const catalogue=[...(voiceCatalogues.get(route) || []).filter(item=>item.id!==id),{...existing,id,name:existing?.name || id,description}];
    voiceCatalogues.set(route,catalogue);
    if(route===scope(config))voices=catalogue;
    return catalogue;
  }
  function adoptCommunityVoices(result,snapshot) {
    for(const voice of result.communityVoices || []){
      addExtraVoice(voice.id,voice.description,voice.route);
      snapshot.voices.push({id:voice.id,name:voice.id,description:voice.description,route:voice.route});
    }
  }
  function scopeLegacyExtraVoices() {
    const routes=nativeConnections.map(connection=>`native:${connection.id}`);
    for(const voice of additionalVoices(config.extraVoices)) {
      if(extraVoiceRoutes(voice.id).length)continue;
      // Older versions shared this textarea across all providers. Recover known
      // provider IDs and explicit assignments before exposing them to the LLM.
      const provider=GEMINI_VOICES.some(item=>item.id===voice.id) || /^(?:voice_|voicekey_)/.test(voice.id)?'gemini':
        OPENAI_VOICES.some(item=>item.id===voice.id)?'openai_tts':/^[a-f0-9]{32}$/i.test(voice.id)?'fish_audio':null;
      const assigned=[...(config.fixed || []),...Object.values(config.casts || {}).flat()]
        .filter(actor=>actor.voice===voice.id).map(actor=>actor.route || scope(config));
      const selected=provider?routes.filter(route=>detectProvider(route)===provider):assigned.length?assigned:[scope(config)];
      config.extraVoiceRoutes={...config.extraVoiceRoutes,[voice.id]:[...new Set(selected)]};
    }
  }
  async function ensureCatalogue(route,version=loadVersion) {
    if(disposed || version!==loadVersion)return [];
    if(voiceCatalogues.has(route))return voiceCatalogues.get(route);
    const catalogueRevision=voiceCatalogueRevision;
    scopeLegacyExtraVoices();
    let extra=[...additionalVoices(config.extraVoices).filter(voice=>extraVoiceRoutes(voice.id).includes(route)),...(capturedDefaults?.voiceCatalogue || []).filter(voice=>voice.route===route)];
    const connectionId=route.startsWith('native:')?route.slice(7):'';
    if(!nativeConnections.some(c=>c.id===connectionId))throw new Error('Select an available TTS connection for this speaker.');
    const conn=nativeConnections.find(c=>c.id===connectionId);
    const provider=detectProvider(route);
    if(provider==='fish_audio'){
      const assigned=[...(config.fixed || []),...Object.values(config.casts || {}).flat()].filter(actor=>config.connectionMode==='one' || (actor.route || scope(config))===route);
      const ids=[conn.voice,...assigned.map(actor=>config.connectionMode==='one'?config.singleVoices?.[route]?.[actor.speaker] ?? actor.voice:actor.voice)];
      extra.push(...ids.filter(id=>/^[a-f0-9]{32}$/i.test(id || '')).map(id=>({id,name:id})));
    }
    const fallback=nativeProviders.find(item=>item.id===conn.provider)?.capabilities?.staticVoices || [];
    let data;
    try{data=await api(`/tts-connections/${encodeURIComponent(connectionId)}/voices`).then(response=>response.json());}
    catch(error){
      if(disposed || version!==loadVersion)return [];
      if(catalogueRevision!==voiceCatalogueRevision)return ensureCatalogue(route,version);
      if(!fallback.length && !extra.length && provider!=='openai_tts')throw error;data={voices:[]};
    }
    if(disposed || version!==loadVersion)return [];
    // A refreshed connection may keep its ID while changing models or voices.
    // Late responses must retry against the current connection, never cache the old list.
    if(catalogueRevision!==voiceCatalogueRevision)return ensureCatalogue(route,version);
    let baseVoices=data.voices || [];
    if(!baseVoices.length)baseVoices=fallback.length?fallback:provider==='openai_tts'?OPENAI_VOICES:[];
    if(conn.provider==='openrouter_tts'){
      const compatible=voice=>provider==='fish_audio'?!GEMINI_VOICES.some(item=>item.id===voice.id) && !OPENAI_VOICES.some(item=>item.id===voice.id):provider==='gemini'?GEMINI_VOICES.some(item=>item.id===voice.id) || /^(?:voice_|voicekey_)/.test(voice.id):provider==='openai_tts'?OPENAI_VOICES.some(item=>item.id===voice.id):true;
      baseVoices=baseVoices.filter(compatible);extra=extra.filter(compatible);
    }
    if(provider==='gemini' && !baseVoices.some(v=>GEMINI_VOICES.some(gv=>gv.id===v.id))) {
      baseVoices=[...baseVoices,...GEMINI_VOICES];
    }
    const merged=new Map(baseVoices.map(voice=>[voice.id,voice]));
    for(const voice of extra)merged.set(voice.id,{...merged.get(voice.id),...voice});
    const catalogue=normalizeVoiceCatalogue([...merged.values()]);
    // Fish IDs come from its community catalogue or a pasted voice ID. The
    // relay's mixed preset list can legitimately contain no Fish voices yet.
    if(!catalogue.length && (provider!=='fish_audio' || data.error))throw new Error(data.error || 'This TTS connection returned no voices. Configure its voice catalogue in Lumiverse.');
    voiceCatalogues.set(route,catalogue);return catalogue;
  }
  const settingsKey = id => `chat:${id}`;
  const GLOBAL_SETTINGS_KEY='settings:global';
  const CAPTURED_DEFAULTS_KEY='settings:captured-defaults';
  const preferenceFields=['planner','decisionConnection','connection','connectionMode','enableMixer','styleParam','apiBase','chunk','batchSpeech','plannerTokens','retention','concurrency','prefetch','normalizeLoudness','skipMeta','allowLlmFallback','sectionButtons','paranoidMode','extraVoices','extraVoiceRoutes','useStyle','auto','autoPlan','showAutoPlanAction','ignoredTags','fishVoiceSource','plannerMode','useFastClassifier','useJev','jevEndpoint','enableSfx','enableAmbience','enableMusic','loopMusic','freesoundApiKey','readAlong','followNarration'];
  const defaultVoiceFields=['voice','route','gender','style','accent','deliveryMode','excluded'];
  let capturedDefaults=null,defaultOperation=false,defaultsRevision=0;
  let closeDefaultEditor;
  unsubs.push(()=>closeDefaultEditor?.());
  // Repair older settings before hidden voice styles or retired routes reach validation.
  function normalizeSavedSettings(saved){
    const value=structuredClone(saved);
    for(const name of ['mode','model','allowVoiceFallback','autoDesignNPCs','batchGemini'])delete value[name];
    delete value.casts?.gemini;delete value.singleVoices?.gemini;
    for(const actor of [...(value.fixed || []),...(value.leadVoices || []),...Object.values(value.casts || {}).flat()]){
      if(actor?.route==='gemini')actor.route='';
      if(typeof actor?.style==='string')actor.style=actor.style.slice(0,600);
    }
    if(value.npcPolicy?.route==='gemini')value.npcPolicy.route='';
    for(const id in value.extraVoiceRoutes)value.extraVoiceRoutes[id]=value.extraVoiceRoutes[id].filter(route=>route!=='gemini');
    return reconcileCastDuplicates(value);
  }
  function chatSettingsSnapshot(settings){
    const value=normalizeSavedSettings(withoutSecrets(settings));
    // Compare the same defaults the editors display. Rendering an empty field
    // in a stale tab is not an intentional edit of another tab's newer value.
    for(const actor of [...(value.fixed || []),...Object.values(value.casts || {}).flat()]){
      const speaker=actor.speaker.trim(),aliases=(actor.aliases || []).join(',').split(',').map(alias=>alias.trim()).filter((alias,index,list)=>alias && normalizeName(alias)!==normalizeName(speaker) && list.findIndex(other=>normalizeName(other)===normalizeName(alias))===index);
      Object.assign(actor,{speaker,voice:actor.voice || '',route:actor.route || '',gender:actor.gender || 'auto',style:(actor.style || '').trim(),deliveryMode:characterDeliveryMode(actor,normalizeName(speaker)==='narrator'),aliases,pronunciation:(actor.pronunciation || '').trim(),sayAs:namePronunciation(actor),sayAsName:actor.sayAsName || '',accent:(actor.accent || '').trim(),excluded:Boolean(actor.excluded)});
    }
    return value;
  }
  const preferenceSnapshot=value=>Object.fromEntries(preferenceFields.filter(name=>value && Object.hasOwn(value,name)).map(name=>[name,structuredClone(value[name])]));
  // The wizard uses the same connections, catalogue, synthesis, and default
  // format as the settings panel. It never persists a chat cast.
  let setupTestController=null,setupAutoStarted=false;
  const wizardConnections=async(signal,refresh=false)=>{
    const paths=['/tts-connections?limit=200','/connections?limit=200','/decision-connections?limit=200'];
    const results=await Promise.allSettled([...paths.map(path=>api(path,{signal}).then(response=>response.json())),rpc('ping',{},signal,8000)]);
    if(signal?.aborted)throw abortError();
    const result={tts:[],llm:[],decision:[],errors:[]};
    ['tts','llm','decision'].forEach((kind,index)=>{
      if(results[index].status==='fulfilled')result[kind]=results[index].value.data || [];
      else result.errors.push(`Could not load ${kind==='tts'?'TTS':kind==='llm'?'LLM':'Decision'} connections: ${results[index].reason.message}. Refresh to retry.`);
    });
    // Connection IDs survive edits to their provider/model. Refresh the voice
    // lists too, including cached routes used by playback after setup closes.
    if(results[0].status==='fulfilled'){
      const previous=new Map(nativeConnections.map(connection=>[connection.id,JSON.stringify(connection)]));
      const changed=refresh || result.tts.length!==nativeConnections.length || result.tts.some(connection=>previous.get(connection.id)!==JSON.stringify(connection));
      nativeConnections=result.tts;
      if(changed){
        const cachedRoutes=[...voiceCatalogues.keys()].filter(route=>nativeConnections.some(connection=>route===`native:${connection.id}`));
        ++voiceCatalogueRevision;voiceCatalogues.clear();
        await Promise.allSettled(cachedRoutes.map(route=>ensureCatalogue(route)));
        if(disposed || signal?.aborted)throw abortError();
        voices=voiceCatalogues.get(scope(config)) || [];
      }
    }
    result.directJev=results[3].status==='fulfilled' && results[3].value.decisionsAvailable===false;
    return result;
  };
  async function withSetupTest(signal,operation){
    if(disposed || signal.aborted)throw abortError();
    stop(false);const ctrl=new AbortController();setupTestController=controller=ctrl;const token=revision;
    const cancel=()=>ctrl.abort();signal.addEventListener('abort',cancel,{once:true});setBusy(true);
    try{return await operation(ctrl.signal);}
    finally{
      signal.removeEventListener('abort',cancel);ctrl.abort();
      if(setupTestController===ctrl)setupTestController=null;
      if(controller===ctrl)controller=null;
      if(!disposed && token===revision)setBusy(false);
    }
  }
  const setupWizard=createSetupWizard(ctx,{
    report:message=>status(message,true),
    onState:state=>drawerNavigation.setSetupReminder(!state?.completed && Boolean(state?.deferred)),
    session:()=>({jev:$('jevKey').value.trim()}),
    setSession:(kind,value)=>{if(kind==='jev')$('jevKey').value=value;},
    connections:signal=>wizardConnections(signal,true),
    voices:route=>ensureCatalogue(route),
    stopTest:()=>{if(setupTestController){setupTestController.abort();setupTestController=null;stop(false);}},
    connectionGuide:()=>{tab.activate?.();status('Open Lumiverse’s Connect panel, then TTS, LLM, or Decision to configure a connection. Return to Choir, run setup again, and refresh connections.');},
    snapshot:async()=>{
      await flushSettings();
      const [global,preset,legacy,chat,connections]=await Promise.all([ctx.settings.get(GLOBAL_SETTINGS_KEY),ctx.settings.get(CAPTURED_DEFAULTS_KEY),ctx.settings.get('settings:defaults'),chatId?ctx.settings.get(settingsKey(chatId)):null,wizardConnections()]);
      const value=structuredClone(config || defaults());
      if(value.connectionMode==='one')value.fixed=casting(value).fixed;
      return {config:value,preset,connections,existing:Boolean(global || preset || legacy || chat)};
    },
    testPlanner:(draft,signal)=>withSetupTest(signal,async testSignal=>{
      const result=await rpc('testPlanner',{
        plannerMode:draft.plannerMode,connectionId:draft.planner,decisionConnection:draft.decisionConnection,
        jevApiKey:$('jevKey').value.trim(),jevEndpoint:draft.jevEndpoint,
        config:{fixed:[{speaker:'Narrator',voice:'local',style:''}],npcs:[],voices:[{id:'local'}],useStyle:false}
      },testSignal,65000);
      return `${result.provider} · ${result.model}: ${result.response}`;
    }),
    testVoice:(draft,actor,signal)=>withSetupTest(signal,async testSignal=>{
      const route=draft.connectionMode==='one'?scope(draft):actor.route || scope(draft);
      const request=synthesisSettings({speaker:actor.speaker || 'NPC',voice:actor.voice,text:'Hello! Choir is ready to bring your story to life.',style:actor.style || '',route},draft);
      if(!request.connection)throw new Error('This TTS connection is no longer available. Refresh connections.');
      const blob=await nativeSpeech(request.connection,{voice:actor.voice,text:request.segment.text,parameters:request.parameters},testSignal,actor.speaker || 'NPC');
      if(testSignal.aborted)throw abortError();
      await playBlob(blob,testSignal,actor.speaker || 'NPC',0,draft.normalizeLoudness);
    }),
    save:async(draft,initial,signal,onCommit)=>{
      await flushSettings();if(disposed || signal.aborted)throw abortError();
      const route=scope(draft),fixed=draft.fixed.map(actor=>({...actor,route:draft.connectionMode==='one'?route:actor.route || route}));
      const policy={...draft.npcPolicy,route:draft.connectionMode==='one'?'':draft.npcPolicy.route || ''};
      const selected=fixed.filter(actor=>!actor.excluded).map(actor=>({id:actor.voice,route:actor.route}));
      if(['single','preferred'].includes(policy.mode))selected.push(...(policy.mode==='single'?[policy.voice]:policy.voices).map(id=>({id,route:policy.route || route})));
      const routes=[...new Set([route,...fixed.filter(actor=>!actor.excluded).map(actor=>actor.route),...(policy.mode==='skip'?[]:[policy.route || route])])];
      const lists=await Promise.all(routes.map(async route=>{
        let list;
        try{list=await ensureCatalogue(route);}
        catch(error){if(detectProvider(route)!=='fish_audio' || !selected.some(voice=>voice.route===route && voice.id))throw error;list=[];}
        return list.map(voice=>({...voice,route}));
      }));
      // Existing defaults support explicit provider IDs not returned by a
      // catalogue (e.g. private/community Fish voices). Preserve that behavior.
      const catalogue=new Map(lists.flat().map(voice=>[JSON.stringify([voice.route,voice.id]),voice]));
      for(const voice of selected)if(voice.id && !catalogue.has(JSON.stringify([voice.route,voice.id]))){
        if(detectProvider(voice.route)==='fish_audio'){
          if(!/^[A-Za-z0-9_-]{1,200}$/.test(voice.id))throw new Error('Enter a Fish Audio voice ID using letters, numbers, hyphens or underscores.');
          if([...GEMINI_VOICES,...OPENAI_VOICES].some(item=>item.id===voice.id))throw new Error(`Fish Audio requires a Fish voice ID; ${voice.id} belongs to Gemini or OpenAI.`);
        }else throw new Error(`Voice ${voice.id} is not in this connection’s catalogue. Choose an available voice or configure the voice catalogue in Lumiverse.`);
        catalogue.set(JSON.stringify([voice.route,voice.id]),{...voice,name:voice.id});
      }
      validateNumericSettings(draft);
      // Disabled roles keep their saved choices, but need no catalogue from a
      // removed connection. Validate their identity on the available default route.
      validateCastConfig({fixed:fixed.map(actor=>actor.excluded?{...actor,voice:'',route}:actor),npcs:[],voices:[...catalogue.values()],defaultRoute:route,npcPolicy:policy,useStyle:draft.useStyle});
      if(disposed || signal.aborted)throw abortError();
      const [global,preset]=await Promise.all([ctx.settings.get(GLOBAL_SETTINGS_KEY),ctx.settings.get(CAPTURED_DEFAULTS_KEY)]);
      const choices=preferenceSnapshot(draft),baseline=preferenceSnapshot(initial);
      // Preserve fields edited elsewhere while the wizard was open.
      const changes=Object.fromEntries(Object.entries(choices).filter(([name,value])=>!Object.hasOwn(global || {},name) || JSON.stringify(value)!==JSON.stringify(baseline[name])));
      const defaultsPreset={...(preset || {}),version:2,npcPolicy:structuredClone(policy),leadVoices:fixed.map(actor=>Object.fromEntries(defaultVoiceFields.filter(name=>Object.hasOwn(actor,name)).map(name=>[name,actor[name]]))),
        voiceCatalogue:[...new Map([...(preset?.voiceCatalogue || []),...selected.filter(voice=>voice.id).map(voice=>catalogue.get(JSON.stringify([voice.route,voice.id])))].map(voice=>[JSON.stringify([voice.route,voice.id]),voice])).values()]};
      if(disposed || signal.aborted)throw abortError();
      onCommit?.();
      await saveSetupSettings(ctx.settings,[[GLOBAL_SETTINGS_KEY,{...(global || {}),...changes}],[CAPTURED_DEFAULTS_KEY,defaultsPreset]],{version:1,completed:true,deferred:false});
      capturedDefaults=defaultsPreset;++defaultsRevision;
      if(!disposed){
        // Reload through the normal path: saved chats retain their own cast;
        // unsaved/new chats inherit the just-captured defaults.
        await loadChat(true);
      }
    }
  });
  $('setupWizard').onclick=()=>void setupWizard.open();
  void ctx.settings.get(ONBOARDING_KEY).then(state=>{if(!disposed)drawerNavigation.setSetupReminder(!state?.completed && Boolean(state?.deferred));}).catch(()=>{});
  unsubs.push(()=>setupWizard.dispose());
  function refreshDefaultControls(){
    $('captureDefaults').disabled=busy || defaultOperation || !chatId || !castRows.length;
    $('applyDefaults').disabled=busy || defaultOperation || !chatId || !castRows.length || !capturedDefaults?.leadVoices;
  }
  function withDefaultSetup(value,preset,group){
    const candidate={...value,...(!group || group==='npc'?preset.npcPolicy?{npcPolicy:structuredClone(preset.npcPolicy)}:{}:{})};
    if(group!=='npc' && Array.isArray(preset.leadVoices)){
      candidate.fixed=value.fixed.map((actor,index)=>({...actor,...Object.fromEntries(defaultVoiceFields.filter(name=>preset.leadVoices[Math.min(index,2)] && Object.hasOwn(preset.leadVoices[Math.min(index,2)],name)).map(name=>[name,preset.leadVoices[Math.min(index,2)][name]]))}));
      if(candidate.connectionMode==='one')candidate.singleVoices={...value.singleVoices,[scope(candidate)]:{...value.singleVoices?.[scope(candidate)],...Object.fromEntries(candidate.fixed.slice(0,3).map(actor=>[actor.speaker,actor.voice || '']))}};
    }
    return candidate;
  }
  function defaultLabel(name,node){const label=document.createElement('label');label.textContent=name;node.setAttribute('aria-label',name);label.append(node);return label;}
  function defaultConnection(value,name){
    const select=document.createElement('select');option(select,'','Use default TTS connection');
    for(const connection of nativeConnections)option(select,`native:${connection.id}`,`${connection.name} · ${connection.provider}`);
    if(value && ![...select.options].some(item=>item.value===value))option(select,value,`${value} · unavailable`);
    select.value=value || '';select.setAttribute('aria-label',name);return select;
  }
  function npcPolicyEditor(container,initial,getDefaultRoute,onChange,prefix='',getShared=()=>false,voicePicker=null){
    const policy=structuredClone(initial || {mode:'llm',route:'',voice:'',voices:[]}),mode=document.createElement('select');
    policy.routeVoices ||= {};
    for(const [value,name] of [['skip','Do not voice discovered characters'],['single','Use one shared voice'],['preferred','Choose from preferred voices'],['llm','Let the LLM decide']])option(mode,value,name);
    mode.value=policy.mode;const connection=defaultConnection(getShared()?'':policy.route,`${prefix}Casting connection`),voice=document.createElement('select'),pool=document.createElement('select');pool.multiple=true;pool.size=5;
    const selectedRoute=()=>connection.value || getDefaultRoute();
    const voiceField=voicePicker?.(voice,selectedRoute,`${prefix}Shared voice`,()=>{policy.voice=voice.value;onChange(read());});
    const poolField=voicePicker?.(pool,selectedRoute,`${prefix}Preferred voices`,()=>{policy.voices=[...pool.selectedOptions].map(item=>item.value);onChange(read());});
    const voiceLabel=voiceField?.node || defaultLabel(`${prefix}Shared voice`,voice),poolLabel=poolField?.node || defaultLabel(`${prefix}Preferred voices`,pool),connectionLabel=defaultLabel(`${prefix}Casting connection`,connection);
    const hint=document.createElement('small');hint.textContent='For discovered characters. Ctrl / Cmd-click to pick several voices.';
    container.append(defaultLabel(`${prefix}Automatic casting`,mode),connectionLabel,voiceLabel,poolLabel,hint);let request=0;
    const show=()=>{connection.disabled=getShared();connection.value=getShared()?'':policy.route || '';connectionLabel.hidden=policy.mode==='skip';voiceLabel.hidden=policy.mode!=='single';poolLabel.hidden=policy.mode!=='preferred';voiceField?.refresh();poolField?.refresh();};
    const fill=catalogue=>{
      if(voicePicker)catalogue=voicePicker.merge(catalogue,selectedRoute());
      voice.replaceChildren();pool.replaceChildren();option(voice,'','Choose a voice');
      for(const item of catalogue){const name=item.name || item.id;option(voice,item.id,name);option(pool,item.id,name);pool.lastElementChild.selected=(policy.voices || []).includes(item.id);}
      voice.value=policy.voice || '';show();
    };
    const refresh=async()=>{
      show();const token=++request,route=connection.value || getDefaultRoute();voice.disabled=pool.disabled=true;
      try{const catalogue=await ensureCatalogue(route);if(token===request && container.isConnected)fill(catalogue);}
      catch(error){if(token===request && container.isConnected)status(error.message,true);}
      finally{if(token===request){voice.disabled=pool.disabled=false;}}
    };
    const read=()=>({...structuredClone(policy),route:getShared()?'':policy.route || ''});
    fill(voiceCatalogues.get(connection.value || getDefaultRoute()) || []);
    mode.onchange=()=>{policy.mode=mode.value;show();onChange(read());};
    connection.onchange=()=>{
      policy.routeVoices[policy.route || getDefaultRoute()]={voice:policy.voice || '',voices:[...(policy.voices || [])]};
      policy.route=connection.value;const saved=policy.routeVoices[selectedRoute()];
      policy.voice=saved?.voice || '';policy.voices=[...(saved?.voices || [])];onChange(read());void refresh();
    };
    voice.onchange=()=>{policy.voice=voice.value;onChange(read());};
    pool.onchange=()=>{policy.voices=[...pool.selectedOptions].map(item=>item.value);onChange(read());};
    return {refresh,read};
  }
  function fishVoicePicker({active,mergeVoices,remember,onFeedback,openLibrary,selectedMessage}) {
    const voicePicker=(voice,getRoute,name,onSelect)=>{
      const node=document.createElement('div'),tools=document.createElement('div');tools.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
      const browse=document.createElement('button'),paste=document.createElement('button');browse.type=paste.type='button';browse.textContent='Browse voice catalogue';paste.textContent='Paste voice ID';
      browse.setAttribute('aria-label',`Browse Fish voice catalogue for ${name}`);paste.setAttribute('aria-label',`Paste Fish voice ID for ${name}`);
      const editor=document.createElement('div');editor.hidden=true;editor.style.cssText='display:grid;gap:6px;margin-top:6px';
      const id=document.createElement('input'),description=document.createElement('input');id.type=description.type='text';id.maxLength=200;description.maxLength=600;id.placeholder='Fish Audio voice ID';description.placeholder='Optional voice description';
      id.setAttribute('aria-label',`Fish voice ID for ${name}`);description.setAttribute('aria-label',`Fish voice description for ${name}`);
      const use=document.createElement('button'),discard=document.createElement('button');use.type=discard.type='button';use.textContent='Use this voice';discard.textContent='Close voice ID';use.setAttribute('aria-label',`Use Fish voice ID for ${name}`);
      const hide=()=>{editor.hidden=true;paste.setAttribute('aria-expanded','false');};hide();
      const choose=(item,selectedRoute=getRoute())=>{
        if(!active())return;
        if(selectedRoute!==getRoute() || detectProvider(selectedRoute)!=='fish_audio'){onFeedback('Select a Fish Audio connection for this voice.');return;}
        const voiceId=String(item.id || '').trim();
        if(!/^[A-Za-z0-9_-]{1,200}$/.test(voiceId)){onFeedback('Enter a Fish Audio voice ID using letters, numbers, hyphens or underscores.');return;}
        if([...GEMINI_VOICES,...OPENAI_VOICES].some(voice=>voice.id===voiceId)){onFeedback(`Fish Audio requires a Fish voice ID; ${voiceId} belongs to Gemini or OpenAI.`);return;}
        const known=mergeVoices(voiceCatalogues.get(selectedRoute) || [],selectedRoute).find(voice=>voice.id===voiceId);
        const entry={id:voiceId,route:selectedRoute,name:String(item.name || known?.name || voiceId).slice(0,200),description:String(item.description || known?.description || '').replace(/[|\r\n]+/g,' ').slice(0,600)};
        remember(entry);
        if(![...voice.options].some(option=>option.value===voiceId))option(voice,voiceId,entry.name);
        if(voice.multiple)[...voice.options].find(option=>option.value===voiceId).selected=true;else voice.value=voiceId;
        onSelect();hide();onFeedback(selectedMessage(entry.name));voice.focus();
      };
      browse.onclick=()=>{const selectedRoute=getRoute();openLibrary({targetSpeaker:name,defaultQuery:name.includes('{{')?'character':name.includes('Narrator')?'narrator':'voice',onSelect:item=>choose(item,selectedRoute)});};
      paste.onclick=()=>{if(!editor.hidden){hide();return;}id.value=voice.multiple?'':voice.value;description.value='';editor.hidden=false;paste.setAttribute('aria-expanded','true');id.focus();};
      use.onclick=()=>choose({id:id.value,description:description.value});discard.onclick=()=>{hide();paste.focus();};
      editor.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();discard.click();}else if(event.key==='Enter'){event.preventDefault();use.click();}};
      tools.append(browse,paste);editor.append(id,description,use,discard);node.append(defaultLabel(name,voice),tools,editor);
      const refresh=()=>{tools.hidden=detectProvider(getRoute())!=='fish_audio';if(tools.hidden)hide();};refresh();
      return {node,refresh};
    };
    voicePicker.merge=mergeVoices;
    return voicePicker;
  }
  function openDefaultEditor(group='lead',useCurrent=false){
    closeDefaultEditor?.();
    const current=capture(),draft=structuredClone(useCurrent || !capturedDefaults?current:withDefaultSetup(current,capturedDefaults));
    if(useCurrent || !capturedDefaults)draft.fixed=casting(current).fixed;
    draft.fixed=draft.fixed.slice(0,3);draft.casts={};draft.singleVoices={};
    const overlay=document.createElement('div');overlay.className='et-default-overlay';
    const dialog=document.createElement('div');dialog.className='ensemble-tts et-default-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Set default');
    const heading=document.createElement('h2');heading.textContent='Set default';
    const intro=document.createElement('p');intro.style.fontSize='.85em';intro.textContent='New chats start with these voices.';
    const tabs=document.createElement('div');tabs.className='et-default-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Default settings');
    const body=document.createElement('div');body.className='et-default-body';const panels=[];const buttons=[];
    for(const [key,title] of [['lead','Voices'],['npc','Automatic casting']]){
      const panel=document.createElement('div');panel.dataset.panel=key;panel.setAttribute('role','tabpanel');panel.id=`choir-default-${key}`;
      const button=document.createElement('button');button.type='button';button.textContent=title;button.id=`choir-default-tab-${key}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',button.id);
      tabs.append(button);body.append(panel);panels.push(panel);buttons.push(button);
    }
    const select=index=>{panels.forEach((panel,i)=>panel.hidden=i!==index);buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;});};
    buttons.forEach((button,index)=>{button.onclick=()=>select(index);button.onkeydown=event=>{const next=event.key==='ArrowRight'?(index+1)%2:event.key==='ArrowLeft'?(index+1)%2:null;if(next!==null){event.preventDefault();select(next);buttons[next].focus();}};});select(group==='npc'?1:0);
    const route=()=>scope(current),draftVoices=new Map((capturedDefaults?.voiceCatalogue || []).map(voice=>[`${voice.route}:${voice.id}`,voice]));
    let closeLibrary;
    const mergeVoices=(catalogue,selectedRoute)=>[...new Map([...catalogue,...[...draftVoices.values()].filter(voice=>voice.route===selectedRoute)].map(voice=>[voice.id,voice])).values()];
    const voicePicker=fishVoicePicker({active:()=>dialog.isConnected && !disposed,mergeVoices,remember:entry=>draftVoices.set(`${entry.route}:${entry.id}`,entry),onFeedback:message=>feedback.textContent=message,openLibrary:options=>{closeLibrary?.();closeLibrary=openVoiceLibraryModal(options);},selectedMessage:name=>`Selected ${name}. Save default to keep this choice.`});
    const voiceRefreshes=[];
    for(const [index,name] of ['Narrator','{{user}}','{{char}}'].entries()){
      const actor=draft.fixed[index] || {speaker:name,voice:'',style:''};draft.fixed[index]=actor;
      const section=document.createElement('div');section.className='et-grid';section.style.alignItems='start';const title=document.createElement('strong');title.textContent=name;title.style.gridColumn='1 / -1';
      const connection=defaultConnection(actor.route,`Default ${name} connection`),voice=document.createElement('select');let request=0;
      const fill=catalogue=>{catalogue=mergeVoices(catalogue,connection.value || route());const selected=actor.voice || '';voice.replaceChildren();option(voice,'','Let the LLM decide');for(const item of catalogue)option(voice,item.id,item.name || item.id);if(selected && !catalogue.some(item=>item.id===selected))option(voice,selected,`${selected} · unavailable`);voice.value=selected;};
      fill(voiceCatalogues.get(connection.value || route()) || []);
      const refresh=async()=>{field.refresh();const token=++request;voice.disabled=true;try{const catalogue=await ensureCatalogue(connection.value || route());if(token===request && dialog.isConnected)fill(catalogue);}catch(error){if(token===request)feedback.textContent=error.message;}finally{if(token===request)voice.disabled=false;}};
      voiceRefreshes.push(refresh);
      const shared=()=>{connection.disabled=current.connectionMode==='one';if(connection.disabled){connection.value='';actor.route='';}};shared();
      const field=voicePicker(voice,()=>connection.value || route(),`Default ${name} voice`,()=>actor.voice=voice.value);
      connection.onchange=()=>{actor.route=connection.value;actor.voice='';void refresh();};voice.onchange=()=>actor.voice=voice.value;
      section.append(title,defaultLabel(`Default ${name} connection`,connection),field.node);panels[0].append(section);
    }
    const npcEditor=npcPolicyEditor(panels[1],draft.npcPolicy,route,value=>draft.npcPolicy=value,'Default ',()=>current.connectionMode==='one',voicePicker);
    const feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.dataset.defaultFeedback='';feedback.style.fontSize='.85em';
    const actions=document.createElement('div');actions.className='et-default-actions';
    const fromChat=document.createElement('button'),cancel=document.createElement('button'),save=document.createElement('button');fromChat.textContent='Use current chat settings';cancel.textContent='Cancel';save.textContent='Save default';save.className='et-btn-primary';actions.append(fromChat,cancel,save);
    const targetChat=chatId,version=loadVersion,previousFocus=document.activeElement;
    const close=()=>{closeLibrary?.();overlay.remove();if(closeDefaultEditor===close)closeDefaultEditor=null;if(previousFocus?.isConnected)previousFocus.focus();};closeDefaultEditor=close;
    cancel.onclick=close;fromChat.onclick=()=>openDefaultEditor(group,true);overlay.onclick=event=>{if(event.target===overlay)close();};
    dialog.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='Tab'){const focusable=[...dialog.querySelectorAll('button,input,select')].filter(node=>!node.disabled && node.tabIndex>=0 && !node.closest('[hidden]')),first=focusable[0],last=focusable.at(-1);if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}};
    save.onclick=()=>void(async()=>{
      save.disabled=true;fromChat.disabled=true;defaultOperation=true;refreshDefaultControls();feedback.textContent='Saving default…';$('defaultStatus').textContent='Saving default…';
      try{
        draft.npcPolicy=npcEditor.read();
        if(draft.connectionMode==='one')for(const actor of draft.fixed)actor.route=route();
        const candidate=structuredClone(draft);
        const routes=new Set([scope(candidate),...candidate.fixed.map(actor=>actor.route || scope(candidate)),...(['single','preferred','llm'].includes(candidate.npcPolicy?.mode)?[candidate.npcPolicy.route || scope(candidate)]:[])]);
        await Promise.all([...routes].map(route=>ensureCatalogue(route)));
        if(disposed || targetChat!==chatId || version!==loadVersion || !dialog.isConnected)return;
        const selected=[...candidate.fixed.map(actor=>({id:actor.voice,route:actor.route || scope(candidate)})),...(['single','preferred'].includes(candidate.npcPolicy?.mode)?(candidate.npcPolicy.mode==='single'?[candidate.npcPolicy.voice]:candidate.npcPolicy.voices || []).map(id=>({id,route:candidate.npcPolicy.route || scope(candidate)})):[])];
        const voiceCatalogue=[...new Map(selected.filter(voice=>voice.id && detectProvider(voice.route)==='fish_audio').flatMap(voice=>{const item=draftVoices.get(`${voice.route}:${voice.id}`) || voiceCatalogues.get(voice.route)?.find(item=>item.id===voice.id);return item?[[`${voice.route}:${voice.id}`,{id:voice.id,route:voice.route,name:item.name || voice.id,description:item.description || '',...(item.gender?{gender:item.gender}:{})}]]:[];})).values()];
        validateSettings(candidate,voiceCatalogue);
        const preset={version:2,npcPolicy:structuredClone(candidate.npcPolicy),leadVoices:candidate.fixed.map(actor=>Object.fromEntries(defaultVoiceFields.filter(name=>Object.hasOwn(actor,name)).map(name=>[name,structuredClone(actor[name])]))),...(voiceCatalogue.length?{voiceCatalogue}: {})};
        await ctx.settings.set(CAPTURED_DEFAULTS_KEY,structuredClone(preset));capturedDefaults=preset;++defaultsRevision;
        for(const voice of voiceCatalogue){const catalogue=voiceCatalogues.get(voice.route);if(catalogue)voiceCatalogues.set(voice.route,[...new Map([...catalogue,voice].map(item=>[item.id,item])).values()]);}
        if(!disposed){$('defaultStatus').textContent='Default saved. New chats use it.';feedback.textContent='Default saved.';close();}
      }catch(error){if(!disposed){feedback.textContent=error.message;$('defaultStatus').textContent='Default save failed; previous default kept.';}}
      finally{defaultOperation=false;if(!disposed){save.disabled=false;fromChat.disabled=false;refreshDefaultControls();}}
    })();
    dialog.append(heading,intro,tabs,body,feedback,actions);overlay.append(dialog);document.body.append(overlay);buttons[0].focus();
    for(const refresh of voiceRefreshes)void refresh();void npcEditor.refresh();
  }
  let settingsWriteQueue=null,pendingSettings=null,autosaveTimer=null,settingsEdit=0,preferenceBaseline={};const pendingRetentionPolicies=new Map(),chatBaselines=new Map();
  function saveState(text,error=false){if(disposed)return;$('saveState').textContent=text;$('saveState').classList.toggle('et-error',error);$('save').hidden=!error || !text.startsWith('Save failed');}
  async function persistConfig(targetChat=chatId,value=config,inherit=false){
    if(pendingSettings?.chatId===targetChat){pendingSettings=null;clearTimeout(autosaveTimer);autosaveTimer=null;inherit=true;}
    validateNumericSettings(value);
    const snapshot=chatSettingsSnapshot(value),localSnapshot=structuredClone(snapshot),edit=settingsEdit;
    if(!chatBaselines.has(targetChat))chatBaselines.set(targetChat,{});
    const chatBaseline=chatBaselines.get(targetChat);
    const localPreferences=preferenceSnapshot(snapshot),baseline=preferenceBaseline;
    const write=()=>withSettingsLock(async()=>{
      let preferences,retentionChanged=false;
      const latestChat=await ctx.settings.get(settingsKey(targetChat));
      const merged=reconcileCastDuplicates(latestChat?mergeSettingsChanges(chatSettingsSnapshot({...defaults(),...latestChat}),chatBaseline,snapshot):snapshot);
      replaceBaseline(snapshot,merged);
      if(inherit){
        const latest=await ctx.settings.get(GLOBAL_SETTINGS_KEY);
        // A stale tab must not overwrite preferences it never edited, including
        // a Freesound key saved elsewhere. Compare inside the serialized queue
        // so a later edit can also undo an earlier, still-pending save.
        const changes=Object.fromEntries(Object.entries(localPreferences).filter(([name,value])=>JSON.stringify(value)!==JSON.stringify(baseline[name])));
        retentionChanged=Object.hasOwn(changes,'retention');
        preferences={...localPreferences,...preferenceSnapshot(latest),...changes};
        Object.assign(snapshot,preferences);
      }
      await ctx.settings.set(settingsKey(targetChat),snapshot);
      if(inherit){await ctx.settings.set(GLOBAL_SETTINGS_KEY,preferences);
        Object.assign(baseline,localPreferences);
        // Only a deliberate retention edit changes existing audio. A default
        // inherited from another tab applies to new recordings only.
        if(retentionChanged)pendingRetentionPolicies.set(targetChat,snapshot.retention);
        if(pendingRetentionPolicies.has(targetChat)){try{await recordingStore('policy',recordingKey(targetChat,''),{retention:pendingRetentionPolicies.get(targetChat)});pendingRetentionPolicies.delete(targetChat);}catch(error){if(chatId===targetChat)status(`Settings saved. Audio retention could not be applied: ${error.message}`,true);}}
        if(chatId===targetChat && edit===settingsEdit && !pendingSettings){config.retention=snapshot.retention;$('retention').value=snapshot.retention;baseline.retention=snapshot.retention;}
      }
      replaceBaseline(chatBaseline,localSnapshot);
    });
    const operation=settingsWriteQueue?settingsWriteQueue.catch(()=>{}).then(write):write();settingsWriteQueue=operation;
    try{await operation;if(inherit && chatId===targetChat && edit===settingsEdit && !pendingSettings)saveState('Saved automatically');}catch(error){if(chatId===targetChat && edit===settingsEdit)saveState('Save failed · Retry save',true);throw error;}finally{if(settingsWriteQueue===operation)settingsWriteQueue=null;}
  }
  function scheduleSettingsSave(){
    if(disposed || !chatId || !config)return false;
    const candidate=capture();let castConflict=false;
    try{
      const names=new Set();
      for(const actor of [...candidate.fixed,...(candidate.casts[scope(candidate)] || [])]){
        const key=normalizeName(actor.speaker);
        if(key && names.has(key)){castConflict=true;throw new Error(`A character named ${actor.speaker} is already in Cast. Choose a different name or remove the extra entry.`);}
        if(key)names.add(key);
      }
      validateNumericSettings(candidate);
      for(const name of ['chunk','plannerTokens','prefetch'])if(!$(name).value.trim())throw new Error('Enter a value for '+$(name).parentElement.firstChild.textContent.trim()+'.');
    }catch(error){++settingsEdit;pendingSettings=null;clearTimeout(autosaveTimer);autosaveTimer=null;saveState(castConflict?'Not saved · duplicate character name':'Not saved · check Settings',true);status(error.message,true);return false;}
    if(candidate.ignoredTags!==config.ignoredTags){stop(false);clearPlan();paragraphCues.clear();renderMessages();}
    if(JSON.stringify(namePronunciations(pronunciationActors(candidate)))!==JSON.stringify(namePronunciations(pronunciationActors(config))))stop(false);
    $('readingPreview').hidden=true;
    config=candidate;pendingSettings={chatId,value:structuredClone(config),edit:++settingsEdit};
    syncTtsInspector();
    refreshDeliveryGuidance();
    updateCastVisibility();
    if(!config.autoPlan && !config.auto)cancelAutoReplies();
    if(autoReplyActive?.token===revision){
      if(autoReplyActive.phase==='planning' && !config.autoPlan){stop(false,false,Boolean(config.auto));status('Automatic planning stopped.');}
      else if(['restore','playback'].includes(autoReplyActive.phase) && !config.auto){stop(false);status('Automatic playback stopped.');}
    }
    renderMixer();
    refreshSectionControls();
    saveState('Saving…');clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>void flushSettings().catch(()=>{}),250);
    return true;
  }
  async function flushSettings(){
    clearTimeout(autosaveTimer);autosaveTimer=null;
    const pending=pendingSettings;if(!pending)return settingsWriteQueue;
    pendingSettings=null;
    try{
      await persistConfig(pending.chatId,pending.value,true);
      if(!disposed && chatId===pending.chatId && pending.edit===settingsEdit)saveState('Saved automatically');
    }catch(error){
      if(!pendingSettings && chatId===pending.chatId)pendingSettings=pending;
      if(!disposed && chatId===pending.chatId && pending.edit===settingsEdit)saveState('Save failed · Retry save',true);
      throw error;
    }
  }
  const autosaveFields=new Set(preferenceFields.filter(name=>!['mode','connection','connectionMode','sectionButtons','useJev'].includes(name)));
  const autoSaveEvent=event=>{if(event.target.hasAttribute('data-choir-persist') || autosaveFields.has(event.target.dataset.et))scheduleSettingsSave();};
  root.addEventListener('input',autoSaveEvent);
  for(const name of autosaveFields)$(name)?.addEventListener('change',autoSaveEvent);
  $('followNarration').addEventListener('change',syncNarrationFollow);
  root.addEventListener('change',event=>{if(event.target.hasAttribute('data-choir-persist'))autoSaveEvent(event);});
  const docRoot=root?.ownerDocument || (typeof document!=='undefined'?document:null);
  const viewRoot=docRoot?.defaultView || (typeof window!=='undefined'?window:null);
  const saveOnLeave=()=>{void flushSettings().catch(()=>{});void persistMixer(false);};
  viewRoot?.addEventListener('pagehide',saveOnLeave);
  const saveOnHidden=()=>{if(docRoot?.visibilityState==='hidden')saveOnLeave();};docRoot?.addEventListener('visibilitychange',saveOnHidden);
  unsubs.push(()=>{root.removeEventListener('input',autoSaveEvent);root.removeEventListener('change',autoSaveEvent);viewRoot?.removeEventListener('pagehide',saveOnLeave);docRoot?.removeEventListener('visibilitychange',saveOnHidden);clearTimeout(autosaveTimer);});

  function rpc(action,input,signal,timeoutMs=185000,onProgress) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve,reject) => {
      const id=randomUuid();
      let lastProgress;
      const cancel=()=>{try{ctx.sendToBackend({namespace:'choir',id,action:'cancel'});}catch{}done(abortError());};
      const timer=setTimeout(()=>{
        try{ctx.sendToBackend({namespace:'choir',id,action:'cancel'});}catch{}
        done(new Error(action==='ping'
          ? 'Choir backend did not respond. Update and restart Choir in Extensions, then reload the page. Both backend and frontend must be running.'
          : `${backendRequestKind(action)} request timed out waiting for the backend. ${lastProgress?`Last reported stage: ${lastProgress.stage}. ${lastProgress.provider || ''} ${lastProgress.model || ''}.`:'The backend did not acknowledge this request; restart Choir and reload the page.'}`));
      },timeoutMs);
      const done=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);pending.delete(id);error?reject(error):resolve(result);};
      done.progress=progress=>{lastProgress=progress;onProgress?.(progress);};
      pending.set(id,done); signal?.addEventListener('abort',cancel,{once:true});
      try {ctx.sendToBackend({namespace:'choir',id,action,input});} catch(error){done(error);}
    });
  }
  unsubs.push(ctx.onBackendMessage(message=>{
    if(message?.namespace !== 'choir')return;
    if(message.progress){pending.get(message.id)?.progress(message.progress);return;}
    pending.get(message.id)?.(message.error?new Error(message.error):null,message.result);
  }));

  async function api(path,options={}) {
    const base=$('apiBase').value.trim().replace(/\/$/,'');
    if (!base || (!base.startsWith('/') && !/^https?:\/\//i.test(base))) throw new Error('Enter a valid Lumiverse API base.');
    const response=await fetch(`${base}${path}`,{credentials:'include',...options});
    if(!response.ok) {
      // Proxy errors may be HTML or plain text. Read a bounded body, including JSON details.
      let raw='';
      const reader=response.body?.getReader();
      if(reader){
        const decoder=new TextDecoder();let remaining=16384;
        try{
          while(remaining>0){const {value,done}=await reader.read();if(done)break;raw+=decoder.decode(value.subarray(0,remaining),{stream:true});remaining-=value.byteLength;}
          raw+=decoder.decode();
        }catch(error){if(error.name==='AbortError')throw error;}
        finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
      }else raw=await response.text().catch(()=>'');
      throw new Error(apiErrorMessage(raw.slice(0,16384),response.status));
    }
    return response;
  }
  // Keep this body builder shared by the preview and the actual fetch. Never
  // serialize the connection object: it can contain authentication fields.
  const ttsRequestBody=(connection,{voice,text,parameters})=>JSON.stringify({connectionId:connection.id,model:connection.model,voice,text,parameters});
  function clearTtsRequestLog(){ttsRequestLog.length=0;$('ttsRequests').replaceChildren();renderTtsInspector();}
  function syncTtsInspector(){
    const enabled=Boolean(config?.paranoidMode);
    for(const name of ['ttsInspectorOpen','ttsInspectorFromPlan'])$(name).hidden=!enabled;
    if(!enabled)ttsRequestLog.length=0;
    renderTtsInspector();
  }
  function renderTtsInspector(){
    const node=$('ttsRequests');
    $('ttsInspectorView').options[1].textContent=`Attempted calls (${ttsRequestLog.length})`;
    if(!config?.paranoidMode){node.replaceChildren();$('ttsInspectorNote').textContent='Enable Paranoid mode in Settings → Planner.';return;}
    if(node.closest('[data-choir-destination]').hidden)return;
    node.replaceChildren();
    const sent=$('ttsInspectorView').value==='sent';
    $('clearTtsLog').disabled=!ttsRequestLog.length;
    $('ttsInspectorNote').textContent=sent?'Last 20 attempted calls in this open chat, newest first. Cache hits and saved Replay make no new TTS call. This log clears on reload, chat change or disabling the mode.':'Prepared with your current settings; these are not proof of a call. Cached audio may be reused. Plan a message first to inspect its requests.';
    const append=(title,body,metadata)=>{
      const card=document.createElement('section');card.className='et-tts-request';
      const heading=document.createElement('strong');heading.textContent=title;
      const details=document.createElement('div');details.className='et-hint';details.textContent=metadata;
      const payload=JSON.parse(body),voices=payload.parameters?.turns?.map(turn=>`${turn.speaker}: ${turn.voice}`).join(' · ') || `Voice: ${payload.voice || '(provider default)'}`;
      const voiceLabel=document.createElement('div');voiceLabel.textContent=voices;
      const json=document.createElement('textarea');json.readOnly=true;json.rows=9;json.setAttribute('aria-label',title);json.dataset.choirTtsPayload=sent?'sent':'prepared';json.value=JSON.stringify(payload,null,2);
      card.append(heading,details,voiceLabel,json);node.append(card);
    };
    if(sent){
      for(const entry of [...ttsRequestLog].reverse())append(`Call ${entry.id} · ${entry.speaker} · ${entry.status}`,entry.body,`${entry.time} · ${entry.origin} · ${entry.connection}`);
      if(!ttsRequestLog.length)node.textContent='No TTS calls recorded while Paranoid mode is enabled.';
      return;
    }
    if(!plan?.segments?.length){node.textContent='No speech plan loaded. Use Plan latest or plan a saved message.';return;}
    try{
      const snapshot=capture(),batches=playbackBatches(plan.segments.map((segment,passageIndex)=>({...segment,passageIndex})),snapshot).filter(segment=>!segment.kind);
      let count=0;
      for(const batch of batches)for(const segment of batch.unison?speechMembers(batch):[batch]){
        const request=synthesisSettings(segment,snapshot);
        if(!request.connection)throw new Error(`TTS connection for ${segment.speaker} is unavailable.`);
        append(`Prepared ${++count} · ${segment.speaker}`,ttsRequestBody(request.connection,{voice:segment.voice,text:request.text,parameters:request.parameters}),`${request.connection.name || request.connection.id} · ${request.connection.provider} · ${request.connection.model || 'default model'}`);
      }
      if(!count)node.textContent='No speech requests: the current speakers are muted or excluded.';
    }catch(error){node.textContent=`Cannot prepare request preview: ${error.message}`;}
  }
  for(const name of ['ttsInspectorOpen','ttsInspectorFromPlan'])$(name).addEventListener('click',renderTtsInspector);
  $('ttsInspectorView').onchange=renderTtsInspector;$('refreshTtsInspector').onclick=renderTtsInspector;$('clearTtsLog').onclick=clearTtsRequestLog;
  async function nativeSpeech(connection,{voice,text,parameters},signal,speaker='Voice',origin='Voice preview'){
    if(signal?.aborted)throw abortError();
    const request=new AbortController();let timedOut=false;
    const cancel=()=>request.abort();signal?.addEventListener('abort',cancel,{once:true});
    // Bound both the relay response and its audio download; do not retry paid requests automatically.
    const timeout=setTimeout(()=>{timedOut=true;request.abort();},185000);
    let inspected;
    try{
      if(speechProviderFamily(connection.provider,connection.model)==='fish_audio' && [...GEMINI_VOICES,...OPENAI_VOICES].some(item=>item.id===voice))throw new Error(`Fish Audio requires a Fish voice ID; ${voice} belongs to Gemini or OpenAI. Edit this speaker and choose a Fish voice.`);
      const body=ttsRequestBody(connection,{voice,text,parameters});
      if(config?.paranoidMode && !disposed){
        inspected={id:++ttsRequestSequence,speaker,origin,body,connection:`${connection.name || connection.id} · ${connection.provider}`,time:new Date().toLocaleTimeString(),status:'Sending'};
        ttsRequestLog.push(inspected);if(ttsRequestLog.length>20)ttsRequestLog.shift();renderTtsInspector();
      }
      const response=await api('/tts/synthesize',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:request.signal});
      const blob=await response.blob();if(inspected)inspected.status='Succeeded';return blob;
    }catch(error){
      if(inspected)inspected.status=signal?.aborted || error.name==='AbortError' && !timedOut?'Cancelled':'Failed';
      if(signal?.aborted || error.name==='AbortError' && !timedOut)throw error;
      if(timedOut)error=new Error('TTS request timed out after 185 seconds. Try a smaller Max characters per request or check the Lumiverse relay.');
      const provider=nativeProviders.find(item=>item.id===connection.provider);
      const label=provider?.displayName || (connection.provider==='fish_audio'?'Fish Audio':connection.provider==='openai_tts'?'GPT TTS':connection.provider || 'TTS');
      throw new Error(`${label} speech failed for ${speaker} (${connection.name || connection.id}; model ${connection.model || 'default'}; voice ${voice || 'default'}): ${error.message}`);
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);if(inspected && !disposed)renderTtsInspector();}
  }
  function option(select,value,label) {const node=document.createElement('option');node.value=value;node.textContent=label;select.append(node);}
  let previewAudio = null;
  function openVoiceLibraryModal({ onSelect, defaultQuery = '', targetSpeaker = '' }) {
    if (previewAudio) { try { previewAudio.pause(); } catch {} previewAudio = null; }
    const overlay = document.createElement('div');
    overlay.className = 'et-modal-overlay';
    overlay.dataset.et = 'voiceLibraryModal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);padding:16px;box-sizing:border-box';

    const dialog = document.createElement('div');
    dialog.className = 'et-modal-dialog';
    dialog.style.cssText = 'background:var(--lumiverse-bg-surface,#1e1e24);color:var(--lumiverse-text,#e0e0e0);border-radius:12px;width:100%;max-width:680px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.12);overflow:hidden;font-family:inherit';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.08)';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.style.cssText = 'margin:0;font-size:1.15em;display:flex;align-items:center;gap:8px';
    title.textContent = 'Fish Audio Voice Library';
    const subtitle = document.createElement('div');
    subtitle.style.cssText = 'font-size:0.8em;opacity:0.7;margin-top:2px';
    subtitle.textContent = targetSpeaker ? `Select a community voice for ${targetSpeaker}` : 'Search and preview 2M+ community models';
    titleWrap.append(title, subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.innerHTML = ICON_CLOSE; closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.style.cssText = 'background:none;border:none;color:inherit;font-size:1.3em;cursor:pointer;padding:4px 8px;border-radius:4px;opacity:0.8';
    closeBtn.onclick = () => closeModal();
    header.append(titleWrap, closeBtn);

    const searchSection = document.createElement('div');
    searchSection.style.cssText = 'padding:14px 20px 8px;display:flex;flex-direction:column;gap:8px;border-bottom:1px solid rgba(255,255,255,0.05)';

    const searchRow = document.createElement('div');
    searchRow.style.cssText = 'display:flex;gap:8px';
    const queryInput = document.createElement('input');
    queryInput.type = 'text'; queryInput.value = defaultQuery;
    queryInput.placeholder = 'Search character, anime, game, or narrator (e.g. Natsuki, Geralt, Glados)...';
    queryInput.style.cssText = 'flex:1;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.25);color:inherit;font-size:0.95em';

    const searchBtn = document.createElement('button');
    searchBtn.type = 'button'; searchBtn.className = 'et-btn-primary'; searchBtn.textContent = 'Search';
    searchBtn.style.cssText = 'padding:8px 18px;white-space:nowrap';
    searchRow.append(queryInput, searchBtn);

    const pillsRow = document.createElement('div');
    pillsRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:2px';
    const pills = ['Narration', 'Anime', 'Gaming', 'Calm', 'Male', 'Female', 'Villain'];
    for (const pill of pills) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'et-btn-subtle';
      btn.style.cssText = 'font-size:0.78em;padding:2px 8px;border-radius:12px;opacity:0.85';
      btn.textContent = pill;
      btn.onclick = () => { queryInput.value = pill.toLowerCase(); doSearch(); };
      pillsRow.append(btn);
    }
    searchSection.append(searchRow, pillsRow);

    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'et-modal-results';
    resultsContainer.style.cssText = 'flex:1;overflow-y:auto;padding:12px 20px 20px;display:flex;flex-direction:column;gap:10px';

    dialog.append(header, searchSection, resultsContainer);
    overlay.append(dialog);

    let activePlayBtn = null;
    const closeModal = () => {
      if (previewAudio) { try { previewAudio.pause(); } catch {} previewAudio = null; }
      overlay.remove();
      document.removeEventListener('keydown', handleKeyDown);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const doSearch = async () => {
      const q = queryInput.value.trim();
      if (!q) return;
      if (previewAudio) { try { previewAudio.pause(); } catch {} previewAudio = null; }
      resultsContainer.replaceChildren();
      const loading = document.createElement('div');
      loading.style.cssText = 'padding:24px;text-align:center;opacity:0.7';
      loading.textContent = `Searching community models for "${q}"…`;
      resultsContainer.append(loading);
      searchBtn.disabled = true;

      try {
        const res = await rpc('searchVoices', { query: q, limit: 25 }, null, 15000);
        resultsContainer.replaceChildren();
        if (!res?.results?.length) {
          const empty = document.createElement('div');
          empty.style.cssText = 'padding:32px 16px;text-align:center;opacity:0.7';
          empty.textContent = `No voice models found for "${q}". Try another search term.`;
          resultsContainer.append(empty);
          return;
        }

        for (const item of res.results) {
          const card = document.createElement('div');
          card.className = 'et-voice-card';
          card.style.cssText = 'display:flex;gap:14px;align-items:center;padding:12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);transition:all 0.15s ease';

          const iconWrap = document.createElement('div');
          iconWrap.style.cssText = 'width:54px;height:54px;border-radius:8px;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;position:relative';
          if (item.coverImage) {
            const img = document.createElement('img');
            img.src = item.coverImage; img.alt = item.name;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            img.onerror = () => { img.remove(); iconWrap.textContent = (item.name[0] || 'V').toUpperCase(); iconWrap.style.fontSize = '1.4em'; iconWrap.style.fontWeight = 'bold'; };
            iconWrap.append(img);
          } else {
            iconWrap.textContent = (item.name[0] || 'V').toUpperCase();
            iconWrap.style.fontSize = '1.4em'; iconWrap.style.fontWeight = 'bold';
          }

          const info = document.createElement('div');
          info.style.cssText = 'flex:1;min-width:0';
          const nameEl = document.createElement('div');
          nameEl.style.cssText = 'font-weight:600;font-size:1.02em;display:flex;align-items:center;gap:6px';
          nameEl.textContent = item.name;
          if (item.author) {
            const authorSpan = document.createElement('span');
            authorSpan.style.cssText = 'font-size:0.78em;font-weight:normal;opacity:0.6';
            authorSpan.textContent = `by ${item.author}`;
            nameEl.append(authorSpan);
          }

          const descEl = document.createElement('div');
          descEl.style.cssText = 'font-size:0.83em;opacity:0.8;margin:3px 0 5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35';
          descEl.textContent = item.description || 'Community voice model';

          const tagsEl = document.createElement('div');
          tagsEl.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';
          for (const t of (item.tags || [])) {
            const tagBadge = document.createElement('span');
            tagBadge.style.cssText = 'font-size:0.72em;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.06);opacity:0.75';
            tagBadge.textContent = `#${t}`;
            tagsEl.append(tagBadge);
          }
          info.append(nameEl, descEl, tagsEl);

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0';

          const listenBtn = document.createElement('button');
          listenBtn.type = 'button'; listenBtn.className = 'et-btn-subtle';
          listenBtn.style.cssText = 'font-size:0.85em;padding:4px 10px;white-space:nowrap';
          listenBtn.innerHTML = `${ICON_PLAY} Listen`;
          listenBtn.onclick = () => {
            if (previewAudio) {
              try { previewAudio.pause(); } catch {}
              const wasCurrent = activePlayBtn === listenBtn;
              if (activePlayBtn) activePlayBtn.innerHTML = `${ICON_PLAY} Listen`;
              previewAudio = null; activePlayBtn = null;
              if (wasCurrent) return;
            }
            if (item.sampleAudio) {
              const audio = new Audio(item.sampleAudio);
              previewAudio = audio; activePlayBtn = listenBtn;
              listenBtn.innerHTML = `${ICON_PAUSE} Pause`;
              audio.play().catch(() => { listenBtn.innerHTML = `${ICON_PLAY} Listen`; });
              audio.onended = () => { listenBtn.innerHTML = `${ICON_PLAY} Listen`; activePlayBtn = null; previewAudio = null; };
              audio.onerror = () => { listenBtn.innerHTML = `${ICON_PLAY} Listen`; activePlayBtn = null; previewAudio = null; };
            } else {
              status(`No pre-recorded sample for "${item.name}".`);
            }
          };

          const selectBtn = document.createElement('button');
          selectBtn.type = 'button'; selectBtn.className = 'et-btn-primary';
          selectBtn.style.cssText = 'font-size:0.85em;padding:5px 12px;white-space:nowrap';
          selectBtn.textContent = 'Use Voice';
          selectBtn.onclick = () => {
            closeModal();
            onSelect(item);
          };

          actions.append(listenBtn, selectBtn);
          card.append(iconWrap, info, actions);
          resultsContainer.append(card);
        }
      } catch (err) {
        resultsContainer.replaceChildren();
        const errEl = document.createElement('div');
        errEl.className = 'et-error'; errEl.style.cssText = 'padding:16px;text-align:center';
        errEl.textContent = `Search failed: ${err.message}`;
        resultsContainer.append(errEl);
      } finally {
        searchBtn.disabled = false;
      }
    };

    searchBtn.onclick = doSearch;
    queryInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };

    document.body.append(overlay);
    try { queryInput.focus(); } catch {}
    if (defaultQuery) doSearch();
    return closeModal;
  }

  let castEditorId=0;
  function makeRow(actor,container,reserved=false,open=false) {
    const required=reserved || container===$('fixed') && actor===config.fixed[1];
    const row=document.createElement('div');row.className='et-card et-cast-row';
    const header=document.createElement('div');header.className='et-cast-header';
    const heading=document.createElement('strong'),edit=document.createElement('button');edit.type='button';edit.className='et-btn-subtle';edit.dataset.choirEdit='';
    const editor=document.createElement('div');editor.className='et-grid et-cast-editor';editor.dataset.choirCastEditor='';editor.id=`choir-cast-editor-${++castEditorId}`;editor.hidden=!open;edit.setAttribute('aria-controls',editor.id);
    const name=document.createElement('input');name.value=actor.speaker;name.disabled=reserved;name.style.display='none';name.dataset.choirPersist='';editor.prepend(name);
    let removeButton;
    const refreshHeading=()=>{const speaker=name.value.trim() || 'Character';heading.textContent=speaker;edit.textContent=editor.hidden?'Edit':'←';edit.setAttribute('aria-label',editor.hidden?`Edit ${speaker}`:`Close ${speaker} editor`);edit.setAttribute('aria-expanded',String(!editor.hidden));if(removeButton){removeButton.title=`Remove ${speaker}`;if(editor.hidden)removeButton.innerHTML=ICON_CLOSE;else removeButton.textContent='Remove';}};
    if(!required){
      removeButton=document.createElement('button');removeButton.type='button';removeButton.className='et-btn-subtle et-btn-danger';removeButton.dataset.choirRemove='';removeButton.setAttribute('aria-label','Remove character');
      removeButton.onclick=e=>{
        e.preventDefault();e.stopPropagation();stop(false);config=capture();
        const speaker=name.value.trim(),key=normalizeName(speaker),next=row.nextElementSibling || row.previousElementSibling;
        // Card discovery must respect a deliberate removal on the next reload.
        config.removedCardCast=[...new Set([...(config.removedCardCast || []),speaker,...aliases.value.split(',').map(alias=>alias.trim()).filter(Boolean)])];
        config.casts=Object.fromEntries(Object.entries(config.casts).map(([route,actors])=>[route,actors.filter(actor=>normalizeName(actor.speaker)!==key)]));
        config.singleVoices=Object.fromEntries(Object.entries(config.singleVoices || {}).map(([route,choices])=>[route,Object.fromEntries(Object.entries(choices).filter(([name])=>normalizeName(name)!==key))]));
        drawerNavigation.closeCast();row.remove();scheduleSettingsSave();clearPlan();refreshDefaultControls();
        (next?.querySelector('[data-choir-edit]') || $('add')).focus();status(`Removed ${speaker}.`);
      };
    }
    name.addEventListener('input',refreshHeading);edit.onclick=()=>{if(!editor.hidden){drawerNavigation.closeCast();return;}editor.hidden=false;drawerNavigation.openCast(row,()=>{editor.hidden=true;refreshHeading();updateCastVisibility(true);});refreshHeading();};refreshHeading();
    edit.style.marginLeft='auto';
    if(!reserved){
      heading.title='Click to change name';
      heading.onclick=(e)=>{
        e.stopPropagation();
        const current=name.value.trim() || 'Character';
        const input=document.createElement('input');
        input.type='text';input.value=current;input.className='et-cast-name-input';
        const saveName=()=>{
          const val=input.value.trim();
          if(val && val!==name.value){
            name.value=val;actor.speaker=val;scheduleSettingsSave();renderMixer();
          }
          refreshHeading();
          if(input.parentNode)input.replaceWith(heading);
        };
        input.onkeydown=(ev)=>{
          if(ev.key==='Enter'){ev.preventDefault();saveName();}
          else if(ev.key==='Escape'){ev.preventDefault();refreshHeading();if(input.parentNode)input.replaceWith(heading);}
        };
        input.onblur=saveName;
        heading.replaceWith(input);
        input.focus();input.select();
      };
    }
    header.append(heading,edit);if(removeButton)header.append(removeButton);row.append(header,editor);
    const voice=document.createElement('select');
    const route=document.createElement('select');route.dataset.choirRoute='';
    option(route,'','Use chat default');
    for(const connection of nativeConnections)option(route,`native:${connection.id}`,`${connection.name} · ${connection.provider}`);
    if(actor.route && ![...route.options].some(option=>option.value===actor.route))option(route,actor.route,`${actor.route} · unavailable`);
    const single=config.connectionMode==='one';route.value=single?'':actor.route || '';
    let rowVoices=voiceCatalogues.get(route.value || scope(config)) || [];
    voice.dataset.choirVoice='';
    option(voice,'','Let LLM choose');
    for(const item of rowVoices) option(voice,item.id,`${item.name || item.id} · ${item.gender==='female'?'Female':item.gender==='male'?'Male':item.gender==='neutral'?'Neutral':'Gender unknown'}${item.description ? ` · ${item.description}`:''}`);
    const assignedVoice=single?singleVoice(actor,config):actor.voice;
    if(assignedVoice && !rowVoices.some(v=>v.id===assignedVoice))option(voice,assignedVoice,`${assignedVoice} · unavailable`);
    voice.value=assignedVoice || '';
    const gender=document.createElement('select');
    gender.dataset.choirGender='';
    for(const [value,label] of [['auto','All voices / let LLM infer'],['female','Female voices'],['male','Male voices'],['neutral','Neutral voices']])option(gender,value,label);
    gender.value=actor.gender || 'auto';

    let searchFilter='';
    const filterVoices=()=>{
      const selected=voice.value;voice.replaceChildren();option(voice,'','Let LLM choose');
      const q=searchFilter.toLowerCase().trim();
      for(const item of rowVoices) {
        if(gender.value!=='auto' && item.gender && item.gender!==gender.value && item.id!==selected)continue;
        if(q && !String(item.name || '').toLowerCase().includes(q) && !String(item.id || '').toLowerCase().includes(q) && !String(item.description || '').toLowerCase().includes(q) && item.id!==selected)continue;
        const mismatch=gender.value!=='auto' && item.gender && item.gender!==gender.value;
        option(voice,item.id,`${item.name || item.id} · ${item.gender==='female'?'Female':item.gender==='male'?'Male':item.gender==='neutral'?'Neutral':'Gender unknown'}${item.description ? ` · ${item.description}`:''}${mismatch?' · selected voice differs from filter':''}`);
      }
      if(selected && !rowVoices.some(v=>v.id===selected))option(voice,selected,`${selected} · unavailable`);
      voice.value=selected;
    };
    gender.onchange=filterVoices;filterVoices();

    const voiceWrap=document.createElement('div');
    const voiceSearchRow=document.createElement('div');
    voiceSearchRow.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px';
    const voiceSearchInput=document.createElement('input');
    voiceSearchInput.type='text';
    voiceSearchInput.placeholder='Filter voices…';
    voiceSearchInput.style.cssText='font-size:0.85em;padding:4px 6px;flex:1 1 140px;min-width:0';
    voiceSearchInput.oninput=()=>{searchFilter=voiceSearchInput.value;filterVoices();};

    const searchCommBtn=document.createElement('button');
    searchCommBtn.type='button';searchCommBtn.className='et-btn-subtle';
    searchCommBtn.title='Search Fish Audio community models';searchCommBtn.innerHTML=ICON_SEARCH;
    searchCommBtn.style.cssText='padding:2px 8px';
    const doRowSearch=()=>{
      openVoiceLibraryModal({
        targetSpeaker: name.value || 'Character',
        defaultQuery: voiceSearchInput.value.trim() || name.value.trim() || 'narrator',
        onSelect: async (item) => {
          rememberExtraVoiceRoute(item.id,route.value || scope(config));
          const entry = `${item.id} | ${item.name}${item.description ? ` · ${item.description}` : ''}`;
          const existing = String(config.extraVoices || '').trim();
          if (!existing.includes(item.id)) {
            config.extraVoices = existing ? `${existing}\n${entry}` : entry;
            $('extraVoices').value = config.extraVoices;
          }
          if (!rowVoices.some(v => v.id === item.id)) {
            rowVoices.push({ id: item.id, name: item.name, description: item.description });
          }
          searchFilter = ''; voiceSearchInput.value = ''; filterVoices();
          voice.value = item.id;refreshSummary();
          config = capture(); if (chatId) await persistConfig(chatId,config);
          status(`Assigned community voice "${item.name}" to ${name.value || 'character'}.`);
        }
      });
    };
    searchCommBtn.onclick=doRowSearch;
    voiceSearchInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(!searchCommBtn.hidden)doRowSearch();}};

    const voiceIdBtn=document.createElement('button');
    voiceIdBtn.type='button';voiceIdBtn.className='et-btn-subtle';voiceIdBtn.textContent='Paste voice ID';voiceIdBtn.dataset.choirVoiceId='';
    voiceIdBtn.setAttribute('aria-expanded','false');
    const voiceIdEditor=document.createElement('div');voiceIdEditor.hidden=true;voiceIdEditor.dataset.choirVoiceIdEditor='';
    voiceIdEditor.id=`choir-voice-id-${++voiceIdEditorCount}`;voiceIdBtn.setAttribute('aria-controls',voiceIdEditor.id);
    voiceIdEditor.style.cssText='margin-top:8px;display:grid;gap:6px';
    const voiceIdInput=document.createElement('input');voiceIdInput.type='text';voiceIdInput.maxLength=200;voiceIdInput.placeholder='Fish Audio voice ID';voiceIdInput.dataset.choirVoiceIdInput='';
    const voiceDescription=document.createElement('input');voiceDescription.type='text';voiceDescription.maxLength=600;voiceDescription.placeholder='Optional description for LLM casting';voiceDescription.dataset.choirVoiceDescription='';
    const voiceIdHint=document.createElement('small');voiceIdHint.textContent='Paste the voice ID from Fish Audio. A description helps the LLM choose it.';
    const voiceIdActions=document.createElement('div');voiceIdActions.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    const applyVoiceId=document.createElement('button');applyVoiceId.type='button';applyVoiceId.className='et-btn-subtle';applyVoiceId.textContent='Use this voice';applyVoiceId.dataset.choirApplyVoiceId='';
    const cancelVoiceId=document.createElement('button');cancelVoiceId.type='button';cancelVoiceId.className='et-btn-subtle';cancelVoiceId.textContent='Cancel';
    const closeVoiceIdEditor=()=>{voiceIdEditor.hidden=true;voiceIdBtn.setAttribute('aria-expanded','false');};
    voiceIdBtn.onclick=()=>{
      if(!voiceIdEditor.hidden){closeVoiceIdEditor();return;}
      voiceIdInput.value=voice.value;
      voiceDescription.value=rowVoices.find(item=>item.id===voice.value)?.description || '';
      voiceIdEditor.hidden=false;voiceIdBtn.setAttribute('aria-expanded','true');voiceIdInput.focus();voiceIdInput.select();
    };
    cancelVoiceId.onclick=()=>{closeVoiceIdEditor();voiceIdBtn.focus();};
    applyVoiceId.onclick=()=>run(async()=>{
      const id=voiceIdInput.value.trim();
      if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw new Error('Enter a Fish Audio voice ID using letters, numbers, hyphens or underscores.');
      const selectedRoute=route.value || scope(config),targetChat=chatId,version=loadVersion;
      if(detectProvider(selectedRoute)!=='fish_audio')throw new Error('Select a Fish Audio connection for this voice.');
      const description=voiceDescription.value.trim().replace(/[|\r\n]+/g,' ') || rowVoices.find(item=>item.id===id)?.description || '';
      rowVoices=addExtraVoice(id,description,selectedRoute);
      if(![...voice.options].some(item=>item.value===id))option(voice,id,id);
      voice.value=id;searchFilter='';voiceSearchInput.value='';filterVoices();
      if(!scheduleSettingsSave())throw new Error('Voice ID could not be saved. Check Settings first.');
      await flushSettings();
      if(disposed || chatId!==targetChat || version!==loadVersion || !root.contains(row))return;
      closeVoiceIdEditor();renderCast();status(`Voice ID saved for ${name.value || 'character'}. Use the preview button to test it.`);
    });
    voiceIdEditor.onkeydown=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelVoiceId.click();}
      else if(e.key==='Enter'){e.preventDefault();applyVoiceId.click();}
    };
    voiceIdActions.append(applyVoiceId,cancelVoiceId);voiceIdEditor.append(voiceIdInput,voiceDescription,voiceIdHint,voiceIdActions);

    const auditionRowBtn=document.createElement('button');
    auditionRowBtn.dataset.choirPreview='';
    auditionRowBtn.type='button';auditionRowBtn.className='et-btn-subtle';
    auditionRowBtn.title='Audition voice';auditionRowBtn.innerHTML=ICON_PLAY;
    auditionRowBtn.style.cssText='padding:2px 8px';
    const audition=sampleText=>run(async()=>{
      const selectedVoice=voice.value;
      if(!selectedVoice)throw new Error('Choose a voice first to audition.');
      const snapshot=capture();validateNumericSettings(snapshot);
      stop(false);const token=revision,ctrl=new AbortController();controller=ctrl;setBusy(true);
      status(`Auditioning ${selectedVoice}…`);
      try {
        const selectedRoute=route.value || scope(config);
        const previewRequest=synthesisSettings({speaker:name.value || 'Voice',voice:selectedVoice,text:sampleText,style:style.value.trim(),route:selectedRoute},snapshot);
        const connectionId=selectedRoute.startsWith('native:')?selectedRoute.slice(7):config.connection;
        const conn=nativeConnections.find(c=>c.id===connectionId) || nativeConnections[0];
        if(!conn)throw new Error('TTS connection not available for audition.');
        const textToSend=previewRequest.text;
        const blob=await nativeSpeech(conn,{voice:selectedVoice,text:textToSend,parameters:previewRequest.parameters},ctrl.signal,name.value || 'Voice');
        if(token!==revision || ctrl.signal.aborted)return;
        await playBlob(blob,ctrl.signal,name.value || 'Voice',0,$('normalizeLoudness').checked);
        if(token===revision)status('Audition finished.');
      } finally {if(token===revision){controller=null;setBusy(false);}}
    });

    auditionRowBtn.onclick=()=>audition('Hello! I am your voice for this story.');

    const style=document.createElement('input');style.value=actor.style || '';style.maxLength=600;
    const aliases=document.createElement('input');aliases.value=(actor.aliases || []).join(', ');aliases.maxLength=3000;
    const pronunciation=document.createElement('input');pronunciation.value=actor.pronunciation || '';pronunciation.maxLength=300;pronunciation.placeholder='Optional instruction for supported providers';
    const sayAsName=document.createElement('select');sayAsName.dataset.choirSayAsName='';sayAsName.setAttribute('aria-label','Name spelling to pronounce');
    const refreshPronunciationTargets=()=>{
      const selected=sayAsName.options.length?sayAsName.value:actor.sayAsName || '',written=name.value.trim();sayAsName.replaceChildren();option(sayAsName,'',written);
      const variants=[...new Map(aliases.value.split(',').map(value=>value.trim()).filter(value=>value && normalizeName(value)!==normalizeName(written)).map(value=>[normalizeName(value),value])).values()];
      for(const alias of variants)option(sayAsName,alias,alias);
      if(selected && !variants.includes(selected))option(sayAsName,selected,`${selected} · saved spelling`);
      sayAsName.value=selected;
    };
    refreshPronunciationTargets();
    const sayAs=document.createElement('input');sayAs.value=namePronunciation(actor);sayAs.maxLength=120;sayAs.placeholder='e.g. Eh-Lee-Zah';sayAs.dataset.choirSayAs='';
    const pronunciationHint=document.createElement('small');pronunciationHint.dataset.choirPronunciationHint='';
    const updatePronunciationHint=()=>{
      const spelling=sayAs.value.trim(),written=namePronunciationTarget({speaker:name.value,sayAsName:sayAsName.value});
      pronunciationHint.textContent=(spelling?`Every voice says “${written}” as “${spelling}”. `:`Enter how to say the written name “${written}”. `)+'Choose the name or alias used in the story under Name spelling to pronounce. Story text stays unchanged. Leave Say name as blank to use its written spelling.';
    };
    // An explicit edit of the older field must not silently disappear just
    // because this editor has already written an empty sayAs property.
    const promoteNameMapping=()=>{
      if(!reserved){const spelling=namePronunciation({speaker:name.value.trim(),sayAsName:sayAsName.value,pronunciation:pronunciation.value});if(spelling)sayAs.value=spelling;}
      updatePronunciationHint();
    };
    pronunciation.addEventListener('input',promoteNameMapping);pronunciation.addEventListener('change',promoteNameMapping);
    sayAs.addEventListener('input',updatePronunciationHint);sayAsName.addEventListener('change',updatePronunciationHint);
    for(const node of [name,aliases])node.addEventListener('input',()=>{refreshPronunciationTargets();updatePronunciationHint();});updatePronunciationHint();
    const accent=document.createElement('input');accent.value=actor.accent || '';accent.maxLength=300;accent.placeholder='e.g. Irish, light Dublin accent';
    const deliveryMode=document.createElement('select');deliveryMode.dataset.choirDeliveryMode='';option(deliveryMode,'auto','Automatic acting');option(deliveryMode,'base','Base style only');option(deliveryMode,'off','No tone directions');deliveryMode.value=characterDeliveryMode(actor,normalizeName(actor.speaker)==='narrator');
    deliveryMode.title='Base style only ignores planner emotions. Accents and pronunciation remain active in every mode. Narrator defaults to steady narration.';
    const excluded=document.createElement('input');excluded.type='checkbox';excluded.checked=Boolean(actor.excluded);

    const updateCardProviderControls=()=>{
      const cardRoute=route.value || scope(config);
      const cardProvider=detectProvider(cardRoute);
      const speaker=name.value || 'Character';
      voiceIdBtn.hidden=cardProvider!=='fish_audio';voiceIdBtn.setAttribute('aria-label',`Paste Fish Audio voice ID for ${speaker}`);
      voiceIdInput.setAttribute('aria-label',`Fish Audio voice ID for ${speaker}`);voiceDescription.setAttribute('aria-label',`Voice description for ${speaker}`);
      if(voiceIdBtn.hidden)closeVoiceIdEditor();
      if(cardProvider==='fish_audio') {
        voiceSearchInput.placeholder='Filter / search Fish library…';
        searchCommBtn.hidden=false;
        style.placeholder='e.g. cheerful, whispering, sigh (Fish cues)';
      } else if(cardProvider==='gemini') {
        voiceSearchInput.placeholder='Filter Gemini voices…';
        searchCommBtn.hidden=true;
        style.placeholder='Optional: slightly amused, softly spoken';
      } else {
        voiceSearchInput.placeholder='Filter voices…';
        searchCommBtn.hidden=true;
        style.placeholder='Delivery style instruction';
      }
      style.title=cardProvider==='gemini'?'Keep delivery brief, or leave it empty. The selected voice supplies identity; avoid long persona descriptions or instructions to keep its timbre unchanged.':'';
      accent.title=cardProvider==='gemini'?'For a stable accent, prefer a regional or designed voice from Google AI Studio. This saved accent direction remains active.':'';
    };

    route.onchange=()=>run(async()=>{
      const selected=route.value,targetChat=chatId,version=loadVersion;voice.value='';voice.disabled=true;scheduleSettingsSave();
      try {
        const catalogue=await ensureCatalogue(selected || scope(config));
        if(route.value!==selected || disposed || chatId!==targetChat || version!==loadVersion || !root.contains(row))return;
        rowVoices=catalogue;filterVoices();
        updateCardProviderControls();refreshSummary();
        updateProviderVisibility();
        scheduleSettingsSave();status('Speaker TTS connection selected.');
      } finally {if(!disposed && route.value===selected)voice.disabled=busy;}
    });

    auditionRowBtn.setAttribute('aria-label',`Audition ${actor.speaker}`);header.append(auditionRowBtn);auditionRowBtn.classList.add('et-cast-audition');
    const summary=document.createElement('span');summary.className='et-cast-summary';header.append(summary);
    const refreshSummary=()=>{const selected=rowVoices.find(item=>item.id===voice.value),provider=detectProvider(route.value || scope(config)),label={fish_audio:'Fish',gemini:'Gemini',google_tts:'Gemini',openai_tts:'OpenAI',openrouter_tts:'OpenRouter'}[provider] || provider;const display=selected?.name && selected.name!==voice.value?selected.name:selected?.description?.split(/[.;\n]/)[0]?.slice(0,48) || (voice.value && /^[a-f0-9]{20,}$/i.test(voice.value)?'Saved voice':voice.value) || 'Automatic';summary.textContent=`${display} · ${label}`;summary.title=voice.value || 'Chosen during planning';};refreshSummary();voice.addEventListener('change',refreshSummary);route.addEventListener('change',refreshSummary);
    voiceSearchRow.append(voiceSearchInput,searchCommBtn,voiceIdBtn);
    const browse=document.createElement('button');browse.type='button';browse.textContent='Find a voice';browse.setAttribute('aria-expanded','false');voiceSearchRow.hidden=true;browse.onclick=()=>{voiceSearchRow.hidden=!voiceSearchRow.hidden;browse.setAttribute('aria-expanded',String(!voiceSearchRow.hidden));if(!voiceSearchRow.hidden)voiceSearchInput.focus();};
    voiceWrap.append(voice,browse,voiceSearchRow,voiceIdEditor);
    const primary=document.createElement('div');primary.dataset.choirVoicePage='';const secondary=document.createElement('section');secondary.dataset.choirPronunciationPage='';secondary.className='et-control-group';const pronunciationTitle=document.createElement('h4');pronunciationTitle.textContent='Pronunciation & speed';secondary.append(pronunciationTitle);editor.append(primary,secondary);
    name.style.display='';const nameLabel=document.createElement('label');nameLabel.textContent='Name';nameLabel.className='et-inline-field';nameLabel.append(name);primary.append(nameLabel);
    const deliveryPair=document.createElement('div');deliveryPair.className='et-edit-pair';

    for (const [label,node] of [['TTS connection',route],['Voice gender filter',gender],['Voice',voiceWrap],['Delivery',deliveryMode],['Base delivery style',style],['Accent preference',accent],['Aliases (comma separated)',aliases],['Name spelling to pronounce',sayAsName],['Say name as',sayAs],['Speaking instruction',pronunciation]]) {
      if(node!==route)(node===voiceWrap?voice:node).dataset.choirPersist='';
      const wrap=document.createElement('label');wrap.textContent=label==='TTS connection'?'Connection':label==='Base delivery style'?'Base style':label==='Accent preference'?'Accent':label;wrap.append(node);
      if([aliases,sayAsName,sayAs,pronunciation,gender].includes(node))secondary.append(wrap);else if(node===accent || node===deliveryMode)deliveryPair.append(wrap);else{wrap.classList.add('et-inline-field');primary.append(wrap);}
      if(node===route)wrap.hidden=single;
      if(node===sayAs || node===sayAsName)wrap.hidden=reserved;
      if(node===pronunciation)wrap.title='Used only when the speech provider supports instructions. Use Say name as for name pronunciation.';
      if(node===gender)wrap.hidden=true;
      if(node===accent)wrap.title='Requested on every passage. The model and selected voice determine how convincingly it can produce the accent. Fish S1 uses the voice’s recorded accent.';
      if(node===voiceWrap)wrap.style.cssText='grid-column:1 / -1;margin-top:2px';
    }
    style.closest('label').before(deliveryPair);
    const deliveryHelp=document.createElement('small');deliveryHelp.className='et-hint';deliveryHelp.textContent='Automatic acting chooses emotion and intensity per line. After planning, see Playback → Speech plan for the directions.';deliveryPair.after(deliveryHelp);
    const speedSection=document.createElement('div');speedSection.className='et-tuning et-character-speed';
    const speedHeading=document.createElement('span');speedHeading.className='et-tuning-title';speedHeading.textContent='Voice speed';
    const speedSlot=document.createElement('div');speedSlot.className='et-tuning-slot';
    const speed=makeMixerTuning(`${actor.speaker} speed`,{...SPEED_CONTROL,max:mixerState.speedSliderMax,title:'Replaces the global playback speed for this character. Pitch is kept.',onValue:value=>{
      stretchSpeedSlider(value);const speaker=name.value.trim(),channel=Object.hasOwn(mixerState.channels,speaker)?mixerState.channels[speaker]:{volume:1,mute:false};
      channel.speed=value;Object.defineProperty(mixerState.channels,speaker,{value:channel,writable:true,enumerable:true,configurable:true});
      paintSpeakerSpeeds();applyPlaybackRate();refreshSpeechGrouping();
    },onCommit:saveMixerValue,onReset:()=>followMasterSpeed(name.value.trim())});
    const followButton=document.createElement('button');followButton.type='button';followButton.className='et-tuning-reset';followButton.textContent='Use global';followButton.setAttribute('aria-label',`Follow playback speed for ${actor.speaker}`);followButton.onclick=()=>followMasterSpeed(name.value.trim());
    speakerSpeedRows.push({get speaker(){return name.value.trim();},speed,followButton});
    speedSlot.append(speed.root,followButton);speedSection.append(speedHeading,speedSlot);secondary.append(speedSection);
    if(!reserved){
      const tools=document.createElement('div');tools.style.gridColumn='1 / -1';
      const test=document.createElement('button');test.type='button';test.className='et-btn-subtle';test.textContent='Test pronunciation';test.dataset.choirPronunciationTest='';test.setAttribute('aria-label',`Test pronunciation of ${actor.speaker}`);
      test.onclick=()=>audition(`${namePronunciationTarget({speaker:name.value,sayAsName:sayAsName.value})} opened the door.`);tools.append(pronunciationHint,document.createElement('br'),test);secondary.append(tools);
    }
    container.append(row);if(open){editor.hidden=true;edit.click();}
    paintSpeakerSpeeds();
    updateCardProviderControls();
    return {row,voiceChoice:()=>[name.value.trim(),voice.value],setExcluded:value=>{excluded.checked=value;},read:()=>({speaker:name.value.trim(),voice:single?actor.voice || '':voice.value,route:single?actor.route || '':route.value,gender:gender.value,style:style.value.trim(),deliveryMode:deliveryMode.value,aliases:aliases.value.split(',').map(a=>a.trim()).filter((a,i,list)=>a && normalizeName(a)!==normalizeName(name.value) && list.findIndex(b=>normalizeName(b)===normalizeName(a))===i),pronunciation:pronunciation.value.trim(),sayAs:sayAs.value.trim(),sayAsName:sayAsName.value,accent:accent.value.trim(),excluded:excluded.checked})};
  }
  let closePolicyLibrary,castVisibilitySnapshot;
  unsubs.push(()=>closePolicyLibrary?.());
  function updateCastVisibility(force=false){
    const latest=latestReply(),content=latest?ctx.messages.getContent(latest.id):'',entries=[...castRows.map(entry=>({entry,home:$('fixed')})),...npcRows.map(entry=>({entry,home:$('npcs')}))].filter(({entry})=>root.contains(entry.row));
    const actors=entries.map(({entry})=>entry.read()),identity=JSON.stringify(actors.map(actor=>[actor.speaker,actor.aliases]));
    if(!force && castVisibilitySnapshot?.chatId===chatId && castVisibilitySnapshot.id===latest?.id && castVisibilitySnapshot.content===content && castVisibilitySnapshot.plan===plan && castVisibilitySnapshot.identity===identity)return;
    const other=$('otherCast'),otherRows=$('otherCastRows'),previous=castVisibilitySnapshot;
    castVisibilitySnapshot={chatId,id:latest?.id,content,plan,identity};
    // Before the first plan, leave every voice available for initial setup.
    const canGroup=Boolean(plan && planSource?.chatId===chatId && latest && content);
    const transcript=canGroup?normalizeName(filteredTranscript(content)):'';
    const speakers=new Set(canGroup && planSource.messageId===latest.id && sameSpeech(planSource.content,content)?plan.segments.flatMap(speechMembers).filter(segment=>!segment.kind).map(segment=>normalizeName(segment.speaker)):[]);
    const buckets=new Map([[$('fixed'),[]],[$('npcs'),[]],[otherRows,[]]]);
    actors.forEach((actor,index)=>{
      const {entry,home}=entries[index],names=[actor.speaker,...(actor.aliases || [])].map(normalizeName).filter(Boolean);
      const pinned=home===$('fixed') && castRows.indexOf(entry)<2;
      const present=pinned || !canGroup || names.some(name=>speakers.has(name) || new RegExp(`(?:^|[^\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^\\p{L}\\p{N}_])`,'u').test(transcript));
      const editing=!entry.row.querySelector('[data-choir-cast-editor]').hidden;
      const target=editing?entry.row.parentElement:present?home:otherRows;buckets.get(target)?.push(entry.row);
    });
    const focused=document.activeElement;let restoreFocus=false;
    for(const [target,rows] of buckets)rows.forEach((row,index)=>{if(target.children[index]!==row){if(row.contains(focused))restoreFocus=true;target.insertBefore(row,target.children[index] || null);}});
    const count=buckets.get(otherRows).length;$('otherCastCount').textContent=String(count);drawerNavigation.updateCastFilter(count);
    if(restoreFocus)(otherRows.contains(focused) && other.hidden?$('castFilter'):focused)?.focus({preventScroll:true});
  }
  function renderCast() {
    drawerNavigation.closeCast();
    config=reconcileCastDuplicates(config);
    $('fixed').replaceChildren();$('npcs').replaceChildren();$('otherCastRows').replaceChildren();
    closePolicyLibrary?.();
    const policyRoot=$('npcPolicyRoot');policyRoot.replaceChildren();
    const picker=fishVoicePicker({active:()=>policyRoot.isConnected && !disposed,
      mergeVoices:(catalogue,route)=>[...new Map([...catalogue,...(voiceCatalogues.get(route) || [])].map(voice=>[voice.id,voice])).values()],
      remember:entry=>{addExtraVoice(entry.id,entry.description || entry.name,entry.route);},
      onFeedback:message=>status(message),openLibrary:options=>{closePolicyLibrary?.();closePolicyLibrary=openVoiceLibraryModal(options);},selectedMessage:name=>`Selected ${name}. Saving automatically.`});
    npcPolicyEditor(policyRoot,config.npcPolicy,()=>scope(config),value=>{config=capture();config.npcPolicy=value;generationPolicyChanged?.();renderMixer();scheduleSettingsSave();},'',()=>config.connectionMode==='one',picker);
    castRows=config.fixed.map(actor=>makeRow(actor,$('fixed'),normalizeName(actor.speaker)==='narrator'));
    const npcs=config.casts[scope(config)] || [];
    npcRows=npcs.map(actor=>makeRow(actor,$('npcs')));
    updateCastVisibility(true);
    updateProviderVisibility();
    renderMixer();
    refreshDefaultControls();
  }
  function capture() {
    // New bulk entries belong to the selected default connection. Card actions
    // record their own route before capture, including non-default Fish voices.
    scopeLegacyExtraVoices();
    for(const voice of additionalVoices($('extraVoices').value))if(!Object.hasOwn(config.extraVoiceRoutes || {},voice.id))rememberExtraVoiceRoute(voice.id,scope(config));
    return reconcileCardCast({...config,paranoidMode:$('paranoidMode').checked,showAutoPlanAction:$('showAutoPlanAction').checked,fixed:castRows.filter(v=>root.contains(v.row)).map(v=>v.read()),
      singleVoices:config.connectionMode==='one'?{...config.singleVoices,[scope(config)]:Object.fromEntries([...castRows,...npcRows].filter(v=>v.row.isConnected || v.row.parentElement).map(v=>v.voiceChoice()))}:config.singleVoices,
      casts:{...config.casts,[scope(config)]:npcRows.filter(v=>root.contains(v.row)).map(v=>v.read())},
      planner:$('planner').value,connection:$('connection').value,decisionConnection:$('decisionConnection')?$('decisionConnection').value:(config.decisionConnection||''),
      styleParam:$('styleParam').value,apiBase:$('apiBase').value.trim(),chunk:Number($('chunk').value),
      plannerTokens:Number($('plannerTokens').value),retention:$('retention').value,batchSpeech:$('batchSpeech').checked,concurrency:Number($('concurrency').value),
      prefetch:Number($('prefetch').value),normalizeLoudness:$('normalizeLoudness').checked,skipMeta:$('skipMeta').checked,allowLlmFallback:$('allowLlmFallback').checked,sectionButtons:$('sectionButtons').checked,enableMixer:Boolean($('enableMixer')?.checked),
      extraVoices:$('extraVoices').value,ignoredTags:$('ignoredTags').value,useStyle:$('useStyle').checked,auto:$('auto').checked,muteNarrator:Boolean(config.muteNarrator),enableSfx:$('enableSfx')?Boolean($('enableSfx').checked):(config.enableSfx!==false),enableAmbience:$('enableAmbience').checked,enableMusic:$('enableMusic').checked,loopMusic:$('loopMusic').checked,readAlong:$('readAlong').value,followNarration:$('followNarration').checked,freesoundApiKey:$('freesoundApiKey')?$('freesoundApiKey').value.trim():(config.freesoundApiKey||''),fishVoiceSource:$('fishVoiceSource').value,plannerMode:$('plannerMode')?$('plannerMode').value:resolvePlannerMode(config),useFastClassifier:$('plannerMode')?$('plannerMode').value==='heuristic':Boolean(config.useFastClassifier),useJev:$('plannerMode')?$('plannerMode').value==='jev':Boolean(config.useJev),jevApiKey:$('jevKey')?$('jevKey').value.trim():(config.jevApiKey||''),jevEndpoint:$('jevEndpoint')?$('jevEndpoint').value.trim():(config.jevEndpoint||'')},activeCharacterCard || {});
  }
  function casting(c=config) {
    const routeActor=actor=>c.connectionMode==='one'?{...actor,route:scope(c),voice:singleVoice(actor,c)}:actor;
    const npcPolicy=c.connectionMode==='one' && c.npcPolicy?{...c.npcPolicy,route:scope(c)}:c.npcPolicy;
    const knownNPCs=new Map((c.casts[scope(c)] || []).map(actor=>[normalizeName(actor.speaker),actor]));
    if(c.connectionMode==='one'){
      // Keep known NPC identities when changing the shared connection. Reuse a
      // saved voice only if that ID exists in the destination catalogue.
      const catalogue=voiceCatalogues.get(scope(c)) || [];
      for(const [route,actors] of Object.entries(c.casts))for(const actor of actors)if(!knownNPCs.has(normalizeName(actor.speaker))){
        const voice=c.singleVoices?.[route]?.[actor.speaker] ?? actor.voice;
        knownNPCs.set(normalizeName(actor.speaker),{...actor,route:scope(c),voice:catalogue.some(entry=>entry.id===voice)?voice:''});
      }
    }
    const fixed=c.fixed.map(routeActor),npcs=[...knownNPCs.values()].map(routeActor).map(actor=>npcCastActor(actor,{npcPolicy,defaultRoute:scope(c)})),actors=[...fixed,...npcs];
    const routes=new Set([scope(c),...actors.map(actor=>actor.route || scope(c)),...(npcPolicy?.route?[npcPolicy.route]:[])]);
    const communityRoutes=c.fishVoiceSource==='own'?[]:[...routes].filter(route=>detectProvider(route)==='fish_audio');
    const personaSpeaker=activePersonaName?fixed.find(actor=>normalizeName(actor.speaker)===normalizeName(activePersonaName))?.speaker:undefined;
    return {fixed,npcs,personaSpeaker,defaultRoute:scope(c),
      voices:[...routes].flatMap(route=>(voiceCatalogues.get(route) || []).map(voice=>({...voice,route}))),useStyle:c.useStyle,npcPolicy,
      ...(communityRoutes.length?{communityRoutes:Object.fromEntries(communityRoutes.map(route=>[route,c.fishVoiceSource || 'community']))}:{})};
  }
  function singleVoice(actor,c){
    const selected=c.singleVoices?.[scope(c)];
    if(selected && Object.hasOwn(selected,actor.speaker))return selected[actor.speaker];
    if(!actor.route || actor.route===scope(c))return actor.voice || '';
    // A voice saved for another connection (a Gemini name on Fish, say) only carries
    // over when this connection offers the same ID; otherwise cast it automatically.
    return (voiceCatalogues.get(scope(c)) || []).some(v=>v.id===actor.voice)?actor.voice:'';
  }
  function needsVoiceSelection(attribution,cast){
    const actors=[...cast.fixed,...cast.npcs];
    return attribution.segments.flatMap(speechMembers).some(segment=>{
      if(segment.kind==='sfx' || isBed(segment))return false;
      const actor=actors.find(actor=>normalizeName(actor.speaker)===normalizeName(segment.speaker) || (actor.aliases || []).some(alias=>normalizeName(alias)===normalizeName(segment.speaker)));
      if(['single','skip'].includes(cast.npcPolicy?.mode) && !cast.fixed.includes(actor))return false;
      return !actor?.voice;
    });
  }
  function rememberPlanCast(result){
    const previous=config.casts[scope(config)] || [];
    let chosen=false;
    if(config.connectionMode==='one'){
      const choices={...(config.singleVoices?.[scope(config)] || {})};
      for(const segment of result.segments.flatMap(speechMembers)){
        const policyChoice=['single','preferred'].includes(config.npcPolicy?.mode) && !config.fixed.some(actor=>normalizeName(actor.speaker)===normalizeName(segment.speaker)) && choices[segment.speaker]!==segment.voice;
        if(policyChoice || !Object.hasOwn(choices,segment.speaker) || !choices[segment.speaker]){Object.defineProperty(choices,segment.speaker,{value:segment.voice,enumerable:true,writable:true,configurable:true});chosen=true;}
      }
      config.singleVoices={...config.singleVoices,[scope(config)]:choices};
      config.casts[scope(config)]=result.npcs.map(actor=>{const saved=previous.find(v=>normalizeName(v.speaker)===normalizeName(actor.speaker));return saved?{...actor,route:saved.route,voice:saved.voice}:actor;});
    }else{
      for(const actor of config.fixed)if(!actor.voice){
        const voice=result.segments.flatMap(speechMembers).find(segment=>normalizeName(segment.speaker)===normalizeName(actor.speaker))?.voice;
        if(voice){actor.voice=voice;chosen=true;}
      }
      chosen ||= result.npcs.some(actor=>!previous.find(saved=>normalizeName(saved.speaker)===normalizeName(actor.speaker))?.voice);
      config.casts[scope(config)]=result.npcs;
    }
    return chosen;
  }
  function validateNumericSettings(c){
    for(const actor of [...(c.fixed || []),...Object.values(c.casts || {}).flat()])if(actor.sayAs!==undefined && (typeof actor.sayAs!=='string' || actor.sayAs.length>120 || /[<>\[\]\r\n]/u.test(actor.sayAs)))throw new Error('Say name as must be plain pronunciation spelling, up to 120 characters.');
    for(const actor of [...(c.fixed || []),...Object.values(c.casts || {}).flat()])if(actor.sayAsName!==undefined && (typeof actor.sayAsName!=='string' || actor.sayAsName.length>100 || /[<>\r\n]/u.test(actor.sayAsName)))throw new Error('Name spelling to pronounce must be plain text, up to 100 characters.');
    if(!Number.isInteger(c.chunk) || c.chunk<80 || c.chunk>MAX_SPEECH_CHARS)throw new Error('Max characters per request must be a whole number from 80 to 10000 (default: 1800).');
    if(!Number.isInteger(c.concurrency) || c.concurrency<1 || c.concurrency>4)throw new Error('Choose 1–4 concurrent TTS requests.');
    if(!Number.isInteger(c.prefetch) || c.prefetch<0 || c.prefetch>4)throw new Error('Prefetch must be 0–4 passages.');
    if(!Number.isInteger(c.plannerTokens) || c.plannerTokens<1024 || c.plannerTokens>32768)throw new Error('Planner output budget must be 1024–32768 tokens.');
  }
  function validateSettings(c,extraVoices=[]) {
    if(!['session','1','7','30','forever'].includes(c.retention))throw new Error('Choose a valid audio retention period.');
    const cast=casting(c);validateCastConfig({...cast,voices:[...cast.voices,...extraVoices]});
    validateNumericSettings(c);
    if(!nativeConnections.some(v=>v.id===c.connection))throw new Error('Select an existing Lumiverse TTS connection.');
  }
  function updatePlannerVisibility() {
    const mode=$('plannerMode')?.value || 'llm';
    const isJev=mode==='jev';
    const isHeuristic=mode==='heuristic';
    if($('llmPlannerBox'))$('llmPlannerBox').hidden=false;
    if($('jevPlannerBox'))$('jevPlannerBox').hidden=!isJev;
    if($('useFastClassifier'))$('useFastClassifier').checked=isHeuristic;
    $('plannerHint').textContent=isHeuristic?'Runs on this device. Unclear dialogue stops planning.':isJev?'Jev picks speakers; your Planner LLM reads the card once.':'';
    $('plannerHint').hidden=!$('plannerHint').textContent;
  }
  function updateProviderVisibility() {
    const activeProvider=detectProvider(config);
    const several=config.connectionMode==='several';
    const anyFish=activeProvider==='fish_audio' || several && [...castRows,...npcRows].some(row=>detectProvider(row.read().route || scope(config))==='fish_audio');
    $('fishVoiceSourceWrap').hidden=!anyFish;

    if($('extraVoicesLabel')) {
      $('geminiVoiceHint').hidden=activeProvider!=='gemini';
      if(activeProvider==='fish_audio') {
        $('extraVoicesLabel').textContent='Additional Fish Audio voices & reference IDs (ID | description)';
        $('extraVoices').placeholder='reference_id | description (e.g. Fish Audio model ID or reference voice)';
      } else if(activeProvider==='gemini') {
        $('extraVoicesLabel').textContent='Additional Gemini voices & custom IDs (ID | description)';
        $('extraVoices').placeholder='voice_… | description (or a temporary voicekey_… ID)';
      } else {
        $('extraVoicesLabel').textContent='Additional voices & models (ID | description)';
        $('extraVoices').placeholder='voice_id | description';
      }
    }

    if($('styleParam')) {
      const conn=nativeConnections.find(v=>v.id===config.connection);
      const provId=String(conn?.provider || '').toLowerCase();
      const hideStyle=activeProvider==='fish_audio' || activeProvider==='gemini' ||
        provId.includes('fish') || provId.includes('aistudio') || provId.includes('vertex');
      const styleLabel=$('styleParam').closest('label');
      if(styleLabel)styleLabel.hidden=hideStyle;
      if(hideStyle) {
        $('styleParam').value='';
      } else {
        const parameters=nativeProviders.find(v=>v.id===conn?.provider)?.capabilities?.parameters || {};
        const hasAny=['instructions','instruct','prompt'].some(p=>parameters[p]);
        $('styleParam').options[0].textContent=hasAny ? 'Ignore style' : 'Not supported by this provider';
      }
    }
  }
  function setFields() {
    for(const name of ['planner','connection','decisionConnection','fishVoiceSource','styleParam','apiBase','chunk','plannerTokens','extraVoices','ignoredTags','retention'])if($(name))$(name).value=config[name] || '';
    $('connectionMode').value=config.connectionMode;
    $('useStyle').checked=config.useStyle;$('auto').checked=config.auto;
    $('showAutoPlanAction').checked=Boolean(config.showAutoPlanAction);
    $('paranoidMode').checked=Boolean(config.paranoidMode);syncTtsInspector();
    if($('enableSfx'))$('enableSfx').checked=config.enableSfx!==false;
    $('enableAmbience').checked=config.enableAmbience!==false;$('enableMusic').checked=config.enableMusic===true;$('loopMusic').checked=config.loopMusic===true;
    if($('enableMixer'))$('enableMixer').checked=Boolean(config.enableMixer);
    $('readAlong').value=config.readAlong || 'off';$('followNarration').checked=Boolean(config.followNarration);
    if($('freesoundApiKey'))$('freesoundApiKey').value=config.freesoundApiKey||'';$('concurrency').value=config.concurrency;
    if($('plannerMode'))$('plannerMode').value=resolvePlannerMode(config);
    if($('useFastClassifier'))$('useFastClassifier').checked=Boolean(config.useFastClassifier);
    if($('jevKey'))$('jevKey').value=config.jevApiKey||'';
    if($('jevEndpoint'))$('jevEndpoint').value=config.jevEndpoint||'';
    for(const name of ['allowLlmFallback','normalizeLoudness','skipMeta','sectionButtons'])$(name).checked=Boolean(config[name]);
    $('prefetch').value=config.prefetch;
    $('batchSpeech').checked=Boolean(config.batchSpeech);syncVoiceControls();
    updatePlannerVisibility();
    updateProviderVisibility();
  }
  function setBusy(value) {
    busy=value;
    if(value)$('downloadAll').disabled=true;
    for(const entry of messageDownloads)entry.button.disabled=value;
    if(!value)void refreshMessageDownloads();
    if(!value){scheduleAutoReplies();clearReadAlong();}
    for (const name of ['save','latest','load','testPlanner','add','reset','connection','connectionMode','apply'])if($(name))$(name).disabled=value;
    for (const name of ['planner','plannerMode','decisionConnection','fishVoiceSource','jevKey','jevEndpoint','styleParam','apiBase','chunk','plannerTokens','extraVoices','useStyle','useFastClassifier','planJson','retention','allowLlmFallback','prefetch','normalizeLoudness','skipMeta','sectionButtons','enableSfx','enableAmbience','enableMusic','loopMusic','freesoundApiKey','testTts','importCast'])if($(name))$(name).disabled=value;
    updateTransport();
    $('batchSpeech').disabled=value;if($('concurrency'))$('concurrency').disabled=value;
    for(const node of [...root.querySelectorAll('.et-cast-row input,.et-cast-row select,.et-cast-row button'),...$('npcPolicyRoot').querySelectorAll('input,select')])node.disabled=value;
    const narrator=castRows[0]?.row.querySelector('input');if(narrator && config.fixed[0]?.speaker==='Narrator')narrator.disabled=true;
    refreshDefaultControls();
  }
  function clearPlan() {plan=null;planSource=null;planAttribution=null;mixerPlaybackSegments=null;$('preview').replaceChildren();$('planJson').value='';$('planSummary').textContent='Speech plan';$('latestNotice').hidden=true;updateCastVisibility();renderMixer();refreshSectionControls();renderTtsInspector();}
  // Cue keeps the current ambience bed running into its next paragraph.
  function stop(show=true,keepBed=false,keepMusic=false) {
    if(show){cancelAutoReplies();visibleStops++;}
    if(activePlayback && currentAudio)savePosition(currentAudio.currentTime || 0);
    revision++;controller?.abort();controller=null;paragraphPlaybackScope=null;playedCapture?.discard();playedCapture=null;
    for(const pending of paragraphPrefetchControllers)pending.abort();paragraphPrefetchControllers.clear();
    planningSource=null;advancePlayback=null;skipAudio=null;generationPolicyChanged=null;activePlayback=null;currentSpeaker='';currentGroupLevel=null;currentGroupNames=[];mixerPlaybackSegments=null;
    currentAudio?.pause();finishAudio?.();currentAudio=null;finishAudio=null;
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    audioReady=false;if(keepBed)pauseBeds(false);else if(keepMusic && continuousMusic()){stopBeds('ambience');pauseBeds(false);}else stopBeds();
    setBusy(false);renderMixer();if(show)status('Stopped.');
  }
  async function save() {
    if(!chatId)throw new Error('Open a chat first.');
    const updated=capture();validateSettings(updated);config=updated;
    await flushSettings();await persistConfig(chatId,config,true);saveState('Settings saved');
    if(planSource)await restoreSavedPlan(planSource.messageId);
    status('Cast and audio retention saved. Saved attribution reused; changed voices generate only affected audio.');
  }
  let cataloguesReady=false;
  async function loadProviders() {
    const version=loadVersion;
    const results=await Promise.allSettled([
      api('/tts-connections?limit=200').then(r=>r.json()),api('/tts-connections/providers').then(r=>r.json()),api('/connections?limit=200').then(r=>r.json()),api('/decision-connections?limit=200').then(r=>r.json())
    ]);
    if(disposed || version!==loadVersion)return;
    nativeConnections=results[0].status==='fulfilled' ? results[0].value.data || [] : nativeConnections;
    nativeProviders=results[1].status==='fulfilled' ? results[1].value.providers || [] : nativeProviders;
    const decisionConnections=results[3].status==='fulfilled' ? results[3].value.data || [] : [];
    if(!config.connection && nativeConnections.length)config.connection=nativeConnections[0].id;
    $('connection').replaceChildren();option($('connection'),'','Choose connection');
    nativeConnections.forEach(c=>option($('connection'),c.id,`${c.name} · ${c.provider}`));
    if(config.connection && !nativeConnections.some(connection=>connection.id===config.connection))option($('connection'),config.connection,'Saved TTS connection · unavailable');
    $('connection').value=config.connection;
    $('planner').replaceChildren();option($('planner'),'','Default LLM connection');
    const plannerConnections=results[2].status==='fulfilled'?results[2].value.data || []:[];
    for(const c of plannerConnections)option($('planner'),c.id,`${c.name} · ${c.provider || ''} · ${c.model || 'No model configured'}`);
    if(config.planner && !plannerConnections.some(c=>c.id===config.planner))option($('planner'),config.planner,'Saved planner connection · unavailable');
    $('planner').value=config.planner;
    if($('decisionConnection')) {
      $('decisionConnection').replaceChildren();
      option($('decisionConnection'),'','Default Decision connection');
      for(const c of decisionConnections) {
        option($('decisionConnection'),c.id,`${c.name} · ${c.provider}${c.model ? ` (${c.model})` : ''}`);
      }
      if(config.decisionConnection && !decisionConnections.some(c=>c.id===config.decisionConnection)) {
        option($('decisionConnection'),config.decisionConnection,'Saved Decision connection · unavailable');
      }
      $('decisionConnection').value=config.decisionConnection || '';
    }
    if(!setupAutoStarted){setupAutoStarted=true;void setupWizard.start();}
    if(results[0].status==='rejected'){renderCast();throw new Error(`Could not load TTS connections: ${results[0].reason.message}. Your selected connection is retained; use Reload to retry.`);}
    if(!nativeConnections.length){renderCast();throw new Error('Choir speaks through Lumiverse TTS connections. Add one in Lumiverse, then use Reload.');}
    await loadVoices(version);
  }
  async function loadVoices(version=loadVersion) {
    cataloguesReady=false;
    ++voiceCatalogueRevision;voiceCatalogues.clear();
    // Keep saved editors available even if the catalogue request fails.
    renderCast();
    const catalogue=await ensureCatalogue(scope(config),version);
    if(disposed || version!==loadVersion)return;
    voices=catalogue;
    const selectedRoutes=new Set(config.connectionMode==='one'?[]:[...config.fixed,...(config.casts[scope(config)] || [])].map(actor=>actor.route).filter(Boolean));
    if(config.npcPolicy?.route)selectedRoutes.add(config.npcPolicy.route);
    const catalogues=await Promise.allSettled([...selectedRoutes].map(route=>ensureCatalogue(route)));
    for(const result of catalogues)if(result.status==='rejected')status(result.reason.message,true);
    if(version!==loadVersion || disposed)return;
    const connection=nativeConnections.find(v=>v.id===config.connection);
    const parameters=nativeProviders.find(v=>v.id===connection?.provider)?.capabilities?.parameters || {};
    for(const node of $('styleParam').options)node.disabled=Boolean(node.value && !parameters[node.value]);
    if(config.styleParam && !parameters[config.styleParam]){config.styleParam='';$('styleParam').value='';}
    cataloguesReady=true;renderCast();refreshSectionControls();
  }
  // Opening a chat and switching connections reload voice catalogues; Play waits
  // for voicesLoading so saved plans are not checked against missing voices.
  function loadChat(force=false){
    const loading=run(()=>switchChat(force));
    voicesLoading=Promise.all([voicesLoading,loading]);
    return loading;
  }
  async function switchChat(force=false) {
    const id=ctx.getActiveChat().chatId;
    if(!force && id===chatId && config)return;
    // Capture the old chat before awaiting its save; a later navigation must win.
    const version=++loadVersion;
    cataloguesReady=false;
    closeDefaultEditor?.();
    cancelAutoReplies();stop(false);clearPlan();clearTtsRequestLog();transcriptCache.clear();
    try{await flushSettings();}catch(error){status(`Previous chat settings could not be saved: ${error.message}`,true);}
    if(disposed || version!==loadVersion)return;
    chatId=id;
    activeCharacterCard=null;activePersonaName='';activeCardKey='';
    pendingSettings=null;
    castRows=[];npcRows=[];$('fixed').replaceChildren();$('npcs').replaceChildren();
    refreshDefaultControls();
    const defaultRevision=defaultsRevision;
    const [globalSaved,saved,preset]=await Promise.all([ctx.settings.get(GLOBAL_SETTINGS_KEY),id?ctx.settings.get(settingsKey(id)):null,ctx.settings.get(CAPTURED_DEFAULTS_KEY)]);
    if(disposed || version!==loadVersion)return;
    if(defaultRevision===defaultsRevision)capturedDefaults=[1,2].includes(preset?.version)?normalizeSavedSettings({version:2,...(Array.isArray(preset.leadVoices)?{leadVoices:preset.leadVoices}:{}),...(Array.isArray(preset.voiceCatalogue)?{voiceCatalogue:preset.voiceCatalogue}:{}),...(preset.npcPolicy || preset.preferences?.npcPolicy?{npcPolicy:preset.npcPolicy || preset.preferences.npcPolicy}:{})}):null;
    const preferences={...preferenceSnapshot(preset?.preferences || await ctx.settings.get('settings:defaults')),...preferenceSnapshot(saved),...preferenceSnapshot(globalSaved)};
    if(disposed || version!==loadVersion)return;
    const legacyCast=!saved && !capturedDefaults && Array.isArray(globalSaved?.fixed)?globalSaved:null;
    const repairDuplicates=saved && reconcileCastDuplicates(saved)!==saved;
    config=normalizeSavedSettings({...defaults(),...Object.fromEntries(preferenceFields.filter(name=>preferences && Object.hasOwn(preferences,name)).map(name=>[name,preferences[name]])),...(legacyCast || {}),...(saved || {}),...preferences});
    config.plannerMode=resolvePlannerMode(preferences);
    config.useFastClassifier=config.plannerMode==='heuristic';config.useJev=config.plannerMode==='jev';
    preferenceBaseline=preferenceSnapshot(config);
    chatBaselines.set(id,chatSettingsSnapshot(config));
    if(!saved && !legacyCast)config.fixed[0].voice='';
    if(saved && !saved.connectionMode)config.connectionMode='several';
    if(saved?.jevApiKey){await persistConfig(id,config);if(disposed || version!==loadVersion)return;}
    void recordingStore('prune').catch(()=>{});
    if(disposed || version!==loadVersion)return;
    if(!saved && !legacyCast && capturedDefaults)config=withDefaultSetup(config,capturedDefaults);
    const repairCast=!config.fixed.some(actor=>normalizeName(actor.speaker)==='narrator');
    if(repairCast){
      const baseline=withDefaultSetup({...config,fixed:defaults().fixed},capturedDefaults || {},'lead').fixed;
      const profile=await activePersona();if(disposed || version!==loadVersion)return;
      const persona=config.fixed.some(actor=>['persona','user','you',normalizeName(profile?.name)].filter(Boolean).includes(normalizeName(actor.speaker)));
      config.fixed=[baseline[0],...(persona?[]:[baseline[1]]),...config.fixed];
    }
    setFields();await loadProviders();
    if(version!==loadVersion || disposed)return;
    await refreshLeadNames(Boolean(saved));
    if(version!==loadVersion || disposed)return;
    if(repairCast || repairDuplicates)await persistConfig(id,config);
    const previous=id?await ctx.settings.get(`activeplan:${id}`):null;
    if(version!==loadVersion || disposed)return;
    if(previous)await restoreSavedPlan(previous);
    if(version!==loadVersion || disposed)return;
    saveState(saved?'Saved settings restored':capturedDefaults?'Default setup loaded':preferences?'Connection preferences restored':'Changes save automatically');
    $('defaultStatus').textContent='';
    refreshDefaultControls();
    positionMixer();
    renderMessages();status(plan?'Saved speech plan restored.':id?'Ready.':'Open a chat to begin.');
  }
  async function persistPlan(){
    if(!planSource || !plan)return;
    const source={...planSource}, saved={...source,attribution:attributionPlan(plan,casting(config)),warning:plan.warning || ''};
    planAttribution=saved.attribution;
    await ctx.settings.set(await planKey(source.chatId,source.messageId),saved);
    await ctx.settings.set(`activeplan:${source.chatId}`,source.messageId);
  }
  async function restoreSavedPlan(messageId,renderRows=true){
    const targetChat=chatId,version=loadVersion,token=revision;
    const saved=await ctx.settings.get(await planKey(targetChat,messageId));
    if(disposed || targetChat!==chatId || version!==loadVersion || token!==revision)return false;
    if(pendingCardAnalysis() || !saved || mergedCardRecording(saved) || !sameSpeech(saved.content,ctx.messages.getContent(messageId)) || !await recordingMatchesTranscript(saved,saved.content))return false;
    if(disposed || targetChat!==chatId || version!==loadVersion || token!==revision)return false;
    const cast=casting(config);
    // Attribution has no voice IDs. A blank selection needs a real LLM choice,
    // rather than restoreAttribution's first catalogue entry.
    if(needsVoiceSelection(saved.attribution,cast))return false;
    const restored=restoreAttribution(saved.attribution,saved.transcript,cast);
    planAttribution=saved.attribution;
    const chosen=rememberPlanCast(restored);
    plan={...restored,warning:saved.warning || ''};planSource={messageId,content:saved.content,transcript:saved.transcript,chatId:targetChat,sections:saved.sections,soundCues:Boolean(saved.soundCues),soundCueWarning:saved.soundCueWarning || ''};
    if(renderRows)renderCast();renderPreview();
    if(chosen)await persistConfig(targetChat,config);
    return !disposed && targetChat===chatId && version===loadVersion && token===revision;
  }
  let latestNoticeVersion=0;
  function refreshLatestNotice(){
    const version=++latestNoticeVersion,targetChat=chatId;
    const latest=ctx.messages.getRecent(200).filter(v=>!v.is_user && !v.extra?.is_system).at(-1);
    const content=latest && ctx.messages.getContent(latest.id);
    const current=plan && latest && planSource?.chatId===targetChat && planSource.messageId===latest.id && sameSpeech(planSource.content,content);
    $('latestNotice').hidden=!current;
    if(current || !latest || !targetChat)return;
    void (async()=>{
      const saved=await ctx.settings.get(await planKey(targetChat,latest.id));
      const matches=saved && sameSpeech(saved.content,content) && saved.attribution?.segments?.length && await recordingMatchesTranscript(saved,content);
      if(!disposed && version===latestNoticeVersion && targetChat===chatId && sameSpeech(ctx.messages.getContent(latest.id),content))$('latestNotice').hidden=!matches;
    })().catch(()=>{});
  }
  function refreshDeliveryGuidance(){
    if(!plan)return;
    const snapshot=capture();
    for(const node of $('preview').querySelectorAll('[data-choir-delivery]')){
      const segment=plan.segments[Number(node.dataset.choirDelivery)];node.replaceChildren();
      const members=speechMembers(segment);
      for(const member of members){
        const line=document.createElement('div'),actor=actorFor(member,snapshot);
        const mode=characterDeliveryMode(actor,normalizeName(member.speaker)==='narrator');
        const label=snapshot.useStyle===false || mode==='off'?'Tone directions off':mode==='base'?'Base style only':'Automatic acting';
        const speaker=members.length>1?`${member.speaker} · `:'';
        try{line.textContent=`${speaker}${label} · ${synthesisSettings(member,snapshot).segment.style || 'No added direction'}`;}
        catch(error){line.textContent=`${speaker}Delivery unavailable: ${error.message}`;}
        node.append(line);
      }
    }
  }
  function renderPreview() {
    updateCastVisibility();
    refreshLatestNotice();
    $('preview').replaceChildren();
    $('planSummary').textContent=`Speech plan · ${plan.segments.length} spoken blocks`;
    if(plan.warning){const warning=document.createElement('p');warning.setAttribute('role','note');warning.textContent=`Jev failed: ${plan.warning}. Explicit LLM fallback supplied this attribution.`;$('preview').append(warning);}
    for(const [index,segment] of plan.segments.entries()) {
      const card=document.createElement('div');card.className='et-card et-plan-block';
      const isMutedNarrator=normalizeName(segment.speaker)==='narrator' && Boolean(config.muteNarrator);
      if(isMutedNarrator)card.style.opacity='0.55';
      const label=document.createElement('strong');
      const connectionLabel=nativeConnections.find(c=>`native:${c.id}`===segment.route)?.name;
      label.textContent=`${index+1}. ${segment.speaker}${segment.unison?' · in unison':''} · ${segment.unison?segment.unison.map(member=>member.voice).join(' + '):segment.voice}${connectionLabel?` · ${connectionLabel}`:''}${isMutedNarrator?' · Muted':''}`;
      const text=document.createElement('div');text.className='et-transcript';text.textContent=segment.text;
      const cacheStatus=document.createElement('small');cacheStatus.dataset.cacheIndex=index;cacheStatus.textContent='Checking cache…';
      const heading=document.createElement('div');heading.className='et-plan-heading';heading.append(label,cacheStatus);
      card.append(heading);
      if(!segment.kind){const delivery=document.createElement('small');delivery.className='et-plan-delivery';delivery.dataset.choirDelivery=index;card.append(delivery);}
      card.append(text);$('preview').append(card);
    }
    // Editing uses delivery-only styles, so re-validation does not double the base style.
    $('planJson').value=JSON.stringify({segments:plan.segments.map(segment=>withoutBase(segment,casting(config)))},null,2);
    refreshDeliveryGuidance();
    renderTtsInspector();
    renderMixer();void refreshCacheStatus();refreshSectionControls();
  }
  async function refreshCacheStatus(){
    if(!planSource)return;
    const source=planSource,segments=plan.segments,snapshot=capture();
    const record=await recordingStore('get',recordingKey(source.chatId,source.messageId)).catch(()=>null);
    if(source!==planSource)return;
    const grouped=snapshot.batchSpeech?playbackBatches(segments.map((segment,passageIndex)=>({...segment,passageIndex})),snapshot):null;
    for(const [index,segment] of segments.entries()){
      const batches=(grouped?grouped.filter(batch=>batch.passageIndex===index || batch.turns?.some(turn=>turn.passageIndex===index)):playbackBatches([segment],snapshot)).filter(batch=>!batch.ambience?.stop && !batch.music?.stop);
      const count=batches.filter(batch=>record?.passages?.[cacheKey(batch,snapshot)]).length;
      const node=$('preview').querySelector(`[data-cache-index="${index}"]`);
      const shared=grouped?.filter(batch=>!isBed(batch)).map((batch,clip)=>({batch,clip})).filter(({batch})=>batch.turns?.some(turn=>turn.passageIndex===index));
      const label=shared?.length?`Shared ${shared.length===1?'clip':'clips'} ${shared.map(({clip})=>clip+1).join(', ')} · `:'';
      if(node)node.textContent=speakerExcluded(segment.speaker)?'No voice · text retained':label+(count===batches.length?'Cached':`${count}/${batches.length} cached · requires generation`);
    }
  }
  const replacePersonaMacro=(text,name)=>text.replace(/\{\{\s*user\s*\}\}/gi,()=>name);
  // A chat can open before Lumiverse applies its persona binding, so the chat's own persona wins over the global selection.
  async function activePersona(signal){
    const chat=chatId?await api(`/chats/${encodeURIComponent(chatId)}?messages=false`,{signal}).then(response=>response.json()).catch(()=>null):null;
    const personaId=chat?.metadata?.active_persona_id || ctx.state.get?.('persona.activeId');
    return personaId?api(`/personas/${encodeURIComponent(personaId)}`,{signal}).then(response=>response.json()).catch(()=>null):null;
  }
  const LEAD_PLACEHOLDERS=[[],['persona','{{user}}'],['character','{{char}}']];
  const leadPlaceholder=(fixed,index)=>Boolean(LEAD_PLACEHOLDERS[index]?.includes(normalizeName(fixed[index]?.speaker)));
  // Only placeholder lead names are replaced, so names the user typed stay. Runs after each chat load and
  // whenever the persona changes, because the persona may become known only after the chat opened.
  const cardFingerprint=card=>sha256Hex(JSON.stringify(['name','description','personality','scenario','first_mes'].map(field=>card?.[field] || '')));
  function rolesForCard(card){
    const local=characterCardRoles(card || {}),cached=config?.cardCastAnalysis?.key===activeCardKey?validateCardRoles(config.cardCastAnalysis.roles):[];
    // A saved analysis may predate improved local profile detection. Keep its
    // extra people, but let explicit profiles restore missing identities and
    // aliases without charging for another analysis of the unchanged card.
    const roles=local.map(role=>({...role,aliases:[...(role.aliases || [])]}));
    const identity=role=>[role.name,...(role.aliases || [])].map(normalizeName);
    const titles=new Set([card?.name,String(card?.name || '').split(/\s*\|+\s*/)[0]].map(normalizeName));
    for(const role of cached){
      if(local.length>1 && titles.has(normalizeName(role.name)))continue;
      const exact=roles.find(candidate=>normalizeName(candidate.name)===normalizeName(role.name));
      const names=identity(role),matches=roles.filter(candidate=>identity(candidate).some(name=>names.includes(name)));
      // One cached group description cannot merge two separately named people.
      if(!exact && matches.length>1)continue;
      const existing=exact || matches[0];
      if(existing)existing.aliases=[...new Set([...existing.aliases,role.name,...(role.aliases || [])])].filter(name=>normalizeName(name)!==normalizeName(existing.name)).slice(0,30);
      else roles.push({...role,aliases:[...(role.aliases || [])]});
    }
    const npcNames=new Set([...(config?.cardCastNPCs || []),...(config?.removedCardCast || [])].map(normalizeName));
    return validateCardRoles(roles).filter(role=>![role.name,...(role.aliases || [])].some(name=>npcNames.has(normalizeName(name))));
  }
  function expandCardRoles(value,roles,character){
    let renamed=false;
    const matchesRole=(actor,role)=>actor && [actor.speaker,...(actor.aliases || [])].some(name=>[role.name,...(role.aliases || [])].some(other=>normalizeName(name)===normalizeName(other)));
    const transferChoices=(source,target)=>{
      value.singleVoices=Object.fromEntries(Object.entries(value.singleVoices || {}).map(([route,choices])=>{
        const previous=source && Object.keys(choices).find(name=>normalizeName(name)===normalizeName(source.speaker));
        if(Object.hasOwn(choices,target.speaker) || !previous)return [route,choices];
        const updated={...choices,[target.speaker]:choices[previous]};if(previous!==target.speaker)delete updated[previous];
        return [route,updated];
      }));
    };
    const mergeAliases=(actor,role)=>{
      const occupied=new Set(value.fixed.filter(other=>other!==actor).flatMap(other=>[other.speaker,...(other.aliases || [])]).map(normalizeName));
      const names=[...(actor.aliases || []),role.name,...(role.aliases || [])].filter(name=>normalizeName(name)!==normalizeName(actor.speaker) && !occupied.has(normalizeName(name)));
      const aliases=[...new Map(names.map(name=>[normalizeName(name),name])).values()];
      if(JSON.stringify(aliases)!==JSON.stringify(actor.aliases || [])){actor.aliases=aliases;renamed=true;}
    };
    if(roles.length){value.cardCastSourceTitle=character.name;value.cardCastSourceId=ctx.getActiveChat().characterId;}
    if(roles.length>1)value.cardGroupName=character.name;
    if(roles.length && !leadPlaceholder(value.fixed,2) && normalizeName(value.fixed[2]?.speaker)!==normalizeName(character.name) && (value.cardCastSourceTitle===character.name || value.cardCastSourceId && value.cardCastSourceId===ctx.getActiveChat().characterId || value.cardGroupName===character.name)){
      const template=value.fixed[2];
      for(const role of roles){
        const existing=value.fixed.find(actor=>matchesRole(actor,role));
        if(existing){mergeAliases(existing,role);continue;}
        const prior=Object.values(value.casts || {}).flat().find(actor=>matchesRole(actor,role));
        const added={...template,...prior,speaker:role.name,voice:prior?.voice || '',aliases:role.aliases || [],pronunciation:prior?.pronunciation || '',sayAs:prior?namePronunciation(prior):'',sayAsName:prior?.sayAsName || ''};
        transferChoices(prior,added);value.fixed.push(added);renamed=true;
      }
      const names=new Set(value.fixed.flatMap(actor=>[actor.speaker,...(actor.aliases || [])]).map(normalizeName));
      value.casts=Object.fromEntries(Object.entries(value.casts || {}).map(([route,actors])=>[route,actors.filter(actor=>![actor.speaker,...(actor.aliases || [])].some(name=>names.has(normalizeName(name))))]));
      return {value,renamed};
    }
    if(roles.length && (leadPlaceholder(value.fixed,2) || normalizeName(value.fixed[2]?.speaker)===normalizeName(character.name))){
      const template=value.fixed[2],occupied=new Set(value.fixed.filter((_,index)=>index!==2).map(actor=>normalizeName(actor.speaker)));
      const leads=roles.filter(role=>!occupied.has(normalizeName(role.name))).map((role,index)=>{
        const prior=Object.values(value.casts || {}).flat().find(actor=>matchesRole(actor,role));
        const added={...template,...prior,speaker:role.name,voice:prior?.voice || (index===0?template.voice:''),aliases:[...new Set([...(roles.length===1?template.aliases || []:[]),...(role.aliases || [])])],pronunciation:prior?.pronunciation || (roles.length===1?template.pronunciation:'') || '',sayAs:prior?namePronunciation(prior):roles.length===1?namePronunciation(template):'',sayAsName:prior?prior.sayAsName || '':roles.length===1?template.sayAsName || '':''};
        transferChoices(prior,added);if(index===0)transferChoices(template,added);
        return added;
      });
      if(leads.length){
        value.fixed.splice(2,1,...leads);
        const names=new Set(leads.flatMap(actor=>[actor.speaker,...actor.aliases]).map(normalizeName));
        value.casts=Object.fromEntries(Object.entries(value.casts || {}).map(([route,actors])=>[route,actors.filter(actor=>!names.has(normalizeName(actor.speaker)))]));
        renamed=true;
      }
    }
    return {value,renamed};
  }
  function pendingCardAnalysis(){
    const card=activeCharacterCard;
    return card && resolvePlannerMode(config)!=='heuristic' && characterCardRoleDiscovery(card).needsAnalysis && config.cardCastAnalysis?.key!==activeCardKey
      && ['description','personality','scenario','first_mes'].some(field=>String(card[field] || '').trim());
  }
  async function discoverCardCast(signal){
    const id=ctx.getActiveChat().characterId,version=loadVersion;
    const card=id?await ctx.characters.get(id).catch(()=>null):null;
    if(signal.aborted || disposed || version!==loadVersion)throw abortError();
    activeCharacterCard=card;activeCardKey=await cardFingerprint(card);
    if(signal.aborted || disposed || version!==loadVersion)throw abortError();
    const structured=characterCardRoles(card || {});
    if(structured.length){const expanded=expandCardRoles(config,rolesForCard(card),card);config=expanded.value;if(expanded.renamed){clearPlan();renderCast();await persistConfig(chatId,config);}}
    if(!pendingCardAnalysis())return;
    status('Identifying this card’s characters with the Planner LLM…');
    const result=await rpc('cardCast',{card:Object.fromEntries(['name','description','personality','scenario','first_mes'].map(field=>[field,String(card[field] || '')])),connectionId:config.planner},signal,60000,progress=>status(progress.stage));
    if(signal.aborted || disposed || version!==loadVersion)throw abortError();
    const roles=validateCardRoles(result.roles);
    config.cardCastAnalysis={key:activeCardKey,roles:roles.length?roles:structured};config.cardCastSourceTitle=card.name;config.cardCastSourceId=id;
    const expanded=expandCardRoles(config,rolesForCard(card),card);config=expanded.value;
    if(expanded.renamed){clearPlan();renderCast();}
    await persistConfig(chatId,config);
    return true;
  }
  async function refreshLeadNames(save=true){
    if(!chatId || !config || busy)return;
    const version=loadVersion,characterId=ctx.getActiveChat().characterId;
    const [persona,character]=await Promise.all([activePersona(),characterId?ctx.characters.get(characterId).catch(()=>null):null]);
    if(disposed || version!==loadVersion || busy)return;
    let value=capture(),renamed=false;
    activeCharacterCard=character;activePersonaName=typeof persona?.name==='string'?persona.name.trim():'';
    activeCardKey=await cardFingerprint(character);
    if(disposed || version!==loadVersion || busy)return;
    const roles=rolesForCard(character);
    const expanded=expandCardRoles(value,roles,character);value=expanded.value;renamed=expanded.renamed;if(renamed)clearPlan();
    for(const [index,profile] of [[1,persona],[2,character]]){
      const name=typeof profile?.name==='string'?profile.name.trim():'',previous=value.fixed[index]?.speaker;
      if(!name || !leadPlaceholder(value.fixed,index))continue;
      value.fixed[index]={...value.fixed[index],speaker:name};renamed=true;
      value.singleVoices=Object.fromEntries(Object.entries(value.singleVoices || {}).map(([route,voices])=>[route,Object.hasOwn(voices,previous)?{...voices,[name]:voices[previous]}:voices]));
    }
    const reconciled=reconcileCardCast(value,character || {});
    renamed ||= JSON.stringify(reconciled)!==JSON.stringify(value);value=reconciled;
    if(!renamed)return;
    config=value;renderCast();
    if(save)scheduleSettingsSave();
  }
  async function personaName() {
    const persona=await activePersona();
    if(persona?.name?.trim())return persona.name.trim();
    const name=config.fixed[1]?.speaker?.trim();
    if(name && !leadPlaceholder(config.fixed,1))return name;
    // Lumiverse shows {{user}} as "User" when no persona is selected; read it the same way.
    return 'User';
  }
  // Without a named persona, the placeholder persona row voices the lines spoken under the fallback name.
  function personaFallbackCast(cast,name){
    if(!leadPlaceholder(cast.fixed,1))return cast;
    const taken=[...cast.fixed,...(cast.npcs || [])].some(actor=>[actor.speaker,...(actor.aliases || [])].some(alias=>normalizeName(alias)===normalizeName(name)));
    return taken?cast:{...cast,fixed:cast.fixed.map((actor,index)=>index===1?{...actor,aliases:[...(actor.aliases || []),name]}:actor)};
  }
  async function plannerProfiles(cast,signal){
    const characterId=ctx.getActiveChat().characterId;
    const [character,persona]=await Promise.all([characterId?ctx.characters.get(characterId).catch(()=>null):null,activePersona(signal)]);
    const text=(value,limit)=>typeof value==='string'?value.trim().slice(0,limit):'';
    activeCardKey=await cardFingerprint(character);
    const roles=rolesForCard(character);
    // A shared personality/scenario describes several people. Only single-role
    // cards can safely attach those fields to one speaker's voice profile.
    const profiles=roles.length?roles.map(role=>[cast.fixed.find(actor=>[actor.speaker,...(actor.aliases || [])].some(name=>[role.name,...(role.aliases || [])].some(other=>normalizeName(name)===normalizeName(other))))?.speaker || role.name,{...(roles.length===1?character:{}),name:role.name,description:role.description},'character']):[[cast.fixed[2]?.speaker,character,'character']];
    return [...profiles,[cast.fixed[1]?.speaker,persona,'persona']].flatMap(([speaker,profile,role])=>!speaker || !profile?[]:[{
      speaker,name:text(profile.name,100),role,description:text(profile.description,8000),personality:text(profile.personality,2000),
      // Scenario cards often leave the description empty and introduce their characters in the scenario and greeting.
      ...(role==='character'?{scenario:text(profile.scenario,2000),firstMessage:text(profile.first_mes,1500)}:{})
    }]);
  }
  // Edits that only add images, trackers or other non-spoken markup keep a plan and its audio valid.
  // transcriptFromMessage runs a full HTML/markup filter, and the same message text is compared on
  // several hot paths (play, replay, section controls). Memoize per content + ignored tags, bounded
  // so old chats' message text is not retained indefinitely.
  function filteredTranscript(content,ignoredTags=config?.ignoredTags){
    const source=String(content ?? '');
    const key=`${source}\u0000${String(ignoredTags ?? '')}`;
    const hit=transcriptCache.get(key);
    if(hit!==undefined)return hit;
    const value=transcriptFromMessage(source,ignoredTags);
    transcriptCache.set(key,value);
    if(transcriptCache.size>64)transcriptCache.delete(transcriptCache.keys().next().value);
    return value;
  }
  const spokenText=content=>filteredTranscript(content).replace(/\s+/g,' ').trim();
  const sameSpeech=(a,b)=>a===b || (a!=null && b!=null && spokenText(a)===spokenText(b));
  function mergedCardRecording(recording){
    const transcript=recording.transcript || '';
    const expected=speechSourceUnits(transcript).filter(unit=>unisonSpeakers(transcript,unit,casting(config))?.length>=2).length;
    const actual=(recording.attribution?.segments || recording.segments || []).flatMap(segment=>segment.turns || [segment]).filter(segment=>segment.unison?.length>=2).length;
    if(expected>actual)return true;
    const groupName=normalizeName(config?.cardGroupName);
    // A card can be named after its real lead while also describing other people.
    // Only an obsolete title, absent from the independently assigned cast, marks
    // a recording that still combines those people into the old group voice.
    const namedLead=(config?.fixed || []).slice(2).some(actor=>normalizeName(actor.speaker)===groupName);
    return Boolean(groupName && !namedLead && config.fixed.length>3 && (recording.attribution?.segments || recording.segments || []).flatMap(speechMembers).some(segment=>normalizeName(segment.speaker)===groupName));
  }
  function aliasedLeadRecording(recording){
    return (recording.segments || []).flatMap(speechMembers).some(segment=>(config?.fixed || []).some(actor=>normalizeName(actor.speaker)!==normalizeName(segment.speaker) && (actor.aliases || []).some(alias=>normalizeName(alias)===normalizeName(segment.speaker))));
  }
  // The non-story check runs once per cleaned transcript. Its saved line numbers give every later
  // read of the reply the same text; without a signal only the saved result is used.
  const skipChecks=new Map();
  async function storyTranscript(transcript,signal){
    if(!transcript || config?.skipMeta===false || resolvePlannerMode(config)==='heuristic')return transcript;
    const key=`skip:${await sha256Hex(transcript)}`;
    let skip=skipChecks.get(key) ?? await ctx.settings.get(key).catch(()=>null);
    if(!Array.isArray(skip) && signal){
      status('Checking for non-story blocks…');
      try{
        skip=(await rpc('skipCheck',{lines:transcriptLines(transcript),connectionId:config.planner},signal,90000)).skip;
        await ctx.settings.set(key,skip).catch(()=>{});
      }catch(error){
        if(signal.aborted)throw error;
        status(`Non-story check failed (${error.message}); reading the whole reply.`);
        return transcript;
      }
    }
    if(!Array.isArray(skip))return transcript;
    skipChecks.set(key,skip);
    return withoutLines(transcript,skip);
  }
  async function recordingMatchesTranscript(recording,content) {
    let transcript=await storyTranscript(filteredTranscript(content));
    if(/\{\{\s*user\s*\}\}/i.test(transcript))transcript=replacePersonaMacro(transcript,await personaName());
    const saved=recording.transcript ?? recording.segments?.map(segment=>segment.text).join(' ');
    const canonical=text=>String(text || '').replace(/\s+/g,' ').trim();
    return canonical(saved)===canonical(transcript);
  }
  async function prepare(messageId,autoPlay=false,contentOverride,forceReplan=false) {
    if(!chatId)throw new Error('Open a chat first.');
    stop(false,false,true);clearPlan();config=capture();validateSettings(config);showFoleyStatus(missingFoleyKey(config),false);
    const token=revision, targetChat=chatId;
    const content=contentOverride ?? ctx.messages.getContent(messageId);
    if(content==null)throw new Error('Message is no longer available.');
    let transcript=filteredTranscript(content);
    if(!transcript)throw new Error('This message contains no speakable text.');
    let snapshot=structuredClone(casting(config)),context='';
    const ctrl=new AbortController();controller=ctrl;
    planningSource={messageId,chatId:targetChat,content,token};messagePlaybackId=messageId;
    setBusy(true);status('Checking Choir backend…');
    try {
      const cardAnalyzed=Boolean(await discoverCardCast(ctrl.signal));snapshot=structuredClone(casting(config));
      if(!forceReplan && await restoreSavedPlan(messageId)){
        status('Saved attribution reused.');
        if(autoPlay){controller=null;setBusy(false);await play();}
        return;
      }
      if(ctrl.signal.aborted || token!==revision || targetChat!==chatId || disposed)return;
      const stripBase=segments=>segments.map(segment=>withoutBase(segment,snapshot));
      const plannerMode=resolvePlannerMode(config);
      if(plannerMode!=='heuristic'){
        await rpc('ping',{},ctrl.signal,8000);if(token!==revision || ctrl.signal.aborted)return;
        transcript=await storyTranscript(transcript,ctrl.signal);
        context=(await Promise.all(ctx.messages.getRecent(12).filter(v=>v.id!==messageId && !v.extra?.is_system)
          .map(async v=>`${v.name || (v.is_user ? 'Persona':'Character')}: ${(await storyTranscript(transcriptFromMessage(v.content,config?.ignoredTags))).slice(0,1000)}`))).join('\n').slice(-4000);
        if(token!==revision || ctrl.signal.aborted)return;
        if(!transcript)throw new Error('This message contains only non-story blocks.');
      }
      if(/\{\{\s*user\s*\}\}/i.test(transcript+context)) {
        const name=await personaName();
        if(ctrl.signal.aborted || token!==revision)return;
        transcript=replacePersonaMacro(transcript,name);context=replacePersonaMacro(context,name);
        snapshot=personaFallbackCast(snapshot,name);
      }
      let fastPlan = null;
      if (plannerMode==='heuristic') {
        const failure={};
        try {
          fastPlan = fastClassifyPlan(transcript, snapshot, failure);
          if (fastPlan) status('Speech plan ready (instant local classifier, 0ms).');
        } catch(error) {
          fastPlan = null;
          failure.message=`Heuristic planning failed: ${error.message} No LLM request was made.`;
        }
        if(!fastPlan)throw new Error(failure.message || 'Heuristic could not identify the speaker. Add clear speaker tags or choose Jev or LLM. No LLM request was made.');
      }
      // 2. Jev System 1 classifier (~20ms)
      let jevFailure='';
      if(!fastPlan){
        snapshot.characterProfiles=await plannerProfiles(snapshot,ctrl.signal);
        if(ctrl.signal.aborted || token!==revision || targetChat!==chatId)return;
      }
      if (!fastPlan && plannerMode==='jev') {
        try {
          status('Classifying dialogue with Jev System 1 model…');
          const jevKey = (config.jevApiKey || $('jevKey')?.value || '').trim();
          const jevEndpoint = (config.jevEndpoint || $('jevEndpoint')?.value || '').trim();
          // Jev plans in several sequential Decision rounds (speakers, delivery, new names,
          // voice genders). A Lumiverse Decision connection may be backed by a slow model,
          // so allow more than one quick round; community voice searches need longer still.
          const jevTimeout = snapshot.communityRoutes ? 245000 : 90000;
          const result = await rpc('planJev', {
            transcript,
            config: {...snapshot,allowLlmFallback:config.allowLlmFallback},
            context,
            connectionId:config.planner,
            decisionConnection: snapshot.decisionConnection || $('decisionConnection')?.value || '',
            apiKey: jevKey,
            endpoint: jevEndpoint,
            timeoutMs: jevTimeout - 5000
          }, ctrl.signal, jevTimeout);
          if (!result || !Array.isArray(result.segments))throw new Error('Jev returned no valid speech plan.');
          adoptCommunityVoices(result,snapshot);
          fastPlan = validatePlan({ segments: stripBase(result.segments) }, transcript, snapshot);
          status('Speech plan ready (Jev System 1 classifier).');
        } catch (err) {
          if(ctrl.signal.aborted || token!==revision)throw err;
          if(!config.allowLlmFallback)throw err;
          jevFailure=err.message;status(`Jev failed: ${jevFailure}. Using enabled LLM fallback.`);
          fastPlan = null;
        }
      }

      if (!fastPlan) {
        status('Planning speakers and voices…');
        let result;
        try {
          result = await rpc('plan', {
            transcript,
            config: snapshot,
            timeoutMs: 240000,
            context,
            connectionId: config.planner,
            maxTokens: config.plannerTokens,
            decisionConnection: config.decisionConnection,
            jevApiKey: config.jevApiKey,
            jevEndpoint: config.jevEndpoint
          }, ctrl.signal, 245000,
          progress => status(`Planning speakers and voices: ${progress.stage}${progress.model ? ` · ${progress.model}` : ''}`));
        } catch(error) {
          if (ctrl.signal.aborted || token !== revision) throw error;
          throw new Error(jevFailure?`${jevFailure}\nLLM fallback failed: ${error.message}`:error.message);
        }
        if (token !== revision || targetChat !== chatId || disposed) return;
        adoptCommunityVoices(result,snapshot);
        fastPlan = validatePlan({ segments: stripBase(result.segments) }, transcript, snapshot);
      }
      snapshot.npcs = fastPlan.npcs;
      for (const actor of snapshot.fixed) {
        if (!actor.voice) actor.voice = fastPlan.segments.flatMap(speechMembers).find(s => normalizeName(s.speaker) === normalizeName(actor.speaker))?.voice || '';
      }
      const combined = stripBase(fastPlan.segments);
      // Validate the complete original reply before audio or cast persistence.
      const validated=validatePlan({segments:combined},transcript,snapshot);
      plan={...validated,warning:jevFailure};planSource={messageId,content,transcript,chatId:targetChat,soundCues:false,soundCueWarning:''};
      const cued=await cuePlannedSegments(plan.segments,ctrl,token);
      if(token!==revision || ctrl.signal.aborted)return;
      plan.segments=cued.segments;planSource.soundCues=cued.checked;planSource.soundCueWarning=cued.warning || '';
      rememberPlanCast(validated);
      renderCast();renderPreview();setBusy(true);
      await persistConfig(targetChat,config);
      if(token!==revision || disposed)return;
      await persistPlan();
      status(`Ready: ${plan.segments.length} turns, ${new Set(plan.segments.flatMap(speechMembers).map(s=>s.speaker)).size} speakers.${plannerMode==='heuristic' || plannerMode==='jev' && !jevFailure?` ${plannerMode==='heuristic'?'Local heuristic':'Jev'} attribution; ${cardAnalyzed?`LLM used for card analysis${planSource.soundCues?' and sound effects':''}`:planSource.soundCues?'one LLM request for sound effects':'no LLM request'}.`:''}${jevFailure?` Jev failed: ${jevFailure}. LLM fallback used.`:''}`);
    } finally {ctrl.abort();if(planningSource?.token===token)planningSource=null;if(token===revision){controller=null;advancePlayback=null;generationPolicyChanged=null;updateNextControls();setBusy(false);}}
    if(autoPlay && token===revision)await play();
  }
  // Read-along draws with the CSS Custom Highlight API, so Lumiverse's React-owned message DOM is never changed.
  function clearReadAlong(){readAlongStop?.();readAlongStop=null;followContainer=null;followPaused=false;followGroup=null;followRange=null;followResume.hidden=true;globalThis.CSS?.highlights?.delete('choir-speaking');}
  function scrollParent(node){
    for(let element=node.parentElement;element;element=element.parentElement)if(/auto|scroll|overlay/.test(document.defaultView.getComputedStyle(element).overflowY) && element.scrollHeight>element.clientHeight)return element;
    return null;
  }
  // A line outside the comfort band moves to the upper third of the chat.
  function followLine(rect,container){
    const box=container.getBoundingClientRect();
    if(!rect || rect.top>=box.top+box.height*0.1 && rect.bottom<=box.top+box.height*0.85)return;
    container.scrollTo({top:container.scrollTop+rect.top-box.top-box.height/3,behavior:'smooth'});
  }
  // After the reader scrolls away, a pill over the chat returns to the narration without stopping playback.
  const followRect=()=>{const rects=followRange?.getClientRects();return rects?.[followWord?rects.length-1:0];};
  function placeFollowResume(){
    const rect=followRect();
    if(!followPaused || !config?.followNarration || !followContainer || !rect){followResume.hidden=true;return;}
    const box=followContainer.getBoundingClientRect(),view=document.defaultView;
    const safe=parseFloat(view.getComputedStyle(followContainer).getPropertyValue('--lcs-input-safe-zone')) || 0;
    const label=`${rect.top<box.top?'↑':'↓'} Back to narration`;
    if(followResume.textContent!==label)followResume.textContent=label;
    followResume.style.left=`${box.left+box.width/2}px`;followResume.style.bottom=`${view.innerHeight-box.bottom+safe+12}px`;followResume.hidden=false;
  }
  followResume.onclick=()=>{followPaused=false;followResume.hidden=true;if(followContainer)followLine(followRect(),followContainer);};
  // items are every clip of this playback in order, so repeated phrases map to the right occurrence.
  function followSpeech(audio,{messageId,items,index}){
    const highlights=globalThis.CSS?.highlights,{MutationObserver,NodeFilter}=document.defaultView;
    if(!highlights || !messageId || items[index].kind)return;
    const pieces=items.flatMap((item,i)=>{
      if(item.kind)return [];
      // A batched clip speaks several passages; each one is highlighted on its own.
      const turns=item.turns?.length>1?item.turns:[item];let offset=0;
      return turns.map((turn,t)=>({text:turn.text,item:i,offset:(offset+=turn.text.length+1)-turn.text.length-1,group:turns.length>1?`${i}:${t}`:item.passageIndex ?? `${i}`}));
    });
    const own=pieces.filter(piece=>piece.item===index),text=items[index].text;
    let element=null,mapped=null,shown='',request;
    const observer=new MutationObserver(()=>{mapped=null;});
    const tick=()=>{
      request=globalThis.requestAnimationFrame(tick);
      if(followPaused)placeFollowResume();
      const mode=config?.readAlong,draw=mode==='passage' || mode==='word',word=mode==='word';
      if(!draw && !config?.followNarration){if(shown)highlights.delete('choir-speaking');shown='';return;}
      // Streaming and virtualized remounts replace the rendered text, so map again after any change.
      if(!element?.isConnected){mapped=null;observer.disconnect();element=ctx.dom.findMessageElement(messageId);if(element)observer.observe(element,{childList:true,subtree:true,characterData:true});}
      const content=element?.querySelector('[data-component="MessageContent"]');
      if(!content)return;
      if(!mapped){
        const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('button,pre,script,style')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}),nodes=[];
        while(walker.nextNode())nodes.push(walker.currentNode);
        const {stream,at}=readAlongIndex(nodes.map(node=>node.data));
        mapped={nodes,at,spans:locatePassages(stream,pieces.map(piece=>piece.text))};shown='';
      }
      const spoken=spokenLength(text,audio.duration>0?audio.currentTime/audio.duration:0);
      const current=own.findLast(piece=>piece.offset<spoken) || own[0],position=pieces.indexOf(current);
      let start=-1,end=-1;
      pieces.forEach((piece,i)=>{
        const span=mapped.spans[i];
        if(!span || piece.group!==current.group || word && i>position)return;
        if(start<0)start=span[0];
        end=word && piece===current?span[0]+readableText(piece.text.slice(0,spoken-piece.offset)).length:span[1];
      });
      const key=end>start?`${start}:${end}`:'none';
      if(key===shown)return;
      shown=key;
      if(key==='none'){highlights.delete('choir-speaking');return;}
      // Quotes and punctuation touching the words belong to the passage too.
      const [first,from]=mapped.at[start],[last,to]=mapped.at[end-1],head=mapped.nodes[first].data,tail=mapped.nodes[last].data,mark=/[^\s\p{L}\p{N}\p{M}]/u;
      let left=from,right=to+1;
      while(left>0 && mark.test(head[left-1]))left--;
      while(right<tail.length && mark.test(tail[right]))right++;
      const range=document.createRange();range.setStart(mapped.nodes[first],left);range.setEnd(mapped.nodes[last],right);
      if(draw)highlights.set('choir-speaking',new globalThis.Highlight(range));else highlights.delete('choir-speaking');
      followRange=range;followWord=word;
      if(config.followNarration && !followPaused){
        followContainer||=scrollParent(element);
        const rects=range.getClientRects();
        if(followContainer)followLine(current.group!==followGroup?rects[0]:word?rects[rects.length-1]:null,followContainer);
      }
      followGroup=current.group;
    };
    readAlongStop?.();
    readAlongStop=()=>{globalThis.cancelAnimationFrame(request);observer.disconnect();};
    request=globalThis.requestAnimationFrame(tick);
    return readAlongStop;
  }
  // Wheel, touch or keyboard scrolling in the chat hands scrolling back to the reader until the next Play.
  const userScroll=event=>{if(followContainer && (event.type!=='keydown' || /^(?:Arrow(?:Up|Down)|Page(?:Up|Down)|Home|End| )$/.test(event.key) && !event.target.closest?.('input,textarea,select,[contenteditable]')) && (followContainer.contains(event.target) || event.target===document.body))followPaused=true;};
  for(const type of ['wheel','touchmove','keydown'])document.addEventListener(type,userScroll,{capture:true,passive:true});
  unsubs.push(()=>{for(const type of ['wheel','touchmove','keydown'])document.removeEventListener(type,userScroll,{capture:true});});
  // Decode once when audio arrives, while earlier speech plays. Keep only the
  // measured gain, not the decoded PCM, and observe background failures here.
  const loudnessMeasurements=new WeakMap();
  let outputBus=null,speechLimiter=null,playedCapture=null;
  // Exclude pauses and silent synthesis waits. Keep deliberately configured
  // voice gaps and any music or ambience still heard while speech is loading.
  function syncPlayedAudio(){
    if(!playedCapture)return;
    const foreground=currentAudio && !currentAudio.paused && !currentAudio.ended && !currentAudio.error;
    const gap=voiceGapHold && !voiceGapHold.paused;
    const background=!bedsPaused && [...Object.values(beds),...fadingBeds].some(layer=>layer?.audio && !layer.audio.paused && !layer.audio.ended && !layer.audio.error && effectVolume(layer.kind)*layer.level>0);
    if(foreground || gap || background)playedCapture.start();else playedCapture.pause();
  }
  function playbackOutput(){
    const Context=globalThis.AudioContext || globalThis.webkitAudioContext;
    if(!Context)return null;
    audioContext ||= new Context();
    if(!outputBus){outputBus=audioContext.createGain();outputBus.connect(audioContext.destination);}
    return outputBus;
  }
  // Speech passes a soft clipper, so loudness matching can raise quiet voices
  // fully and high channel volumes do not clip. It has no attack or release
  // state: a compressor here clamps the first words of a playback while it
  // settles. Effects and beds bypass it.
  function speechOutput(){
    const output=playbackOutput();
    if(!output || typeof audioContext.createWaveShaper!=='function')return output;
    if(!speechLimiter){
      // A shaper maps -1…1, so halve the input to cover peaks up to ±2.
      const scale=audioContext.createGain(),shaper=audioContext.createWaveShaper();
      scale.gain.value=0.5;shaper.curve=softClipCurve(2);shaper.oversample='2x';
      scale.connect(shaper);shaper.connect(output);speechLimiter=scale;
    }
    return speechLimiter;
  }
  function beginPlayedAudio(){
    try{const output=playbackOutput();if(output){playedCapture=createPlayedAudioCapture(audioContext,output);syncPlayedAudio();return playedCapture;}}catch{}
    return playedCapture={continuous:false,markDiscontinuous(){},start(){},pause(){},fail(){},discard(){},finish:async()=>({error:'This browser cannot save the played audio mix.'})};
  }
  const playedAudioHint=played=>played?.blob && played.complete===false?' This playback was skipped or seeked. Play the message from the start without navigation to save a complete WAV; saved speech will be reused.':'';
  function prepareLoudness(blob){
    if(!loudnessMeasurements.has(blob))loudnessMeasurements.set(blob,(async()=>{
      const AudioContextClass=globalThis.AudioContext || globalThis.webkitAudioContext;
      if(!AudioContextClass)return {gain:1};
      audioContext ||= new AudioContextClass();
      const decoded=await audioContext.decodeAudioData(await blob.arrayBuffer());
      const limited=typeof audioContext.createWaveShaper==='function';
      return {gain:loudnessGain(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),undefined,decoded.sampleRate,limited?LIMITED_SPEECH_PEAK:undefined)};
    })().catch(error=>({gain:1,error})));
    return loudnessMeasurements.get(blob);
  }
  function preparePlayback(blob,segment,snapshot){
    if(blob && snapshot.normalizeLoudness && !segment?.unison && !isBed(segment))void prepareLoudness(blob);
    return blob;
  }
  function playbackLoudness(blob,signal){
    return new Promise((resolve,reject)=>{
      const cancel=()=>{signal.removeEventListener('abort',cancel);reject(abortError());};
      if(signal.aborted){cancel();return;}
      signal.addEventListener('abort',cancel,{once:true});
      prepareLoudness(blob).then(value=>{signal.removeEventListener('abort',cancel);resolve(value);});
    });
  }
  async function playBlob(blob,signal,speaker='',offset=0,normalize=false,paused=false,track=null) {
    if(signal.aborted)throw abortError();
    const url=URL.createObjectURL(blob);objectUrl=url;currentAudio=new Audio(url);
    const audio=currentAudio,position=activePlayback;audioReady=false;currentSpeaker=speaker;
    const item=track?.items?.[track.index];currentGroupNames=item?.unison?item.unison.map(member=>member.speaker):item?.dialogue?item.turns.map(turn=>turn.speaker):[];
    const groupLevels=currentGroupNames.map(name=>mixerVolume(1,name,mixerState.channels));
    currentGroupLevel=item?.unison?1:groupLevels.length?(groupLevels.every(level=>level===groupLevels[0])?groupLevels[0]:item.groupLevel ?? 1):null;
    renderMixer();applyVolume();
    const AudioContextClass=globalThis.AudioContext || globalThis.webkitAudioContext;
    let mediaSource, gain, stopFollowing, gapHold=null;
    // Speed applies to spoken blocks only. Sound effects, ambience and previews play at normal speed.
    // A unison or dialogue block has several speakers; its first speaker's own speed is used for the whole block.
    currentAudioSpeech=Boolean(item && !item.kind);currentSpeedSpeaker=currentAudioSpeech?primarySpeaker(item,speaker):'';setAudioRate(audio,currentAudioSpeech?playbackRateFor(currentSpeedSpeaker):1);audio.preservesPitch=true;
    const endGap=()=>{gapHold?.cancel();if(voiceGapHold===gapHold)voiceGapHold=null;gapHold=null;};
    try {
    if(AudioContextClass){
      try{
        audioContext ||= new AudioContextClass();await audioContext.resume();
        if(signal.aborted)throw abortError();
        if(normalize && !item?.unison){
          const measured=await playbackLoudness(blob,signal);
          if(signal.aborted)throw abortError();
          currentNormalize=measured.gain;
          if(measured.error)throw measured.error;
        }
        mediaSource=audioContext.createMediaElementSource(audio);gain=audioContext.createGain();currentGain=gain;
        mediaSource.connect(gain);gain.connect(speechOutput());audio.volume=1;applyVolume();
      }catch(error){if(signal.aborted)throw error;playedCapture?.fail(`Speech could not be included: ${error.message}`);status(`${normalize?'Loudness matching':'Volume boost'} unavailable: ${error.message}. Playing at browser volume.`);}
    }
    const seek=()=>{if(offset>0 && Number.isFinite(audio.duration))audio.currentTime=Math.min(offset,Math.max(0,audio.duration-0.05));updateSeekControls();};
    audio.onloadedmetadata=seek;seek();
    let lastSaved=0;
    audio.ontimeupdate=()=>{updateSeekControls();if(activePlayback && Date.now()-lastSaved>POSITION_SAVE_MS){lastSaved=Date.now();savePosition(audio.currentTime);}};
    audio.ondurationchange=updateSeekControls;
      if(signal.aborted)throw abortError();
      await new Promise((resolve,reject)=>{
        let settled=false;
        const done=error=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);audio.onended=null;audio.onerror=null;endGap();syncPlayedAudio();if(currentAudio===audio){finishAudio=null;skipAudio=null;updateNextControls();}error?reject(error):resolve();};
        const cancel=()=>{audio.pause();done(abortError());};finishAudio=cancel;
        skipAudio=()=>{audio.pause();done();};updateNextControls();
        audio.onended=()=>done();audio.onerror=()=>done(new Error('Browser could not decode this provider’s audio. Use WAV or MP3.'));
        signal.addEventListener('abort',cancel,{once:true});
        if(speakerExcluded(speaker) || speaker==='SFX' && config?.enableSfx===false){done();return;}
        if(track)stopFollowing=followSpeech(audio,track);
        audio.onplay=audio.onpause=syncPlayedAudio;
        const startAudio=()=>{const playing=audio.play();syncPlayedAudio();return playing.then(()=>{if(!settled && currentAudio===audio){audioReady=true;updateTransport();}}).catch(error=>done(new Error(error.name==='NotAllowedError'?'Browser blocked audio. Click Play in the mixer to enable playback.':error.message)));};
        const gapMs=track?.gapMs || 0;
        if(gapMs>0){
          // The silence runs before the audio starts. Mixer Play pauses or resumes it, and a block started paused waits for Play.
          audioReady=true;
          gapHold=startVoiceGap(gapMs,paused,()=>{if(settled)return;gapHold=null;voiceGapHold=null;startAudio();});
          voiceGapHold=gapHold;syncPlayedAudio();updateTransport();
        }
        else if(paused){audioReady=true;updateTransport();}
        else startAudio();
      });
    } finally {
      if(activePlayback===position && position)savePosition(audio.currentTime || 0);
      endGap();stopFollowing?.();audio.onloadedmetadata=null;audio.ontimeupdate=null;audio.ondurationchange=null;mediaSource?.disconnect();gain?.disconnect();
      audio.onplay=audio.onpause=null;audio.pause();if(currentAudio===audio){currentAudio=null;currentAudioSpeech=false;currentSpeedSpeaker='';skipAudio=null;currentGain=null;currentNormalize=1;audioReady=false;currentSpeaker='';currentGroupLevel=null;currentGroupNames=[];renderMixer();}syncPlayedAudio();
      URL.revokeObjectURL(url);if(objectUrl===url)objectUrl=null;
    }
  }
  // Pause, Stop and the end of a clip save the exact position; while playing, a
  // save every few seconds keeps resume close without loading the database.
  const POSITION_SAVE_MS=5000;
  function savePosition(seconds=0){
    if(!activePlayback)return;
    const value={...activePlayback,seconds};
    void ctx.settings.set(`position:${value.chatId}`,value).catch(error=>status(`Playback position could not be saved: ${error.message}`,true));
  }
  const speechMembers=segment=>segment.unison?segment.unison.map(member=>({...member,text:segment.text,passageIndex:segment.passageIndex})):segment.turns || [segment];
  const withoutBase=(segment,cast)=>{
    const actor=[...cast.fixed,...(cast.npcs || [])].find(actor=>normalizeName(actor.speaker)===normalizeName(segment.speaker));
    const prefix=actor?.style?`${actor.style}. `:'',style=segment.style || '';
    return {...segment,style:prefix && style.startsWith(prefix)?style.slice(prefix.length):style===actor?.style?'':style,...(segment.unison?{unison:segment.unison.map(member=>withoutBase(member,cast))}:{})};
  };
  const pronunciationActors=snapshot=>[...(snapshot.fixed || []),...(snapshot.npcs ?? snapshot.casts?.[scope(snapshot)] ?? [])];
  const actorFor=(segment,snapshot)=>pronunciationActors(snapshot).find(actor=>normalizeName(actor.speaker)===normalizeName(segment.speaker));
  const speechTextOptions=snapshot=>({speechText:text=>respellNames(text,pronunciationActors(snapshot)),atomicWords:namePronunciations(pronunciationActors(snapshot)).map(rule=>rule.name)});
  function recordingSpeechText(segment,snapshot){return segment.kind?null:speechMembers(segment).map(member=>respellNames(member.text,pronunciationActors(snapshot)));}
  function recordedSpeechMatches(recording,index,snapshot){
    const segment=recording.segments[index];if(segment.kind)return true;
    const before=recording.speechTexts?.[index] ?? speechMembers(segment).map(member=>member.text);
    return JSON.stringify(before)===JSON.stringify(recordingSpeechText(segment,snapshot));
  }
  function synthesisSettings(segment,snapshot){
    if(segment.turns?.length>1){
      if(!segment.dialogue){const single=synthesisSettings({...segment,turns:undefined},snapshot);return {...single,segment:{...single.segment,turns:segment.turns.map(turn=>synthesisSettings(turn,snapshot).segment)}};}
      const requests=segment.turns.map(turn=>synthesisSettings(turn,snapshot)),first=requests[0];
      // Fish cues are already injected into each turn's text. Clear the turn
      // style so a relay cannot prepend a second, conflicting direction.
      const turns=requests.map(request=>detectProvider(request.segment.route)==='fish_audio'?{...request.segment,text:request.text,style:''}:request.segment);
      if(requests.some(request=>request.connection?.id!==first.connection?.id))throw new Error('Different TTS connections must use separate speech requests.');
      const parameters={...first.parameters};
      if(segment.dialogue && first.connection){parameters.turns=turns.map(({speaker,voice,text,style})=>({speaker,voice,text,style}));for(const key of ['voice_direction','speech_style','instructions'])if(Object.hasOwn(parameters,key))parameters[key]='';}
      return {segment:{...segment,text:turns.map(turn=>turn.text).join('\n'),turns},text:requests.map(request=>request.text).join('\n'),connection:first.connection,parameters:{...first.parameters,
        ...parameters}};
    }
    const route=segment.route || scope(snapshot),actor=actorFor(segment,snapshot);
    const connection=nativeConnections.find(c=>`native:${c.id}`===route);
    const supported=nativeProviders.find(provider=>provider.id===connection?.provider)?.capabilities?.parameters || {};
    const family=detectProvider(route);
    const legacyMapping=actor && namePronunciation({speaker:actor.speaker,sayAsName:actor.sayAsName,pronunciation:actor.pronunciation});
    const spoken={...segment,text:respellNames(segment.text,pronunciationActors(snapshot))};
    const delivery=voiceDelivery({segment:spoken,actor:legacyMapping?{...actor,pronunciation:''}:actor,narrator:normalizeName(segment.speaker)==='narrator',family,connection,supported,styleParam:snapshot.styleParam,useStyle:snapshot.useStyle!==false});
    return {segment:{...spoken,route,style:delivery.style},text:delivery.text,connection,parameters:delivery.parameters};
  }
  function unisonLevels(segment){return speechMembers(segment).map(member=>[member.speaker,mixerVolume(1,member.speaker,mixerState.channels),speakerExcluded(member.speaker)]);}
  function cacheKey(segment,snapshot){
    if(segment.unison)return JSON.stringify(['unison',1,snapshot.normalizeLoudness,unisonLevels(segment),speechMembers(segment).map(member=>cacheKey(member,snapshot))]);
    if(segment.kind)return `${segment.kind}:${foleyKey(segment[segment.kind])}`;
    const request=synthesisSettings(segment,snapshot);
    const keyed=detectProvider(request.segment.route)==='fish_audio'?{...request.segment,text:request.text}:request.segment;
    return passageKey(keyed,{...snapshot,defaultRoute:scope(snapshot)},request.connection,request.parameters);
  }
  function nativeSpeakerLimit(connection){
    const capability=nativeProviders.find(item=>item.id===connection?.provider)?.capabilities?.multiSpeaker;
    return capability && (!capability.models || capability.models.includes(connection?.model))?capability.maxSpeakersByModel?.[connection.model] ?? capability.maxSpeakers:0;
  }
  function groupedLimits(segment,route,snapshot){
    if(segment.unison){
      const limits=speechMembers(segment).map(member=>{
        const route=member.route || scope(snapshot),limit=groupedLimits(member,route,snapshot),request=synthesisSettings(member,snapshot);
        const delivery=[request.segment.style,...Object.values(request.parameters).filter(value=>typeof value==='string')].join('\n');
        return {...limit,maxChars:limit.maxChars-(detectProvider(route)==='fish_audio'?delivery.length+4:0),maxBytes:limit.maxBytes?limit.maxBytes-new TextEncoder().encode(delivery).length:Infinity};
      });
      return {...speechTextOptions(snapshot),maxChars:Math.min(...limits.map(limit=>limit.maxChars)),maxBytes:Math.min(...limits.map(limit=>limit.maxBytes ?? Infinity))};
    }
    const request=synthesisSettings(segment,snapshot),connection=request.connection;
    const provider=nativeProviders.find(item=>item.id===connection?.provider);
    const family=detectProvider(route),limits=speechRequestLimits(connection?.provider,connection?.model);
    const prebuilt=GEMINI_VOICES.some(voice=>voice.id===segment.voice);
    // Gemini's multi-speaker audio is one clip: normalize that clip instead of
    // undoing grouping. Fish retains its existing per-voice matching.
    const sharedLoudness=!snapshot.normalizeLoudness || family==='gemini';
    const compatibleVoice=family==='fish_audio' || family==='gemini' && prebuilt || provider?.capabilities.staticVoices?.some(voice=>voice.id===segment.voice);
    const maxSpeakers=voiceGapSetting()===0 && sharedLoudness && compatibleVoice?nativeSpeakerLimit(connection):0;
    const parameters={...request.parameters};
    if(maxSpeakers && (['gemini','fish_audio'].includes(family) || connection?.provider==='openrouter_tts')){delete parameters.speech_style;delete parameters.instructions;delete parameters.voice_direction;}
    const level=mixerVolume(1,segment.speaker,mixerState.channels);
    return {...limits,...speechTextOptions(snapshot),maxSpeakers,group:JSON.stringify([parameters,level,maxSpeakers,playbackRateFor(segment.speaker)]),
      measure:turns=>{
        const styled=turns.map(turn=>{const request=synthesisSettings(turn,snapshot);return family==='fish_audio'?{...request.segment,text:request.text}:request.segment;});
        const text=styled.map((turn,index)=>family==='fish_audio'
          ? `${maxSpeakers?`<|speaker:${index}|>`:''}${turn.text}`:turn.text).join('\n');
        const styles=family==='fish_audio'?'':styled.map(turn=>turn.style || '').join('');
        const effective={...connection?.default_parameters,...request.parameters};
        const nativeStyle=family==='gemini' && connection?String(effective.speech_style ?? effective.instructions ?? 'casual, relaxed conversation, natural pacing, understated expression'):'';
        return {chars:text.length,bytes:new TextEncoder().encode(text+styles+nativeStyle.repeat(turns.length)).length};
      }};
  }
  function updateGroupingStatus(){
    const node=$('groupingStatus');if(!node)return;
    if(plan)$('planSummary').textContent=`Speech plan · ${plan.segments.length} spoken blocks`;
    node.hidden=true;if(!config?.batchSpeech)return;
    const route=scope(config),connection=nativeConnections.find(item=>`native:${item.id}`===route);
    const maxSpeakers=nativeSpeakerLimit(connection);
    const name=connection?.name || 'This connection';
    const reasons=[];
    if(config.normalizeLoudness && detectProvider(route)==='gemini' && maxSpeakers)reasons.push('Gemini dialogue is loudness-matched as one clip, rather than per character.');
    else if(config.normalizeLoudness && detectProvider(route)!=='gemini')reasons.push('Loudness matching keeps different voices in separate clips so each can be balanced.');
    if(voiceGapSetting()>0)reasons.push('Gap between voices keeps spoken turns separate. Set the gap to 0 to allow shared dialogue clips.');
    const members=plan?.segments?.filter(segment=>!segment.kind).flatMap(speechMembers).filter(segment=>!speakerExcluded(segment.speaker)) || [];
    if(new Set(members.map(segment=>segment.route || route)).size>1)reasons.push('Different TTS connections use separate calls.');
    const byRoute=new Map();for(const member of members){const key=member.route || route;if(!byRoute.has(key))byRoute.set(key,[]);byRoute.get(key).push(member);}
    for(const voices of byRoute.values()){
      if(new Set(voices.map(segment=>mixerVolume(1,segment.speaker,mixerState.channels))).size>1)reasons.push('Different channel volumes keep those voices in separate clips.');
      if(new Set(voices.map(segment=>playbackRateFor(segment.speaker))).size>1)reasons.push('Different character speeds keep those voices in separate clips.');
    }
    const capability=maxSpeakers?`${name} can combine up to ${maxSpeakers} ${detectProvider(route)==='gemini'?'preset ':''}voices per call.${detectProvider(route)==='gemini'?' The narrator counts as a speaker.':''}`:`${name}'s Lumiverse relay advertises one voice per call; different assigned voices need separate calls.${detectProvider(route)==='gemini'?' Multi-speaker support must be installed on this Lumiverse server for the selected model; updating Choir alone cannot enable it.':''}`;
    const explanation=[...new Set([...reasons,capability])].join(' ');
    node.title=explanation;node.textContent=`Grouping enabled. ${explanation}`;node.hidden=false;
    if(plan?.segments?.length){
      try{const batches=playbackBatches(plan.segments.map((segment,passageIndex)=>({...segment,passageIndex})),config);
        const speech=batches.filter(batch=>!batch.kind).length;
        $('planSummary').textContent=`Speech plan · ${plan.segments.filter(segment=>!segment.kind).length} text turns · ${speech} speech ${speech===1?'clip':'clips'}`;
        const requests=batches.filter(batch=>!batch.kind).reduce((sum,batch)=>sum+(batch.unison?.length || 1),0);
        node.textContent=`This plan: ${speech} speech ${speech===1?'batch':'batches'}${requests>speech?` (up to ${requests} TTS calls)`:''}. ${explanation}`;
      }catch{}
    }
  }
  function ttsBatches(segments,snapshot){
    // Clip sizes follow the plan's effects, not the SFX toggle, so toggling keeps cached speech.
    if(snapshot.batchSpeech)return groupedSpeechBatches(segments,snapshot.chunk,scope(snapshot),(segment,route)=>groupedLimits(segment,route,snapshot),{sfx:segments.some(segment=>segment.kind==='sfx')})
      .map(batch=>batch.dialogue?{...batch,groupLevel:mixerVolume(1,batch.turns[0].speaker,mixerState.channels)}:batch);
    return speechBatches(segments,snapshot.chunk,scope(snapshot),(segment,route)=>{
      if(segment.unison)return groupedLimits(segment,route,snapshot);
      if(segment.kind)return {maxChars:MAX_SPEECH_CHARS};
      const connection=nativeConnections.find(item=>`native:${item.id}`===route);
      const limits=speechRequestLimits(connection?.provider,connection?.model);
      const request=synthesisSettings(segment,snapshot),prefix=request.text.slice(0,Math.max(0,request.text.length-request.segment.text.length));
      if(limits.maxBytes){
        const delivery=[prefix,...Object.values(request.parameters)].filter(value=>typeof value==='string').join('\n');
        limits.maxBytes-=new TextEncoder().encode(delivery || '').length;
        if(limits.maxBytes<80)throw new Error('Shorten the Gemini delivery instructions to leave room for speech text.');
      }
      limits.maxChars-=prefix.length+(detectProvider(route)==='fish_audio' && request.parameters.voice_direction?request.parameters.voice_direction.length+3:0);
      return {...limits,...speechTextOptions(snapshot)};
    });
  }
  const SFX_PLACEMENT_VERSION=1;
  const outdatedSfxRecording=recording=>config.enableSfx!==false && recording.sfxPlacement!==SFX_PLACEMENT_VERSION && recording.segments?.some(segment=>segment.kind==='sfx');
  function playbackBatches(segments,snapshot,{filterMuted=true}={}){
    const sound=(kind,speaker,text,cue)=>({kind,speaker,voice:'',text,route:kind,[kind]:cue});
    let spoken=0,lastEffect=-Infinity;
    const expanded=segments.flatMap(segment=>{
      const {sfx,ambience,music,...speech}=segment;
      const segmentStart=spoken;spoken+=speech.text.length;
      // Every planned sound cuts the speech, whether or not its kind is switched
      // on: speech clips, their cache keys and groups then do not change with the
      // toggles. The player skips switched-off sounds (playbackExcluded).
      const points=[
        ...(music || []).map(entry=>sound('music','Music',entry.stop?'[Music stop]':`[Music: ${musicLabel(entry)}]`,entry)),
        ...(ambience || []).map(entry=>sound('ambience','Ambience',entry.stop?'[Ambience stop]':`[Ambience: ${entry.query}]`,entry.stop?entry:{...entry,filter:AMBIENCE_FILTER})),
        // Plans saved before unmatched effects were dropped may still hold them.
        ...(sfx || []).filter(cue=>cue.trigger).map(cue=>sound('sfx','SFX',`[SFX: ${cue.query}]`,cue))
      ];
      if(!points.length)return [speech];
      // Effects use complete phrase boundaries; background beds keep their exact anchors.
      const parts=[];let start=0;
      const placed=points.map(part=>{
        const anchor=Math.max(0,cueOffset(speech.text,part[part.kind].trigger));
        return {part,anchor,at:part.kind==='sfx'?sfxCueOffset(speech.text,part.sfx.trigger):anchor};
      }).sort((a,b)=>a.at-b.at);
      const spaced=spaceSoundEffects(placed,{start:segmentStart,last:lastEffect});lastEffect=spaced.last;
      for(const {part,at,anchor} of spaced.kept){
        const head=speech.text.slice(start,Math.max(start,at)).trim();
        if(head)parts.push({...speech,text:head});
        parts.push({...part,passageIndex:segment.passageIndex,moment:speech.text.slice(Math.max(0,anchor-60),anchor+240)});
        start=Math.max(start,at);
      }
      const tail=speech.text.slice(start).trim();
      return tail?[...parts,{...speech,text:tail}]:parts;
    }).flatMap(segment=>{
      if(!segment.unison || !filterMuted)return [segment];
      const unison=segment.unison.filter(member=>!speakerExcluded(member.speaker));
      return unison.length>1?[{...segment,unison,mixLevels:unison.map(member=>[member.speaker,mixerVolume(1,member.speaker,mixerState.channels),false]),mixNormalize:snapshot.normalizeLoudness}]:unison.length?[{...segment,...unison[0],unison:undefined}]:[];
    }).filter(segment=>!(filterMuted && (snapshot.batchSpeech?speakerExcluded(segment.speaker):snapshot.muteNarrator && normalizeName(segment.speaker)==='narrator')));
    const batches=ttsBatches(expanded,snapshot),chunks=new Map();
    return batches.map(batch=>{const passage=batch.passageIndex,chunkIndex=chunks.get(passage) || 0;chunks.set(passage,chunkIndex+1);return {...batch,chunkIndex};});
  }
  const foleyKey=sound=>JSON.stringify(sound?.feels?[sound.feels,sound.genres,sound.keywords]:[sound?.query || 'thump',sound?.filter || 'duration:[0.2 TO 4]']);
  const freesoundKey=snapshot=>(snapshot.freesoundApiKey || $('freesoundApiKey')?.value || '').trim();
  const soundsEnabled=snapshot=>snapshot.enableSfx!==false || snapshot.enableAmbience!==false;
  const soundCuesWanted=snapshot=>soundsEnabled(snapshot) && Boolean(freesoundKey(snapshot)) || snapshot.enableMusic===true;
  const missingFoleyKey=snapshot=>soundsEnabled(snapshot) && !freesoundKey(snapshot)?'Sound effects and ambience need a Freesound API key in Playback → Soundscape. Speech continues.':'';
  async function chooseSoundCues(segments,signal,onStage=status,currentMusic){
    onStage('Choosing sound effects…');
    const result=await rpc('sfx',{segments:segments.map(({speaker,text})=>({speaker,text})),connectionId:config.planner,music:config.enableMusic===true,...(currentMusic?{currentMusic}:{})},signal,60000,
      progress=>onStage(`Choosing sound effects: ${progress.stage}${progress.model?` · ${progress.model}`:''}`));
    // Music alone needs no Freesound key; Freesound sounds without one would only fail later.
    return freesoundKey(config)?result:{...result,cues:[],ambience:[]};
  }
  // Sound effects are optional: a failed choice never blocks speech.
  // The music playing at the end of earlier text, so the next sound request keeps it unless the scene changes.
  const lastMusic=entries=>{const entry=(entries || []).filter(entry=>!entry.stop).at(-1);return entry && {title:'',feels:entry.feels};};
  async function cuePlannedSegments(segments,ctrl,token){
    if(!soundCuesWanted(config))return {segments,checked:false};
    const currentMusic=continuousMusic() && beds.music && {title:beds.music.title || '',feels:beds.music.feels};
    try{return {segments:applySoundCues(segments,await chooseSoundCues(segments,ctrl.signal,status,currentMusic)),checked:true};}
    catch(error){
      if(ctrl.signal.aborted || token!==revision)throw error;
      const warning=`SFX skipped: ${error.message}. Speech continues. Use Plan latest to retry sound-effect choices.`;
      showFoleyStatus(warning);return {segments,checked:false,warning};
    }
  }
  const foleyWarning=warnings=>warnings?.length?` SFX skipped: ${warnings.join('; ')}.`:'';
  function showFoleyStatus(message='',error=true){
    if(disposed)return;
    $('sfxStatus').hidden=!message;$('sfxStatus').textContent=message;$('sfxStatus').classList.toggle('et-error',Boolean(message) && error);
  }
  async function synthesizeSpeechBlob(segment,snapshot,signal){
    if(signal.aborted)throw abortError();
    const request=synthesisSettings(segment,snapshot),route=segment.route || scope(snapshot);
    const connection=request.connection;
    if(!connection)throw new Error(`TTS connection for ${segment.speaker} is no longer available. Choose another connection and plan again.`);
    return nativeSpeech(connection,{voice:segment.voice,text:request.text,parameters:request.parameters},signal,segment.speaker,'Speech playback');
  }
  async function synthesizeUnisonBlob(segment,snapshot,signal,loadMember){
    const Context=globalThis.AudioContext || globalThis.webkitAudioContext;
    if(!Context)throw new Error('This browser cannot mix simultaneous voices.');
    audioContext ||= new Context();const tracks=[];
    for(const member of speechMembers(segment)){
      signal.throwIfAborted();
      const audio=await loadMember(member);
      signal.throwIfAborted();
      const decoded=await audioContext.decodeAudioData(await audio.arrayBuffer());
      signal.throwIfAborted();
      tracks.push({channels:Array.from({length:decoded.numberOfChannels},(_,index)=>decoded.getChannelData(index)),level:mixerVolume(1,member.speaker,mixerState.channels)});
    }
    return new Blob([mixUnisonAudio(tracks,audioContext.sampleRate,{normalize:snapshot.normalizeLoudness})],{type:'audio/wav'});
  }
  // Request every clip needed within this much playback, beyond the Prefetch
  // count, so a long clip after short ones is ready when its turn comes.
  const LOOKAHEAD_SECONDS=45;
  // How long speech waits for a sound effect that is still downloading.
  const SFX_WAIT_MS=1000;
  function createStreamingPlayer(snapshot,source,cached,ctrl,token,{pruneStale=false,retain=[],mix=null,fullMessage=false}={}) {
    const recordingMetadata={createdAt:cached?.createdAt ?? Date.now(),...(cached?.expiresAt===null || Number.isFinite(cached?.expiresAt)?{expiresAt:cached.expiresAt}:{}),recordingState:cached?.recordingState,fullMessage};
    const segments=[];
    const warnings=new Set();
    const warnFoley=error=>{warnings.add(error.message);if(token===revision)showFoleyStatus(`SFX skipped: ${[...warnings].join('; ')}. Speech continues.`);};
    const ready=new Map();
    const resolvers=new Map();
    const synthesisStages=new Map();
    const synthesisStatus=(index,format)=>{synthesisStages.set(index,format);if(token===revision && index===playIdx && !currentAudio)status(format());};
    let nextToSynthesize=0;
    const synthesisQueues=[{pending:[],active:0,limit:Math.max(1,Number(snapshot.concurrency)||1)},{pending:[],active:0,limit:1}];
    let isDoneAdding=false;
    let wakePlayback=null;
    const blobs=[];
    let playIdx=0,failed=false,saveError='',saveQueue=Promise.resolve(),savedPlayedAudio=cached?.playedAudio;
    const waitForSaves=()=>new Promise((resolve,reject)=>{
      const cancel=()=>reject(abortError());
      if(ctrl.signal.aborted){cancel();return;}
      ctrl.signal.addEventListener('abort',cancel,{once:true});
      saveQueue.then(resolve,reject).finally(()=>ctrl.signal.removeEventListener('abort',cancel));
    });
    const skipped=new Set(),failures=new Set(),scheduled=new Set();let jumpTo=null,pauseNext=false,initialized=false,resumePending=Boolean(source.resume),wakePolicy;
    const blockStart=(index)=>{const passage=segments[index]?.passageIndex ?? index;while(index>0 && (segments[index-1].passageIndex ?? index-1)===passage)index--;return index;};
    advancePlayback=(direction=1)=>{
      if(ctrl.signal.aborted || token!==revision || !skipAudio || !activePlayback)return;
      mix?.markDiscontinuous();
      const passage=segments[playIdx]?.passageIndex ?? playIdx;let next=playIdx+1;
      while(next<segments.length && (segments[next].passageIndex ?? next)===passage)next++;
      for(let index=playIdx;index<next;index++)skipped.add(index);
      // Requests for the part being skipped would only delay what plays next.
      if(direction>0)cancelSkipped(playIdx,next);
      if(direction<0){const start=blockStart(playIdx);next=start>0?blockStart(start-1):0;while(next>0 && speakerExcluded(segments[next].speaker))next=blockStart(next-1);if(speakerExcluded(segments[next]?.speaker))next=blockStart(playIdx);for(let index=next;index<segments.length && (segments[index].passageIndex ?? index)===(segments[next].passageIndex ?? next);index++)skipped.delete(index);}
      failed=[...failures].some(index=>!skipped.has(index) && !speakerExcluded(segments[index].speaker));jumpTo=next;pauseNext=heldPaused();skipAudio();
    };
    generationPolicyChanged=()=>{failed=[...failures].some(index=>!skipped.has(index) && !playbackExcluded(segments[index]));if(currentSpeaker==='SFX' && config?.enableSfx===false){pauseNext=heldPaused();skipAudio?.();}nextToSynthesize=Math.min(nextToSynthesize,playIdx);wakePolicy?.({policy:true});pump();};
    const passages={...(cached?.passages || {})};
    const inflight=new Map(),jobs=new Map();
    // Free a skipped clip's slot so going back later can request it again.
    const releaseSlot=index=>{scheduled.delete(index);ready.delete(index);resolvers.delete(index);};
    function cancelSkipped(from,to){
      for(let index=from;index<to;index++){
        if(index===playIdx)continue;
        const job=jobs.get(index);
        if(job){job.abort();continue;}
        for(const queue of synthesisQueues){const at=queue.pending.indexOf(index);if(at>=0){queue.pending.splice(at,1);releaseSlot(index);}}
      }
    }
    // Upgrade old complete recordings without discarding their audio.
    if(!cached?.passages)for(const [index,segment] of (cached?.segments || []).entries())if(cached.blobs?.[index] && (!segment.turns || segment.turns.length===1) && recordedSpeechMatches(cached,index,snapshot))passages[cacheKey(segment,snapshot)]=cached.blobs[index];
    // Only audio present before this playback is free to skip in the lookahead
    // budget. Newly prepared clips still count, keeping generation bounded.
    const cachedSpeechKeys=new Set(Object.keys(passages));
    let currentKeys=null,savedKeys=null;
    const currentPassageKeys=()=>currentKeys ||= (()=>{
      const keys=new Set();
      // `retain` is the unfiltered plan. It keeps audio for speakers currently
      // set to No voice, so turning them back on can reuse what was cached.
      for(const segment of [...segments,...retain]){
        try{keys.add(cacheKey(segment,snapshot));}catch{}
        if(segment.unison)for(const member of speechMembers(segment))try{keys.add(cacheKey(member,snapshot));}catch{}
      }
      return [...keys];
    })();
    const previousPassageKeys=()=>cached?.passageKeys || Object.keys(cached?.passages || {});
    const savedPassageKeys=()=>savedKeys ||= pruneStale?currentPassageKeys():[...new Set([...previousPassageKeys(),...currentPassageKeys()])];
    // A full replay keeps the current plan and the immediately previous
    // generation, so one voice, route, mode or text change can be undone
    // without paying for the same speech again. Older generations are dropped,
    // which bounds the record at two plans. Section playback keeps every clip.
    const pruneStalePassages=()=>{
      if(!pruneStale)return;
      const keep=new Set(currentPassageKeys());
      for(const key of previousPassageKeys())keep.add(key);
      for(const key of Object.keys(passages))if(!keep.has(key))delete passages[key];
    };
    const persist=()=>{
      const value={...recordingMetadata,content:source.content,transcript:source.transcript,segments:[...segments],blobs:[...blobs],speechTexts:segments.map(segment=>recordingSpeechText(segment,snapshot)),passages:{...passages},passageKeys:isDoneAdding?savedPassageKeys():(cached?.passageKeys || []),playedAudio:savedPlayedAudio,sfxPlacement:SFX_PLACEMENT_VERSION,retention:snapshot.retention};
      // Submit in order, but do not make synthesis or audible playback wait for
      // disk commits. IndexedDB orders these read/write transactions itself.
      const saving=recordingStore('put',recordingKey(source.chatId,source.messageId),value).catch(error=>{saveError=error.message;});
      saveQueue=Promise.all([saveQueue,saving]).then(()=>{});
      return saveQueue;
    };
    // Beds load beside the speech queue, so a slow download never delays the words.
    const bedLoads=new Map();
    const loadBed=index=>{
      if(!bedLoads.has(index))bedLoads.set(index,(async()=>{
        const seg=segments[index],key=cacheKey(seg,snapshot);
        const signal=seg.kind==='music' && continuousMusic()?bedPrefetch.signal:ctrl.signal;
        const source=passages[key] ||= await fetchFoleyAudio(seg,snapshot,signal);
        // Persist the bytes, not just the selected URL. Cached replay should
        // not have to download a whole music track again before it can play.
        if(seg.kind==='music')await musicAudioBlob(source,signal);
        blobs[index]=source;
        void persist();return blobs[index];
      })().catch(error=>{if(!ctrl.signal.aborted && token===revision)warnFoley(error);throw error;}));
      return bedLoads.get(index);
    };

    ctrl.signal.addEventListener('abort',()=>{wakePlayback?.();wakePolicy?.({policy:true});},{once:true});

    function ensureSlot(index) {
      if(!ready.has(index)) {
        let res;
        const p=new Promise(r=>res=r);
        ready.set(index,p);
        resolvers.set(index,res);
      }
    }

    function pump() {
      const prefetchEnd=speechLookaheadEnd(segments,playIdx,Number(snapshot.prefetch ?? 1),{
        excluded:playbackExcluded,horizonSeconds:LOOKAHEAD_SECONDS,cached:segment=>{try{return cachedSpeechKeys.has(cacheKey(segment,snapshot));}catch{return false;}}
      });
      while(!failed && !ctrl.signal.aborted && nextToSynthesize<segments.length && nextToSynthesize<=prefetchEnd) {
        const idx=nextToSynthesize++;
        if(playbackExcluded(segments[idx]))continue;
        if(isBed(segments[idx])){if(!segments[idx][segments[idx].kind].stop)loadBed(idx).catch(()=>{});continue;}
        if(scheduled.has(idx))continue;scheduled.add(idx);
        ensureSlot(idx);
        if(blobs[idx]){
          synthesisStatus(idx,()=>`Loading cached audio ${audioProgress(segments,idx)}: ${segments[idx].speaker}`);
          resolvers.get(idx)({blob:blobs[idx]});continue;
        }
        synthesisQueues[segments[idx].kind==='sfx'?1:0].pending.push(idx);
      }
      // Effects are short downloads on their own queue: fetch every one now so
      // each is ready by its moment instead of starting a clip or two before it.
      if(!ctrl.signal.aborted)for(let idx=playIdx;idx<segments.length;idx++){
        if(segments[idx].kind!=='sfx' || scheduled.has(idx) || playbackExcluded(segments[idx]))continue;
        scheduled.add(idx);ensureSlot(idx);
        if(blobs[idx]){resolvers.get(idx)({blob:blobs[idx]});continue;}
        synthesisQueues[1].pending.push(idx);
      }
      // Cached clips need neither a synthesis worker nor another disk write.
      // Decode only nearby audio, even when a missing request lies farther on.
      const prepareEnd=speechLookaheadEnd(segments,playIdx,Number(snapshot.prefetch ?? 1),{excluded:playbackExcluded});
      for(let index=playIdx;index<=prepareEnd && index<segments.length;index++)if(blobs[index] && !isBed(segments[index]) && !playbackExcluded(segments[index]))preparePlayback(blobs[index],segments[index],snapshot);
      // Effects download separately and cannot occupy a paid TTS request slot.
      for(const queue of synthesisQueues)while(!ctrl.signal.aborted && (!failed || queue===synthesisQueues[1]) && queue.active<queue.limit && queue.pending.length){
        const idx=queue.pending.shift();
        if(playbackExcluded(segments[idx])){resolvers.get(idx)({skip:true});scheduled.delete(idx);ready.delete(idx);resolvers.delete(idx);continue;}
        queue.active++;
        // Each request can be cancelled alone (Next) as well as with the playback.
        const job=new AbortController(),stopJob=()=>job.abort();
        ctrl.signal.addEventListener('abort',stopJob,{once:true});jobs.set(idx,job);
        (async()=>{
          let resolveFlight,rejectFlight,flightKey;
          try {
            const seg=segments[idx];
            if(job.signal.aborted)throw abortError();
            synthesisStatus(idx,()=>seg.kind==='sfx'?`Loading sound effect ${audioProgress(segments,idx)}`:`Synthesizing ${audioProgress(segments,idx)}: ${seg.speaker} · ${seg.voice}`);
            const request=synthesisSettings(seg,snapshot),key=cacheKey(seg,snapshot);
            let blob=passages[key];
            // A shared request cancelled by Next leaves this clip to request the audio itself.
            if(!blob && inflight.has(key))blob=await inflight.get(key).catch(error=>{if(error?.name==='AbortError' && !ctrl.signal.aborted)return undefined;throw error;});
            if(!blob){flightKey=key;const promise=new Promise((resolve,reject)=>{resolveFlight=resolve;rejectFlight=reject;});promise.catch(()=>{});inflight.set(key,promise);}
            if(blob) {
              synthesisStatus(idx,()=>`Loading cached audio ${audioProgress(segments,idx)}: ${seg.speaker}`);
            } else if(seg.kind==='sfx') {
              blob=await fetchFoleyAudio(seg,snapshot,job.signal);
            } else if(seg.unison){
              blob=await synthesizeUnisonBlob(seg,snapshot,job.signal,async member=>{
                const memberKey=cacheKey(member,snapshot);
                let audio=passages[memberKey];
                if(!audio){audio=await synthesizeSpeechBlob(member,snapshot,job.signal);passages[memberKey]=audio;void persist();}
                return audio;
              });
            } else {
              blob=await synthesizeSpeechBlob(seg,snapshot,job.signal);
            }
            if(token!==revision || job.signal.aborted)throw abortError();
            resolveFlight?.(blob);
            blobs[idx]=blob;passages[key]=blob;
            preparePlayback(blob,seg,snapshot);
            void persist();
            void refreshCacheStatus().catch(()=>{});
            resolvers.get(idx)({blob});
          } catch(error) {
            rejectFlight?.(error);
            // Cancelled by Next: not a failure; the slot is free if playback returns.
            if(job.signal.aborted && !ctrl.signal.aborted && token===revision)releaseSlot(idx);
            else if(segments[idx].kind==='sfx' && !ctrl.signal.aborted && token===revision){warnFoley(error);resolvers.get(idx)({skip:true});}
            else{failures.add(idx);if(!skipped.has(idx) && !speakerExcluded(segments[idx].speaker))failed=true;resolvers.get(idx)({error});}
          } finally {
            if(flightKey)inflight.delete(flightKey);
            jobs.delete(idx);ctrl.signal.removeEventListener('abort',stopJob);
            queue.active--;
            pump();
          }
        })();
      }
    }

    function push(newSegments) {
      // Beds load as soon as they are known, so a new bed is ready when its marker plays.
      for(const s of newSegments){
        const index=segments.push(s)-1;
        // Resuming starts playback later, but a complete recording must still
        // retain earlier audio that already exists in the passage cache.
        try{const saved=passages[cacheKey(s,snapshot)];if(saved)blobs[index]=saved;}catch{}
        if(isBed(s) && !s[s.kind].stop && !playbackExcluded(s))loadBed(index).catch(()=>{});
      }
      currentKeys=null;savedKeys=null;
      mixerPlaybackSegments=segments;
      if(!initialized && segments.length){initialized=true;if(source.resume){const start=segments.findIndex(segment=>segment.passageIndex>source.resume.passage || (segment.passageIndex===source.resume.passage && segment.chunkIndex>=(source.resume.chunk || 0)));playIdx=start<0?segments.length:start;nextToSynthesize=playIdx;}}
      pump();
      wakePlayback?.();
    }

    function finish() {
      isDoneAdding=true;
      pruneStalePassages();
      wakePlayback?.();
    }

    const playbackPromise=(async()=>{
      while(!ctrl.signal.aborted) {
        if(playIdx>=segments.length) {
          if(isDoneAdding)break;
          await new Promise(resolve=>{wakePlayback=resolve;});
          wakePlayback=null;
          continue;
        }
        if(playbackExcluded(segments[playIdx]) || isBed(segments[playIdx])){playIdx++;nextToSynthesize=Math.max(nextToSynthesize,playIdx);pump();continue;}
        ensureSlot(playIdx);pump();
        status(synthesisStages.get(playIdx)?.() || `Waiting for audio ${audioProgress(segments,playIdx)}: ${segments[playIdx].speaker}`);updateTransport();
        // Speech never waits long for an effect: a late one is skipped and keeps
        // downloading, so Replay still has it.
        const late=segments[playIdx].kind==='sfx'?new Promise(resolve=>setTimeout(()=>resolve({skip:true,late:true}),SFX_WAIT_MS)):null;
        const outcome=await Promise.race([ready.get(playIdx),new Promise(resolve=>{wakePolicy=resolve;}),...(late?[late]:[])]);wakePolicy=null;
        if(outcome.policy)continue;
        if(token!==revision || ctrl.signal.aborted)throw abortError();
        if(outcome.skip){playIdx++;nextToSynthesize=Math.max(nextToSynthesize,playIdx);pump();continue;}
        if(outcome.error){await waitForSaves();throw new Error(`${outcome.error.message} Completed passages were retained.${saveError?` Storage failed: ${saveError}`:''}`);}
        const blob=outcome.blob;
        const seg=segments[playIdx];
        status(`Playing ${audioProgress(segments,playIdx)}: ${seg.speaker}`);
        activePlayback={chatId:source.chatId,messageId:source.messageId,content:source.content,passage:seg.passageIndex ?? playIdx,chunk:seg.chunkIndex ?? 0};
        const offset=resumePending && source.resume.passage===activePlayback.passage && source.resume.chunk===activePlayback.chunk?source.resume.seconds:0;resumePending=false;
        const paused=pauseNext;pauseNext=false;
        for(const kind in beds){const marker=bedIndex(segments,playIdx,kind);followBed(segments[marker]?.[kind],()=>loadBed(marker),kind,()=>{delete passages[cacheKey(segments[marker],snapshot)];blobs[marker]=undefined;void persist();});}
        try{await playBlob(blob,ctrl.signal,seg.speaker,offset,snapshot.normalizeLoudness,paused,{messageId:source.messageId,items:segments,index:playIdx,gapMs:gapBefore(segments,playIdx)});}
        catch(error){
          if(seg.kind!=='sfx' || ctrl.signal.aborted || token!==revision)throw error;
          warnFoley(error);delete passages[cacheKey(seg,snapshot)];blobs[playIdx]=undefined;dropVolatileSource(cacheKey(seg,snapshot));await persist();
        }
        const previous=playIdx;playIdx=jumpTo ?? playIdx+1;jumpTo=null;nextToSynthesize=playIdx<previous?Math.min(nextToSynthesize,playIdx):Math.max(nextToSynthesize,playIdx);
        activePlayback={...activePlayback,passage:segments[playIdx]?.passageIndex ?? (activePlayback.passage+1),chunk:segments[playIdx]?.chunkIndex ?? 0,complete:isDoneAdding && playIdx===segments.length};
        savePosition(0);activePlayback=null;pump();
      }
      // End at the last played clip, before waiting for device storage. Looped
      // music may keep playing between messages but belongs to this file only
      // for the duration of this message.
      const playedAudio=await mix?.finish();if(playedCapture===mix)playedCapture=null;
      // A carried music load can save its cache after foreground playback
      // finishes. That late write must retain the newly completed mix.
      if(playedAudio)savedPlayedAudio={...playedAudio,content:source.content,complete:fullMessage && mix.continuous};
      await waitForSaves();
      if(saveError)status(`Audio could not be saved: ${saveError}`,true);
      return {blobs,segments,warnings:[...warnings],passages,passageKeys:savedPassageKeys(),playedAudio:playedAudio?savedPlayedAudio:null,recordingMetadata};
    })().finally(()=>{if(token===revision)fadeOutBeds();});

    // Observe failures immediately while the next planning section is pending.
    playbackPromise.catch(()=>{failed=true;});
    return {push,finish,playbackPromise};
  }
  async function play(options={}) {
    status('Checking playback settings…');
    // A chat load or connection switch in progress reloads voices; finish it first.
    await voicesLoading;if(disposed)return;
    const preflightRevision=revision,preflightChat=chatId,preflightStops=visibleStops;
    await flushSettings();
    const retentionChat=chatId,retentionEdit=settingsEdit;
    const latestPreferences=await ctx.settings.get(GLOBAL_SETTINGS_KEY).catch(()=>null);
    if(disposed || preflightChat!==chatId)return;
    if(preflightRevision!==revision){
      // A settings change (a new provider's voices loading, say) stopped playback
      // while this Play waited for saving. Start again rather than ignoring the click.
      if(options.automaticReply || visibleStops!==preflightStops)return;
      if(!options.restarted)return play({...options,restarted:true});
      status('Settings changed while starting playback. Press Play again.');return;
    }
    if(retentionChat===chatId && retentionEdit===settingsEdit && latestPreferences?.retention){config.retention=latestPreferences.retention;$('retention').value=latestPreferences.retention;preferenceBaseline.retention=latestPreferences.retention;}
    const automatic=options.automaticReply;
    if(automatic && (autoReplyActive!==automatic || automatic.token!==revision || !config.auto))return;
    if(!plan || !planSource)throw new Error('Plan a message first.');
    if(chatId!==planSource.chatId || !sameSpeech(ctx.messages.getContent(planSource.messageId),planSource.content)) {
      clearPlan();throw new Error('Message or swipe changed. Generate a fresh plan.');
    }
    config=capture();
    if(planAttribution){
      const cast=casting(config);
      if(needsVoiceSelection(planAttribution,cast)){
        if(automatic){status('Auto-play skipped: plan this reply to choose its voices.');return;}
        const source={...planSource};
        const operation=prepare(source.messageId,false,undefined,true),token=revision;
        await operation;
        if(token===revision && plan && chatId===source.chatId && planSource?.messageId===source.messageId && planSource.content===source.content)return play(options);
        return;
      }
      const restored=restoreAttribution(planAttribution,planSource.transcript,cast),chosen=rememberPlanCast(restored);
      plan={...restored,warning:plan.warning};if(chosen)renderCast();renderPreview();
      if(chosen){
        const source=planSource,token=revision;
        await persistConfig(source.chatId,config);
        if(disposed || token!==revision || source!==planSource)return;
      }
    }
    stop(false,false,true);const token=revision;const ctrl=new AbortController();controller=ctrl;
    if(automatic)automatic.token=token;
    const snapshot=structuredClone(capture());
    snapshot.audioScope={chatId:planSource.chatId,messageId:planSource.messageId};
    // Playback uses saved choices. Optional LLM work belongs to an explicit plan,
    // so old recordings and failed effect choices cannot hold up replay.
    showFoleyStatus(soundsEnabled(snapshot)?planSource.soundCueWarning || missingFoleyKey(snapshot):'',Boolean(planSource.soundCueWarning));
    const resume=options.resume?await ctx.settings.get(`position:${chatId}`):null;
    if(token!==revision || ctrl.signal.aborted)throw abortError();
    const validResume=resume?.messageId===planSource.messageId && sameSpeech(resume.content,planSource.content) && !resume.complete?resume:null;
    // Only a whole-message playback can safely discard other saved clips.
    const fullPlayback=options.clip===undefined && options.indices===undefined;
    const selected=plan.segments.flatMap((segment,index)=>options.indices && !options.indices.includes(index)?[]:[{...segment,passageIndex:index}]);
    // Keep every clip the plan can produce, including speakers and sound types
    // currently switched off, so changing those controls can reuse cached audio.
    const retain=fullPlayback?playbackBatches(selected,{...snapshot,enableSfx:true,enableAmbience:true,enableMusic:true},{filterMuted:false}):[];
    let segments=snapshot.batchSpeech?playbackBatches(selected,snapshot):selected.flatMap(segment=>playbackBatches([segment],snapshot));
    if(options.clip!==undefined){
      if(!snapshot.batchSpeech || !Number.isInteger(options.clip) || !segments[options.clip] || isBed(segments[options.clip]))throw new Error('This audio clip changed. Choose a current clip.');
      segments=[segments[options.clip]];
    }
    if(!segments.some(segment=>!speakerExcluded(segment.speaker))){controller=null;status('All characters have No voice enabled. Text and saved audio remain available.');updateTransport();return;}
    validateSettings(snapshot);
    const source={...planSource,resume:validResume}, key=recordingKey(source.chatId,source.messageId);
    let cached,storageError='';
    status('Checking saved audio…');
    try{cached=await recordingStore('begin',key);}catch(error){storageError=error.message;}
    if(token!==revision || ctrl.signal.aborted)throw abortError();
    if(fullPlayback)cached=retainCarriedMusic(segments,cached,snapshot);
    const signature=JSON.stringify([snapshot.connection,snapshot.styleParam,segments,
      segments.map(segment=>nativeConnections.find(c=>`native:${c.id}`===(segment.route || scope(snapshot)))?.model)]);
    if(source.resume && cached?.signature!==signature && (snapshot.batchSpeech || cached?.segments?.some(segment=>segment.turns?.length>1) || outdatedSfxRecording(cached || {})))source.resume=null;
    setBusy(true);
    try {
      const mix=fullPlayback && !source.resume?beginPlayedAudio():null;
      const player=createStreamingPlayer(snapshot,source,cached,ctrl,token,{pruneStale:fullPlayback,retain,mix,fullMessage:fullPlayback});
      player.push(segments);
      player.finish();
      const {blobs,warnings,passages,passageKeys,playedAudio,recordingMetadata}=await player.playbackPromise;
      {
        if(token!==revision || ctrl.signal.aborted)throw abortError();
        try{const partial=await recordingStore('get',key);await recordingStore('put',key,{...partial,...recordingMetadata,content:source.content,transcript:source.transcript,signature,fullMessage:fullPlayback,segments,blobs,passages,passageKeys,resumedPlayback:Boolean(source.resume),playedAudio:playedAudio?{...playedAudio,content:source.content}:partial?.playedAudio,speechTexts:segments.map(segment=>recordingSpeechText(segment,snapshot)),sfxPlacement:SFX_PLACEMENT_VERSION,retention:snapshot.retention});storageError='';}
        catch(error){storageError=error.message;}
      }
      if(token===revision){renderMessages();status((storageError?`Playback finished. Audio could not be saved: ${storageError}`:snapshot.retention==='session'?'Playback finished. Audio kept for this session; Replay is available beside the message.':'Playback finished. Audio saved on this device; Replay is available beside the message.')+(source.resume && !playedAudio?' This playback was resumed. Use Replay beside the message to play from the start and save a complete WAV; saved speech will be reused.':'')+playedAudioHint(playedAudio)+foleyWarning(warnings));}
    } finally {ctrl.abort();if(token===revision){playedCapture?.discard();playedCapture=null;}void refreshCacheStatus();if(token===revision){activePlayback=null;advancePlayback=null;generationPolicyChanged=null;updateNextControls();controller=null;setBusy(false);}}
  }
  async function replayRecording(messageId) {
    stop(false,false,true);const token=revision,targetChat=chatId;
    const ctrl=new AbortController();controller=ctrl;setBusy(true);
    status('Loading saved audio…');
    try {
      await flushSettings();
      const recording=await recordingStore('get',recordingKey(targetChat,messageId));
      if(token!==revision || ctrl.signal.aborted)throw abortError();
      if(!recording)throw new Error('No saved audio for this message on this device. Plan and play it first.');
      if(!sameSpeech(ctx.messages.getContent(messageId),recording.content))throw new Error('The message changed since recording. Plan and play the current reply.');
      if(mergedCardRecording(recording))throw new Error('This recording combines several card characters into one voice. Plan and play the message again to separate them.');
      if(aliasedLeadRecording(recording))throw new Error('This recording treats a lead character alias as a separate speaker. Plan and play the message again to use the lead voice.');
      if(!await recordingMatchesTranscript(recording,recording.content))throw new Error('This recording uses older speech text. Plan and play the message again to apply the current filters or persona name.');
      const recordedText=recording.segments.flatMap(segment=>segment.turns || [segment]).filter(segment=>!segment.kind).map(segment=>segment.text).join(' ');
      const canonical=text=>String(text || '').replace(/\s+/g,' ').trim();
      const wholeMessage=recording.fullMessage===true || recording.fullMessage===undefined && Boolean(recordedText) && canonical(recordedText)===canonical(recording.transcript);
      const snapshot=structuredClone(capture());
      if(recordingSpeechMissing(recording,snapshot))throw new Error('Some speech is missing. Play the whole message from the start to finish saving it before Replay or download. Previously saved speech will be reused.');
      snapshot.audioScope={chatId:targetChat,messageId};
      if(outdatedSfxRecording(recording)){
        if(await restoreSavedPlan(messageId)){await play();return;}
        throw new Error('Saved sound-effect timing needs updating. Plan and play this reply to place effects between phrases.');
      }
      if(recording.segments.some(segment=>segment.unison && (JSON.stringify(segment.mixLevels)!==JSON.stringify(unisonLevels(segment)) || segment.mixNormalize!==config.normalizeLoudness) || segment.dialogue && (!config.batchSpeech || config.normalizeLoudness && detectProvider(segment.route)!=='gemini' || voiceGapSetting()>0 || segment.turns.some(turn=>speakerExcluded(turn.speaker) || mixerVolume(1,turn.speaker,mixerState.channels)!==mixerVolume(1,segment.turns[0].speaker,mixerState.channels) || playbackRateFor(turn.speaker)!==playbackRateFor(segment.turns[0].speaker))))){
        if(await restoreSavedPlan(messageId)){await play();return;}
        throw new Error('Speaker controls changed. Plan and play this reply to rebuild its grouped audio.');
      }
      if(recording.segments.some((_,index)=>!recordedSpeechMatches(recording,index,snapshot))){
        status('Updating pronunciation in saved speech…');
        const source={chatId:targetChat,messageId,content:recording.content,transcript:recording.transcript};
        const mix=wholeMessage?beginPlayedAudio():null,player=createStreamingPlayer(snapshot,source,recording,ctrl,token,{mix,fullMessage:wholeMessage});
        player.push(recording.segments);player.finish();
        const {warnings,playedAudio}=await player.playbackPromise;
        if(token!==revision || ctrl.signal.aborted)throw abortError();
        if(playedAudio){const saved=await recordingStore('get',recordingKey(targetChat,messageId));await recordingStore('put',recordingKey(targetChat,messageId),{...saved,playedAudio:{...playedAudio,content:recording.content}});}
        if(token===revision)status('Playback finished. Name pronunciation updated.'+playedAudioHint(playedAudio)+foleyWarning(warnings));
        return;
      }
      // Recover old sparse indexes from the exact saved passage cache before
      // replay, so saving a complete mix never requires another TTS request.
      for(const [index,segment] of recording.segments.entries())if(!recording.blobs[index]){
        try{recording.blobs[index]=recording.passages?.[cacheKey(segment,snapshot)];}catch{}
      }
      const mix=wholeMessage?beginPlayedAudio():null;
      mixerPlaybackSegments=recording.segments;renderMixer();
      let pauseNext=false;
      generationPolicyChanged=()=>{if(currentSpeaker==='SFX' && config?.enableSfx===false){pauseNext=heldPaused();skipAudio?.();}};
      for(let index=0;index<recording.blobs.length;) {
        const blob=recording.blobs[index];
        if(!blob || speakerExcluded(recording.segments[index].speaker) || recording.segments[index].kind==='sfx' && config.enableSfx===false || isBed(recording.segments[index])){index++;continue;}
        if(token!==revision || ctrl.signal.aborted)throw abortError();
        // Cached replay has no synthesis pump. Prepare the current and next
        // audible clip before handoff, skipping background markers.
        let ahead=0;
        for(let next=index;next<recording.blobs.length && ahead<2;next++){
          if(playbackExcluded(recording.segments[next]) || isBed(recording.segments[next]))continue;
          preparePlayback(recording.blobs[next],recording.segments[next],snapshot);ahead++;
        }
        status(`Replaying ${audioProgress(recording.segments,index)}: ${recording.segments[index].speaker}`);
        const segment=recording.segments[index];
        let nextIndex=index+1;
        advancePlayback=(direction=1)=>{if(!skipAudio || ctrl.signal.aborted || token!==revision)return;mix?.markDiscontinuous();const passage=segment.passageIndex ?? index;if(direction<0){let start=index;while(start>0 && (recording.segments[start-1].passageIndex ?? start-1)===passage)start--;nextIndex=Math.max(0,start-1);const previous=recording.segments[nextIndex].passageIndex ?? nextIndex;while(nextIndex>0 && (recording.segments[nextIndex-1].passageIndex ?? nextIndex-1)===previous)nextIndex--;}else while(nextIndex<recording.segments.length && (recording.segments[nextIndex].passageIndex ?? nextIndex)===passage)nextIndex++;pauseNext=heldPaused();skipAudio();};
        activePlayback={chatId:targetChat,messageId,content:recording.content,passage:segment.passageIndex ?? index,chunk:segment.chunkIndex ?? 0};
        for(const kind in beds){const marker=bedIndex(recording.segments,index,kind),bedBlob=bedEnabled(kind) && recording.blobs[marker];const entry=recording.segments[marker]?.[kind];followBed(entry?.stop?entry:bedBlob && entry,async()=>bedBlob,kind);}
        const paused=pauseNext;pauseNext=false;await playBlob(blob,ctrl.signal,recording.segments[index].speaker,0,config.normalizeLoudness,paused,{messageId,items:recording.segments,index,gapMs:gapBefore(recording.segments,index)});
        index=nextIndex;const next=recording.segments[index];activePlayback={...activePlayback,passage:next?.passageIndex ?? (activePlayback.passage+1),chunk:next?.chunkIndex ?? 0,complete:index===recording.blobs.length};savePosition(0);activePlayback=null;
      }
      const playedAudio=await mix?.finish();if(playedCapture===mix)playedCapture=null;
      if(token!==revision || ctrl.signal.aborted)throw abortError();
      if(playedAudio)await recordingStore('put',recordingKey(targetChat,messageId),{...recording,playedAudio:{...playedAudio,content:recording.content,complete:wholeMessage && mix.continuous}});
      if(token===revision)status('Replay finished.'+playedAudioHint(playedAudio?{...playedAudio,complete:wholeMessage && mix.continuous}:null));
    } finally {if(token===revision){playedCapture?.discard();playedCapture=null;fadeOutBeds();activePlayback=null;advancePlayback=null;generationPolicyChanged=null;updateNextControls();controller=null;setBusy(false);}}
  }
  function recordingSpeechMissing(recording,snapshot,respectExclusions=true){
    recording.blobs ||= [];
    return !(recording.segments?.length) || recording.segments.some((segment,index)=>{
      if(segment.kind || respectExclusions && speakerExcluded(segment.speaker))return false;
      if(!recording.blobs[index])try{recording.blobs[index]=recording.passages?.[cacheKey(segment,snapshot)];}catch{}
      return !recording.blobs[index];
    });
  }
  async function playMessage(messageId,restarted=false) {
    if(controller && messagePlaybackId===messageId){stop();return;}
    if(messageOperation?.messageId===messageId && messageOperation.chatId===chatId)return;
    // Saved plans are checked against voices that may still be loading.
    status('Checking playback settings…');await voicesLoading;if(disposed)return;
    stop(false,false,true);messagePlaybackId=messageId;
    const operation={messageId,chatId,token:revision,stops:visibleStops};messageOperation=operation;
    const valid=()=>!disposed && chatId===operation.chatId && revision===operation.token;
    // Loading the chat or switching voices can restart Choir while this Play is
    // checking saved audio. Start again once rather than ignoring the click;
    // a Stop pressed meanwhile still cancels it.
    const interrupted=()=>!restarted && !operation.started && !disposed && chatId===operation.chatId && revision!==operation.token && visibleStops===operation.stops;
    try{await playChecked(messageId,operation,valid);}
    finally{if(messageOperation===operation)messageOperation=null;}
    if(interrupted())return playMessage(messageId,true);
  }
  async function playChecked(messageId,operation,valid) {
    {
      const content=ctx.messages.getContent(messageId);
      // A validated plan remains playable even if saving it failed or has not finished.
      if(plan && planSource?.chatId===chatId && planSource.messageId===messageId && sameSpeech(planSource.content,content) && await recordingMatchesTranscript(planSource,content)){
        if(valid()){operation.started=true;status('Reusing the current speech plan.');await play();}return;
      }
      status('Checking saved plan and audio…');
      if(await restoreSavedPlan(messageId)){if(valid()){operation.started=true;await play();}return;}
      if(!valid())return;
      let recording;try{recording=await recordingStore('get',recordingKey(operation.chatId,messageId));}catch{}
      if(!valid())return;
      if(recording && !pendingCardAnalysis() && !mergedCardRecording(recording) && !aliasedLeadRecording(recording) && sameSpeech(recording.content,content) && await recordingMatchesTranscript(recording,content) && !needsVoiceSelection({segments:(recording.segments || []).flatMap(speechMembers)},casting(config))){
        if(!valid())return;
        const canonical=text=>String(text || '').replace(/\s+/g,' ').trim();
        const recordedText=(recording.segments || []).flatMap(segment=>segment.turns || [segment]).filter(segment=>!segment.kind).map(segment=>segment.text).join(' ');
        if(!outdatedSfxRecording(recording) && canonical(recordedText)===canonical(recording.transcript || filteredTranscript(content)) && !recordingSpeechMissing(recording,capture())){operation.started=true;await replayRecording(messageId);return;}
      }
      if(valid()){operation.started=true;await prepare(messageId,true);}
    }
  }
  function sectionsFor(source,segments){
    const sections=source?.sections,indices=Array.isArray(sections)?sections.flat():[];
    if(Array.isArray(sections) && sections.every(section=>Array.isArray(section) && section.length) && indices.length===segments.length && indices.every((index,position)=>Number.isInteger(index) && index===position))return sections;
    return segments.map((_,index)=>[index]);
  }
  function appendSectionButtons(container,source,segments,messageId){
    for(const [section,indices] of sectionsFor(source,segments).entries()){
      const button=document.createElement('button');button.type='button';button.dataset.choirSection=section;button.innerHTML=`${ICON_PLAY} ${section+1}`;
      button.setAttribute('aria-label',`Play Choir section ${section+1}`);button.title=`Section ${section+1}: ${indices.map(index=>segments[index].text).join(' ').slice(0,120)}`;
      button.style.cssText='display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid #8886;border-radius:5px;background:transparent;color:inherit;font:12px system-ui;cursor:pointer';
      button.onclick=()=>run(()=>playSection(messageId,section));container.append(button);
    }
  }
  function appendClipButtons(container,segments,messageId){
    const batches=playbackBatches(segments.map((segment,passageIndex)=>({...segment,passageIndex})),config);
    let count=0;
    for(const [clip,batch] of batches.entries()){
      if(isBed(batch))continue;
      const turns=batch.turns || [batch],order=batch.unison?batch.unison.map(member=>member.speaker).join(' + ')+' · in unison':turns.map(turn=>turn.speaker).filter((speaker,index,names)=>index===0 || speaker!==names[index-1]).join(' → ');
      const label=batch.kind==='sfx'?`Sound effect ${++count}`:`Clip ${++count}`;
      const description=batch.kind==='sfx'?'Sound effect':batch.unison?`${batch.unison.length} short voice calls mixed into one simultaneous clip; cached voices are reused`:batch.dialogue?'One multi-speaker TTS call':'One single-voice TTS call';
      const button=document.createElement('button');button.type='button';button.dataset.choirClip=clip;
      const displayOrder=order.length>140?`${[...new Set(turns.map(turn=>turn.speaker))].join(' / ')} · ${turns.length} turns`:order;
      button.innerHTML=ICON_PLAY;button.append(document.createTextNode(` ${label} · ${batch.kind==='sfx'?'SFX':displayOrder}`));
      button.setAttribute('aria-label',`Play Choir ${label.toLowerCase()}`);button.title=`${description}: ${order}\n${turns.map(turn=>turn.text).join(' ').slice(0,180)}`;
      button.style.cssText='display:inline-flex;align-items:center;gap:4px;min-width:0;max-width:100%;text-align:left;padding:3px 6px;border:1px solid #8886;border-radius:5px;background:transparent;color:inherit;font:12px system-ui;cursor:pointer';
      button.onclick=()=>run(()=>playSection(messageId,clip,true));container.append(button);
    }
    return count;
  }
  async function playSection(messageId,section,grouped=false){
    const targetChat=chatId,content=ctx.messages.getContent(messageId);
    if(controller && messagePlaybackId===messageId){stop();return;}
    if(!(plan && planSource?.messageId===messageId && planSource.chatId===targetChat && sameSpeech(planSource.content,content)))await prepare(messageId);
    if(chatId!==targetChat || !sameSpeech(ctx.messages.getContent(messageId),content) || planSource?.messageId!==messageId || !sameSpeech(planSource.content,content))return;
    const indices=grouped?null:sectionsFor(planSource,plan.segments)[section];if(!grouped && !indices)throw new Error('This section changed. Choose a current section.');
    messagePlaybackId=messageId;await play(grouped?{clip:section}:{indices});
  }
  async function renderSectionControls(entry){
    const version=++entry.version,targetChat=chatId,content=ctx.messages.getContent(entry.messageId);
    const isSecEnabled=Boolean(config?.sectionButtons);
    syncMessageControls(entry);
    entry.details.hidden=!isSecEnabled;entry.list.replaceChildren();if(entry.details.hidden)return;
    entry.summary.textContent=config?.batchSpeech?'Audio clips':'Sections';
    if(!cataloguesReady){const label=document.createElement('span');label.textContent='Loading voice catalogues…';entry.list.append(label);return;}
    let source,segments,cachedAttribution;
    if(planSource?.chatId===targetChat && planSource.messageId===entry.messageId && sameSpeech(planSource.content,content)){source=planSource;segments=plan.segments;}
    else {
      const saved=await ctx.settings.get(await planKey(targetChat,entry.messageId)).catch(()=>null);
      if(saved && sameSpeech(saved.content,content) && await recordingMatchesTranscript(saved,content)){
        source=saved;cachedAttribution=saved.attribution;segments=cachedAttribution?.segments;
      }
    }
    if(disposed || entry.version!==version || chatId!==targetChat || !messageSections.has(entry) || !config?.sectionButtons)return;
    if(config.batchSpeech && segments?.length){
      const cast=casting(config);
      // Section metadata is read-only. An unassigned automatic voice is a
      // normal pending choice, including on older messages; it must not throw
      // into the status of the message currently being planned or played.
      if(needsVoiceSelection({segments},cast)){
        const label=document.createElement('span');label.textContent='Plan this message to choose its voices.';
        const button=document.createElement('button');button.type='button';button.dataset.choirPlanVoices='';button.textContent='Plan message';
        button.setAttribute('aria-label','Plan Choir voices for this message');button.title='Choose missing voices and show audio clips without starting playback.';
        button.style.cssText='padding:4px 8px;border:1px solid #8886;border-radius:5px;background:transparent;color:inherit;font:12px system-ui;cursor:pointer';
        button.onclick=()=>run(()=>prepare(entry.messageId,false,undefined,true));entry.list.append(label,button);return;
      }
      if(cachedAttribution)segments=restoreAttribution(cachedAttribution,source.transcript,cast).segments;
    }
    if(segments?.length){
      if(config.batchSpeech)entry.summary.textContent=`Audio clips (${appendClipButtons(entry.list,segments,entry.messageId)})`;
      else appendSectionButtons(entry.list,source,segments,entry.messageId);
    }
    else {const label=document.createElement('span');label.textContent='Plan this message to show its sections.';entry.list.append(label);}
  }
  function syncMessageControls(entry){entry.play.hidden=!config?.sectionButtons;if(!config?.sectionButtons)entry.closeSections();entry.controls.hidden=!config?.sectionButtons && entry.download.hidden;entry.place();}
  function refreshSectionControls(){for(const entry of messageSections)void renderSectionControls(entry).catch(error=>{if(!disposed)status(`Section controls unavailable: ${error.message}`,true);});}
  const messageDownloads=new Set();
  function downloadableRecording(recording,content){
    const played=recording?.playedAudio;
    return Boolean(played && !audioExpired(recording) && sameSpeech(played.content,content) && !played.error && played.blob?.size && played.complete!==false && (played.complete===true || !recordingSpeechMissing(recording,capture(),false)) && !(played.duration*48000*4>128*1024*1024) && (globalThis.AudioContext || globalThis.webkitAudioContext));
  }
  let downloadRefreshVersion=0;
  async function refreshMessageDownloads(){
    const refreshVersion=++downloadRefreshVersion;
    const targetChat=chatId,reads=new Map();
    await Promise.all([...messageDownloads].map(async entry=>{
      const {button,messageId}=entry;
      // Lumiverse mounts inactive drawer roots off-document. Keep their Saved
      // controls registered; only discard buttons actually removed from Choir.
      if(!button.isConnected && !root.contains(button)){messageDownloads.delete(entry);return;}
      const version=++entry.version,content=ctx.messages.getContent(messageId);
      if(!targetChat || entry.chatId!==targetChat || entry.content!==content){button.hidden=true;entry.changed?.();}
      button.disabled=busy;if(!targetChat)return;
      if(!reads.has(messageId))reads.set(messageId,recordingStore('get',recordingKey(targetChat,messageId)).catch(()=>null));
      const recording=await reads.get(messageId);
      if(disposed || entry.version!==version || chatId!==targetChat || ctx.messages.getContent(messageId)!==content || !messageDownloads.has(entry))return;
      entry.chatId=targetChat;entry.content=content;button.hidden=!downloadableRecording(recording,content);button.disabled=busy;entry.changed?.();
    }));
    const latest=latestReply(),content=latest?ctx.messages.getContent(latest.id):'';
    const [recording,ids]=await Promise.all([latest?reads.get(latest.id) || recordingStore('get',recordingKey(targetChat,latest.id)).catch(()=>null):null,targetChat?recordingStore('listChat',recordingKey(targetChat,'')).catch(()=>[]):[]]);
    if(disposed || targetChat!==chatId || refreshVersion!==downloadRefreshVersion)return;
    $('drawerDownload').hidden=!latest || latestReply()?.id!==latest.id || !downloadableRecording(recording,content);$('drawerDownload').disabled=busy;
    $('downloadAll').disabled=busy || !ids.length;
  }
  const downloadUrls=new Map();
  unsubs.push(()=>{for(const [url,timer] of downloadUrls){clearTimeout(timer);URL.revokeObjectURL(url);}downloadUrls.clear();});
  function saveDownload(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.hidden=true;document.body.append(link);link.click();link.remove();downloadUrls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);downloadUrls.delete(url);},30000));}
  async function downloadAllSpeech(){
    if(busy)throw new Error('Wait for playback or planning to finish before downloading audio.');
    const targetChat=chatId,token=revision,ctrl=new AbortController();if(!targetChat)return;controller=ctrl;setBusy(true);$('downloadAll').disabled=true;let decoder;
    try{
      const Context=globalThis.AudioContext || globalThis.webkitAudioContext;if(!Context)throw new Error('This browser cannot prepare WAV downloads.');
      const ids=await recordingStore('listChat',recordingKey(targetChat,'')),entries=[],checks=[],names=new Set();let skipped=0,total=22;
      const assertCurrent=()=>{ctrl.signal.throwIfAborted();if(disposed || targetChat!==chatId || token!==revision)throw abortError();};assertCurrent();decoder=new Context({sampleRate:48000});
      for(const [index,messageId] of ids.entries()){
        assertCurrent();status(`Preparing saved audio ${index+1}/${ids.length}…`);
        const key=recordingKey(targetChat,messageId),recording=await recordingStore('get',key);assertCurrent();let message=ctx.messages.getRecent(500).find(entry=>entry.id===messageId);
        if(!message){try{const response=await api(`/chats/${encodeURIComponent(targetChat)}/messages/${encodeURIComponent(messageId)}`,{signal:ctrl.signal}).then(response=>response.json());message=response.data || response;}catch(error){assertCurrent();skipped++;continue;}}
        if(!Number.isInteger(message?.index_in_chat) || typeof message.content!=='string' || !downloadableRecording(recording,message.content)){skipped++;continue;}
        const played=recording.playedAudio,filename=playedAudioFilename(activeCharacterCard?.name || message.name || 'Char',targetChat,message.index_in_chat);if(names.has(filename)){skipped++;continue;}
        const estimated=played.duration*48000*4;if(total+estimated>256*1024*1024)throw new Error('These recordings exceed the 256 MB ZIP limit. Download messages individually.');
        const decoded=await decoder.decodeAudioData(await played.blob.arrayBuffer());assertCurrent();
        const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,channel)=>decoded.getChannelData(channel)),bytes=speechDownloadWav([{channels}],decoder.sampleRate);
        total+=bytes.byteLength+new TextEncoder().encode(filename).length*2+76;if(total>256*1024*1024)throw new Error('These recordings exceed the 256 MB ZIP limit. Download messages individually.');
        names.add(filename);entries.push({filename,bytes,index:message.index_in_chat});checks.push({key,played,content:message.content,messageId});
      }
      // A deletion or retention change in another tab must still win during a
      // long export. Validate each saved mix again before writing the archive.
      for(let index=checks.length-1;index>=0;index--){const check=checks[index],current=await recordingStore('get',check.key);assertCurrent();const local=ctx.messages.getRecent(500).find(message=>message.id===check.messageId);if(!downloadableRecording(current,check.content) || current.playedAudio.blob.size!==check.played.blob.size || current.playedAudio.duration!==check.played.duration || local && !sameSpeech(local.content,check.content)){entries.splice(index,1);skipped++;}}
      if(!entries.length)throw new Error('No complete, current recordings are available. Play a whole message first.');
      entries.sort((a,b)=>a.index-b.index);const zip=createWavArchive(entries);assertCurrent();saveDownload(zip,entries[0].filename.replace(/ - \d+\.wav$/u,'.zip'));status(`Downloaded ${entries.length} saved recording${entries.length===1?'':'s'} as separate WAVs in one ZIP.${skipped?` Skipped ${skipped} partial, expired or changed recording${skipped===1?'':'s'}.`:''}`);
    }finally{await decoder?.close().catch(()=>{});if(controller===ctrl){controller=null;setBusy(false);}}
  }
  async function downloadSpeech(messageId) {
    if(busy)throw new Error('Wait for playback or planning to finish before downloading audio.');
    const targetChat=chatId,content=ctx.messages.getContent(messageId),token=revision;
    const recording=await recordingStore('get',recordingKey(targetChat,messageId));
    if(disposed || targetChat!==chatId || token!==revision)throw abortError();
    const played=recording?.playedAudio;
    if(!played || !sameSpeech(played.content,content))throw new Error(recording?.resumedPlayback?'This playback was resumed. Use Replay beside the message to play from the start and save a complete WAV; saved speech will be reused.':'Play this whole message first to save its played audio mix, then download it. Previously saved speech will be reused.');
    if(played.complete===false || played.complete!==true && recordingSpeechMissing(recording,capture(),false))throw new Error('Some speech is missing from this saved playback. Play the whole message from the start before downloading; saved speech will be reused.');
    if(played.error)throw new Error(played.error);
    if(!played.blob?.size)throw new Error('No played audio was saved. Replay this whole message, then download it.');
    if(disposed || targetChat!==chatId || token!==revision)throw abortError();
    const Context=globalThis.AudioContext || globalThis.webkitAudioContext;
    if(!Context)throw new Error('This browser cannot prepare a WAV download.');
    if(busy)throw new Error('Wait for playback or planning to finish before downloading audio.');
    const ctrl=new AbortController();controller=ctrl;setBusy(true);let decoder;
    try {
      status('Preparing played audio download…');
      decoder=new Context({sampleRate:48000});
      if(played.duration*48000*4>128*1024*1024)throw new Error('This message is too long for a WAV download (128 MB limit).');
      const decoded=await decoder.decodeAudioData(await played.blob.arrayBuffer());ctrl.signal.throwIfAborted();
      const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,channel)=>decoded.getChannelData(channel));
      const wav=speechDownloadWav([{channels}],decoder.sampleRate);ctrl.signal.throwIfAborted();
      let message=ctx.messages.getRecent(500).find(entry=>entry.id===messageId);
      if(!Number.isInteger(message?.index_in_chat)){
        const response=await api(`/chats/${encodeURIComponent(targetChat)}/messages/${encodeURIComponent(messageId)}`,{signal:ctrl.signal}).then(response=>response.json());
        message=response.data || response;
      }
      const filename=playedAudioFilename(activeCharacterCard?.name || message?.name || 'Char',targetChat,message?.index_in_chat);
      if(disposed || targetChat!==chatId || token!==revision || !sameSpeech(ctx.messages.getContent(messageId),content))throw abortError();
      const url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'})),link=document.createElement('a');
      link.href=url;link.download=filename;link.hidden=true;document.body.append(link);link.click();link.remove();
      downloadUrls.set(url,setTimeout(()=>{URL.revokeObjectURL(url);downloadUrls.delete(url);},30000));
      status('Audio downloaded as one WAV of the completed playback, with the sounds, speed and mixer levels heard.');
    } finally {
      await decoder?.close().catch(()=>{});
      if(controller===ctrl){controller=null;setBusy(false);}
    }
  }
  function speechDownloadButton(messageId) {
    const button=document.createElement('button');button.type='button';button.className='choir-message-icon choir-download';button.innerHTML=ICON_DOWNLOAD;button.dataset.choirDownload='';button.hidden=true;
    button.title='One WAV of the last completed whole-message playback. Includes only sounds that were on, with the speed and mixer levels heard. Replay older recordings once to save the mix.';
    button.setAttribute('aria-label','Download Choir audio for this message');button.onclick=()=>run(()=>downloadSpeech(messageId));
    const entry={button,messageId,version:0};messageDownloads.add(entry);return button;
  }
  const decorateMessage=(target,context={})=>{
    const messageId=context.messageId || ctx.dom.getMessageId?.(context.node || target) || context.scope?.match(/^message:(.*):(?:bubble|minimal):footer$/)?.[1] || context.scope?.split(':')[1];
    if(!messageId)return;
    const controls=document.createElement('div');controls.className='choir-message-controls';controls.dataset.choirMessageControls='';
    const button=document.createElement('button');button.type='button';button.innerHTML=ICON_PLAY;button.title='Play Choir · click again to stop';button.setAttribute('aria-label','Play or stop Choir audio for this message');
    button.className='choir-message-icon';
    const progress=document.createElement('span');progress.className='choir-message-status';progress.setAttribute('role','status');progress.style.cssText='display:block;font-size:0.75em;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    let statuses=messageStatuses.get(messageId);if(!statuses){statuses=new Set();messageStatuses.set(messageId,statuses);}statuses.add(progress);
    const sections=document.createElement('details');sections.hidden=true;
    const summary=document.createElement('summary');summary.textContent='Sections';const sectionList=document.createElement('div');sectionList.className='choir-section-list';sections.append(summary,sectionList);
    const popover=typeof sectionList.showPopover==='function';
    const closeSections=(focus=false)=>{
      sections.open=false;
      document.removeEventListener('keydown',dismissKey);document.removeEventListener('pointerdown',dismissOutside,true);
      document.defaultView.removeEventListener('resize',positionSections);document.removeEventListener('scroll',positionSections,true);
      if(popover){if(sectionList.matches(':popover-open'))sectionList.hidePopover();}
      else{sectionList.hidden=true;delete sectionList.dataset.portal;sections.append(sectionList);}
      if(focus && summary.isConnected)summary.focus();
    };
    const dismissKey=event=>{if(event.key==='Escape' && sections.open){event.preventDefault();closeSections(true);}};
    const dismissOutside=event=>{if(!sectionList.contains(event.target) && !summary.contains(event.target))closeSections();};
    if(popover){sectionList.setAttribute('popover','auto');sectionList.addEventListener('toggle',event=>{if(event.newState==='closed')closeSections();});}
    else sectionList.hidden=true;
    const positionSections=()=>{
      if(!sections.open || sections.hidden || !summary.isConnected){closeSections();return;}
      for(const other of messageSections)if(other.details!==sections && other.details.open)other.closeSections();
      if(popover && !sectionList.matches(':popover-open'))sectionList.showPopover();
      else if(!popover){sectionList.hidden=false;sectionList.dataset.portal='';document.body.append(sectionList);document.addEventListener('pointerdown',dismissOutside,true);}
      // Follow scrolling and resizing only while open: one listener per message
      // footer would otherwise run on every scroll of a long chat.
      document.addEventListener('keydown',dismissKey);document.defaultView.addEventListener('resize',positionSections);document.addEventListener('scroll',positionSections,true);
      const width=document.documentElement.clientWidth || document.defaultView.innerWidth,height=document.documentElement.clientHeight || document.defaultView.innerHeight;
      const anchor=summary.getBoundingClientRect(),rect=sectionList.getBoundingClientRect();
      sectionList.style.left=`${Math.max(10,Math.min(anchor.right-rect.width,width-rect.width-10))}px`;
      const top=anchor.bottom+rect.height+6>height?anchor.top-rect.height-6:anchor.bottom+6;
      sectionList.style.top=`${Math.max(10,Math.min(top,height-rect.height-10))}px`;
    };
    sections.addEventListener('toggle',positionSections);
    const download=speechDownloadButton(messageId),downloadEntry=[...messageDownloads].find(item=>item.button===download);
    const place=()=>{
      const anchor=context.node?.isConnected?context.node:target,card=target.closest?.('[data-message-id]') || anchor.closest?.('[data-message-id]');
      const swipe=card?.querySelector('[data-component="SwipeControls"]') || anchor.parentElement?.querySelector(':scope > [data-component="SwipeControls"]');
      const parent=swipe || target;if(controls.parentNode!==parent)parent.append(controls);controls.toggleAttribute('data-at-swipe',Boolean(swipe));
    };
    const entry={messageId,target,content:ctx.messages.getContent(messageId),details:sections,summary,list:sectionList,controls,play:button,download,place,closeSections,version:0};messageSections.add(entry);downloadEntry.changed=()=>syncMessageControls(entry);
    button.onclick=()=>run(()=>playMessage(messageId));controls.append(button,sections,download);target.append(progress);place();
    void renderSectionControls(entry).catch(error=>{if(!disposed)status(`Section controls unavailable: ${error.message}`,true);});void refreshMessageDownloads();
    return ()=>{entry.version++;closeSections();sections.removeEventListener('toggle',positionSections);messageSections.delete(entry);downloadEntry.version++;messageDownloads.delete(downloadEntry);controls.remove();progress.remove();statuses.delete(progress);if(!statuses.size)messageStatuses.delete(messageId);};
  };
  const registerDecorator=ctx.ui.registerDomDecorator?.bind(ctx.ui) || ctx.registerDomDecorator?.bind(ctx);
  if(registerDecorator) {
    const handle=registerDecorator({mount:'message_footer',render:decorateMessage,target:'message_footer',decorate:decorateMessage,update:target=>{
      for(const entry of messageSections)if(entry.target===target){entry.place();const content=ctx.messages.getContent(entry.messageId);if(entry.content!==content){entry.content=content;void renderSectionControls(entry);void refreshMessageDownloads();}}
    }});
    unsubs.push(typeof handle==='function'?handle:()=>handle?.destroy());
  } else if(ctx.registerMessageAction) {
    const handle=ctx.registerMessageAction({id:'choir-play',label:'Play Choir',onClick:id=>run(()=>playMessage(id))});
    unsubs.push(()=>handle.destroy());
  }
  function renderMessages() {
    updateCastVisibility();
    refreshLatestNotice();
    refreshSectionControls();
    $('messages').replaceChildren();
    const recent=ctx.messages.getRecent(20).filter(v=>!v.extra?.is_system);
    for(const message of recent) {
      const row=document.createElement('div');row.className='et-card et-message';
      const name=document.createElement('span');name.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px;font-size:0.9em';
      name.style.whiteSpace='normal';name.textContent=`${Number.isInteger(message.index_in_chat)?`Message ${String(message.index_in_chat+1).padStart(3,'0')} · `:''}${message.name || (message.is_user?'You':'Character')}`;const metadata=document.createElement('small');metadata.textContent='No completed mix saved';name.append(metadata);
      const actions=document.createElement('div');actions.className='et-btn-group';
      const button=document.createElement('button');button.type='button';button.className='et-btn-subtle';button.textContent='Plan';button.onclick=()=>run(()=>prepare(message.id,false,undefined,true));actions.append(button);
      const replay=document.createElement('button');replay.type='button';replay.className='et-btn-subtle';replay.textContent='Replay';replay.onclick=()=>run(()=>replayRecording(message.id));actions.append(replay);
      const download=speechDownloadButton(message.id),entry=[...messageDownloads].find(item=>item.button===download);entry.changed=()=>{metadata.textContent=download.hidden?'Replay to save a complete mix':'Complete playback · WAV ready';};actions.append(download);
      const removeAudio=document.createElement('button');removeAudio.type='button';removeAudio.className='et-btn-danger';removeAudio.textContent='Delete audio';removeAudio.onclick=()=>run(async()=>{
        const targetChat=chatId,key=recordingKey(targetChat,message.id);
        stop(false);status('Deleting saved audio…');
        await recordingStore('delete',key);
        if(await recordingStore('get',key))throw new Error('Audio deletion did not complete. Stop playback and try again.');
        if(chatId===targetChat){replay.disabled=true;removeAudio.textContent='Audio deleted';void refreshMessageDownloads();status('Saved audio deleted for this message. Play plan will generate new audio.');}
      });actions.append(removeAudio);
      row.append(name,actions);$('messages').append(row);
    }
    void refreshMessageDownloads();
  }
  // Recordings cost money to generate, so clearing them all takes a second tap.
  let clearAudioArmed=null;
  $('deleteChatAudio').onclick=()=>run(async()=>{
    if(!chatId)throw new Error('Open a chat first.');
    const button=$('deleteChatAudio');
    if(clearAudioArmed?.chatId!==chatId){
      clearTimeout(clearAudioArmed?.timer);
      clearAudioArmed={chatId,timer:setTimeout(()=>{clearAudioArmed=null;button.textContent='Clear chat audio';},5000)};
      button.textContent='Tap again to delete all';status('Tap Clear chat audio again within 5 seconds to delete every saved recording for this chat. Downloaded WAV files are not affected.');return;
    }
    clearTimeout(clearAudioArmed.timer);clearAudioArmed=null;button.textContent='Clear chat audio';
    const targetChat=chatId;stop(false);status('Deleting saved audio for this chat…');
    await recordingStore('deleteChat',recordingKey(targetChat,''));
    if(chatId===targetChat){renderMessages();status('All Choir audio deleted for this chat on this device.');}
  });
  async function run(action) {
    try{await action();}catch(error){if(error.name!=='AbortError')status(error.message,true);}finally{updateTransport();}
  }
  $('save').onclick=()=>run(save);
  $('captureDefaults').onclick=()=>run(()=>{if(!defaultOperation && chatId)openDefaultEditor('lead');});
  const applyCastDefault=group=>run(async()=>{
    if(defaultOperation)return;
    if(!chatId)throw new Error('Open a chat first.');
    if(!capturedDefaults)throw new Error('Capture a default setup first.');
    const preset=structuredClone(capturedDefaults),targetChat=chatId;let version=loadVersion,previous,saving=false,token;
    defaultOperation=true;refreshDefaultControls();$('defaultStatus').textContent='Applying default setup…';
    try{
      await flushSettings();if(disposed || targetChat!==chatId || version!==loadVersion)return;
      previous=capture();const messageId=planSource?.messageId;
      cancelAutoReplies();stop(false);token=revision;version=++loadVersion;setBusy(true);
      config=withDefaultSetup(previous,preset,group);setFields();await loadProviders();
      if(disposed || targetChat!==chatId || version!==loadVersion || token!==revision)return;
      setBusy(true);
      validateSettings(config);saving=true;await persistConfig(targetChat,config,true);
      if(disposed || targetChat!==chatId || version!==loadVersion || token!==revision)return;
      if(messageId && !await restoreSavedPlan(messageId))clearPlan();
      if(disposed || targetChat!==chatId || version!==loadVersion || token!==revision)return;
      saveState('Saved automatically');$('defaultStatus').textContent='Default applied to this chat.';
      status('Cast default applied. This chat saves its own voice choices.');
    }catch(error){
      if(!disposed && targetChat===chatId && version===loadVersion){
        if(previous && !saving){config=previous;setFields();await loadProviders().catch(()=>renderCast());}
        if(saving)saveState('Save failed · Retry save',true);
        $('defaultStatus').textContent='Default could not be applied. Try again.';
      }
      throw error;
    }finally{defaultOperation=false;if(!disposed){if(targetChat===chatId && version===loadVersion)setBusy(false);refreshDefaultControls();}}
  });
  $('applyDefaults').onclick=()=>applyCastDefault();
  $('stop').onclick=()=>stop();
  $('testPlanner').onclick=()=>run(async()=>{
    stop(false);const token=revision,ctrl=new AbortController();controller=ctrl;setBusy(true);
    const mode=$('plannerMode').value;
    if(mode==='heuristic'){
      try{
        const snapshot=casting(capture());validateCastConfig(snapshot);
        const result=fastClassifyPlan('The room fell quiet.',snapshot);
        if(!result)throw new Error('Assign a narrator voice to test the local heuristic. No LLM request was made.');
        status('Heuristic test passed: local narration attribution. No LLM request was made.');
      }finally{ctrl.abort();if(token===revision){controller=null;setBusy(false);}}
      return;
    }
    const isJev=mode==='jev';
    status(isJev ? 'Testing Jev classifier…' : 'Testing planner…');
    try {
      await rpc('ping',{},ctrl.signal,8000);
      const payload=isJev ? {
        plannerMode:'jev',
        useJev:true,
        decisionConnection:$('decisionConnection')?.value || config.decisionConnection || '',
        jevApiKey:$('jevKey')?.value?.trim() || config.jevApiKey || '',
        jevEndpoint:$('jevEndpoint')?.value?.trim() || config.jevEndpoint || ''
      } : {
        connectionId:$('planner').value
      };
      const result=await rpc('testPlanner',payload,ctrl.signal,65000,
        progress=>status(`${isJev?'Jev':'Planner'} test: ${progress.stage}${progress.model?` · ${progress.model}`:''}`));
      if(token===revision)status(`Planner test passed: ${result.provider} · ${result.model}. Response: ${result.response}`);
    } finally {if(token===revision){controller=null;setBusy(false);}}
  });
  function latestReply(){return disposed?null:ctx.messages.getRecent(200).filter(v=>!v.is_user && !v.extra?.is_system).at(-1);}
  async function planLatest(){
    const latest=latestReply();
    if(!latest)throw new Error('No assistant reply in the active chat.');
    const targetChat=chatId,content=ctx.messages.getContent(latest.id);
    const alreadyShown=plan && planSource?.messageId===latest.id && sameSpeech(planSource.content,ctx.messages.getContent(latest.id));
    const alreadyPlanned=alreadyShown || await restoreSavedPlan(latest.id);
    if(disposed || targetChat!==chatId || !sameSpeech(ctx.messages.getContent(latest.id),content))return;
    await prepare(latest.id,false,undefined,Boolean(alreadyPlanned));
  }
  $('latest').onclick=()=>run(planLatest);
  $('previewReading').onclick=()=>{
    const latest=latestReply(),preview=$('readingPreview');
    preview.textContent=latest?transcriptFromMessage(ctx.messages.getContent(latest.id),$('ignoredTags').value) || 'No readable story text remains.':'Open a chat with an assistant reply to preview reading.';
    preview.hidden=false;
  };
  $('add').onclick=()=>{const names=new Set([...castRows,...npcRows].filter(entry=>root.contains(entry.row)).map(entry=>normalizeName(entry.read().speaker)));let index=1;while(names.has(normalizeName(`Character ${index}`)))index++;castRows.push(makeRow({speaker:`Character ${index}`,voice:'',style:''},$('fixed'),false,true));scheduleSettingsSave();renderMixer();};
        const doSearchVoices = () => {
    const query = $('voiceSearchQuery')?.value?.trim() || '';
    openVoiceLibraryModal({
      defaultQuery: query || 'narrator',
      onSelect: async (item) => {
        const fishRoute=[scope(config),...casting(config).fixed.map(actor=>actor.route),...casting(config).npcs.map(actor=>actor.route)].find(route=>route && detectProvider(route)==='fish_audio');
        if(!fishRoute)throw new Error('Select a Fish Audio connection before adding community voices.');
        rememberExtraVoiceRoute(item.id,fishRoute);
        const entry = `${item.id} | ${item.name}${item.description ? ` · ${item.description}` : ''}`;
        const existing = $('extraVoices').value.trim();
        $('extraVoices').value = existing ? `${existing}\n${entry}` : entry;
        config = capture();
        if (chatId) await persistConfig(chatId,config);
        loadVersion++; await loadVoices();
        status(`Added "${item.name}" to voice catalogue.`);
      }
    });
  };
  $('searchVoicesBtn')?.addEventListener('click', doSearchVoices);
  $('voiceSearchQuery')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearchVoices(); } });
  $('load').onclick=()=>run(async()=>{await flushSettings();config=capture();loadVersion++;await loadProviders();await persistConfig(chatId,config,true);saveState('Settings saved');clearPlan();status('Connections and voices reloaded.');});
  $('plannerMode')?.addEventListener('change',updatePlannerVisibility);
  $('allowLlmFallback').onchange=updatePlannerVisibility;
  $('sectionButtons').onchange=()=>run(async()=>{config=capture();refreshSectionControls();if(plan)renderPreview();scheduleSettingsSave();await flushSettings();});
  $('connectionMode').onchange=()=>(voicesLoading=run(async()=>{
    await flushSettings();
    const messageId=planSource?.messageId,targetChat=chatId;stop(false);config=capture();config.connectionMode=$('connectionMode').value;const version=++loadVersion;
    await persistConfig(targetChat,config,true);if(disposed || chatId!==targetChat || version!==loadVersion)return;saveState('Settings saved');
    await loadVoices();if(disposed || chatId!==targetChat || version!==loadVersion)return;
    if(messageId)await restoreSavedPlan(messageId);if(disposed || chatId!==targetChat || version!==loadVersion)return;
    renderMixer();if(chatId){await persistConfig(chatId,config,true);saveState('Settings saved');}
    status(config.connectionMode==='one'?'One TTS now applies to the whole cast. Per-character routes are remembered.':'Several TTS restored your per-character routes.');
  }));
  $('testTts').onclick=()=>castRows[0]?.row.querySelector('[data-choir-preview]')?.click();
  $('exportCast').onclick=()=>{$('castJson').value=JSON.stringify(castExport(capture()),null,2);status('Cast exported below. Copy this JSON to transfer it. Credentials are excluded.');};
  $('importCast').onclick=()=>run(async()=>{
    if(!chatId)throw new Error('Open a chat first.');
    const imported=castImport(normalizeSavedSettings(JSON.parse($('castJson').value))),candidate={...capture(),...imported};
    const routes=new Set([scope(candidate),...candidate.fixed.map(actor=>actor.route || scope(candidate)),...Object.keys(candidate.casts),...Object.keys(candidate.singleVoices || {}),...Object.values(candidate.casts).flat().map(actor=>actor.route).filter(Boolean)]);
    for(const route of routes)await ensureCatalogue(route);
    for(const [route,choices] of Object.entries(candidate.singleVoices || {}))for(const voice of Object.values(choices))if(voice && !voiceCatalogues.get(route)?.some(v=>v.id===voice))throw new Error(`Imported voice ${voice} is unavailable on ${route}.`);
    validateSettings(candidate);
    for(const route of Object.keys(candidate.casts))validateCastConfig(casting({...candidate,connection:route.slice(7)}));
    stop(false);config=candidate;await persistConfig(chatId,config);setFields();renderCast();
    if(planSource)await restoreSavedPlan(planSource.messageId);
    status('Cast imported and validated. Saved attribution reused.');
  });
  $('connection').onchange=()=>(voicesLoading=run(async()=>{
    await flushSettings();
    const messageId=planSource?.messageId,targetChat=chatId;stop(false);config=capture();const version=++loadVersion;
    await persistConfig(targetChat,config,true);if(disposed || chatId!==targetChat || version!==loadVersion)return;saveState('Settings saved');
    setFields();await loadVoices();if(disposed || chatId!==targetChat || version!==loadVersion)return;
    if(messageId)await restoreSavedPlan(messageId);if(disposed || chatId!==targetChat || version!==loadVersion)return;renderMixer();
    const unavailable=config.connectionMode==='several' && config.fixed.some(v=>v.voice && !voices.some(x=>x.id===v.voice));
    await persistConfig(targetChat,config,true);if(disposed || chatId!==targetChat || version!==loadVersion)return;saveState('Settings saved');
    status(unavailable?'Choose valid voices for this provider.':'Provider selected.');
  }));
  $('apply').onclick=()=>run(async()=>{
    if(!planSource)throw new Error('Plan a message first.');
    const edited=validatePlan(parsePlanJson($('planJson').value),planSource.transcript,casting(config));
    plan=edited;rememberPlanCast(edited);await persistConfig(chatId,config);
    await persistPlan();renderCast();renderPreview();status('Edited plan validated and saved.');
  });
  unsubs.push(ctx.state.subscribe('chat.active',()=>loadChat()));
  unsubs.push(ctx.state.subscribe('persona.activeId',()=>run(refreshLeadNames)));
  function cancelAutoReplies(messageId){
    if(messageId)autoReplyQueue.delete(messageId);else autoReplyQueue.clear();
    if(!autoReplyQueue.size){clearTimeout(autoReplyTimer);autoReplyTimer=null;}
  }
  function scheduleAutoReplies(){
    if(disposed || autoReplyTimer || autoReplyActive || !autoReplyQueue.size)return;
    autoReplyTimer=setTimeout(()=>{autoReplyTimer=null;void run(drainAutoReplies);},100);
  }
  async function drainAutoReplies(){
    if(disposed || autoReplyActive || !autoReplyQueue.size)return;
    if(!config || (!config.autoPlan && !config.auto) || ctx.getActiveChat().chatId!==chatId){cancelAutoReplies();return;}
    if(busy || controller || currentAudio){scheduleAutoReplies();return;}
    const reply=autoReplyQueue.values().next().value;
    if(reply.chatId!==chatId){autoReplyQueue.delete(reply.messageId);scheduleAutoReplies();return;}
    const message=ctx.messages.getRecent(200).find(item=>item.id===reply.messageId),content=ctx.messages.getContent(reply.messageId);
    if(message?.is_user || message?.extra?.is_system){autoReplyQueue.delete(reply.messageId);scheduleAutoReplies();return;}
    // Completion metadata can arrive before the host reconciles its message store.
    // Read the saved reply when the event carries only a continuation, or its text
    // differs from the host's final message projection. Never plan a stale swipe.
    const needsCanonical=reply.needsCanonical || message && typeof content==='string' && typeof reply.content==='string' && content!==reply.content;
    if(needsCanonical && !reply.canonicalChecked && (!reply.canonicalAttemptAt || Date.now()-reply.canonicalAttemptAt>=1000)){
      reply.canonicalAttemptAt=Date.now();
      try{
        const saved=await api(`/chats/${encodeURIComponent(reply.chatId)}/messages?limit=200&tail=true`).then(response=>response.json());
        if(disposed || reply.chatId!==chatId || autoReplyQueue.get(reply.messageId)!==reply || (!config.autoPlan && !config.auto))return;
        const completed=saved.data?.find(item=>item.id===reply.messageId);
        const raw=completed?.swipes?.[completed.swipe_id] ?? completed?.content;
        const eventMatches=typeof reply.content!=='string' || raw===reply.content ||
          reply.generationType==='continue' && typeof raw==='string' && raw.endsWith(reply.content) ||
          typeof raw==='string' && filteredTranscript(raw)===filteredTranscript(reply.content);
        const swipeMatches=reply.swipeId==null || completed?.swipe_id===reply.swipeId;
        if(completed && !completed.is_user && !completed.extra?.is_system && typeof completed.content==='string' && completed.content.trim() && eventMatches && swipeMatches){
          reply.content=completed.content;reply.needsCanonical=false;reply.canonicalChecked=true;
        }
      }catch{} // The normal event/store path still works if this endpoint is unavailable.
    }
    if(!message || typeof content!=='string' || !content.trim() || reply.needsCanonical || (typeof reply.content==='string' && content!==reply.content)){
      if(Date.now()-reply.queuedAt>15000){autoReplyQueue.delete(reply.messageId);status('Choir could not find the completed reply in chat. Use Plan latest to retry.',true);}
      else status('Waiting for the completed reply to appear in chat…');
      scheduleAutoReplies();updateTransport();return;
    }
    autoReplyQueue.delete(reply.messageId);autoReplyActive=reply;reply.token=revision;
    const current=()=>!disposed && autoReplyActive===reply && reply.chatId===chatId && reply.token===revision;
    try{
      if(config.autoPlan){
        reply.phase='planning';
        const operation=prepare(reply.messageId);reply.token=revision;await operation;
      }else{
        reply.phase='restore';setBusy(true);
        try{
          if(!await restoreSavedPlan(reply.messageId)){
            if(current())status('Auto-play skipped: no available plan. Enable Auto-plan or plan this reply manually.');
            return;
          }
        }finally{if(current())setBusy(false);}
      }
      if(!current() || !config.auto || planSource?.messageId!==reply.messageId)return;
      reply.phase='playback';await play({automaticReply:reply});
    }
    finally{autoReplyActive=null;scheduleAutoReplies();}
  }
  function queueAutoReply(payload,needsCanonical=false){
    renderMessages();
    if(payload?.chatId!==chatId || !config || disposed)return;
    const generation=payload.generationId?JSON.stringify([payload.chatId,payload.generationId]):null;
    if(generation && seenAutoGenerations.has(generation))return;
    const remember=()=>{if(generation){seenAutoGenerations.add(generation);if(seenAutoGenerations.size>100)seenAutoGenerations.delete(seenAutoGenerations.values().next().value);}};
    if(payload.error || !payload.messageId || (!config.autoPlan && !config.auto)){remember();return;}
    if(payload.generationType==='impersonate' || payload.impersonateDraft){remember();return;}
    const message=ctx.messages.getRecent(200).find(item=>item.id===payload.messageId);
    if(message?.is_user || message?.extra?.is_system){remember();return;}
    if(autoReplyActive?.messageId===payload.messageId && autoReplyActive.content===payload.content)return;
    remember();
    const existing=autoReplyQueue.get(payload.messageId);
    autoReplyQueue.set(payload.messageId,{chatId:payload.chatId,messageId:payload.messageId,content:payload.content,generationType:payload.generationType,swipeId:payload.swipeId,needsCanonical:needsCanonical===true || payload.generationType==='continue',queuedAt:existing?.queuedAt ?? Date.now()});
    scheduleAutoReplies();updateTransport();
  }
  unsubs.push(ctx.state.subscribe('chat.messageCount',()=>{renderMessages();scheduleAutoReplies();updateTransport();}));
  // The host also passes WebSocket metadata; it is not our canonical-read flag.
  unsubs.push(ctx.events.on('GENERATION_ENDED',payload=>queueAutoReply(payload)));
  // Lumiverse sends this after successful persistence. Recover a missed terminal
  // event, and deduplicate it with GENERATION_ENDED using the same generation ID.
  unsubs.push(ctx.events.on('GENERATION_METRICS_READY',payload=>queueAutoReply(payload,true)));
  for(const event of ['MESSAGE_EDITED','MESSAGE_SWIPED','SWIPE_EDITED','MESSAGE_DELETED']) {
    unsubs.push(ctx.events.on(event,payload=>{
      const id=payload?.messageId || payload?.message?.id || payload?.id;
      if(payload?.chatId && payload.chatId!==chatId)return;
      cancelAutoReplies(id);
      const affected=planSource || planningSource;
      const edited=typeof payload?.message?.content==='string'?payload.message.content:id && ctx.messages.getContent(id);
      const spokenUnchanged=(event==='MESSAGE_EDITED' || event==='SWIPE_EDITED') && edited!=null && sameSpeech(edited,affected?.content);
      if(affected && (!id || id===affected.messageId) && !spokenUnchanged){stop(false);clearPlan();status('Message changed. Generate a fresh plan.');}
      renderMessages();
    }));
  }
  const action=ctx.ui.registerInputBarAction({id:'ensemble',label:'Choir',subtitle:'Cast and play voices',iconSvg:CHOIR_ICON_SVG,enabled:true});
  action.onClick(()=>tab.activate());
  unsubs.push(()=>action.destroy());

  $('enableSfx').addEventListener('change',syncSfxPlayback);
  $('enableAmbience').addEventListener('change',syncAmbiencePlayback);
  $('enableMusic').addEventListener('change',syncMusicPlayback);
  $('loopMusic').addEventListener('change',()=>{if(!$('loopMusic').checked && !controller && !currentAudio)stopBeds('music');updateTransport();});
  $('freesoundApiKey').addEventListener('input',()=>showFoleyStatus());

  function dropVolatileSource(sourceKey){for(const cache of [foleyCache,paragraphAudioCache])for(const [key,entry] of cache)if(entry.sourceKey===sourceKey)cache.delete(key);}
  // The story moment lets the backend's Decision model pick among Freesound's results.
  async function fetchFoleyAudio(seg, snapshot, signal) {
    // Scene assets are shared by Cue and full-message playback in this chat.
    // A message deletion conservatively clears these shared assets as well.
    snapshot={...snapshot,audioScope:{...volatileScope(snapshot),messageId:null}};
    signal.throwIfAborted();
    if(seg.kind==='music')return fetchMusicTrack(seg, snapshot, signal);
    const sfx = seg[seg.kind];
    const query = sfx.query || 'thump';
    const filter = sfx.filter || 'duration:[0.2 TO 4]';
    const sourceKey=`${seg.kind}:${foleyKey(sfx)}`,key=volatileKey(sourceKey,snapshot);
    return loadVolatileAudio(foleyCache,key,sourceKey,snapshot,signal,async()=>{
    const apiKey = snapshot.freesoundApiKey || $('freesoundApiKey')?.value?.trim() || '';
    if(!apiKey)throw new Error('Configure a Freesound API key in Playback → Soundscape');
    let previewUrl;
    // Freesound requires every search word to match, so drop trailing words until one matches.
    for(let words=query.split(' ');!previewUrl && words.length;words=words.slice(0,-1)){
      const result=await rpc('freesound',{query:words.join(' '),filter,apiKey,kind:seg.kind,moment:seg.moment,
        decisionConnection:snapshot.decisionConnection,jevApiKey:snapshot.jevApiKey,jevEndpoint:snapshot.jevEndpoint},signal,10000);
      signal.throwIfAborted();
      previewUrl=result?.results?.find(sound=>sound.previewUrl)?.previewUrl;
    }
    if(!previewUrl)throw new Error(`No Freesound result for "${query}"`);
    // Lumiverse's CORS proxy downloads the preview; the extension never fetches other sites itself.
    const preview=await rpc('freesoundPreview',{url:previewUrl},signal,30000);
    signal.throwIfAborted();
    const audio=audioBytes(preview.base64,preview.mimeType);const blob=new Blob([audio.data],{type:audio.mimeType});
    if(!blob.size)throw new Error('Freesound returned an empty preview');
    return blob;
    },64);
  }

  const musicAudioLoads=new WeakMap();
  async function musicAudioBlob(track,signal){
    if(track instanceof Blob)return track;
    if(track.blob)return track.blob;
    const pending=musicAudioLoads.get(track);if(pending && !pending.signal.aborted)return pending.promise;
    const entry={signal};entry.promise=(async()=>{
      let blob;
      if(track.url?.startsWith('blob:'))blob=await fetch(track.url,{signal}).then(response=>response.blob());
      else{const result=await rpc('musicAudio',{url:track.url},signal,60000);signal.throwIfAborted();const audio=audioBytes(result.base64,result.mimeType);blob=new Blob([audio.data],{type:audio.mimeType});}
      signal.throwIfAborted();if(!blob.size)throw new Error('The music track was empty.');
      return track.blob=blob;
    })();musicAudioLoads.set(track,entry);
    try{return await entry.promise;}finally{if(musicAudioLoads.get(track)===entry)musicAudioLoads.delete(track);}
  }
  // Select once; the host proxies music audio so Web Audio can include it in
  // the same mix heard through the speakers. Existing URL caches also work.
  async function fetchMusicTrack(seg, snapshot, signal) {
    snapshot={...snapshot,audioScope:{...volatileScope(snapshot),messageId:null}};
    const sourceKey=`music:${foleyKey(seg.music)}`,key=volatileKey(sourceKey,snapshot);
    return loadVolatileAudio(foleyCache,key,sourceKey,snapshot,signal,async()=>{
    const {feels,genres,keywords}=seg.music;
    const track=await rpc('music',{feels,genres,keywords,moment:seg.moment,decisionConnection:snapshot.decisionConnection,jevApiKey:snapshot.jevApiKey,jevEndpoint:snapshot.jevEndpoint},signal,20000);
    signal.throwIfAborted();
    return track;
    },64);
  }

  async function synthesizeSegment(seg,snapshot,signal) {
    if(seg.kind)return fetchFoleyAudio(seg,snapshot,signal);
    if(seg.unison)return synthesizeUnisonBlob(seg,snapshot,signal,member=>getCachedOrSynthesize(member,snapshot,signal,false));
    return synthesizeSpeechBlob(seg,snapshot,signal);
  }



  function segmentCacheKey(seg, snap) {
    return volatileKey(cacheKey(seg,snap),snap);
  }
  function getCachedOrSynthesize(seg, snap, sig, prepare=true) {
    const k = segmentCacheKey(seg, snap);
    return loadVolatileAudio(paragraphAudioCache,k,cacheKey(seg,snap),snap,sig,()=>synthesizeSegment(seg,snap,sig),80).then(blob=>prepare?preparePlayback(blob,seg,snap):blob);
  }

  const paragraphCues = new Map();
  function paragraphSegments(rawText, snap, preferredSpeaker = '') {
    const cleanPara = transcriptFromMessage(rawText,snap.ignoredTags).trim();
    if (!cleanPara) return {segments: [], cleanPara, fromPlan: false};

    let segments = null;

    // 1. If an existing message plan is cached in memory, reuse matching segments
    if (plan && Array.isArray(plan.segments) && plan.segments.length > 0) {
      const matched = plan.segments.filter(s => {
        const segText = s.text.trim();
        return cleanPara.includes(segText) || segText.includes(cleanPara);
      });
      if (matched.length) return {segments: matched, cleanPara, fromPlan: true};
    }

    // 2. Otherwise plan the paragraph directly in 0ms without blocking on LLM RPC
    if (!segments) {
      let planResult = null;
      if (config.useFastClassifier !== false || snap.fixed.length>3) {
        try { planResult = fastClassifyPlan(cleanPara, { ...snap, speaker: preferredSpeaker }); } catch {}
      }
      if (!planResult) {
        const units = speechSourceUnits(cleanPara);
        const narratorVoice = snap.fixed.find(a => normalizeName(a.speaker) === 'narrator')?.voice || '';
        const allCast = [
          ...(snap.fixed || []),
          ...(snap.npcs || []),
          ...Object.values(snap.casts || {}).flat()
        ];
        const explicitActor = preferredSpeaker ? allCast.find(a => [a.speaker,...(a.aliases || [])].some(name=>normalizeName(name)===normalizeName(preferredSpeaker)) && a.voice) : null;
        // Several leads require explicit attribution. Do not route every quote to the first person.
        if(snap.fixed.length>3 && !explicitActor && units.some(unit=>unit.kind==='dialogue'))throw new Error('Plan this message with Jev or LLM first to identify each character, or provide a named speaker.');
        const charActor = explicitActor || (snap.fixed[2]?.voice ? snap.fixed[2] : (snap.fixed[1]?.voice ? snap.fixed[1] : (snap.fixed[2] || snap.fixed[1] || snap.fixed[0])));
        planResult = {
          segments: units.map(u => ({
            speaker: u.kind === 'dialogue' ? (charActor?.speaker || 'Character') : 'Narrator',
            voice: u.kind === 'dialogue' ? (charActor?.voice || narratorVoice) : narratorVoice,
            route: u.kind === 'dialogue' ? (charActor?.route || scope(snap)) : (snap.fixed[0]?.route || scope(snap)),
            style: snap.useStyle===false?'':(u.kind==='dialogue'?charActor:snap.fixed.find(actor=>normalizeName(actor.speaker)==='narrator'))?.style || '',
            text: u.text,
            unit_ids: [u.id]
          }))
        };
      }
      segments = planResult?.segments || [];
    }

    return {segments: applySoundCues(segments, paragraphCues.get(cleanPara)), cleanPara, fromPlan: false};
  }

  function planAndBatchParagraph(rawText, snap, filterMuted = false, preferredSpeaker = '') {
    return playbackBatches(paragraphSegments(rawText, snap, preferredSpeaker).segments, snap, {filterMuted});
  }

  // Paragraphs outside the current message plan get their effects chosen once per text.
  async function loadParagraphCues(rawText, snap, preferredSpeaker, signal, carried) {
    const {segments, cleanPara, fromPlan} = paragraphSegments(rawText, snap, preferredSpeaker);
    if (fromPlan || !segments.length || paragraphCues.has(cleanPara) || !soundCuesWanted(snap)) return;
    // Cue carries the playing track into later paragraphs, so the planner changes it only when the scene does.
    const playing = carried || beds.music && {title: beds.music.title || '', feels: beds.music.feels};
    paragraphCues.set(cleanPara, await chooseSoundCues(segments, signal, () => {}, playing));
    if (paragraphCues.size > 80) paragraphCues.delete(paragraphCues.keys().next().value);
  }

  const bridge = {
    version: 1,
    isAvailable: () => !disposed,
    getConfig: () => structuredClone(config),
    isNarratorMuted: () => speakerExcluded('Narrator'),
    setNarratorMuted: (muted) => {
      if (config) config.muteNarrator = Boolean(muted);
      if(!muted){
        for(const actor of [...(config?.fixed || []),...Object.values(config?.casts || {}).flat()])if(normalizeName(actor.speaker)==='narrator')actor.excluded=false;
        for(const entry of [...castRows,...npcRows])if(normalizeName(entry.read().speaker)==='narrator')entry.setExcluded(false);
      }
      if(!stopGroupedForSpeaker('Narrator')){generationPolicyChanged?.();if(muted && normalizeName(currentSpeaker)==='narrator')advancePlayback?.();}
      scheduleSettingsSave();if(plan)renderPreview();void flushSettings().catch(()=>{});
    },
    setSoundEnabled: (on) => {
      for (const name of ['enableSfx','enableAmbience','enableMusic']) { $(name).checked = Boolean(on); if (config) config[name] = Boolean(on); }
      scheduleSettingsSave(); syncSfxPlayback(); syncAmbiencePlayback(); syncMusicPlayback(); void flushSettings().catch(()=>{});
    },
    getMusic: () => currentMusic(),
    openDrawer: () => tab?.activate(),
    stop: () => stop(true),
    planParagraph: (text, speaker) => {
      const cap = capture();
      const castInfo = casting(cap);
      const snapshot = { ...structuredClone(cap), fixed: castInfo.fixed, voices: castInfo.voices, npcs: castInfo.npcs, defaultRoute: castInfo.defaultRoute, npcPolicy:castInfo.npcPolicy };
      // Switched-off sounds stay in the batches only to keep speech cuts stable;
      // companions see the sounds that will actually play.
      const off = segment => segment.kind === 'sfx' && snapshot.enableSfx === false || segment.kind === 'ambience' && snapshot.enableAmbience === false || segment.kind === 'music' && snapshot.enableMusic !== true;
      const batches = planAndBatchParagraph(text, snapshot, false, speaker).filter(segment => !off(segment));
      return { segments: batches };
    },
    playParagraph: async ({ text, speaker, nextText, chatId: targetChat, messageId, paragraphIndex, signal, onStatus } = {}) => {
      if (disposed) return { played: 0 };
      if(signal?.aborted)throw abortError();
      if(targetChat && targetChat!==chatId)throw new Error('The paragraph belongs to a different chat.');
      invalidateVolatileAudio({kind:'prune'});
      stop(false,true);const token=revision;
      const cap = capture();
      const castInfo = casting(cap);
      const snapshot = { ...structuredClone(cap), fixed: castInfo.fixed, voices: castInfo.voices, npcs: castInfo.npcs, defaultRoute: castInfo.defaultRoute, npcPolicy:castInfo.npcPolicy };

      snapshot.audioScope={chatId:targetChat || chatId,messageId:messageId || null};
      paragraphPlaybackScope=snapshot.audioScope;
      const ctrl = new AbortController();
      controller = ctrl;
      paragraphPrefetchControllers.add(ctrl);
      let finishParagraphWork=()=>Promise.resolve();
      updateTransport();
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        let cueWarning='';
        try{await loadParagraphCues(text,snapshot,speaker,ctrl.signal);}
        catch(error){if(ctrl.signal.aborted || token!==revision)throw abortError();cueWarning=error.message;}
        if(disposed || token!==revision || ctrl.signal.aborted || signal?.aborted)throw abortError();
        mixerPlaybackSegments=planAndBatchParagraph(text,snapshot,false,speaker);renderMixer();
        const batches = planAndBatchParagraph(text,snapshot,true,speaker).filter(batch=>!playbackExcluded(batch));
        if (!batches.length) {
          onStatus?.({ kind: 'idle', message: snapshot.muteNarrator ? 'Narrator muted' : 'No speech' });
          return { played: 0 };
        }

            let played=0;const warnings=new Set(cueWarning?[cueWarning]:[]);showFoleyStatus(cueWarning?`SFX skipped: ${cueWarning}. Speech continues.`:missingFoleyKey(snapshot),Boolean(cueWarning));
        const warnFoley=error=>{warnings.add(error.message);showFoleyStatus(`SFX skipped: ${[...warnings].join('; ')}. Speech continues.`);};
        // followBed later picks these loads up from paragraphAudioCache.
        const prefetchBeds=list=>{for(const batch of list)if(isBed(batch) && !batch[batch.kind].stop && !playbackExcluded(batch))getCachedOrSynthesize(batch,snapshot,bedPrefetch.signal).catch(()=>{});};
        prefetchBeds(batches);

        const speechJobs=new Map(),speechQueues=[{pending:[],active:0,limit:Math.max(1,Number(snapshot.concurrency)||1)},{pending:[],active:0,limit:1}];
        const cachedSpeechKeys=new Set([...paragraphAudioCache].filter(([,entry])=>!entry.signal).map(([key])=>key));
        let currentBatchIndex=0,nextBatches=[];
        const pumpSpeech=()=>{
          if(ctrl.signal.aborted || token!==revision || disposed){for(const queue of speechQueues)for(const job of queue.pending.splice(0))job.reject(abortError());return;}
          for(const queue of speechQueues)while(queue.pending.length && queue.active<queue.limit){
            const job=queue.pending.shift();
            if(playbackExcluded(job.batch)){speechJobs.delete(job.key);job.resolve(null);continue;}
            queue.active++;
            getCachedOrSynthesize(job.batch,snapshot,ctrl.signal).then(job.resolve,job.reject).finally(()=>{queue.active--;pumpSpeech();});
          }
        };
        const queueSpeech=(batch,prepare=true)=>{
          const key=segmentCacheKey(batch,snapshot);
          const saved=readVolatileAudio(paragraphAudioCache,key);
          if(cachedSpeechKeys.has(key) && saved && !saved.signal){
            speechJobs.set(key,saved.promise);
            return prepare?saved.promise.then(blob=>preparePlayback(blob,batch,snapshot)):saved.promise;
          }
          if(!speechJobs.has(key)){
            let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});
            speechJobs.set(key,promise);speechQueues[batch.kind==='sfx'?1:0].pending.push({key,batch,resolve,reject});pumpSpeech();
            return promise;
          }
          return speechJobs.get(key);
        };
        const prefetchSpeech=index=>{
          if(ctrl.signal.aborted || token!==revision)return;
          const candidates=[...batches,...nextBatches];
          const end=speechLookaheadEnd(candidates,index,Number(snapshot.prefetch)||0,{
            excluded:playbackExcluded,horizonSeconds:LOOKAHEAD_SECONDS,cached:batch=>{try{return cachedSpeechKeys.has(segmentCacheKey(batch,snapshot));}catch{return false;}}
          });
          const prepareEnd=speechLookaheadEnd(candidates,index,Number(snapshot.prefetch)||0,{excluded:playbackExcluded});
          for(let next=index;next<=end && next<candidates.length;next++){
            const batch=candidates[next];if(isBed(batch) || playbackExcluded(batch))continue;
            queueSpeech(batch,next<=prepareEnd);
          }
        };
        ctrl.signal.addEventListener('abort',pumpSpeech,{once:true});
        let nextCueWork=Promise.resolve();
        finishParagraphWork=async()=>{await nextCueWork;await Promise.allSettled([...speechJobs.values()]);};

        // Discover cues early; speech joins the queue when it falls within lookahead.
        if (snapshot.prefetch>0 && nextText && typeof nextText === 'string' && nextText.trim()) {
          // The current paragraph's music has not started yet, so name it directly.
          const carried = lastMusic(paragraphCues.get(paragraphSegments(text, snapshot, speaker).cleanPara)?.music);
          nextCueWork=loadParagraphCues(nextText, snapshot, '', ctrl.signal, carried).catch(() => {}).then(() => {
            if(ctrl.signal.aborted || token!==revision)return;
            nextBatches=planAndBatchParagraph(nextText,snapshot,true);
            prefetchBeds(nextBatches);prefetchSpeech(currentBatchIndex);
          }).catch(() => {});
        }

        for (let i = 0; i < batches.length; i++) {
          if (ctrl.signal.aborted || signal?.aborted) throw abortError();
          currentBatchIndex=i;
          const batch = batches[i];
          if(playbackExcluded(batch))continue;
          // The bed keeps running after this paragraph until another bed, a stop entry, stop() or cancellation.
          if(isBed(batch)){followBed(batch[batch.kind],bedSignal=>getCachedOrSynthesize(batch,snapshot,bedSignal).catch(error=>{if(!bedSignal.aborted)warnFoley(error);throw error;}),batch.kind);continue;}

          prefetchSpeech(i);

          onStatus?.({ kind: 'loading', speaker: batch.speaker });
          try{
            const blob = await queueSpeech(batch);
            if (ctrl.signal.aborted || signal?.aborted) throw abortError();
            if(!blob || playbackExcluded(batch))continue;
            onStatus?.({ kind: 'playing', speaker: batch.speaker });
            await playBlob(blob,ctrl.signal,batch.speaker,0,snapshot.normalizeLoudness,false,{messageId,items:batches,index:i,gapMs:gapBefore(batches,i)});
            played++;
          }catch(error){
            if(batch.kind!=='sfx' || ctrl.signal.aborted || signal?.aborted)throw error;
            paragraphAudioCache.delete(segmentCacheKey(batch,snapshot));dropVolatileSource(cacheKey(batch,snapshot));warnFoley(error);
          }
        }
        onStatus?.({ kind: 'idle', ...(warnings.size?{message:foleyWarning([...warnings]).trim()}: {}) });
        return { played, ...(warnings.size?{warnings:[...warnings]}: {}) };
      } catch(error) {
        ctrl.abort();
        if(token===revision)stopBeds();
        throw error;
      } finally {
        // A finished paragraph may still be preparing nextText. Keep that work
        // cancellable by Stop, navigation and the caller until its queue drains.
        void finishParagraphWork().finally(()=>{
          paragraphPrefetchControllers.delete(ctrl);
          signal?.removeEventListener('abort',onAbort);
          if(!disposed)updateTransport();
        });
        if (controller === ctrl){controller=null;paragraphPlaybackScope=null;}
        if (token === revision) clearReadAlong();
        updateTransport();
      }
    }
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.__CHOIR_API__ = bridge;
    const announce = () => globalThis.dispatchEvent?.(new (globalThis.CustomEvent || CustomEvent)('choir-available-v1', { detail: { version: 1 } }));
    announce();
    globalThis.addEventListener?.('choir-ping-v1', announce);
    unsubs.push(() => {
      globalThis.removeEventListener?.('choir-ping-v1', announce);
      if (globalThis.__CHOIR_API__ === bridge) delete globalThis.__CHOIR_API__;
      globalThis.dispatchEvent?.(new (globalThis.CustomEvent || CustomEvent)('choir-unavailable-v1', { detail: { version: 1 } }));
    });
  }



  const AudioChannel=document.defaultView?.BroadcastChannel;
  if(AudioChannel && audioNamespace){
    try{
      audioInvalidations=new AudioChannel(`choir-audio:${audioNamespace}`);
      audioInvalidations.onmessage=event=>{
        const change=event.data;
        if(!disposed && change && ['delete','chat','policy'].includes(change.kind) && typeof change.chatId==='string')invalidateVolatileAudio(change,false);
      };
      unsubs.push(()=>audioInvalidations.close());
    }catch{}
  }
  let retentionCleanup;
  const cleanExpiredAudio=()=>{
    if(disposed)return Promise.resolve();
    if(!retentionCleanup)retentionCleanup=recordingStore('prune').catch(error=>{if(!disposed && !busy)status(`Expired audio could not be cleared: ${error.message}`,true);}).finally(()=>{retentionCleanup=null;});
    return retentionCleanup;
  };
  const retentionTimer=setInterval(()=>void cleanExpiredAudio(),60000);retentionTimer.unref?.();
  const returnToChoir=()=>{if(document.visibilityState!=='hidden')void cleanExpiredAudio();};
  document.addEventListener('visibilitychange',returnToChoir);
  unsubs.push(()=>{clearInterval(retentionTimer);document.removeEventListener('visibilitychange',returnToChoir);});
  const cleanup=()=>{
    if(disposed)return;disposed=true;loadVersion++;cancelAutoReplies();saveOnLeave();stop(false);
    for(const done of [...pending.values()])done(abortError());
    unsubs.splice(0).forEach(fn=>fn());removeStyle();cleanupPlacements();
    try{audioDatabaseHandle?.close();}catch{}
    audioDatabaseHandle=null;audioDatabase=null;
    sessionAudio.clear();paragraphAudioCache.clear();foleyCache.clear();volatilePolicies.clear();paragraphCues.clear();
  };
  mixer.addEventListener('choir:replace',cleanup,{once:true});unsubs.push(()=>mixer.removeEventListener('choir:replace',cleanup));
  await loadChat();
  if(disposed)return cleanup;
  applyMixerLayout();
  if(!setupAutoStarted){setupAutoStarted=true;void setupWizard.start();}
  return cleanup;
}
