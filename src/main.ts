import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "./style.css";
import {
  FOOTER_LEGAL,
  refreshLogoAssets,
  renderLogoHtml,
  resolveLogoSrc,
} from "./brand";
import {
  diasAteVencimento,
  formatarData,
  formatarMoeda,
} from "./format";
import { baixarBoletoPdf, carregarLogoComoDataUrl } from "./boleto";
import { gerarPix } from "./pix";
import { publicUrl } from "./public-url";
import type {
  CobrancasData,
  Contrato,
  Mensalidade,
  MensalidadePaga,
  PixConfig,
} from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;

let cobrancasData: CobrancasData | null = null;
let pixConfig: PixConfig | null = null;
let logoSrc: string | null = null;
let logoHeroSrc: string | null = null;

const fetchSemCache = (url: string) =>
  fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
  });

async function carregarDados(): Promise<void> {
  const [cobrancasRes, configRes] = await Promise.all([
    fetchSemCache(publicUrl("cobrancas.json")),
    fetchSemCache(publicUrl("config.json")),
  ]);

  if (!cobrancasRes.ok || !configRes.ok) {
    throw new Error("Erro ao carregar dados.");
  }

  cobrancasData = (await cobrancasRes.json()) as CobrancasData;
  pixConfig = (await configRes.json()).pix as PixConfig;
}

function badgeVencimento(iso: string): { label: string; className: string } {
  const dias = diasAteVencimento(iso);
  if (dias < 0) {
    return { label: "Vencida", className: "text-bg-danger" };
  }
  if (dias === 0) {
    return { label: "Vence hoje", className: "text-bg-warning" };
  }
  if (dias <= 5) {
    return { label: `${dias} dia(s)`, className: "text-bg-warning" };
  }
  return { label: "Em dia", className: "text-bg-success" };
}

function buscarContrato(numero: string): Contrato | undefined {
  const normalizado = numero.trim().replace(/\s/g, "");
  return cobrancasData?.contratos.find((c) => c.numero === normalizado);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderDescricaoHtml(m: Mensalidade): string {
  if (!m.descricao) return "";
  return `<p class="small text-muted mb-0 mt-1">${escapeHtml(m.descricao)}</p>`;
}

function renderHeader(
  logoClass = "brand-logo",
  src: string | null = logoHeroSrc ?? logoSrc
): string {
  return `
    <header class="app-header app-header--login text-center">
      ${renderLogoHtml(src, { className: logoClass })}
    </header>
  `;
}

function renderItemProxima(m: Mensalidade): string {
  return `
    <li class="list-group-item schedule-item schedule-item--future">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="min-w-0">
          <span class="fw-semibold">${escapeHtml(m.referencia)}</span>
          ${renderDescricaoHtml(m)}
        </div>
        <span class="text-nowrap fw-bold">${formatarMoeda(m.valor)}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mt-1 small text-muted">
        <span>Vence em ${formatarData(m.vencimento)}</span>
        <span class="badge text-bg-secondary">Previsto</span>
      </div>
    </li>
  `;
}

function renderItemHistorico(m: MensalidadePaga): string {
  return `
    <li class="list-group-item schedule-item schedule-item--paid">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="min-w-0">
          <span class="fw-semibold">${escapeHtml(m.referencia)}</span>
          ${renderDescricaoHtml(m)}
        </div>
        <span class="text-nowrap fw-bold">${formatarMoeda(m.valor)}</span>
      </div>
      <div class="d-flex justify-content-between align-items-center mt-1 small text-muted">
        <span>Pago em ${formatarData(m.pagoEm)}</span>
        <span class="badge text-bg-success">Pago</span>
      </div>
    </li>
  `;
}

function renderLogin(): void {
  app.innerHTML = `
    <div class="page-login min-vh-100 d-flex flex-column">
      <main class="container page-login-main flex-grow-1 d-flex align-items-start justify-content-center">
        <div class="w-100" style="max-width: 520px;">
          ${renderHeader("brand-logo brand-logo--hero")}
          <div class="card shadow-lg border-0 app-card">
            <div class="card-body p-4 p-md-5">
              <h1 class="h4 text-center mb-1">Portal de cobrança</h1>
              <p class="text-center text-muted small mb-4">Informe o número do seu contrato para consultar e pagar.</p>
              <form id="form-contrato" novalidate>
                <div class="mb-3">
                  <label for="contrato" class="form-label fw-semibold">Número do contrato</label>
                  <input
                    id="contrato"
                    name="contrato"
                    type="text"
                    class="form-control form-control-lg font-monospace"
                    inputmode="numeric"
                    autocomplete="off"
                    required
                  />
                  <div class="form-text">O número consta no seu e-mail ou mensagem de boas-vindas.</div>
                </div>
                <div id="erro" class="alert alert-danger d-none mb-3" role="alert"></div>
                <button type="submit" class="btn btn-primary btn-lg w-100" id="btn-buscar">
                  Consultar cobrança
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
      <footer class="app-footer text-center py-3 small text-muted">
        © ${new Date().getFullYear()} - ${escapeHtml(FOOTER_LEGAL)}
      </footer>
    </div>
  `;

  const form = document.querySelector<HTMLFormElement>("#form-contrato")!;
  const input = document.querySelector<HTMLInputElement>("#contrato")!;
  const erro = document.querySelector<HTMLDivElement>("#erro")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.classList.add("d-none");

    const contrato = buscarContrato(input.value);
    if (!contrato) {
      erro.textContent =
        "Contrato não encontrado. Verifique o número e tente novamente.";
      erro.classList.remove("d-none");
      input.classList.add("is-invalid");
      input.focus();
      return;
    }

    input.classList.remove("is-invalid");

    if (!pixConfig) return;

    const btn = document.querySelector<HTMLButtonElement>("#btn-buscar")!;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Gerando PIX…';

    try {
      const pix = await gerarPix(contrato.numero, contrato.atual, pixConfig);
      renderCobranca(contrato, pix.payload, pix.qrDataUrl);
    } catch {
      erro.textContent = "Erro ao gerar o PIX. Tente novamente em instantes.";
      erro.classList.remove("d-none");
      btn.disabled = false;
      btn.textContent = "Consultar cobrança";
    }
  });

  input.addEventListener("input", () => input.classList.remove("is-invalid"));
  input.focus();
}

const WHATSAPP_COMPROVANTE = "5563991120229";

function linkComprovanteWhatsApp(
  contrato: Contrato,
  mensalidade: Contrato["atual"]
): string {
  const mensagem = [
    "Olá! Segue o comprovante do pagamento da mensalidade.",
    "",
    `Contrato: ${contrato.numero}`,
    `Cliente: ${contrato.nome}`,
    `Referência: ${mensalidade.referencia}`,
    ...(mensalidade.descricao ? [`Descrição: ${mensalidade.descricao}`] : []),
    `Valor: ${formatarMoeda(mensalidade.valor)}`,
  ].join("\n");

  return `https://wa.me/${WHATSAPP_COMPROVANTE}?text=${encodeURIComponent(mensagem)}`;
}

function renderCobranca(
  contrato: Contrato,
  pixPayload: string,
  qrDataUrl: string
): void {
  const { atual, proximas, historico } = contrato;
  const badge = badgeVencimento(atual.vencimento);
  const chaveExibicao = pixConfig?.chave.replace("+55", "") ?? "";
  const linkWhatsApp = linkComprovanteWhatsApp(contrato, atual);

  const proximasBlock =
    proximas.length > 0
      ? `<ul class="list-group list-group-flush schedule-list">${proximas.map(renderItemProxima).join("")}</ul>`
      : `<p class="text-muted small mb-0 fst-italic">Nenhum vencimento previsto cadastrado.</p>`;

  const historicoCount = historico.length;
  const historicoListaHtml =
    historicoCount > 0
      ? `<ul class="list-group list-group-flush schedule-list">${historico
          .slice()
          .reverse()
          .map(renderItemHistorico)
          .join("")}</ul>`
      : `<p class="text-muted small mb-0 fst-italic">Nenhuma mensalidade paga registrada ainda.</p>`;

  app.innerHTML = `
    <div class="page-billing min-vh-100 py-3 py-md-4">
      <div class="container" style="max-width: 900px;">
        <nav class="d-flex align-items-center gap-3 mb-4 pb-3 border-bottom">
          ${renderLogoHtml(logoSrc, { className: "brand-logo brand-logo--compact" })}
          <div class="flex-grow-1 min-w-0">
            <p class="mb-0 fw-semibold text-truncate">${escapeHtml(contrato.nome)}</p>
            <p class="text-muted small mb-0">Contrato ${escapeHtml(contrato.numero)}</p>
          </div>
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm flex-shrink-0"
            data-bs-toggle="offcanvas"
            data-bs-target="#historico-offcanvas"
            aria-controls="historico-offcanvas"
          >
            Histórico
            ${historicoCount > 0 ? `<span class="badge text-bg-primary ms-1">${historicoCount}</span>` : ""}
          </button>
        </nav>

        <div class="row g-4 align-items-start">
          <section class="col-lg-7">
            <div class="card border-primary-subtle shadow-sm panel-atual">
              <div class="card-header bg-primary-subtle border-primary-subtle">
                <span class="text-uppercase small fw-bold text-primary">Mensalidade atual</span>
              </div>
              <div class="card-body p-4">
                <h2 class="h5 mb-1">${escapeHtml(atual.referencia)}</h2>
                ${renderDescricaoHtml(atual)}
                <p class="display-6 fw-bold text-primary mb-3">${formatarMoeda(atual.valor)}</p>
                <dl class="row small mb-4 g-2">
                  <dt class="col-5 text-muted">Vencimento</dt>
                  <dd class="col-7 mb-0">
                    ${formatarData(atual.vencimento)}
                    <span class="badge ${badge.className} ms-1">${badge.label}</span>
                  </dd>
                </dl>
                <div class="qr-wrap text-center p-3 mb-3 rounded-3 border border-2 border-dashed">
                  <img
                    class="qr-code-img rounded"
                    src="${qrDataUrl}"
                    width="240"
                    height="240"
                    alt="QR Code PIX para pagamento"
                  />
                  <p class="small text-muted mt-2 mb-0">Escaneie com o app do seu banco</p>
                </div>
                <button type="button" class="btn btn-primary w-100" id="btn-copiar">
                  Copiar código PIX
                </button>
                <button type="button" class="btn btn-outline-primary w-100 mt-2" id="btn-boleto">
                  Baixar boleto (PDF)
                </button>
                <a
                  href="${linkWhatsApp}"
                  class="btn btn-whatsapp w-100 mt-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Enviar comprovante pelo WhatsApp
                </a>
                <p class="small text-muted text-center mt-2 mb-0">
                  Após pagar, envie o comprovante pelo botão acima.
                </p>
                <p class="small text-muted text-center mb-0">
                  Chave PIX (telefone): <span class="font-monospace">${escapeHtml(chaveExibicao)}</span>
                </p>
              </div>
            </div>
          </section>

          <section class="col-lg-5">
            <div class="card shadow-sm">
              <div class="card-header card-header--muted">
                <span class="text-uppercase small fw-bold text-secondary">Próximos vencimentos</span>
              </div>
              <div class="card-body">
                <p class="small text-muted mb-3">O PIX será gerado quando cada mês estiver em aberto.</p>
                ${proximasBlock}
              </div>
            </div>
          </section>
        </div>

        <button type="button" class="btn btn-outline-secondary w-100 mt-4" id="btn-voltar">
          Consultar outro contrato
        </button>
      </div>

      <div
        class="offcanvas offcanvas-end"
        tabindex="-1"
        id="historico-offcanvas"
        aria-labelledby="historico-offcanvas-label"
      >
        <div class="offcanvas-header border-bottom">
          <h2 class="offcanvas-title h5" id="historico-offcanvas-label">Histórico de pagamentos</h2>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fechar"></button>
        </div>
        <div class="offcanvas-body">
          ${historicoListaHtml}
        </div>
      </div>
    </div>
  `;

  document.querySelector<HTMLButtonElement>("#btn-copiar")!.addEventListener(
    "click",
    async () => {
      const btn = document.querySelector<HTMLButtonElement>("#btn-copiar")!;
      try {
        await navigator.clipboard.writeText(pixPayload);
        btn.textContent = "Código copiado!";
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-success");
        setTimeout(() => {
          btn.textContent = "Copiar código PIX";
          btn.classList.remove("btn-success");
          btn.classList.add("btn-primary");
        }, 2500);
      } catch {
        btn.textContent = "Não foi possível copiar";
        btn.classList.add("btn-danger");
        setTimeout(() => {
          btn.textContent = "Copiar código PIX";
          btn.classList.remove("btn-danger");
          btn.classList.add("btn-primary");
        }, 2500);
      }
    }
  );

  document.querySelector<HTMLButtonElement>("#btn-boleto")!.addEventListener(
    "click",
    async () => {
      const btn = document.querySelector<HTMLButtonElement>("#btn-boleto")!;
      if (!pixConfig) return;

      const labelOriginal = "Baixar boleto (PDF)";
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Gerando PDF…';

      try {
        const logoDataUrl = await carregarLogoComoDataUrl(logoSrc);
        await baixarBoletoPdf({
          contrato,
          mensalidade: atual,
          pixConfig,
          pixPayload,
          qrDataUrl,
          logoDataUrl,
        });
        btn.textContent = "Boleto baixado!";
        btn.classList.add("btn-success");
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = labelOriginal;
          btn.classList.remove("btn-success");
        }, 2000);
      } catch {
        btn.disabled = false;
        btn.textContent = "Erro ao gerar PDF";
        btn.classList.add("btn-danger");
        setTimeout(() => {
          btn.textContent = labelOriginal;
          btn.classList.remove("btn-danger");
        }, 2500);
      }
    }
  );

  document
    .querySelector<HTMLButtonElement>("#btn-voltar")!
    .addEventListener("click", () => renderLogin());
}

function renderLoading(): void {
  app.innerHTML = `
    <div class="min-vh-100 d-flex align-items-center justify-content-center">
      <div class="text-center">
        <div class="spinner-border text-primary mb-3" role="status">
          <span class="visually-hidden">Carregando…</span>
        </div>
        <p class="text-muted mb-0">Carregando portal…</p>
      </div>
    </div>
  `;
}

function renderErroCarregamento(): void {
  app.innerHTML = `
    <div class="min-vh-100 d-flex align-items-center justify-content-center p-3">
      <div class="card shadow-sm border-0" style="max-width: 400px;">
        <div class="card-body text-center p-4">
          ${renderHeader()}
          <div class="alert alert-danger mb-0" role="alert">
            Não foi possível carregar os dados. Atualize a página.
          </div>
        </div>
      </div>
    </div>
  `;
}

async function init(): Promise<void> {
  renderLoading();
  refreshLogoAssets();

  try {
    [logoSrc, logoHeroSrc] = await Promise.all([
      resolveLogoSrc(false),
      resolveLogoSrc(true),
    ]);
    await carregarDados();
    renderLogin();
  } catch {
    if (!logoSrc) logoSrc = await resolveLogoSrc(false).catch(() => null);
    if (!logoHeroSrc) logoHeroSrc = await resolveLogoSrc(true).catch(() => null);
    renderErroCarregamento();
  }
}

init();
