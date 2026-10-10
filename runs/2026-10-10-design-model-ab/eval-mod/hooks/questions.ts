// Generic design-direction questions, shaped as AskUserQuestion questions. 3- and 4-option mixes.
export const QUESTIONS = [
  {
    header: 'Direction',
    question: 'Which visual direction should the coffee roaster landing page take?',
    options: [
      { label: 'Warm artisan', description: 'Cream and kraft-paper tones, espresso brown and terracotta accents, serif headings, hand-drawn bean illustrations, cozy small-batch feel.' },
      { label: 'Modern minimal', description: 'Mostly white with lots of space, near-black type, one muted sage accent, clean geometric sans, product shots on a tight grid.' },
      { label: 'Bold retro', description: 'Saturated 70s palette of mustard, burnt orange and teal, chunky display type, badge graphics, playful packaging-led layout.' },
    ],
  },
  {
    header: 'Dashboard',
    question: 'Which look should the analytics dashboard for the SaaS app have?',
    options: [
      { label: 'Dark pro', description: 'Charcoal background, neon cyan and magenta chart lines, dense KPI tiles, left sidebar nav, monospace numbers.' },
      { label: 'Light airy', description: 'White canvas, soft blue accent, large rounded cards with generous padding, top nav, friendly sans.' },
      { label: 'Data dense', description: 'Grey grid of many small panels, tables first, tiny sparklines, compact type, traffic-light status colours.' },
      { label: 'Branded bold', description: 'Deep purple header band, one big hero metric, bright coral accent, illustrated empty states.' },
    ],
  },
  {
    header: 'App style',
    question: 'Which visual style for the mobile fitness app home screen?',
    options: [
      { label: 'Energetic', description: 'Black background, electric lime accent, huge progress ring, bold condensed type, chunky pill buttons.' },
      { label: 'Calm wellness', description: 'Pale sand and sage, soft rounded cards, serif greeting, gentle circular progress, lots of breathing room.' },
      { label: 'Clinical', description: 'White and cool grey, single blue accent, precise data rows, small charts, medical-grade feel.' },
    ],
  },
  {
    header: 'Portfolio',
    question: 'Which layout direction for a photographer portfolio site?',
    options: [
      { label: 'Full bleed', description: 'Edge-to-edge hero image, name overlaid in thin white sans, minimal top-right menu, dark overall.' },
      { label: 'Gallery grid', description: 'Off-white page, masonry grid of thumbnails, small black serif name top-left, quiet and editorial.' },
      { label: 'Magazine', description: 'Big serif headline, two-column story layout, red accent rules, one large photo and captions.' },
      { label: 'Brutalist', description: 'Raw grey, black borders everywhere, mono type, oversized index numbers, harsh yellow highlight.' },
    ],
  },
  {
    header: 'Menu design',
    question: 'Which design for the restaurant menu web page?',
    options: [
      { label: 'Bistro', description: 'Cream paper, deep green and gold, classic serif, dotted leaders between dish and price, framed header.' },
      { label: 'Street food', description: 'Bright red and yellow, hand-painted sign feel, big bold sans, photo tiles of dishes, order button.' },
      { label: 'Fine dining', description: 'Black page, thin gold type, very sparse, one course at a time, elegant centred layout.' },
    ],
  },
  {
    header: 'Main menu',
    question: 'Which visual direction for a dark-fantasy game main menu?',
    options: [
      { label: 'Gothic', description: 'Near-black with blood red and bone white, ornate serif title, candle-lit vignette, stacked menu items left.' },
      { label: 'Cold north', description: 'Steel blue and frost white, runic accents, mountain silhouette backdrop, centred menu, thin sans.' },
      { label: 'Ember', description: 'Charcoal and glowing orange embers, ash grey panels, heavy title at top, menu as bottom row of buttons.' },
    ],
  },
]
