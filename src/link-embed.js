const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Sanitize ID for safe use in embed URLs (alphanumeric, hyphen, underscore only) */
function sanitizeEmbedId(id) {
  if (typeof id !== 'string') return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Sanitize numeric ID */
function sanitizeNumericId(id) {
  if (typeof id !== 'string') return '';
  return id.replace(/\D/g, '');
}

const EMBED_RULES = [
  {
    name: 'youtube',
    test: (url) => {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) return u.searchParams.get('v');
      if (u.hostname === 'youtu.be' && u.pathname.length > 1) return u.pathname.slice(1);
      return null;
    },
    embed: (id) => {
      const safe = sanitizeEmbedId(id);
      if (!safe || safe.length > 20) return null;
      return `<iframe class="chat__embed chat__embed--youtube" src="https://www.youtube.com/embed/${safe}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    },
  },
  {
    name: 'vimeo',
    test: (url) => {
      const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      return m ? m[1] : null;
    },
    embed: (id) => {
      const safe = sanitizeNumericId(id);
      if (!safe || safe.length > 15) return null;
      return `<iframe class="chat__embed chat__embed--vimeo" src="https://player.vimeo.com/video/${safe}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    },
  },
  {
    name: 'spotify',
    test: (url) => {
      const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
      return m ? { type: m[1], id: m[2] } : null;
    },
    embed: (data) => {
      const type = sanitizeEmbedId(data.type);
      const id = sanitizeEmbedId(data.id);
      if (!type || !id) return null;
      return `<iframe class="chat__embed chat__embed--spotify" src="https://open.spotify.com/embed/${type}/${id}" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
    },
  },
  {
    name: 'soundcloud',
    test: (url) => (url.includes('soundcloud.com') ? url : null),
    embed: (url) =>
      `<iframe class="chat__embed chat__embed--soundcloud" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%2300d4aa" frameborder="0" allow="autoplay"></iframe>`,
  },
];

export function parseEmbeddableLinks(text) {
  if (!text?.trim()) return [];
  const urls = text.match(URL_REGEX) || [];
  const result = [];
  for (const url of urls) {
    try {
      for (const rule of EMBED_RULES) {
        const id = rule.test(url);
        if (id) {
          result.push({ url, id, rule });
          break;
        }
      }
    } catch {}
  }
  return result;
}

export function getEmbedHtml(url) {
  for (const rule of EMBED_RULES) {
    const id = rule.test(url);
    if (id) return rule.embed(id);
  }
  return null;
}

export function renderChatContent(text, escapeFn, openLabel = '↗ Open') {
  if (!text?.trim()) return '';
  const escaped = escapeFn(text).replace(/\n/g, '<br>');
  const embeds = parseEmbeddableLinks(text);
  if (embeds.length === 0) return escaped;
  const seen = new Set();
  let html = escaped;
  for (const { url } of embeds) {
    if (seen.has(url)) continue;
    seen.add(url);
    const embedHtml = getEmbedHtml(url);
    if (embedHtml) {
      const safeUrl = escapeFn(url);
      const block = `<span class="chat__link-preview"><span class="chat__link-preview__embed">${embedHtml}</span><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="chat__link-preview__open">↗ ${escapeFn(openLabel)}</a></span>`;
      html = html.replace(escapeFn(url), block);
    }
  }
  return html;
}
