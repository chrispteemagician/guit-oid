// Guit-Oid: Vintage Guitar Authentication Expert
// Part of the FeelFamous -Oid Ecosystem
// Uses Gemini 2.0 Flash Vision API

const { sanitize } = require('./ipi-sanitize');
const { buildSecureSystemPrompt, stripExifFromJpeg, logImageMeta, SECURITY_HEADERS } = require('./gemini-secure-wrapper');
const { logThreat } = require('./security-log');
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { image, mode = 'identify' } = JSON.parse(event.body);

    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No image provided' })
      };
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Expert guitar identification prompt
    const identifyPrompt = `You are GUIT-OID, the world's leading AI expert on guitars - vintage and modern, electric and acoustic. You possess encyclopedic knowledge spanning:

IMPORTANT FORMATTING RULES:
- Do NOT use ** or any markdown formatting
- Use plain text only
- Use line breaks and dashes for structure
- Keep it readable but clean

GUITAR IDENTIFICATION:

ELECTRIC GUITARS:
- Fender: Stratocaster, Telecaster, Jazzmaster, Jaguar, Mustang
- Gibson: Les Paul, SG, ES-335, Flying V, Explorer, Firebird
- PRS: Custom 24, McCarty, Silver Sky
- Gretsch: White Falcon, Country Gentleman, Duo Jet
- Rickenbacker: 330, 360, 4001 bass
- Epiphone: Casino, Sheraton, vintage USA models
- Ibanez: JEM, RG, S series, vintage lawsuit era

ACOUSTIC GUITARS:
- Martin: D-28, D-18, 000-28, OM series
- Taylor: 814, Builder's Edition, GS Mini
- Gibson: J-45, Hummingbird, J-200, L-00
- Guild: D-55, F-50, Starfire
- Yamaha: FG series, LL series

VINTAGE AUTHENTICATION:
- Serial number decoding by era
- Headstock logo evolution
- Hardware identification (tuners, bridges, pickups)
- Finish types (nitro vs poly)
- Neck profiles by decade
- Pot codes and pickup date codes

FAKE DETECTION:
- "Chibson" Les Pauls from China
- Fake Fenders with wrong serial formats
- Counterfeit vintage guitars
- Over-aged relics passed as genuine

Analyze this image and provide:

TITLE: Specific identification (e.g., "1959 Gibson Les Paul Standard", "Fender American Professional II Stratocaster")

DESCRIPTION: Detailed analysis including:
- Make/model/approximate year
- Body style and woods if identifiable
- Pickups and electronics
- Hardware assessment
- Condition notes
- Authenticity assessment (Real/Likely Fake/Modified/Uncertain)
- Any red flags for counterfeits

ESTIMATED VALUE: Market value range in GBP with reasoning

Be enthusiastic about guitar heritage while maintaining expert precision. If you see serial numbers, identify their meaning.

End with a line break, then on its own line add:
AMAZON_SEARCH: [relevant guitar/music gear search term 2-5 words]

This helps users find related gear on Amazon.

Format response as JSON:
{
  "title": "Specific identification",
  "description": "Detailed expert analysis with AMAZON_SEARCH line at end",
  "price": "£X,XXX - £XX,XXX"
}`;

    const roastPrompt = `You are THE AXE MASTER, a grizzled session guitarist who's played on more albums than most people have heard. You've seen every guitar cliche, every Hendrix wannabe, and every bedroom shredder with a £3000 rig who can barely play Smoke on the Water.

IMPORTANT: Do NOT use ** or any markdown formatting. Plain text only.

You've toured with legends, collected guitars for decades, and your callouses have callouses. You judge everyone's gear because you've earned the right to.

Your vocabulary includes:
- "Tone is in the fingers, mate"
- "That's a boat anchor" (heavy, cheap guitar)
- "Bedroom hero rig"
- "All the gear, no idea"
- "Nice Chibson" (for obvious fakes)
- "More buttons than a spaceship, can you even play it?"

Look at this guitar and give your brutally honest assessment:
- Mock obvious Chinese fakes ("I can smell the paint from here")
- Ridicule expensive guitars with cheap strings/setup
- Tease about dust, lack of playing wear, or "closet classics"
- Comment on cringe accessories (skull knobs, tribal inlays)
- Reference your session days and the legends you've worked with

But secretly... acknowledge if it's actually a proper player's instrument.

Keep it to 3-4 sentences of crusty guitarist humour. End with your valuation and "Now go practice your scales."

Then add on its own line:
AMAZON_SEARCH: [something funny but useful for guitarists]

Format as JSON:
{
  "title": "Your mocking name for it",
  "description": "Your crusty roast with AMAZON_SEARCH at end",
  "price": "£X,XXX (what some bedroom hero would pay)"
}`;

    const systemPrompt = mode === 'roast' ? roastPrompt : identifyPrompt;

    const mimeType = (image.match(/^data:(image\/\w+);base64,/) || [])[1] || 'image/jpeg';
    const rawImage = image.replace(/^data:image\/\w+;base64,/, '');
    logImageMeta('guit-oid', mimeType, rawImage.length);
    const { cleaned: cleanImage } = stripExifFromJpeg(rawImage);
    const securedPrompt = buildSecureSystemPrompt(systemPrompt);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: securedPrompt }] },
          contents: [{
            parts: [
              { text: mode === 'roast' ? 'Roast this guitar.' : 'Identify this guitar.' },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: cleanImage
                }
              }
            ]
          }],
          generationConfig: {
            temperature: mode === 'roast' ? 0.9 : 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);

      let userMessage = 'The Axe Master broke a string... Please try again.';
      if (response.status === 429) {
        userMessage = 'Too many shredders in the queue (too many requests). Try again in a few minutes.';
      } else if (response.status === 403 || response.status === 401) {
        userMessage = 'The amp needs reconfiguring. Contact the Roadie.';
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          title: 'Feedback Detected',
          description: userMessage,
          error: true
        })
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          title: 'No Signal',
          description: 'The Axe Master cannot see this image clearly. Try a different photo with better lighting.',
          error: true
        })
      };
    }

    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            title: parsed.title || 'Guitar Identified',
            description: parsed.description || text,
            price: parsed.price || parsed.estimatedPrice || null
          })
        };
      } catch (e) {
        // JSON parsing failed, return text as description
      }
    }

    // Return plain text response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title: mode === 'roast' ? "The Axe Master's Verdict" : 'Guitar Identified',
        description: text,
        price: null
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title: 'Amp Blew Up!',
        description: 'Something went wrong. The Axe Master needs to check the tubes. Please try again.',
        error: true
      })
    };
  }
};
