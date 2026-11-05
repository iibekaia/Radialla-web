export function parseTrack(value) {
  const text = value
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, 300);
  if (!text || /^(unknown|unknown artist\s*-\s*unknown title|offline|n\/a)$/i.test(text))
    return null;
  const separator = text.search(/\s[-–—]\s/);
  if (separator < 0) return { artist: null, title: text };
  const artist = text.slice(0, separator).trim(),
    title = text.slice(separator + 3).trim();
  return title ? { artist: artist || null, title } : { artist: null, title: text };
}

/** Consume bounded ICY audio/metadata blocks, even when split across network chunks. */
export async function readIcyTrack(stream, interval, maxBytes = 1024 * 1024) {
  if (!Number.isInteger(interval) || interval < 1 || interval > 256 * 1024) return null;
  let audioRemaining = interval,
    metadataRemaining = null,
    blocks = [],
    total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) return null;
    let offset = 0;
    while (offset < chunk.length) {
      if (audioRemaining > 0) {
        const n = Math.min(audioRemaining, chunk.length - offset);
        audioRemaining -= n;
        offset += n;
        continue;
      }
      if (metadataRemaining === null) {
        metadataRemaining = chunk[offset++] * 16;
        blocks = [];
        if (!metadataRemaining) {
          metadataRemaining = null;
          audioRemaining = interval;
        }
        continue;
      }
      const n = Math.min(metadataRemaining, chunk.length - offset);
      blocks.push(chunk.subarray(offset, offset + n));
      offset += n;
      metadataRemaining -= n;
      if (metadataRemaining === 0) {
        const bytes = Buffer.concat(blocks);
        let text;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          text = new TextDecoder('windows-1252').decode(bytes);
        }
        const match = text.replace(/\0+$/, '').match(/StreamTitle='(.*?)';(?:\w+='|$)/s);
        if (match) return parseTrack(match[1]);
        metadataRemaining = null;
        audioRemaining = interval;
      }
    }
  }
  return null;
}
