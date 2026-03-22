const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

async function generateLumaPrompt({ businesses, postType, postStyle, selectedPhotos, captionResult }) {
  const bizNames = businesses.map(b => b.name).join(', ');
  const bizCategories = [...new Set(businesses.map(b => b.category))].join(', ');
  const bizDescriptions = businesses.map(b => `${b.name}: ${b.description}`).join('; ');
  const photoCount = selectedPhotos?.length || 0;

  let typeInstructions = '';
  if (postType === 'reel') {
    typeInstructions = `Generate a prompt for a 5-10 second video reel.
The video should be dynamic, eye-catching, and suitable for Instagram Reels.
Include camera movements, transitions, and visual effects in your prompt.`;
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
  "prompt": "<the main LumaLabs generation prompt>",
  "coverText": "<text overlay for the cover/title image if carousel>",
  "style": "<visual style description>",
  "mood": "<mood/atmosphere>",
  "colorPalette": ["<color1>", "<color2>", "<color3>"],
  "slides": [
    {"slideNumber": 1, "description": "<what this slide shows>", "prompt": "<specific prompt for this slide>"}
  ]
}

For reels, the "slides" array should contain a single entry describing the full video.
For carousels, include one entry per slide.`;

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
