export function formatJavaRuntimeError(error) {
  const raw = typeof error === 'string' ? error : `${error?.message || error}\n${error?.stack || ''}`;
  const location = [...raw.matchAll(/\bat\s+lab\.([\w$]+)::([\w$]+)/g)].find(match=>!match[2].includes('_$caller'));
  const message = /dereferencing a null pointer|NullPointerException/i.test(raw)
    ? 'NullPointerException: próba użycia wartości null. Sprawdź wynik find() lub getComponent() przed wywołaniem metody.'
    : raw.split('\n')[0].replace(/^RuntimeError:\s*/, '').trim();
  return message + (location ? `\nMiejsce w kodzie Java: ${location[1]}.java — ${location[2]}().` : '');
}
