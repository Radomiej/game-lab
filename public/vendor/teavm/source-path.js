// The playground's in-memory file manager requires flat source filenames.
// Expand wildcard imports of supplied packages so javac does not look for
// those classes again as default-package source files.
function packageName(source) {
  const header = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, " ");
  const declaration = /^\s*package\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/.exec(header);
  return declaration?.[1].replace(/\s/g, "") || "";
}

export function prepareJavaSources(files) {
  const packages = new Map();
  for (const [fileName, source] of Object.entries(files)) {
    const name = packageName(source);
    if (!name) continue;
    const className = fileName.replace(/\\/g, "/").split("/").at(-1).replace(/\.java$/, "");
    if (!packages.has(name)) packages.set(name, []);
    packages.get(name).push(className);
  }
  return Object.entries(files).map(([fileName, source]) => [fileName, source.replace(
    /(^|[\r\n])([ \t]*)import\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.\*\s*;/g,
    (statement, newline, indent, name) => packages.has(name)
      ? newline + packages.get(name).map(className => `${indent}import ${name}.${className};`).join("\n")
      : statement,
  )]);
}
