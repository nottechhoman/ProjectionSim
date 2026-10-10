/**
 * v6: share a project as a link (for opening on a phone).
 *
 * The project JSON is deflated and base64url-encoded into the URL hash, so nothing is
 * uploaded anywhere: the link itself carries the scene. Imported media (images, videos,
 * 3D models) stays on the computer and is not in the link; test patterns and colours are.
 */

export const VIEW_HASH_PREFIX = '#view=';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeProjectForLink(projectJson: string): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(projectJson), new CompressionStream('deflate-raw'));
  return toBase64Url(packed);
}

export async function decodeProjectFromLink(encoded: string): Promise<string> {
  const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(bytes);
}

/** Full URL that opens this app in view mode with the project. */
export async function buildViewLink(projectJson: string, base: string): Promise<string> {
  return `${base.split('#')[0]}${VIEW_HASH_PREFIX}${await encodeProjectForLink(projectJson)}`;
}

/** The encoded project in a location hash, or null. */
export function viewPayloadFromHash(hash: string): string | null {
  return hash.startsWith(VIEW_HASH_PREFIX) ? hash.slice(VIEW_HASH_PREFIX.length) : null;
}
