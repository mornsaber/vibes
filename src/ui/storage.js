// Save slots: several named games, each gzip-compressed in localStorage, plus
// a one-step snapshot of the active game taken before every time advance so
// the last week (or month, quarter, year) can be undone.
//
// Written against a minimal Storage-like interface ({getItem, setItem,
// removeItem}) so the engine tests can exercise it in Node.

const PREFIX = 'airline-exec-sim/';
const INDEX = `${PREFIX}slots`;
const ACTIVE = `${PREFIX}active`;
const LEGACY = `${PREFIX}save-v3`;
const slotKey = (id) => `${PREFIX}slot/${id}`;
const snapKey = (id) => `${PREFIX}snapshot/${id}`;

// ---------------------------------------------------------------------------
// gzip + base64 via the platform's CompressionStream (browsers and Node 18+).

const hasGzip = typeof CompressionStream === 'function';

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function pack(json) {
  if (!hasGzip) return json;
  return `gz:${toBase64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip')))}`;
}
export async function unpack(text) {
  if (text == null) return null;
  if (!text.startsWith('gz:')) return text;
  return new TextDecoder().decode(await pipe(fromBase64(text.slice(3)), new DecompressionStream('gzip')));
}

// ---------------------------------------------------------------------------

export function createSaves(store, { migrate = (g) => g, now = () => Date.now() } = {}) {
  const readIndex = () => {
    try {
      return JSON.parse(store.getItem(INDEX) ?? '[]');
    } catch {
      return [];
    }
  };
  const writeIndex = (list) => store.setItem(INDEX, JSON.stringify(list));
  const meta = (id, name, g, size) => ({
    id, name, size, savedAt: now(),
    airline: g.airline?.name, code: g.airline?.code, color: g.airline?.color, week: g.week, status: g.status, scenario: g.scenario?.name ?? null,
  });
  // Quota errors surface to the caller as a readable message.
  const put = (key, value) => {
    try {
      store.setItem(key, value);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: /quota/i.test(String(err?.name ?? err)) ? 'Browser storage is full — delete a save slot or export saves to files.' : String(err?.message ?? err) };
    }
  };

  const api = {
    list: () => readIndex().sort((a, b) => b.savedAt - a.savedAt),
    activeId: () => store.getItem(ACTIVE),
    setActive: (id) => (id ? store.setItem(ACTIVE, id) : store.removeItem(ACTIVE)),

    // Move a pre-slots save into slot form (once).
    async adoptLegacy() {
      const raw = store.getItem(LEGACY);
      if (!raw) return null;
      const g = migrate(JSON.parse(raw));
      store.removeItem(LEGACY);
      if (!g) return null;
      const res = await api.save(g, { name: g.airline?.name ?? 'Saved game' });
      return res.ok ? res.id : null;
    },

    newId: () => `s${now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,

    async save(game, { id, name } = {}) {
      const list = readIndex();
      id = id ?? api.newId();
      const json = JSON.stringify(game);
      const data = await pack(json);
      const res = put(slotKey(id), data);
      if (!res.ok) return res;
      const prev = list.find((x) => x.id === id);
      const entry = meta(id, name ?? prev?.name ?? game.airline?.name ?? 'Saved game', game, data.length);
      writeIndex([...list.filter((x) => x.id !== id), entry]);
      return { ok: true, id, entry };
    },

    async load(id) {
      const raw = await unpack(store.getItem(slotKey(id)));
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    },

    rename(id, name) {
      const list = readIndex();
      const e = list.find((x) => x.id === id);
      if (!e) return { ok: false, error: 'No such save' };
      e.name = String(name).trim().slice(0, 40) || e.name;
      writeIndex(list);
      return { ok: true };
    },

    remove(id) {
      store.removeItem(slotKey(id));
      store.removeItem(snapKey(id));
      writeIndex(readIndex().filter((x) => x.id !== id));
      if (api.activeId() === id) api.setActive(null);
      return { ok: true };
    },

    // Copy a slot (e.g. "save as" before a risky decision).
    async duplicate(id, name) {
      const g = await api.load(id);
      if (!g) return { ok: false, error: 'No such save' };
      return api.save(g, { name: name ?? `${readIndex().find((x) => x.id === id)?.name ?? 'Save'} (copy)` });
    },

    // Snapshot taken before an advance; one level of undo per slot.
    async snapshot(id, game) {
      return put(snapKey(id), await pack(JSON.stringify(game)));
    },
    async loadSnapshot(id) {
      const raw = await unpack(store.getItem(snapKey(id)));
      return raw ? migrate(JSON.parse(raw)) : null;
    },
    hasSnapshot: (id) => !!store.getItem(snapKey(id)),
    clearSnapshot: (id) => store.removeItem(snapKey(id)),

    // Plain-JSON file contents for export, and parsing for import.
    exportText: (game) => JSON.stringify(game),
    async importText(text, name) {
      const g = migrate(JSON.parse(text));
      if (!g) return { ok: false, error: 'Not a compatible save file' };
      return api.save(g, { name: name ?? g.airline?.name });
    },
  };
  return api;
}
