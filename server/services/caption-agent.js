const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const POST_STYLE_DETAILS = {
  'did-you-know': 'A "Did You Know?" fact-based post that shares a surprising or interesting fact about the brand/product',
  'brand-of-the-day': 'A "Brand of the Day" spotlight featuring one brand with a compelling narrative',
  'top-x-brands': 'A "Top X Brands" ranking/listicle post featuring multiple brands in a category',
  'before-after': 'A "Before & After" transformation story showing impact or results',
  'behind-the-scenes': 'A "Behind the Scenes" post revealing the human/craft side of the brand',
  'hot-take': 'A "Hot Take 🔥" opinion-style post that sparks conversation and engagement',
  'this-or-that': 'A "This or That" comparison post encouraging audience interaction',
  'myth-vs-reality': 'A "Myth vs. Reality" debunking post that educates while entertaining',
  'unpopular-opinion': 'An "Unpopular Opinion" provocative post designed to drive comments',
  'day-in-the-life': 'A "Day in the Life" narrative post showing the brand\'s daily journey',
  'trend-alert': 'A "Trend Alert 🚨" post connecting the brand to current trends',
  'customer-spotlight': 'A "Customer Spotlight" testimonial-style post',
  'throwback': 'A "Throwback / Origin Story" nostalgic post about the brand\'s beginnings',
  'local-gem': 'A "Hidden Local Gem 💎" discovery post positioning the brand as a must-visit',
  'seasonal-pick': 'A "Seasonal Pick" timely recommendation tied to current season/holiday',
  'founder-story': 'A "Meet the Founder" personal story post humanizing the brand',
  'product-hack': 'A "Product Hack / Pro Tip" useful tips post featuring the product',
  'caption-this': 'A "Caption This" engagement-bait post with a fun image prompt',
  'aesthetic-mood': 'An "Aesthetic Mood Board" visually curated post with lifestyle vibes',
  'weekly-roundup': 'A "Weekly Roundup" digest post featuring multiple brands/products',
  'animation': 'An "Animation" post — a single product photo comes to life with cinematic animation, creating a mesmerizing 4-second reel that fades to black',
};

async function generateCaption({ businesses, postType, postStyle, languages, selectedPhotos, customDescription }) {
  const bizDescriptions = businesses.map(b =>
    `- ${b.emoji || ''} ${b.name}: ${b.description} (Category: ${b.category}, City: ${b.city}, Tagline: "${b.short_tagline || ''}")`
  ).join('\n');

  const styleDescription = POST_STYLE_DETAILS[postStyle] || postStyle;
  const photoCount = selectedPhotos?.length || 0;

  const prompt = `You are a viral Instagram copywriter. You write captions that make people STOP scrolling.

**Post Style:** ${styleDescription}
**Featured Business(es):**
${bizDescriptions}

**Post Type:** ${postType}
**Target languages:** ${languages.join(', ')}
${customDescription ? `\n**Custom Direction from User:**\n${customDescription}\n` : ''}
RULES — follow these STRICTLY:
1. MAX 1-2 sentences per caption. Under 100 characters is ideal. Think billboard, not blog.
2. Make it PERSONAL to each SME — mention their actual product/name/tagline. You're marketing THEM specifically, not generic content.
3. Use "eye sentences" — lines that create instant visual or emotional impact. Think: "Your morning deserves this." or "Handmade. Unforgettable." or "This changes everything."
4. Create a WOW factor — surprise, intrigue, or delight in the first 3 words.
5. 1 emoji max. Zero is also fine. Never emoji-spam.
6. Write like Gen-Z talks to millennials — trendy, effortless cool, zero cringe.
7. CTA should feel natural, not salesy. "Try it." beats "Visit our website today!"
8. Generate 10-15 laser-targeted hashtags (mix of niche + trending). Quality over quantity.
9. If multiple businesses: give each one a spotlight moment, don't list them generically.

Respond in this exact JSON format:
{
  "caption": {
    "<language_code>": "<caption text for that language>"
  },
  "hashtags": "<space-separated hashtags>",
  "hook": "<the attention-grabbing first line>",
  "cta": "<the call-to-action line>"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[1].trim());
  } catch {
    // If JSON parsing fails, return raw text
    parsed = { caption: { en: text }, hashtags: '', hook: '', cta: '' };
  }

  return parsed;
}

module.exports = { generateCaption, POST_STYLE_DETAILS };
