const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

async function generateLumaPrompt({ businesses, postType, postStyle, selectedPhotos, captionResult }) {
  const bizNames = businesses.map(b => b.name).join(', ');
  const bizCategories = [...new Set(businesses.map(b => b.category))].join(', ');
  const bizDescriptions = businesses.map(b => `${b.name}: ${b.description}`).join('; ');
  const photoCount = selectedPhotos?.length || 0;

  // Calculate reel duration: each selected photo gets a ~5s segment (LumaLabs minimum)
  // With N photos we create N-1 transition segments (photo1→photo2, photo2→photo3, ...)
  // plus 1 opening segment. So total ≈ N × 5 seconds.
  const segmentCount = Math.max(photoCount, 1);
  const segmentDuration = 5; // LumaLabs supports 5s or 9s per generation
  const totalDuration = segmentCount * segmentDuration;

  let typeInstructions = '';
  if (postType === 'reel') {
    typeInstructions = `Generate a prompt for a ${totalDuration}-second Instagram Reel video.
The user has selected ${photoCount} product photo(s), and each photo will get its own ~${segmentDuration}-second video segment.
The segments will be stitched together into one continuous reel.

You MUST generate a "segments" array with exactly ${segmentCount} entries — one per photo.
Each segment should describe the visual transition/animation for that specific product photo
(e.g. zoom in, rotate, reveal, pan across the product, etc.).

The overall video should feel dynamic, eye-catching, and cohesive — with smooth visual
continuity between segments. Include camera movements, transitions, and visual effects.`;
  } else if (postType === 'carousel') {
    typeInstructions = `Generate prompts for a carousel of ${Math.max(photoCount + 1, 3)} images.
The FIRST image must be a title/cover page that says something like "${postStyle === 'top-x-brands' ? `Top ${photoCount} ${bizCategories} Brands` : captionResult?.hook || bizNames}".
Each subsequent image should showcase the selected products/brands harmoniously.
All images must share a consistent visual style, color palette, and aesthetic.`;
  }

  const prompt = `You are an expert visual content director specializing in social media content creation.
Generate a detailed, high-quality prompt for LumaLabs AI to create ${postType} content.

**Context:**
- Businesses: ${bizNames}
- Categories: ${bizCategories}
- Descriptions: ${bizDescriptions}
- Post style: ${postStyle}
- Number of product photos to feature: ${photoCount}

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
  "totalDuration": ${totalDuration},
  "segments": [
    {"segmentNumber": 1, "description": "<what this segment shows>", "prompt": "<specific LumaLabs prompt for this segment's animation/motion>"}
  ],
  "slides": [
    {"slideNumber": 1, "description": "<what this slide shows>", "prompt": "<specific prompt for this slide>"}
  ]
}

For reels, fill the "segments" array with exactly ${segmentCount} entries (one per selected photo) — each with a unique motion/animation prompt. "slides" can be empty.
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
