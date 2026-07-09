// Shared fetch helpers for the pinia stores.

/**
 * Extract the server's error message from a failed response, defensively: a
 * proxy or crash page may return non-JSON, which must surface as the fallback
 * message rather than a thrown parse error.
 */
export async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return data.message || fallback;
  } catch {
    return fallback;
  }
}
