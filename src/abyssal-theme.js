// Static decoration with no remote assets, timers or changes to the host theme.
const abyssalStars = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220">
  <g fill="none" stroke="#86abd5" stroke-opacity=".16" stroke-width=".6"><path d="m26 44 53 21 43-38 52 50M212 153l40-31 49 22 33-45"/></g>
  <g fill="#b9d0eb" fill-opacity=".55"><circle cx="26" cy="44" r="1.1"/><circle cx="79" cy="65" r="1.4"/><circle cx="122" cy="27" r="1"/><circle cx="174" cy="77" r="1.2"/><circle cx="212" cy="153" r="1"/><circle cx="252" cy="122" r="1.3"/><circle cx="301" cy="144" r="1"/><circle cx="334" cy="99" r="1.4"/><circle cx="41" cy="166" r=".7"/><circle cx="139" cy="132" r=".6"/><circle cx="284" cy="42" r=".8"/><circle cx="184" cy="199" r=".7"/></g>
  <g fill="#e0cfaa" fill-opacity=".65"><path d="m226 27 1.5 4.5L232 33l-4.5 1.5L226 39l-1.5-4.5L220 33l4.5-1.5z"/><path d="m93 182 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></g>
</svg>`)}")`;

export const ABYSSAL_THEME_CSS = `
  :where(.choir-mixer[data-abyssal-theme="true"]){
    --abyss-bg:#061323;--abyss-surface:#0d2138;--abyss-hover:#15304d;
    --abyss-accent:#86abd5;--abyss-accent-hover:#a3c3e8;
    --abyss-text:#eaf1fb;--abyss-muted:#b8c9dd;--abyss-dim:#91a8c1;
    --abyss-gold:var(--ac-starlight,#e0cfaa);
    --abyss-line:rgb(151 187 224 / 27%);--abyss-line-hover:rgb(177 211 245 / 48%);
    --abyss-stars:${abyssalStars};color-scheme:dark;
  }
  .choir-mixer[data-abyssal-theme="true"]{
    --cm-accent:var(--abyss-accent);--cm-accent-text:#e9f2ff;--cm-accent-contrast:#061323;
    --cm-bg:var(--abyss-bg);--cm-bg-elevated:var(--abyss-surface);--cm-text:var(--abyss-text);
    --cm-muted:var(--abyss-muted);--cm-dim:var(--abyss-dim);--cm-line:var(--abyss-line);
    --cm-border-hover:var(--abyss-line-hover);--cm-hover:var(--abyss-hover);--cm-fill:rgb(10 28 50 / 62%);
    --cm-accent-soft:rgb(134 171 213 / 12%);--cm-accent-line:rgb(134 171 213 / 50%);--cm-warning:#e0cfaa;
    --lumiverse-primary-hover:var(--abyss-accent-hover);--lumiverse-input-bg:rgb(4 13 27 / 76%);
    background:radial-gradient(ellipse at 100% 0%,rgb(35 83 134 / 27%),transparent 65%),linear-gradient(150deg,#0d2138,#061323 70%);
    border-color:var(--abyss-line-hover);box-shadow:0 16px 48px rgb(1 7 16 / 60%),0 0 22px rgb(134 171 213 / 8%),inset 0 1px 0 rgb(185 208 235 / 8%);
    font-family:var(--ac-ui-font,"Segoe UI",system-ui,sans-serif);
  }
  .choir-mixer[data-abyssal-theme="true"] .cm-header{background-image:var(--abyss-stars);background-position:30% 0}
  .choir-mixer[data-abyssal-theme="true"] .cm-brand strong{color:var(--abyss-gold);font-family:var(--ac-display-font,Georgia,serif);font-size:16px;letter-spacing:.03em}
  .choir-mixer[data-abyssal-theme="true"] .cm-brand-icon{color:var(--abyss-gold);border:1px solid var(--abyss-line);background:rgb(134 171 213 / 9%)}
  .choir-mixer[data-abyssal-theme="true"] .cm-auto-plan button[aria-pressed="true"]{background:var(--cm-accent-soft);border-color:var(--abyss-accent);color:var(--cm-accent-text)}
  .choir-mixer[data-abyssal-theme="true"] .cm-channel-tabs{background:var(--abyss-bg)}
  .choir-mixer[data-abyssal-theme="true"] .cm-channel-tab[aria-selected="true"]{border-color:var(--abyss-accent);box-shadow:inset 0 1px 0 rgb(185 208 235 / 10%)}
  .choir-mixer[data-abyssal-theme="true"] .cm-channel[aria-current="true"]{border-radius:8px}
  .choir-mixer[data-abyssal-theme="true"][data-collapsed="true"]{background:radial-gradient(circle at 35% 25%,#254569,#061323 75%);box-shadow:0 6px 20px rgb(1 7 16 / 55%),0 0 18px rgb(134 171 213 / 15%);color:var(--abyss-gold)}
  @media(forced-colors:active){
    .choir-mixer[data-abyssal-theme="true"],.choir-mixer[data-abyssal-theme="true"][data-collapsed="true"]{background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none}
    .choir-mixer[data-abyssal-theme="true"] .cm-header{background-image:none}
    .choir-mixer[data-abyssal-theme="true"] .cm-brand strong{color:CanvasText}
    .choir-mixer[data-abyssal-theme="true"] .cm-auto-plan button[aria-pressed="true"]{background:Highlight;color:HighlightText;border-color:Highlight}
  }
`;
