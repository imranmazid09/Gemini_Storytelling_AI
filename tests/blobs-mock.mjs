export const getStore = options => ({
  get: async key => globalThis.__blobs.get(options.name + ':' + key) ?? null,
  setJSON: async (key, value, flags) => {
    const name = options.name + ':' + key;
    if (flags?.onlyIfNew && globalThis.__blobs.has(name)) return { modified: false };
    globalThis.__blobs.set(name, value); return { modified: true };
  }
});
