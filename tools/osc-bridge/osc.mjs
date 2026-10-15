// Minimal OSC 1.0 decoding (no dependencies) and the /show/* → app command mapping.

function readString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const str = buf.toString('utf8', offset, end);
  // Strings are null-terminated and padded to a multiple of 4 bytes.
  const next = offset + Math.ceil((end - offset + 1) / 4) * 4;
  return [str, next];
}

/** Decode one OSC packet into messages ({ address, args }); bundles are flattened. */
export function decodeOsc(buf) {
  if (buf.length === 0) return [];
  if (buf.toString('utf8', 0, 7) === '#bundle') {
    const out = [];
    let offset = 16; // '#bundle\0' + 8-byte timetag
    while (offset + 4 <= buf.length) {
      const size = buf.readInt32BE(offset);
      offset += 4;
      out.push(...decodeOsc(buf.subarray(offset, offset + size)));
      offset += size;
    }
    return out;
  }
  let [address, offset] = readString(buf, 0);
  if (!address.startsWith('/')) return [];
  const args = [];
  if (offset < buf.length && buf[offset] === 0x2c /* , */) {
    let tags;
    [tags, offset] = readString(buf, offset);
    for (const tag of tags.slice(1)) {
      if (tag === 'i') {
        args.push(buf.readInt32BE(offset));
        offset += 4;
      } else if (tag === 'f') {
        args.push(buf.readFloatBE(offset));
        offset += 4;
      } else if (tag === 'd') {
        args.push(buf.readDoubleBE(offset));
        offset += 8;
      } else if (tag === 's') {
        let s;
        [s, offset] = readString(buf, offset);
        args.push(s);
      } else if (tag === 'T') args.push(true);
      else if (tag === 'F') args.push(false);
      else break; // unsupported type: stop reading arguments
    }
  }
  return [{ address, args }];
}

/**
 * Encode a message. types (optional) gives one OSC type tag per argument
 * ('i' int32, 'f' float32, 's' string, 'T' / 'F' booleans); without it numbers that
 * are whole become 'i', others 'f', booleans 'T' / 'F'.
 */
export function encodeOsc(address, args = [], types) {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
  const str = (s) => pad(Buffer.from(s, 'utf8'));
  const tags = args.map((a, i) => {
    const t = types?.[i];
    if (t) return t;
    if (typeof a === 'string') return 's';
    if (typeof a === 'boolean') return a ? 'T' : 'F';
    return Number.isInteger(a) ? 'i' : 'f';
  });
  const parts = [str(address), str(',' + tags.join(''))];
  args.forEach((a, i) => {
    const t = tags[i];
    if (t === 's') parts.push(str(String(a)));
    else if (t === 'i') {
      const b = Buffer.alloc(4);
      b.writeInt32BE(Math.trunc(Number(a)) | 0);
      parts.push(b);
    } else if (t === 'f') {
      const b = Buffer.alloc(4);
      b.writeFloatBE(Number(a));
      parts.push(b);
    }
    // 'T' / 'F' carry no data
  });
  return Buffer.concat(parts);
}

const SEND_TYPES = new Set(['i', 'f', 's', 'T', 'F']);

/**
 * Validate a { type: 'send', address, args, types?, targets? } message from the app.
 * Returns { address, args, types, targets } or an error string.
 */
export function parseSendRequest(data) {
  if (!data || typeof data !== 'object' || data.type !== 'send') return 'not a send request';
  const { address, args = [], types, targets = [] } = data;
  if (typeof address !== 'string' || !address.startsWith('/') || address.length > 256) return 'bad address';
  if (!Array.isArray(args) || args.length > 16) return 'bad args';
  if (!args.every((a) => typeof a === 'string' || typeof a === 'boolean' || (typeof a === 'number' && Number.isFinite(a)))) return 'bad args';
  if (types !== undefined && (typeof types !== 'string' || types.length !== args.length || ![...types].every((t) => SEND_TYPES.has(t)))) {
    return 'bad types';
  }
  if (!Array.isArray(targets) || targets.length > 16) return 'bad targets';
  const parsed = [];
  for (const t of targets) {
    const target = parseTarget(t);
    if (!target) return `bad target ${JSON.stringify(t)}`;
    parsed.push(target);
  }
  return { address, args, types, targets: parsed };
}

/** "host:port" → { host, port }, or null. */
export function parseTarget(text) {
  if (typeof text !== 'string') return null;
  const m = /^\s*([A-Za-z0-9.\-]+|\[[0-9A-Fa-f:]+\]):(\d{1,5})\s*$/.exec(text);
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { host: m[1].replace(/^\[|\]$/g, ''), port };
}

/** OSC address → JSON command the app understands, or null. */
export function oscToCommand({ address, args }) {
  const a = address.toLowerCase().replace(/\/+$/, '');
  // Buttons send 1 on press and 0 on release: only act on press.
  if (args.length === 1 && (args[0] === 0 || args[0] === false) && a !== '/show/cue' && a !== '/show/locate') return null;
  switch (a) {
    case '/show/go':
      return { type: 'go' };
    case '/show/play':
      return { type: 'play' };
    case '/show/pause':
      return { type: 'pause' };
    case '/show/toggle':
      return { type: 'togglePlay' };
    case '/show/stop':
      return { type: 'stop' };
    case '/show/next':
      return { type: 'nextCue' };
    case '/show/prev':
      return { type: 'prevCue' };
    case '/show/cue':
      return args.length > 0 ? { type: 'cue', number: String(args[0]) } : null;
    case '/show/locate':
      return typeof args[0] === 'number' ? { type: 'locate', seconds: args[0] } : null;
    default: {
      // /show/cue/3 form
      const m = /^\/show\/cue\/(.+)$/.exec(a);
      return m ? { type: 'cue', number: m[1] } : null;
    }
  }
}
