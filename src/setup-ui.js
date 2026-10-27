// Wizard-only styling. Host modal, theme and focus trapping stay with Lumiverse.
export const SETUP_CSS = `
  .choir-setup{font:inherit;line-height:1.45;color:var(--lumiverse-text,inherit);min-width:0;display:flex;flex-direction:column;height:min(690px,calc(100dvh - 130px));max-height:100%;--cs-border:var(--lumiverse-border,#8885);--cs-muted:var(--lumiverse-text-muted,inherit);--cs-accent:var(--lumiverse-primary,#bf6385)}
  .choir-setup *{box-sizing:border-box}
  .choir-setup[data-setup-complete="true"]{height:auto;max-height:min(690px,calc(100dvh - 130px))}
  .choir-setup [hidden]{display:none!important}
  .choir-setup [data-setup-body]{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:4px 8px 8px 0;scrollbar-gutter:stable}
  .choir-setup .cs-progress,.choir-setup .cs-actions,.choir-setup .cs-feedback,.choir-setup .cs-step-caption{flex-shrink:0}
  .choir-setup h2{font-size:1.35em;line-height:1.25;margin:0 0 8px;letter-spacing:-.02em}
  .choir-setup h3{font-size:1em;margin:0 0 10px}
  .choir-setup p{margin:6px 0 14px}
  .choir-setup small,.choir-setup .cs-hint{color:var(--cs-muted);font-size:.88em}
  .choir-setup small{display:block;margin-top:5px;overflow-wrap:anywhere}
  .choir-setup .cs-progress{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:0;padding:0 0 12px;list-style:none;border-bottom:1px solid var(--cs-border)}
  .choir-setup .cs-progress button{width:100%;padding:6px;font-size:.85em;display:flex;align-items:center;justify-content:center;gap:6px;background:transparent;border-color:transparent}
  .choir-setup .cs-progress span{font-variant-numeric:tabular-nums;color:var(--cs-muted)}
  .choir-setup .cs-progress b{font-weight:500}
  .choir-setup .cs-progress [aria-current="step"]{background:var(--lumiverse-primary-010,#8882);border-color:var(--cs-accent);color:var(--cs-accent)}
  .choir-setup .cs-progress [aria-current="step"] span{color:inherit}
  .choir-setup .cs-step-caption{font-size:.8em;color:var(--cs-muted);margin:10px 0 8px}
  .choir-setup .cs-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
  .choir-setup .cs-grid>.cs-card{margin-bottom:0}
  .choir-setup .cs-card{border:1px solid var(--cs-border);border-radius:10px;padding:16px;margin:0 0 14px;min-width:0}
  .choir-setup .cs-section{margin:18px 0 0;padding-top:16px;border-top:1px solid var(--cs-border)}
  .choir-setup .cs-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;min-width:0}
  .choir-setup .cs-row>p{flex:1;min-width:160px;margin:0}
  .choir-setup .cs-row>label{flex:1;min-width:160px}
  .choir-setup .cs-hero{display:flex;align-items:center;gap:20px;padding:18px 0 20px}
  .choir-setup .cs-logo{display:block;width:60px;height:96px;object-fit:contain;flex-shrink:0}
  .choir-setup .cs-lead{font-size:1.2em;font-weight:600;margin-bottom:8px}
  .choir-setup .cs-map{list-style:none;padding:0;margin:0 0 18px;display:grid;gap:0}
  .choir-setup .cs-map li{display:grid;grid-template-columns:32px 1fr;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--cs-border)}
  .choir-setup .cs-map strong{font-size:.95em;font-weight:600}
  .choir-setup .cs-map small{margin-top:2px}
  .choir-setup .cs-map-number{color:var(--cs-accent);font-size:1.15em;text-align:center}
  .choir-setup .cs-notice{padding:12px 14px;background:var(--lumiverse-fill-subtle,#8881);border-radius:8px;margin:12px 0}
  .choir-setup .cs-notice p:last-child{margin-bottom:0}
  .choir-setup label{display:flex;flex-direction:column;gap:5px;margin:8px 0;font-size:.92em;min-width:0}
  .choir-setup input,.choir-setup select,.choir-setup textarea{font:inherit;width:100%;min-width:0;min-height:40px;padding:8px 10px;border:1px solid var(--cs-border);border-radius:7px;background:var(--lumiverse-bg-elevated,transparent);color:inherit}
  .choir-setup option{background:var(--lumiverse-bg,Canvas);color:var(--lumiverse-text,CanvasText)}
  .choir-setup button{font:inherit;min-height:40px;padding:8px 12px;border:1px solid var(--cs-border);border-radius:7px;background:var(--lumiverse-fill,#8881);color:inherit;cursor:pointer}
  .choir-setup button:hover:enabled{background:var(--lumiverse-fill-hover,#8882);border-color:var(--cs-accent)}
  .choir-setup button:disabled{opacity:.5;cursor:default}
  .choir-setup :focus-visible{outline:2px solid var(--cs-accent);outline-offset:3px}
  .choir-setup .cs-primary{background:var(--lumiverse-primary-010,#8883);border-color:var(--cs-accent);font-weight:600}
  .choir-setup .cs-check{flex-direction:row;align-items:center;gap:10px;min-height:32px}
  .choir-setup .cs-check input{width:18px;height:18px;min-height:18px;flex-shrink:0;accent-color:var(--cs-accent);margin:0}
  .choir-setup .cs-check span{min-width:0}
  .choir-setup .cs-actions{display:flex;gap:8px;align-items:center;padding:12px 0 0;border-top:1px solid var(--cs-border)}
  .choir-setup .cs-actions .cs-primary{margin-left:auto}
  .choir-setup .cs-actions .cs-skip{background:transparent;border-color:transparent;color:var(--cs-muted)}
  .choir-setup .cs-feedback{white-space:pre-line;overflow-wrap:anywhere;font-size:.9em;margin:0;max-height:100px;overflow:auto}
  .choir-setup .cs-feedback:not(:empty){padding:10px 0}
  .choir-setup .cs-error{color:var(--lumiverse-danger,#df8585)}
  .choir-setup .cs-role-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0 12px}
  .choir-setup .cs-role-picker button{text-align:left;background:transparent;min-width:0;padding:10px 12px}
  .choir-setup .cs-role-picker [aria-pressed="true"]{background:var(--lumiverse-primary-010,#8882);border-color:var(--cs-accent)}
  .choir-setup .cs-role-picker strong{display:block;font-weight:600;font-size:.92em}
  .choir-setup .cs-role-picker small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .choir-setup .cs-voice-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
  .choir-setup .cs-voice-title h3{margin:0}
  .choir-setup .cs-voice-title label{margin:0}
  .choir-setup .cs-voice-choices{display:grid;grid-template-columns:2fr 1fr;gap:12px}
  .choir-setup .cs-voice-choices .cs-gender{grid-column:2;grid-row:1}
  .choir-setup .cs-voice-choices .cs-voice{grid-column:1;grid-row:1}
  .choir-setup .cs-voice-fields>small{margin:4px 0 8px}
  .choir-setup .cs-voice-fields details{margin:8px 0 12px}
  .choir-setup summary{cursor:pointer;min-height:32px;align-content:center;font-size:.92em}
  .choir-setup .cs-status{font-size:.8em;color:var(--cs-muted);white-space:nowrap}
  .choir-setup .cs-review{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--cs-border);min-width:0}
  .choir-setup .cs-review h3{margin:0;font-size:.94em}
  .choir-setup .cs-review small{margin-top:3px}
  .choir-setup .cs-review button{padding:6px 10px}
  .choir-setup .cs-review-group{margin:12px 0 18px}
  .choir-setup .cs-review-group>h3{color:var(--cs-muted);font-size:.82em;margin-bottom:0}
  .choir-setup .cs-guide{margin:12px 0;font-size:.94em}
  .choir-setup .cs-guide summary{font-weight:500}
  .choir-setup .cs-guide ol{padding-left:22px;margin:12px 0;list-style:decimal}
  .choir-setup .cs-guide li{display:list-item;list-style:decimal;margin:8px 0;overflow-wrap:anywhere}
  .choir-setup .cs-guide a{color:var(--cs-accent);text-decoration:underline;text-underline-offset:3px}
  .choir-setup .cs-guide-steps{display:grid;gap:16px}
  .choir-setup .cs-guide-steps>li{margin:0;padding:12px;border:1px solid var(--cs-border);border-radius:8px;min-width:0}
  .choir-setup .cs-guide-steps h4{font-size:1em;margin:0 0 8px}
  .choir-setup .cs-guide-steps p{margin:8px 0}
  .choir-setup .cs-guide figure{margin:12px 0 0;min-width:0}
  .choir-setup .cs-guide-picture{overflow:auto;max-height:440px;border-radius:8px}
  .choir-setup .cs-guide-picture img{display:block;width:100%;max-width:360px;height:auto;margin:auto}
  .choir-setup .cs-guide-picture[data-picture-kind="screenshot"] img{max-width:620px}
  .choir-setup .cs-guide-picture.cs-picture-large img{width:720px;max-width:none;margin:0}
  .choir-setup .cs-guide figcaption{font-size:.85em;color:var(--cs-muted);margin:6px 0}
  .choir-setup .cs-guide .cs-picture-toggle{font-size:.88em;padding:5px 10px;min-height:36px}
  .choir-setup .cs-guide-links{display:flex;flex-wrap:wrap;gap:8px 14px;margin:8px 0}
  .choir-setup .cs-guide .cs-guide-help{padding-left:20px;list-style:disc}
  .choir-setup .cs-guide .cs-guide-help li{list-style:disc}
  @media(pointer:coarse),(max-width:600px){.choir-setup button,.choir-setup input,.choir-setup select{min-height:44px}.choir-setup input,.choir-setup select,.choir-setup textarea{font-size:16px}.choir-setup .cs-check{min-height:44px}.choir-setup .cs-check input{min-height:18px}.choir-setup summary{min-height:44px}}
  @media(max-width:600px){.choir-setup .cs-grid{grid-template-columns:1fr;gap:12px}.choir-setup .cs-card{padding:12px}.choir-setup .cs-progress button{font-size:.8em;padding:6px 2px;gap:4px}.choir-setup .cs-role-picker button{padding:10px 8px}.choir-setup .cs-review{gap:8px}.choir-setup .cs-review .cs-status{grid-column:1;grid-row:2}.choir-setup .cs-review button{grid-column:2;grid-row:1 / span 2}.choir-setup .cs-review{grid-template-columns:minmax(0,1fr) auto}.choir-setup .cs-actions{gap:6px}.choir-setup .cs-actions button{padding:8px;font-size:.9em}.choir-setup .cs-hero{gap:12px;padding:8px 0 14px}.choir-setup .cs-logo{width:44px;height:74px}.choir-setup .cs-role-picker small{font-size:.82em}}
  @media(max-width:400px){.choir-setup .cs-progress b{display:none}.choir-setup .cs-progress button{font-size:.95em}.choir-setup .cs-voice-choices{grid-template-columns:minmax(0,1fr)}.choir-setup .cs-voice-choices .cs-gender,.choir-setup .cs-voice-choices .cs-voice{grid-column:auto;grid-row:auto}.choir-setup .cs-voice-choices .cs-voice{grid-row:1}.choir-setup .cs-role-picker{gap:5px}.choir-setup .cs-role-picker strong{font-size:.82em}.choir-setup .cs-voice-title{align-items:flex-start}}
  @media(max-height:520px){.choir-setup{height:calc(100dvh - 110px)}.choir-setup .cs-step-caption{margin:4px 0}.choir-setup .cs-progress{padding-bottom:6px}}
  @media(prefers-reduced-motion:reduce){.choir-setup *{scroll-behavior:auto}}
`;

// Embedded so the first-run icon also works offline. Source: assets/logo.svg.
export const SETUP_LOGO = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 380\" width=\"100%\" height=\"100%\">\n  <defs>\n    <!-- Clef Gradient: Crimson / Raspberry -->\n    <linearGradient id=\"clefGradient\" x1=\"0%\" y1=\"0%\" x2=\"0%\" y2=\"100%\">\n      <stop offset=\"0%\" stop-color=\"#C72C50\"/>\n      <stop offset=\"60%\" stop-color=\"#BA2448\"/>\n      <stop offset=\"100%\" stop-color=\"#A81D3E\"/>\n    </linearGradient>\n\n    <!-- Sparkle Star Gradient: Warm Gold / Peach -->\n    <linearGradient id=\"starGradient\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">\n      <stop offset=\"0%\" stop-color=\"#F2AE6B\"/>\n      <stop offset=\"100%\" stop-color=\"#DE8645\"/>\n    </linearGradient>\n  </defs>\n\n  <g transform=\"translate(15, 10)\">\n    <!-- 4-Point Accent Sparkle Star -->\n    <path fill=\"url(#starGradient)\" d=\"\n      M 148 10 \n      Q 148 26 158 26 \n      Q 148 26 148 42 \n      Q 148 26 138 26 \n      Q 148 26 148 10 Z\n    \"/>\n\n    <!-- Treble Clef (G-Clef) -->\n    <path fill=\"url(#clefGradient)\" fill-rule=\"evenodd\" d=\"\n      M 98.4 34.2\n      C 93.6 34.2 89.2 37.4 87.4 42.3\n      C 85.5 47.9 86.9 55.5 89.6 64\n      C 94.4 79 102.6 99.4 111.1 122.2\n      C 103.4 128.8 96.4 136.6 90.5 145.7\n      C 81.1 160.3 74.8 176.9 71.7 194.5\n      C 68.6 212.2 69.2 230 73.7 246.6\n      C 78.2 263.1 86.9 277 98.8 287.1\n      C 106.4 293.5 115.2 297.8 125 299.7\n      L 125 308.8\n      C 125 320.3 121.9 329.7 115.9 336.6\n      C 109.9 343.6 101.5 347.2 90.9 347.2\n      C 83.3 347.2 76.6 345 71.1 340.6\n      C 65.6 336.2 62.1 330 60.8 322.1\n      C 65.2 320.9 68.9 318.1 71.4 313.9\n      C 73.9 309.7 74.9 304.7 73.8 299.5\n      C 72.7 294.3 69.6 290 65.3 287.3\n      C 61 284.6 55.7 284 50.8 285.6\n      C 44.8 287.6 39.9 292 37.4 298.1\n      C 34.8 304.2 34.6 311.3 37 318\n      C 40.1 327.1 46 335.2 54.3 341.6\n      C 63.5 349 75 354 87.9 355.8\n      C 90.6 356.2 93.3 356.4 96.1 356.4\n      C 109.3 356.4 121.2 352 130.9 343.4\n      C 140.7 334.8 145.8 322.6 145.8 307\n      L 145.8 220\n      C 153.6 213.3 160.2 204.6 165 194.3\n      C 170.5 182.8 173.3 170.2 173.3 157.3\n      C 173.3 141.8 169.2 128.2 161.1 117.1\n      C 153.4 106.6 142.9 100.2 130.1 98.1\n      C 126.4 88.1 122.3 77.4 118.2 66.5\n      C 114.6 56.8 111.4 47.5 109.1 39.7\n      C 107 33 106.5 27.5 107.2 23.7\n      L 99.1 22\n      C 98.1 25.5 98.4 29.8 98.4 34.2\n      Z\n      M 125 146.8\n      L 125 197.3\n      C 129.9 193.5 134.2 188.6 137.6 182.6\n      C 141.5 175.8 143.5 168.3 143.5 160.3\n      C 143.5 153.3 141.7 146.9 138.1 141.4\n      C 134.7 136 130.1 132.5 125 131.1\n      L 125 146.8\n      Z\n      M 117.2 145.8\n      L 117.2 214.3\n      C 110.5 212 104.7 207.8 100.1 202\n      C 94.8 195.2 92.1 186.8 92.1 176.9\n      C 92.1 166.1 95.1 156.2 100.9 146.9\n      C 105.4 139.8 110.8 133.7 116.9 128.7\n      L 117.2 145.8\n      Z\n      M 112.5 73.7\n      C 110.4 68 108.7 62.5 107.7 57.4\n      C 106.7 52.3 106.3 47.9 106.9 44.3\n      C 107.5 40.7 109.1 38.8 111.7 38.8\n      C 114.3 38.8 116.7 40.8 118.9 44.8\n      C 121.1 48.8 123.4 55 125.8 63.4\n      L 112.5 73.7\n      Z\n    \"/>\n  </g>\n</svg>\n";
