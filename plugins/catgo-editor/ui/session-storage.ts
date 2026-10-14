// MCP App sandboxes can have opaque origins, where even accessing the browser's
// localStorage getter throws. Viewer preferences belong to this editor session;
// structure documents and saves always remain on the host file bridge.
function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    key(index) { return Array.from(values.keys())[index] ?? null },
    getItem(key) { return values.get(String(key)) ?? null },
    setItem(key, value) { values.set(String(key), String(value)) },
    removeItem(key) { values.delete(String(key)) },
    clear() { values.clear() },
  }
}
export const __catgoEditorStorage = memoryStorage()
export const __catgoEditorSessionStorage = memoryStorage()
