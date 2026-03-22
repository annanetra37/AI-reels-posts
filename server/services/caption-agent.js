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
};

async function generateCaption({ businesses, postType, postStyle, languages, selectedPhotos }) {
  const bizDescriptions = businesses.map(b =>
    `- ${b.emoji || ''} ${b.name}: ${b.description} (Category: ${b.category}, City: ${b.city}, Tagline: "${b.short_tagline || ''}")`
  ).join('\n');

  const styleDescription = POST_STYLE_DETAILS[postStyle] || postStyle;
  const photoCount = selectedPhotos?.length || 0;

  const prompt = `You are an elite Instagram marketing strategist and copywriter for a local business directory.
Generate an Instagram ${postType} post with the following parameters:

**Post Style:** ${styleDescription}
**Featured Business(es):**
${bizDescriptions}

**Post Type:** ${postType}
**Number of selected photos:** ${photoCount}
**Target languages:** ${languages.join(', ')}

INSTRUCTIONS:
1. Write a captivating, scroll-stopping caption for each requested language.
2. The caption must match the post style perfectly.
3. Use line breaks, emojis strategically (not excessively), and a strong hook in the first line.
4. Include a clear call-to-action.
5. Generate 20-30 highly relevant hashtags mixing popular, niche, and branded tags.
6. If multiple businesses are featured (e.g., "Top X" style), reference each one naturally.
7. The tone should be trendy, authentic, and engaging — like a top-tier social media manager.

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
