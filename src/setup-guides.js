// These are diagrams, not screenshots. Reuse the same SVGs in the wizard and docs.
function guideEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function guideText(x, y, value, size = 13, color = '#eef5fc', weight = 400) {
  return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + color + '" font-weight="' + weight + '">' + guideEscape(value) + '</text>';
}

function guideBox(x, y, width, height, fill = '#091727', stroke = '#3b526b') {
  return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" rx="7" fill="' + fill + '" stroke="' + stroke + '"/>';
}

function guideField(y, label, value) {
  return guideText(20, y + 19, label, 12, '#b4c4d6') +
    guideBox(105, y, 227, 26) + guideText(114, y + 18, value, 12);
}

function guideButton(x, y, width, label) {
  return guideBox(x, y, width, 31, '#244e68', '#71deff') + guideText(x + 12, y + 21, label, 13, '#eef5fc', 600);
}

function guideFocus(x, y, width, height) {
  return '<rect x="' + (x - 3) + '" y="' + (y - 3) + '" width="' + (width + 6) + '" height="' + (height + 6) + '" rx="9" fill="none" stroke="#71deff" stroke-width="2"/>' +
    '<path d="M' + (x - 14) + ' ' + (y + height / 2) + 'h9m-4-4 4 4-4 4" fill="none" stroke="#71deff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
}

function guideCheck(y, label) {
  return guideBox(20, y - 13, 17, 17, '#244e68', '#71deff') +
    '<path d="M24 ' + (y - 5) + 'l3 3 6-7" fill="none" stroke="#71deff" stroke-width="2"/>' +
    guideText(47, y, label, 13);
}

function guideIllustration(title, content, description) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240" role="img" aria-labelledby="guide-title guide-description">' +
    '<title id="guide-title">' + guideEscape(title) + '</title><desc id="guide-description">' + guideEscape(description) + '</desc>' +
    '<g font-family="Arial, Helvetica, sans-serif">' +
    '<rect width="360" height="240" rx="14" fill="#091727"/>' +
    '<path d="M14 0h332a14 14 0 0 1 14 14v28H0V14A14 14 0 0 1 14 0" fill="#15283f"/>' +
    guideText(16, 27, title, 13, '#eef5fc', 600) +
    '<rect x="287" y="11" width="59" height="22" rx="11" fill="#244e68"/>' +
    guideText(296, 26, 'Example', 10, '#bfefff', 600) +
    content +
    guideText(16, 234, 'Illustration · layout may change', 10, '#b4c4d6') +
    '</g></svg>';
}

function guideStep(id, title, body, links, svg, alt, caption) {
  return { id, title, body, links, picture: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), alt, caption };
}

export const SETUP_GUIDES = {
  fish: {
    title: 'How to connect Fish Audio',
    intro: 'Create a Fish API key, save it in a Lumiverse TTS connection, then choose and test that connection in Choir.',
    note: 'The pictures are illustrated examples, not screenshots. Labels and page layouts can change. All keys shown are masked placeholders.',
    steps: [
      guideStep(
        'fish-account',
        'Sign in to Fish Audio',
        'Sign in or create a Fish Audio account. Verify your email if asked, then open the API keys page.',
        [{ label: 'Create a Fish Audio account', url: 'https://fish.audio/auth/signup' }, { label: 'API keys page', url: 'https://fish.audio/app/api-keys' }],
        guideIllustration('Fish Audio · account',
          guideText(20, 73, 'Create an account or sign in', 17, '#eef5fc', 600) +
          guideBox(20, 88, 312, 29) + guideText(31, 108, 'Email address', 13, '#b4c4d6') +
          guideBox(20, 126, 312, 29) + guideText(31, 146, 'Password: ••••••••', 13, '#b4c4d6') +
          guideButton(20, 169, 151, 'Sign in / sign up') + guideFocus(20, 169, 151, 31) +
          guideText(20, 216, 'Verify your email if prompted.', 12, '#b4c4d6'),
          'An example Fish Audio account page highlights signing in or creating an account.'),
        'Illustration of signing in or creating a Fish Audio account; no account information is shown.',
        'Start with your Fish Audio account.'
      ),
      guideStep(
        'fish-api-key',
        'Create and copy an API key',
        'On API Keys, choose Create New Key and give it a name such as Choir. Set an expiration only if you want one. Copy the new key and keep it private.',
        [{ label: 'Open API Keys', url: 'https://fish.audio/app/api-keys' }, { label: 'Official API key instructions', url: 'https://docs.fish.audio/developer-guide/getting-started/api-key' }],
        guideIllustration('Fish Audio · API Keys',
          guideText(20, 73, 'API keys', 18, '#eef5fc', 600) +
          guideBox(20, 87, 312, 31) + guideText(31, 108, 'Key name: Choir', 13) +
          guideButton(20, 136, 161, 'Create New Key') + guideFocus(20, 136, 161, 31) +
          guideBox(20, 185, 312, 28) + guideText(31, 204, 'New key: •••• •••• ••••', 13, '#b4c4d6'),
          'An example API Keys page highlights Create New Key and shows a masked key placeholder.'),
        'Illustration highlighting Create New Key. The API key is masked.',
        'Create a named API key and copy it securely.'
      ),
      guideStep(
        'fish-lumiverse',
        'Create the Lumiverse TTS connection',
        'Open Lumiverse Connect → TTS → New TTS Connection. Give it a name, select Fish Audio, and paste the key into API Key. Leave API URL empty, choose an available Model, and click Create. Existing connections use Save.',
        [],
        guideIllustration('Lumiverse · TTS connection',
          guideField(48, 'Name', 'Choir Fish Audio') +
          guideField(75, 'Provider', 'Fish Audio') +
          guideField(102, 'API Key', '•••• •••• ••••') +
          guideField(129, 'API URL', 'Leave empty') +
          guideField(156, 'Model', 'Select an available model') +
          guideButton(235, 187, 97, 'Create') + guideFocus(235, 187, 97, 31),
          'An example Lumiverse TTS connection contains a masked API Key, an empty API URL, and highlights Create.'),
        'Illustration of Lumiverse’s connection fields. Leave API URL empty to use the provider default.',
        'Store the API key in the Lumiverse connection.'
      ),
      guideStep(
        'fish-choose-connection',
        'Select the saved connection in Choir',
        'Return to the Choir setup wizard. Click Refresh connections, then choose your saved Fish Audio connection under Default TTS connection.',
        [],
        guideIllustration('Choir · setup wizard',
          guideText(20, 74, 'Choose your TTS connection', 17, '#eef5fc', 600) +
          guideButton(20, 91, 187, 'Refresh connections') + guideFocus(20, 91, 187, 31) +
          guideText(20, 153, 'Default TTS connection', 13, '#b4c4d6') +
          guideBox(20, 165, 312, 34) + guideText(31, 188, 'Choir Fish Audio', 13) + guideText(310, 188, '▾', 14),
          'An example Choir setup screen highlights Refresh connections and shows the saved Fish Audio connection selected.'),
        'Illustration of refreshing the connection list and selecting Choir Fish Audio.',
        'Refresh after creating or changing a connection.'
      ),
      guideStep(
        'fish-voice-id',
        'Choose a voice, or copy its voice ID',
        'In TTS & Voices, choose a Narrator voice. For a voice missing from the list, open its Fish Audio voice page and copy its voice ID from the page URL or copy button. In Choir, expand Use a provider voice ID and paste it into Narrator voice ID. A voice ID is different from an API key.',
        [{ label: 'Browse Fish Audio voices', url: 'https://fish.audio/' }, { label: 'Official voice ID instructions', url: 'https://docs.fish.audio/developer-guide/getting-started/quickstart' }],
        guideIllustration('Fish Audio · voice page',
          guideText(20, 73, 'Choose a voice', 18, '#eef5fc', 600) +
          guideBox(20, 88, 312, 47) + guideText(31, 107, 'fish.audio/m/', 12, '#b4c4d6') +
          guideText(31, 125, '<voice-id>', 13, '#71deff', 600) +
          guideButton(20, 151, 148, 'Copy voice ID') + guideFocus(20, 151, 148, 31) +
          guideText(20, 205, 'Paste into Narrator voice ID in Choir.', 12, '#b4c4d6'),
          'An example voice page highlights Copy voice ID and distinguishes the voice ID from the API key.'),
        'Illustration of finding a voice ID. The text <voice-id> is a placeholder.',
        'API Key identifies your account; Voice identifies the voice.'
      ),
      guideStep(
        'fish-test',
        'Test the narrator before finishing',
        'In TTS & Voices, select your narrator voice and click Test narrator voice. Listen to the result. When it works, continue to Review and Finish setup. If Fish reports insufficient credits or access, check API billing and the selected model’s availability.',
        [{ label: 'Fish API billing', url: 'https://fish.audio/app/billing/' }, { label: 'Current Fish API capabilities', url: 'https://docs.fish.audio/overview/capabilities' }],
        guideIllustration('Choir · TTS & Voices',
          guideText(20, 74, 'TTS & Voices', 18, '#eef5fc', 600) +
          guideText(20, 102, 'Narrator voice', 13, '#b4c4d6') +
          guideBox(20, 114, 312, 32) + guideText(31, 136, 'Your selected Fish voice', 13) + guideText(310, 136, '▾', 14) +
          guideButton(20, 169, 193, 'Test narrator voice') + guideFocus(20, 169, 193, 31) +
          guideText(20, 216, 'Listen, then continue to Review.', 12, '#b4c4d6'),
          'An example TTS and Voices step highlights Test narrator voice beneath the narrator voice selection.'),
        'Illustration highlighting Test narrator voice before finishing setup.',
        'A successful preview confirms that the connection and voice work together.'
      ),
    ],
    sources: [
      { label: 'Fish Audio: Get Your API Key', url: 'https://docs.fish.audio/developer-guide/getting-started/api-key' },
      { label: 'Fish Audio: Quick Start and voice IDs', url: 'https://docs.fish.audio/developer-guide/getting-started/quickstart' },
      { label: 'Fish Audio: Current API capabilities', url: 'https://docs.fish.audio/overview/capabilities' },
    ],
    troubleshooting: [
      'Invalid or missing API key: update API Key in the Lumiverse connection, save it, then refresh Choir’s connections.',
      'Insufficient credits or access: check Fish API billing and model availability. Available free and paid API options can change; a paid web subscription is not a required setup step here.',
      'Unavailable voice or reference ID: verify the voice ID on its Fish Audio page and choose a voice your account can use. Never paste an API key into Voice.',
      'A rate-limit error needs a short wait before retrying. Repeated retries can make it last longer.',
    ],
  },
  freesound: {
    title: 'How to get a Freesound API key',
    intro: 'Get a Freesound API key, paste it into Optional Features, then enable the sound features and choose the LLM that selects sound cues.',
    note: 'The pictures are illustrated examples, not screenshots. Labels and page layouts can change. All keys shown are masked placeholders.',
    steps: [
      guideStep(
        'freesound-account',
        'Sign in to Freesound',
        'Sign in to Freesound or create an account. Verify your email if asked before requesting API credentials.',
        [{ label: 'Open Freesound', url: 'https://freesound.org/' }],
        guideIllustration('Freesound · account',
          guideText(20, 73, 'Sign in or create an account', 17, '#eef5fc', 600) +
          guideBox(20, 88, 312, 29) + guideText(31, 108, 'Your account', 13, '#b4c4d6') +
          guideBox(20, 126, 312, 29) + guideText(31, 146, 'Password: ••••••••', 13, '#b4c4d6') +
          guideButton(20, 169, 118, 'Sign in') + guideFocus(20, 169, 118, 31) +
          guideText(20, 216, 'Verify your email if prompted.', 12, '#b4c4d6'),
          'An example Freesound account page highlights Sign in.'),
        'Illustration of signing in to Freesound; no account information is shown.',
        'Use your Freesound account to request API credentials.'
      ),
      guideStep(
        'freesound-apply',
        'Request API credentials',
        'Open the API credentials page and complete the application form shown there. Use a name such as Choir and describe your intended sound-effects and ambience use.',
        [{ label: 'Open Freesound API credentials', url: 'https://freesound.org/apiv2/apply/' }, { label: 'Official API authentication help', url: 'https://freesound.org/docs/api/authentication.html#token-authentication' }],
        guideIllustration('Freesound · API credentials',
          guideText(20, 73, 'Request API credentials', 18, '#eef5fc', 600) +
          guideBox(20, 91, 312, 34, '#244e68', '#71deff') + guideText(30, 114, 'freesound.org/apiv2/apply/', 13, '#bfefff', 600) +
          guideFocus(20, 91, 312, 34) +
          guideText(20, 158, 'Example application name: Choir', 13) +
          guideText(20, 183, 'Purpose: story effects and ambience', 13) +
          guideText(20, 210, 'Complete the form on that page.', 12, '#b4c4d6'),
          'An example diagram highlights the Freesound API credentials address and suggests an application name and purpose.'),
        'Illustration of where to request credentials. The live page supplies the application form.',
        'Request credentials for the application you will use.'
      ),
      guideStep(
        'freesound-secret',
        'Copy Client secret/Api key',
        'In your API credentials, copy the value under Client secret/Api key. Do not copy Client ID: it is a different value and will not authenticate Choir’s sound searches.',
        [{ label: 'Open your API credentials', url: 'https://freesound.org/apiv2/apply/' }, { label: 'Official token authentication instructions', url: 'https://freesound.org/docs/api/authentication.html#token-authentication' }],
        guideIllustration('Freesound · API credentials',
          guideText(20, 73, 'Your API credentials', 18, '#eef5fc', 600) +
          guideBox(20, 91, 312, 71) +
          '<path d="M115 91v71M20 122h312" stroke="#3b526b"/>' +
          guideText(29, 112, 'Client ID', 12, '#b4c4d6', 600) +
          guideText(125, 112, 'Client secret/Api key', 12, '#eef5fc', 600) +
          guideText(29, 146, '(ID)', 13, '#b4c4d6') +
          guideText(125, 146, '•••• •••• ••••', 15, '#71deff') +
          guideFocus(119, 94, 209, 64) +
          guideText(20, 193, 'Copy the secret / API key column.', 13, '#71deff', 600) +
          guideText(20, 215, 'Client ID is not the API key.', 12, '#b4c4d6'),
          'An example credentials table highlights the Client secret/Api key column and leaves Client ID unselected.'),
        'Illustration highlighting Client secret/Api key, with a masked placeholder value.',
        'Copy the secret/API key column, not Client ID.'
      ),
      guideStep(
        'freesound-paste',
        'Paste the key into Choir',
        'In the Choir setup wizard, open Optional Features. Paste the copied secret into Freesound API key. Keep the key private; the field hides it while you type.',
        [],
        guideIllustration('Choir · Optional Features',
          guideText(20, 74, 'Optional Features', 18, '#eef5fc', 600) +
          guideText(20, 112, 'Freesound API key', 13, '#b4c4d6') +
          guideBox(20, 127, 312, 36) + guideText(31, 151, '•••• •••• ••••', 15) +
          guideFocus(20, 127, 312, 36) +
          guideText(20, 195, 'Paste Client secret/Api key here.', 13, '#71deff', 600),
          'An example Optional Features step highlights Choir’s masked Freesound API key field.'),
        'Illustration showing the Freesound API key field in Optional Features.',
        'Paste the Freesound key into Choir’s dedicated field.'
      ),
      guideStep(
        'freesound-enable',
        'Enable sounds and choose the cue LLM',
        'Enable Sound effects and/or Ambient sound. Select a working Sound cue LLM connection so Choir can choose relevant sounds for the story. You can leave these features off if you do not want sounds.',
        [],
        guideIllustration('Choir · Optional Features',
          guideText(20, 74, 'Choose your sound features', 17, '#eef5fc', 600) +
          guideCheck(106, 'Sound effects') +
          guideCheck(139, 'Ambient sound') +
          guideText(20, 174, 'Sound cue LLM connection', 13, '#b4c4d6') +
          guideBox(20, 186, 312, 29) + guideText(31, 206, 'Your working LLM connection', 12) + guideText(310, 206, '▾', 14) +
          guideFocus(20, 186, 312, 29),
          'An example Optional Features step enables sound effects and ambient sound and highlights the Sound cue LLM connection.'),
        'Illustration highlighting the LLM used to choose sound cues.',
        'The Freesound key finds audio; the cue LLM chooses when to use it.'
      ),
      guideStep(
        'freesound-finish',
        'Finish setup and try Plan & Play',
        'Continue to Review and click Finish setup to save your choices. In Choir’s Plan & Play section, use Plan latest on a story with a sound or ambience cue, then Play in the voice mixer to check the result.',
        [],
        guideIllustration('Choir · Review',
          guideText(20, 74, 'Review', 18, '#eef5fc', 600) +
          guideCheck(105, 'Freesound API key added') +
          guideCheck(134, 'Sound features enabled') +
          guideCheck(163, 'Sound cue LLM selected') +
          guideButton(20, 181, 139, 'Finish setup') + guideFocus(20, 181, 139, 31) +
          guideText(184, 202, 'Then Plan & Play', 12, '#b4c4d6'),
          'An example Review step highlights Finish setup after the key, sound features, and cue LLM have been chosen.'),
        'Illustration highlighting Finish setup; then try a story in Plan & Play.',
        'Finish setup saves the choices for your sound test.'
      ),
    ],
    sources: [
      { label: 'Freesound: API credentials', url: 'https://freesound.org/apiv2/apply/' },
      { label: 'Freesound: Token authentication', url: 'https://freesound.org/docs/api/authentication.html#token-authentication' },
    ],
    troubleshooting: [
      'Authentication fails: confirm you copied Client secret/Api key, not Client ID, and removed any surrounding spaces.',
      'No effects or ambience: check the relevant feature toggle and Sound cue LLM connection, then try a story with a clear sound cue. A cue can have no suitable search result.',
      'For Choir’s sound search and previews, use the API key. You do not need to set up an OAuth authorization flow.',
      'You can finish setup without Freesound and add the key later. Leave sound effects and ambience off until you want to use them.',
    ],
  },
};

export function guideGetAssetEntries() {
  return Object.values(SETUP_GUIDES).flatMap(guide => guide.steps.map(step => ({
    fileName: step.id + '.svg',
    svg: decodeURIComponent(step.picture.slice('data:image/svg+xml;charset=utf-8,'.length)),
  })));
}

export function guideBuildMarkdown() {
  const lines = [
    '# Illustrated sound setup',
    '',
    'These pictures are diagrams of the steps, not screenshots. Website layouts can change. Every key shown is a masked placeholder; never share your real API keys.',
    '',
  ];
  for (const guide of Object.values(SETUP_GUIDES)) {
    lines.push('## ' + guide.title, '', guide.intro, '');
    guide.steps.forEach((step, index) => {
      lines.push('### ' + (index + 1) + '. ' + step.title, '', step.body, '');
      for (const link of step.links) lines.push('[' + link.label + '](' + link.url + ')', '');
      lines.push('![' + step.alt.replaceAll('[', '').replaceAll(']', '') + '](../assets/guides/' + step.id + '.svg)', '', '*' + step.caption + '*', '');
    });
    lines.push('### Troubleshooting', '');
    for (const item of guide.troubleshooting) lines.push('- ' + item);
    lines.push('', '### Official sources', '');
    for (const source of guide.sources) lines.push('- [' + source.label + '](' + source.url + ')');
    lines.push('');
  }
  return lines.join('\n');
}
