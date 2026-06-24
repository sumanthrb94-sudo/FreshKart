/**
 * Maps a produce name to a representative emoji, used by the product thumbnail
 * when a product has no `imageUrl`. This keeps the seed catalog fully
 * self-contained (no flaky remote images) while still looking lively. Once the
 * GCP backend serves real photo URLs, those take precedence.
 */
const EMOJI_RULES: [RegExp, string][] = [
  [/onion/i, "🧅"],
  [/potato/i, "🥔"],
  [/tomato/i, "🍅"],
  [/chilli|chili/i, "🌶️"],
  [/ginger/i, "🫚"],
  [/garlic/i, "🧄"],
  [/cabbage/i, "🥬"],
  [/cauliflower/i, "🥦"],
  [/broccoli/i, "🥦"],
  [/carrot/i, "🥕"],
  [/capsicum|bell\s*pepper/i, "🫑"],
  [/brinjal|eggplant|aubergine/i, "🍆"],
  [/cucumber|keera|dosakai/i, "🥒"],
  [/gourd/i, "🥒"],
  [/beans|chikkudu|gokar/i, "🫛"],
  [/banana/i, "🍌"],
  [/mango/i, "🥭"],
  [/lemon|lime/i, "🍋"],
  [/beetroot|beet/i, "🧆"],
  [/radish|drumstick|donda|tindora|okra|ladies\s*finger/i, "🌿"],
  [/curry|coriander|kothimeer|pudina|mint|palak|spinach|gongura|thotakura|amaranth|methi|fenugreek|spring onion|leaf|greens/i, "🥬"],
];

export function produceEmoji(name: string): string {
  for (const [re, emoji] of EMOJI_RULES) {
    if (re.test(name)) return emoji;
  }
  return "🥬";
}
