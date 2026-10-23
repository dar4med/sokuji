/** Directory boundary, not an origin/security boundary against sibling applications. */
export function installationBase(base: string, ownOrigin = globalThis.location?.origin): URL {
  const url = new URL(base);
  if (!ownOrigin || url.origin !== ownOrigin || !["https:", "http:"].includes(url.protocol) ||
      url.username || url.password || url.search || url.hash || url.href !== base ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(url.pathname))
    throw new Error("Nieprawidłowa baza aplikacji lub obcy origin.");
  return url;
}

// Self-contained: the SW generator embeds this same function, avoiding two naming rules.
export function cacheNamesForPath(pathname: string) {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(pathname))
    throw new Error("Nieprawidłowy katalog instalacji.");
  const prefix = `medpartners-v2-${encodeURIComponent(pathname)}-`;
  return { models: `${prefix}models`, shellPrefix: `${prefix}shell-` };
}

export const modelCacheName = (base: string): string =>
  cacheNamesForPath(installationBase(base).pathname).models;

export function modelPath(id: string, path: string): string {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(id) || typeof path !== "string" ||
      !path.split("/").every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part)))
    throw new Error("Nieprawidłowa ścieżka pliku modelu.");
  return `models/${id}/${path}`;
}
