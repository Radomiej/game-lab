declare module "JSCPP" {
  const JSCPP: any;
  export default JSCPP;
}

// Typy @wasmsharp/core importują Remote z unpkg (patrz vite.config alias)
declare module "https://unpkg.com/*" {
  export type Remote<T> = T;
}
