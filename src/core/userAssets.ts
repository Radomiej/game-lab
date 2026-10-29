// Assety użytkownika — pliki przeciągnięte do zakładki Assety.
// Grafiki rejestrujemy jako tekstury silnika GameLab (Sprite("nazwa"))
// przez renderer.entries/images + wpis w współdzielonym assetManifest
// (walidacja Sprite czyta assetManifest.assets — ten sam obiekt).
// Pliki tekstowe trafiają do projektu pod assets/user/… i widzi je lab.readFile.

export interface UserAsset {
  /** Klucz tekstury = nazwa pliku, np. "logo.png". */
  key: string;
  name: string;
  kind: "image" | "audio" | "text";
  dataUrl: string;
  text?: string;
  image?: HTMLImageElement;
  w?: number;
  h?: number;
}

const registry = new Map<string, UserAsset>();

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const AUDIO_EXT = new Set(["mp3", "wav", "ogg", "m4a", "flac", "aac"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function isImageAsset(name: string): boolean {
  return IMAGE_EXT.has(extOf(name));
}

export function isAudioAsset(name: string): boolean {
  return AUDIO_EXT.has(extOf(name));
}

export const userAssets = {
  list(): UserAsset[] {
    return [...registry.values()];
  },
  get(key: string): UserAsset | undefined {
    return registry.get(key);
  },
  remove(key: string): void {
    registry.delete(key);
  },
};

/** Zwraca zaakceptowany asset albo rzuca czytelny błąd. */
export async function addUserFile(file: File): Promise<UserAsset> {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name}: plik za duży (max 8 MB).`);
  const dataUrl = await readAsDataUrl(file);
  if (isAudioAsset(file.name)) {
    const asset: UserAsset = { key: file.name, name: file.name, kind: "audio", dataUrl };
    registry.set(asset.key, asset);
    return asset;
  }
  if (isImageAsset(file.name)) {
    const image = await loadImage(dataUrl);
    const asset: UserAsset = {
      key: file.name,
      name: file.name,
      kind: "image",
      dataUrl,
      image,
      w: image.naturalWidth,
      h: image.naturalHeight,
    };
    registry.set(asset.key, asset);
    return asset;
  }
  const text = file.type.startsWith("text/") || /\.(json|txt|md|csv|xml|ya?ml|ini|lua|js|ts)$/i.test(file.name)
    ? await file.text()
    : undefined;
  const asset: UserAsset = { key: file.name, name: file.name, kind: "text", dataUrl, text };
  registry.set(asset.key, asset);
  return asset;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error(`${file.name}: nie można odczytać pliku.`));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("nie można zdekodować grafiki."));
    img.src = src;
  });
}
