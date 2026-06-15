export type WasbaiTagResult = {
  detectedTags: string[];
  sponsorLogos?: string[];
  people?: string[];
  locations?: string[];
};

const apiUrl = process.env.WASBAI_API_URL;
const apiKey = process.env.WASBAI_API_KEY;

export async function tagAssetWithWasbai(
  assetUrl: string,
  metadata: Record<string, unknown>,
): Promise<WasbaiTagResult | null> {
  if (!apiUrl || !apiKey) {
    return null;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      assetUrl,
      metadata,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const result = await response.json();
  return {
    detectedTags: result.detectedTags || [],
    sponsorLogos: result.sponsorLogos || [],
    people: result.people || [],
    locations: result.locations || [],
  };
}
