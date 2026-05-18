/** Caminho público respeitando `base` do Vite (GitHub Pages em subpasta). */
export function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL;
  const normalized = path.replace(/^\//, "");
  return `${base}${normalized}`;
}
