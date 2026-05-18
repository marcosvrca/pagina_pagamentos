import { publicUrl } from "./public-url";

const LOGO_CANDIDATES = [
  "static/img/logo.jpeg",
  "static/img/logo.jpg",
  "static/img/logo.png",
  "static/img/logo.svg",
  "static/img/logo.webp",
  "static/img/logo",
].map(publicUrl);

const LOGO_HERO_CANDIDATES = [
  "static/img/logocompleta.png",
  "static/img/logocompleta.jpeg",
  "static/img/logocompleta.jpg",
  ...LOGO_CANDIDATES,
];

let logoVersion = String(Date.now());

export function refreshLogoAssets(): void {
  logoVersion = String(Date.now());
  logoSrcCache = undefined;
  logoHeroSrcCache = undefined;
}

function withCacheBust(src: string): string {
  return `${src}?v=${logoVersion}`;
}

export const EMPRESA_NOME = "mvFlow Sistemas e Gestão";
export const FOOTER_LEGAL = "mvFlow Sistemas e Gestão";

/** Paleta extraída da identidade visual da logo */
export const BRAND = {
  cyan: "#00aeef",
  blue: "#2e5bdb",
  purple: "#9333ea",
  violet: "#8b5cf6",
  bg: "#05050c",
  surface: "#0f1119",
  surfaceElevated: "#161b2e",
  border: "rgba(0, 174, 239, 0.22)",
  text: "#e8edf5",
  textMuted: "#94a3b8",
  gradient: "linear-gradient(90deg, #00aeef 0%, #3d5afe 48%, #9333ea 100%)",
  gradientSoft:
    "linear-gradient(135deg, rgba(0, 174, 239, 0.12) 0%, rgba(61, 90, 254, 0.08) 50%, rgba(147, 51, 234, 0.12) 100%)",
} as const;

function probeImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = withCacheBust(src);
  });
}

let logoSrcCache: string | null | undefined;
let logoHeroSrcCache: string | null | undefined;

async function resolveFromCandidates(
  candidates: string[]
): Promise<string | null> {
  for (const src of candidates) {
    if (await probeImage(src)) return src;
  }
  return null;
}

export async function resolveLogoSrc(hero = false): Promise<string | null> {
  if (hero) {
    if (logoHeroSrcCache !== undefined) return logoHeroSrcCache;
    logoHeroSrcCache = await resolveFromCandidates(LOGO_HERO_CANDIDATES);
    return logoHeroSrcCache;
  }

  if (logoSrcCache !== undefined) return logoSrcCache;
  logoSrcCache = await resolveFromCandidates(LOGO_CANDIDATES);
  return logoSrcCache;
}

export function renderLogoHtml(
  src: string | null,
  options: { className?: string; alt?: string } = {}
): string {
  const cls = options.className ?? "brand-logo";
  const alt = options.alt ?? EMPRESA_NOME;

  if (src) {
    const wrap = cls.includes("brand-logo--hero")
      ? "brand-logo-wrap brand-logo-wrap--hero"
      : cls.includes("brand-logo--compact")
        ? "brand-logo-wrap brand-logo-wrap--compact"
        : "brand-logo-wrap";
    return `<span class="${wrap}"><img class="${cls}" src="${withCacheBust(src)}" alt="${alt}" decoding="async" loading="lazy" /></span>`;
  }

  return `<div class="${cls} brand-logo-fallback" aria-hidden="true"><span class="brand-logo-mv">mv</span><span class="brand-logo-flow">Flow</span></div>`;
}
