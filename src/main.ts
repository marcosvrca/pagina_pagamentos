import "./style.css";
import {
  diasAteVencimento,
  formatarData,
  formatarMoeda,
} from "./format";
import { gerarPix } from "./pix";
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

async function carregarDados(): Promise<void> {
  const [cobrancasRes, configRes] = await Promise.all([
    fetch("/cobrancas.json"),
    fetch("/config.json"),
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
    return { label: "Vencida", className: "badge-late" };
  }
  if (dias === 0) {
    return { label: "Vence hoje", className: "badge-warn" };
  }
  if (dias <= 5) {
    return { label: `${dias} dia(s)`, className: "badge-warn" };
  }
  return { label: "Em dia", className: "badge-ok" };
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

function renderItemProxima(m: Mensalidade): string {
  return `
    <li class="schedule-item schedule-item--future">
      <div class="schedule-item-main">
        <span class="schedule-ref">${escapeHtml(m.referencia)}</span>
        <span class="schedule-valor">${formatarMoeda(m.valor)}</span>
      </div>
      <div class="schedule-item-sub">
        <span>Vence em ${formatarData(m.vencimento)}</span>
        <span class="badge badge-muted">Previsto</span>
      </div>
    </li>
  `;
}

function renderItemHistorico(m: MensalidadePaga): string {
  return `
    <li class="schedule-item schedule-item--paid">
      <div class="schedule-item-main">
        <span class="schedule-ref">${escapeHtml(m.referencia)}</span>
        <span class="schedule-valor">${formatarMoeda(m.valor)}</span>
      </div>
      <div class="schedule-item-sub">
        <span>Pago em ${formatarData(m.pagoEm)}</span>
        <span class="badge badge-ok">Pago</span>
      </div>
    </li>
  `;
}

function renderLogin(): void {
  app.innerHTML = `
    <div class="shell">
      <div class="card">
        <div class="brand">
          <div class="brand-icon">$</div>
          <div>
            <h1>Pagamento</h1>
            <p>Informe o número do seu contrato</p>
          </div>
        </div>
        <form id="form-contrato">
          <label for="contrato">Número do contrato</label>
          <input
            id="contrato"
            name="contrato"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Ex.: 7842"
            required
          />
          <p class="hint">O número consta no seu e-mail ou mensagem de boas-vindas.</p>
          <div id="erro" class="error hidden" role="alert"></div>
          <button type="submit" class="btn" id="btn-buscar">Consultar cobrança</button>
        </form>
      </div>
    </div>
  `;

  const form = document.querySelector<HTMLFormElement>("#form-contrato")!;
  const input = document.querySelector<HTMLInputElement>("#contrato")!;
  const erro = document.querySelector<HTMLDivElement>("#erro")!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    erro.classList.add("hidden");

    const contrato = buscarContrato(input.value);
    if (!contrato) {
      erro.textContent =
        "Contrato não encontrado. Verifique o número e tente novamente.";
      erro.classList.remove("hidden");
      return;
    }

    if (!pixConfig) return;

    const btn = document.querySelector<HTMLButtonElement>("#btn-buscar")!;
    btn.disabled = true;
    btn.textContent = "Gerando PIX…";

    try {
      const pix = await gerarPix(contrato.numero, contrato.atual, pixConfig);
      renderCobranca(contrato, pix.payload, pix.qrDataUrl);
    } catch {
      erro.textContent = "Erro ao gerar o PIX. Tente novamente em instantes.";
      erro.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Consultar cobrança";
    }
  });

  input.focus();
}

function renderCobranca(
  contrato: Contrato,
  pixPayload: string,
  qrDataUrl: string
): void {
  const { atual, proximas, historico } = contrato;
  const badge = badgeVencimento(atual.vencimento);
  const chaveExibicao = pixConfig?.chave.replace("+55", "") ?? "";

  const proximasHtml =
    proximas.length > 0
      ? proximas.map(renderItemProxima).join("")
      : `<p class="panel-empty">Nenhum vencimento previsto cadastrado.</p>`;

  const historicoCount = historico.length;
  const historicoListaHtml =
    historicoCount > 0
      ? `<ul class="schedule-list">${historico
          .slice()
          .reverse()
          .map(renderItemHistorico)
          .join("")}</ul>`
      : `<p class="panel-empty">Nenhuma mensalidade paga registrada ainda.</p>`;

  app.innerHTML = `
    <div class="shell shell-wide">
      <div class="card">
        <div class="invoice-header">
          <h2>${escapeHtml(contrato.nome)}</h2>
          <p class="ref">Contrato ${escapeHtml(contrato.numero)}</p>
        </div>

        <div class="billing-layout" id="billing-layout">
          <button
            type="button"
            class="historico-toggle"
            id="btn-historico"
            aria-expanded="false"
            aria-controls="historico-panel"
          >
            <span class="historico-toggle-text">Histórico de pagamentos</span>
            ${
              historicoCount > 0
                ? `<span class="historico-toggle-count">${historicoCount}</span>`
                : ""
            }
            <span class="historico-toggle-chevron" aria-hidden="true">›</span>
          </button>

          <div class="billing-body">
            <aside class="historico-panel" id="historico-panel" hidden>
              ${historicoListaHtml}
            </aside>

            <div class="billing-main">
              <div class="billing-columns">
                <section class="panel panel-atual" aria-labelledby="titulo-atual">
                  <h3 id="titulo-atual" class="panel-title">Mensalidade atual</h3>
                  <p class="panel-ref">${escapeHtml(atual.referencia)}</p>
                  <p class="amount amount-sm">${formatarMoeda(atual.valor)}</p>
                  <div class="meta meta-compact">
                    <div class="meta-row">
                      <span>Vencimento</span>
                      <span>
                        ${formatarData(atual.vencimento)}
                        <span class="badge ${badge.className}">${badge.label}</span>
                      </span>
                    </div>
                  </div>
                  <div class="qr-wrap">
                    <img src="${qrDataUrl}" width="240" height="240" alt="QR Code PIX" />
                    <p>Escaneie para pagar esta mensalidade</p>
                  </div>
                  <button type="button" class="btn" id="btn-copiar">Copiar código PIX</button>
                  <p class="pix-key">Chave PIX (telefone): ${escapeHtml(chaveExibicao)}</p>
                </section>

                <section class="panel panel-proximas" aria-labelledby="titulo-proximas">
                  <h3 id="titulo-proximas" class="panel-title">Próximos vencimentos</h3>
                  <p class="panel-hint">Aviso — o PIX será gerado quando cada mês estiver em aberto.</p>
                  <ul class="schedule-list">
                    ${proximasHtml}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-secondary" id="btn-voltar">Outro contrato</button>
      </div>
    </div>
  `;

  document.querySelector<HTMLButtonElement>("#btn-copiar")!.addEventListener(
    "click",
    async () => {
      const btn = document.querySelector<HTMLButtonElement>("#btn-copiar")!;
      try {
        await navigator.clipboard.writeText(pixPayload);
        btn.textContent = "Copiado!";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copiar código PIX";
          btn.classList.remove("copied");
        }, 2500);
      } catch {
        btn.textContent = "Não foi possível copiar";
      }
    }
  );

  const billingLayout = document.querySelector<HTMLElement>("#billing-layout")!;
  const toggleHistorico = document.querySelector<HTMLButtonElement>("#btn-historico")!;
  const panelHistorico = document.querySelector<HTMLElement>("#historico-panel")!;

  toggleHistorico.addEventListener("click", () => {
    const expanded = billingLayout.classList.toggle("is-expanded");
    toggleHistorico.setAttribute("aria-expanded", String(expanded));
    panelHistorico.hidden = !expanded;
  });

  document
    .querySelector<HTMLButtonElement>("#btn-voltar")!
    .addEventListener("click", () => renderLogin());
}

async function init(): Promise<void> {
  app.innerHTML = `<div class="shell"><div class="card"><p style="text-align:center;color:var(--muted)">Carregando…</p></div></div>`;

  try {
    await carregarDados();
    renderLogin();
  } catch {
    app.innerHTML = `
      <div class="shell">
        <div class="card">
          <p class="error" style="margin:0">Não foi possível carregar. Atualize a página.</p>
        </div>
      </div>
    `;
  }
}

init();
