import { describe, it, expect } from 'vitest';
import { errorMessage } from '../http';

// errorMessage only reads response.text(); this stub supplies it (a string, or
// a function to simulate the body read itself throwing).
function res(text: string | (() => Promise<string>)): Response {
  return {
    text: typeof text === 'function' ? text : async () => text,
  } as unknown as Response;
}

describe('errorMessage', () => {
  it('returns the server message from a JSON error body', async () => {
    const r = res(JSON.stringify({ message: 'Host already exists!' }));
    expect(await errorMessage(r, 'fallback')).toBe('Host already exists!');
  });

  it('falls back when the JSON body has no message field', async () => {
    expect(await errorMessage(res(JSON.stringify({ other: 'x' })), 'fallback')).toBe('fallback');
  });

  it('falls back on an empty body', async () => {
    expect(await errorMessage(res(''), 'fallback')).toBe('fallback');
  });

  it('falls back on a non-JSON body (e.g. an HTML proxy/crash page)', async () => {
    expect(await errorMessage(res('<html>502 Bad Gateway</html>'), 'fallback')).toBe('fallback');
  });

  it('falls back when reading the body throws', async () => {
    const throwing = res(async () => {
      throw new Error('stream error');
    });
    expect(await errorMessage(throwing, 'fallback')).toBe('fallback');
  });
});
