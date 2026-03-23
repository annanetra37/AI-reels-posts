const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

async function generateLumaPrompt({ businesses, postType, postStyle, selectedPhotos, captionResult, customDescription, music }) {
  const bizNames = businesses.map(b => b.name).join(', ');
  const bizCategories = [...new Set(businesses.map(b => b.category))].join(', ');
  const bizDescriptions = businesses.map(b => `${b.name}: ${b.description}`).join('; ');
  const photoCount = selectedPhotos?.length || 0;

  // Pair photos to minimize LumaLabs API calls:
  // 1 photo → 1 segment (5s), 2 photos → 1 segment (9s), 3 → 2 segments, 4 → 2 segments, etc.
  let apiSegmentCount;
  if (photoCount <= 1) apiSegmentCount = 1;
  else if (photoCount === 2) apiSegmentCount = 1;
  else apiSegmentCount = Math.ceil(photoCount / 2);

  const totalDuration = photoCount <= 1 ? 5
    : photoCount === 2 ? 9
    : apiSegmentCount * 9 - (photoCount % 2 === 1 ? 4 : 0); // pairs get 9s, odd last gets 5s

  let typeInstructions = '';
  if (postStyle === 'animation') {
    typeInstructions = `Generate a prompt for a 5-second "Animation" Instagram Reel.
The user selected 1 product photo that should come to life with cinematic animation.
The photo itself should be animated (subtle motion, zoom, parallax, particles, glow effects, etc.)
for approximately 4 seconds, then smoothly FADE TO BLACK in the last second.

You MUST generate a "segments" array with exactly 1 entry.
The segment prompt must explicitly include "fade to black at the end" instruction.

Make the animation mesmerizing, premium, and eye-catching — like a luxury brand ad.`;
  } else if (postType === 'reel') {
    typeInstructions = `Generate a prompt for a ~${totalDuration}-second Instagram Reel video.
The user has selected ${photoCount} product photo(s). To save cost, photos are paired into ${apiSegmentCount} video segment(s):
${photoCount === 1 ? '- 1 segment: single photo animation (5s)' :
  photoCount === 2 ? '- 1 segment: smooth transition from photo 1 to photo 2 (9s, ~4.5s per photo)' :
  Array.from({ length: apiSegmentCount }, (_, i) => {
    const p1 = i * 2 + 1;
    const p2 = i * 2 + 2;
    return p2 <= photoCount
      ? `- Segment ${i + 1}: transition from photo ${p1} to photo ${p2} (9s)`
      : `- Segment ${i + 1}: photo ${p1} animation (5s)`;
  }).join('\n')}

You MUST generate a "segments" array with exactly ${apiSegmentCount} entries — one per API call.
Each segment prompt should describe the visual animation/transition for that pair of photos
(e.g. zoom, rotate, reveal, pan, morph between products, etc.).

The overall video should feel dynamic, eye-catching, and cohesive.`;
  } else if (postType === 'carousel') {
    typeInstructions = `Generate prompts for a carousel of ${Math.max(photoCount + 1, 3)} images.
The FIRST image must be a title/cover page that says something like "${postStyle === 'top-x-brands' ? `Top ${photoCount} ${bizCategories} Brands` : captionResult?.hook || bizNames}".
Each subsequent image should showcase the selected products/brands harmoniously.
All images must share a consistent visual style, color palette, and aesthetic.`;
  }

  const musicBlock = music === 'auto'
    ? `\n**Music:** The user wants background music. Suggest a music style/mood that fits the brand and video content. Include a "musicSuggestion" field in your JSON response describing the ideal music (genre, tempo, mood, instruments).`
    : '';

  const customBlock = customDescription
    ? `\n**Custom Creative Direction from User:**\n${customDescription}\n(Incorporate these instructions into your creative brief and prompts.)\n`
    : '';

  const prompt = `You are an expert visual content director specializing in social media content creation.
Generate a detailed, high-quality prompt for LumaLabs AI to create ${postType} content.

**Context:**
- Businesses: ${bizNames}
- Categories: ${bizCategories}
- Descriptions: ${bizDescriptions}
- Post style: ${postStyle}
- Number of product photos to feature: ${photoCount}
${musicBlock}${customBlock}
**Requirements:**
${typeInstructions}

**Visual Direction:**
- Modern, premium aesthetic suitable for Instagram
- On-brand colors and mood
- Professional yet trendy look
- Suitable for the "${postStyle}" post style

Respond in this exact JSON format:
{
  "prompt": "<the main/overall LumaLabs generation prompt>",
  "coverText": "<text overlay for the cover/title image if carousel>",
  "style": "<visual style description>",
  "mood": "<mood/atmosphere>",
  "colorPalette": ["<color1>", "<color2>", "<color3>"],
  "musicSuggestion": "<describe ideal background music style, tempo, mood — or empty string if no music>",
  "totalDuration": ${totalDuration},
  "segments": [
    {"segmentNumber": 1, "description": "<what this segment shows>", "prompt": "<specific LumaLabs prompt for this segment's animation/motion>"}
  ],
  "slides": [
    {"slideNumber": 1, "description": "<what this slide shows>", "prompt": "<specific prompt for this slide>"}
  ]
}

For reels, fill the "segments" array with exactly ${apiSegmentCount} entries (one per paired segment) — each with a unique motion/animation prompt. "slides" can be empty.
For carousels, fill the "slides" array (one per slide). "segments" can be empty.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[1].trim());
  } catch {
    parsed = { prompt: text, coverText: '', style: '', mood: '', colorPalette: [], slides: [] };
  }

  return parsed;
}

module.exports = { generateLumaPrompt };
