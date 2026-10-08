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

/** Encode a message (tests / sending); supports int, float and string arguments. */
export function encodeOsc(address, args = []) {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
  const str = (s) => pad(Buffer.from(s, 'utf8'));
  const parts = [str(address), str(',' + args.map((a) => (typeof a === 'string' ? 's' : Number.isInteger(a) ? 'i' : 'f')).join(''))];
  for (const a of args) {
    if (typeof a === 'string') parts.push(str(a));
    else {
      const b = Buffer.alloc(4);
      if (Number.isInteger(a)) b.writeInt32BE(a);
      else b.writeFloatBE(a);
      parts.push(b);
    }
  }
  return Buffer.concat(parts);
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
