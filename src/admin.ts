import { Modal } from "bootstrap";
import {
  exportarCsvAgenda,
  exportarCsvClientes,
  exportarCsvPagamentos,
  exportarRelatorioPdf,
} from "./admin-export";
import { FOOTER_LEGAL, renderLogoHtml } from "./brand";
import { listarCobrancasAbertas } from "./cobrancas-abertas";
import {
  baixarCobrancasJson,
  buscarContratoPorNumero,
  carregarRascunho,
  hojeIso,
  limparRascunho,
  registrarPagamento,
  salvarRascunho,
} from "./cobrancas-store";
import { diasAteVencimento, formatarData, formatarMoeda } from "./format";
import {
  STATUS_LABEL,
  badgeVencimento,
  statusCobranca,
  type StatusCobranca,
} from "./status";
import { linkWhatsAppBoleto, linkWhatsAppCobranca } from "./whatsapp";
import type { CobrancasData, Contrato, Mensalidade, MensalidadePaga } from "./types";

const AUTH_KEY = "mvflow-admin-auth";

export interface AdminOptions {
  app: HTMLElement;
  logoSrc: string | null;
  getData: () => CobrancasData | null;
  setData: (data: CobrancasData) => void;
  reload: () => Promise<void>;
  senha?: string;
  onExit: () => void;
}

type AbaAdmin = "clientes" | "pagamentos" | "agenda";

interface LinhaPagamento extends MensalidadePaga {
  contratoNumero: string;
  contratoNome: string;
}

interface LinhaAgenda extends Mensalidade {
  contratoNumero: string;
  contratoNome: string;
  tipo: "atual" | "proxima";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function isAutenticado(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

function autenticar(): void {
  sessionStorage.setItem(AUTH_KEY, "1");
}

function sair(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

function mesAtualIso(): string {
  const hoje = new Date();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}`;
}

function calcularResumo(data: CobrancasData) {
  const contratos = data.contratos;
  const mesAtual = mesAtualIso();

  let emDia = 0;
  let proximo = 0;
  let venceHoje = 0;
  let vencido = 0;
  let totalAberto = 0;
  let totalRecebido = 0;
  let recebidoMes = 0;

  for (const c of contratos) {
    const st = statusCobranca(c.atual.vencimento);
    totalAberto += c.atual.valor;

    if (st === "em_dia") emDia++;
    else if (st === "proximo") proximo++;
    else if (st === "vence_hoje") venceHoje++;
    else vencido++;

    for (const p of c.historico) {
      totalRecebido += p.valor;
      if (p.pagoEm.startsWith(mesAtual)) recebidoMes += p.valor;
    }
  }

  return {
    totalClientes: contratos.length,
    emDia,
    proximo,
    venceHoje,
    vencido,
    totalAberto,
    totalRecebido,
    recebidoMes,
  };
}

function listarPagamentos(data: CobrancasData): LinhaPagamento[] {
  const linhas: LinhaPagamento[] = [];
  for (const c of data.contratos) {
    for (const p of c.historico) {
      linhas.push({
        ...p,
        contratoNumero: c.numero,
        contratoNome: c.nome,
      });
    }
  }
  return linhas.sort((a, b) => b.pagoEm.localeCompare(a.pagoEm));
}

function listarAgenda(data: CobrancasData): LinhaAgenda[] {
  const linhas: LinhaAgenda[] = [];
  for (const c of data.contratos) {
    linhas.push({
      ...c.atual,
      contratoNumero: c.numero,
      contratoNome: c.nome,
      tipo: "atual",
    });
    for (const p of c.proximas) {
      linhas.push({
        ...p,
        contratoNumero: c.numero,
        contratoNome: c.nome,
        tipo: "proxima",
      });
    }
  }
  return linhas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

function renderLogin(
  app: HTMLElement,
  logoSrc: string | null,
  senhaConfig: string | undefined,
  onSuccess: () => void
): void {
  app.innerHTML = `
    <div class="page-admin-login min-vh-100 d-flex flex-column">
      <main class="container page-login-main flex-grow-1 d-flex align-items-start justify-content-center">
        <div class="w-100" style="max-width: 420px;">
          <header class="app-header text-center">
            ${renderLogoHtml(logoSrc, { className: "brand-logo brand-logo--hero" })}
          </header>
          <div class="card shadow-lg border-0 app-card">
            <div class="card-body p-4">
              <h1 class="h5 text-center mb-1">Painel administrativo</h1>
              <p class="text-center text-muted small mb-4">Acesso restrito à equipe mvFlow.</p>
              <form id="form-admin-login" novalidate>
                <div class="mb-3">
                  <label for="admin-senha" class="form-label fw-semibold">Senha</label>
                  <input
                    id="admin-senha"
                    type="password"
                    class="form-control form-control-lg"
                    autocomplete="current-password"
                    required
                  />
                </div>
                <div id="admin-erro" class="alert alert-danger d-none mb-3" role="alert"></div>
                <button type="submit" class="btn btn-primary btn-lg w-100">Entrar</button>
              </form>
              <a href="#" class="btn btn-link btn-sm w-100 mt-3 text-muted" id="admin-voltar-portal">Voltar ao portal do cliente</a>
            </div>
          </div>
        </div>
      </main>
      <footer class="app-footer text-center py-3 small text-muted">
        © ${new Date().getFullYear()} — ${escapeHtml(FOOTER_LEGAL)}
      </footer>
    </div>
  `;

  document.querySelector<HTMLFormElement>("#form-admin-login")!.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>("#admin-senha")!;
      const erro = document.querySelector<HTMLDivElement>("#admin-erro")!;
      erro.classList.add("d-none");

      if (!senhaConfig) {
        erro.textContent =
          "Senha administrativa não configurada em config.json.";
        erro.classList.remove("d-none");
        return;
      }

      if (input.value !== senhaConfig) {
        erro.textContent = "Senha incorreta.";
        erro.classList.remove("d-none");
        input.classList.add("is-invalid");
        return;
      }

      input.classList.remove("is-invalid");
      autenticar();
      onSuccess();
    }
  );

  document
    .querySelector<HTMLAnchorElement>("#admin-voltar-portal")!
    .addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = "";
      location.reload();
    });
}

type KpiVariant = "default" | "ok" | "warn" | "danger" | "info" | "money";

const KPI_ICON = {
  clientes: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  ok: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
  warn: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  danger: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
  money: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>`,
  received: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
} as const;

function renderKpiCard(opts: {
  label: string;
  valor: string;
  hint?: string;
  variant?: KpiVariant;
  icon?: keyof typeof KPI_ICON;
  colClass?: string;
}): string {
  const {
    label,
    valor,
    hint = "",
    variant = "default",
    icon = "clientes",
    colClass = "col-6 col-md-4 col-xl-2",
  } = opts;

  return `
    <div class="${colClass}">
      <article class="admin-kpi admin-kpi--${variant} card h-100">
        <div class="card-body d-flex flex-column p-3 p-md-4">
          <div class="admin-kpi__icon" aria-hidden="true">${KPI_ICON[icon]}</div>
          <p class="admin-kpi__label mb-2">${escapeHtml(label)}</p>
          <p class="admin-kpi__value mb-0">${valor}</p>
          ${hint ? `<p class="admin-kpi__hint mb-0 mt-2">${escapeHtml(hint)}</p>` : ""}
        </div>
      </article>
    </div>
  `;
}

function renderSecaoKpis(resumo: ReturnType<typeof calcularResumo>): string {
  const mesRef = mesAtualIso().replace("-", "/");

  return `
    <section class="admin-stats mb-4" aria-label="Resumo de cobranças">
      <div class="admin-stats-block">
        <header class="admin-stats-block__header">
          <h2 class="admin-stats-block__title">Situação dos clientes</h2>
          <p class="admin-stats-block__subtitle">Cobrança atual por contrato</p>
        </header>
        <div class="row g-3">
          ${renderKpiCard({
            label: "Clientes",
            valor: String(resumo.totalClientes),
            variant: "info",
            icon: "clientes",
          })}
          ${renderKpiCard({
            label: "Em dia",
            valor: String(resumo.emDia),
            variant: "ok",
            icon: "ok",
          })}
          ${renderKpiCard({
            label: "Vence em breve",
            valor: String(resumo.proximo),
            variant: "warn",
            icon: "warn",
          })}
          ${renderKpiCard({
            label: "Vence hoje",
            valor: String(resumo.venceHoje),
            variant: "warn",
            icon: "warn",
          })}
          ${renderKpiCard({
            label: "Vencidos",
            valor: String(resumo.vencido),
            variant: "danger",
            icon: "danger",
          })}
          ${renderKpiCard({
            label: "Em aberto",
            valor: formatarMoeda(resumo.totalAberto),
            hint: "soma das cobranças atuais",
            variant: "money",
            icon: "money",
          })}
        </div>
      </div>

      <div class="admin-stats-block admin-stats-block--finance mt-4">
        <header class="admin-stats-block__header">
          <h2 class="admin-stats-block__title">Recebimentos</h2>
          <p class="admin-stats-block__subtitle">Histórico consolidado</p>
        </header>
        <div class="row g-3">
          ${renderKpiCard({
            label: "Total recebido",
            valor: formatarMoeda(resumo.totalRecebido),
            hint: "todos os pagamentos registrados",
            variant: "money",
            icon: "received",
            colClass: "col-12 col-md-6",
          })}
          ${renderKpiCard({
            label: "Recebido no mês",
            valor: formatarMoeda(resumo.recebidoMes),
            hint: `referência ${mesRef}`,
            variant: "money",
            icon: "received",
            colClass: "col-12 col-md-6",
          })}
        </div>
      </div>
    </section>
  `;
}

function renderTabelaClientes(
  contratos: Contrato[],
  filtroStatus: StatusCobranca | "todos",
  busca: string
): string {
  const termo = busca.trim().toLowerCase();

  const linhas = contratos.flatMap((c) => listarCobrancasAbertas(c));

  const filtradas = linhas.filter(({ contrato, cobranca }) => {
    const matchBusca =
      !termo ||
      contrato.numero.toLowerCase().includes(termo) ||
      contrato.nome.toLowerCase().includes(termo) ||
      cobranca.referencia.toLowerCase().includes(termo) ||
      (cobranca.descricao?.toLowerCase().includes(termo) ?? false);

    const st = statusCobranca(cobranca.vencimento);
    const matchStatus = filtroStatus === "todos" || st === filtroStatus;
    return matchBusca && matchStatus;
  });

  if (filtradas.length === 0) {
    return `<p class="text-muted small mb-0 fst-italic">Nenhum cliente encontrado com os filtros atuais.</p>`;
  }

  const rows = filtradas
    .map(({ contrato, cobranca, ehAtual }) => {
      const badge = badgeVencimento(cobranca.vencimento);
      const dias = diasAteVencimento(cobranca.vencimento);
      const diasLabel =
        dias < 0
          ? `${Math.abs(dias)} dia(s) em atraso`
          : dias === 0
            ? "Vence hoje"
            : `Em ${dias} dia(s)`;

      const linkCobrar = linkWhatsAppCobranca(contrato, cobranca);
      const linkEnviarBoleto = linkWhatsAppBoleto(contrato, cobranca);
      const btnCobrar = linkCobrar
        ? `<a
              href="${escapeHtml(linkCobrar)}"
              class="btn btn-whatsapp btn-sm"
              target="_blank"
              rel="noopener noreferrer"
              title="Enviar aviso desta cobrança pelo WhatsApp"
            >Cobrar</a>`
        : `<button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              disabled
              title="WhatsApp não cadastrado no contrato"
            >Cobrar</button>`;
      const btnEnviarBoleto = linkEnviarBoleto
        ? `<a
              href="${escapeHtml(linkEnviarBoleto)}"
              class="btn btn-outline-success btn-sm"
              target="_blank"
              rel="noopener noreferrer"
              title="Enviar boleto desta cobrança pelo WhatsApp"
            >Enviar boleto</a>`
        : `<button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              disabled
              title="Esta cobrança não tem boleto PDF cadastrado"
            >Enviar boleto</button>`;

      const tipoBadge = ehAtual
        ? '<span class="badge text-bg-primary">Principal</span>'
        : '<span class="badge text-bg-warning">Paralela</span>';

      const btnPago = ehAtual
        ? `<button
              type="button"
              class="btn btn-success btn-sm admin-btn-pagar"
              data-contrato="${escapeHtml(contrato.numero)}"
              title="Registrar pagamento da cobrança principal"
            >Pago</button>`
        : "";

      const btnCopiar = `<button
              type="button"
              class="btn btn-outline-secondary btn-sm admin-btn-copiar"
              data-contrato="${escapeHtml(contrato.numero)}"
              title="Copiar número do contrato"
            >Copiar</button>`;

      return `
        <tr>
          <td class="font-monospace">${escapeHtml(contrato.numero)}</td>
          <td>
            <span class="fw-semibold">${escapeHtml(contrato.nome)}</span>
            <span class="d-block small text-muted">${contrato.historico.length} pagamento(s) no histórico</span>
          </td>
          <td>
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <span class="fw-semibold">${escapeHtml(cobranca.referencia)}</span>
              ${tipoBadge}
            </div>
            ${cobranca.descricao ? `<span class="small text-muted">${escapeHtml(cobranca.descricao)}</span>` : ""}
          </td>
          <td class="text-nowrap fw-semibold">${formatarMoeda(cobranca.valor)}</td>
          <td class="text-nowrap">
            ${formatarData(cobranca.vencimento)}
            <span class="d-block small text-muted">${diasLabel}</span>
          </td>
          <td><span class="badge ${badge.className}">${badge.label}</span></td>
          <td class="text-nowrap">
            <div class="d-flex flex-wrap gap-1">
              ${btnCobrar}
              ${btnEnviarBoleto}
              ${btnPago}
              ${btnCopiar}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-responsive admin-table-wrap">
      <table class="table table-hover align-middle admin-table mb-0">
        <thead>
          <tr>
            <th>Contrato</th>
            <th>Cliente</th>
            <th>Cobrança em aberto</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTabelaPagamentos(linhas: LinhaPagamento[], busca: string): string {
  const termo = busca.trim().toLowerCase();
  const filtrados = linhas.filter(
    (p) =>
      !termo ||
      p.contratoNumero.toLowerCase().includes(termo) ||
      p.contratoNome.toLowerCase().includes(termo) ||
      p.referencia.toLowerCase().includes(termo)
  );

  if (filtrados.length === 0) {
    return `<p class="text-muted small mb-0 fst-italic">Nenhum pagamento registrado.</p>`;
  }

  const rows = filtrados
    .map(
      (p) => `
      <tr>
        <td class="text-nowrap">${formatarData(p.pagoEm)}</td>
        <td class="font-monospace">${escapeHtml(p.contratoNumero)}</td>
        <td>${escapeHtml(p.contratoNome)}</td>
        <td>${escapeHtml(p.referencia)}</td>
        <td class="text-nowrap fw-semibold">${formatarMoeda(p.valor)}</td>
        <td class="text-nowrap small text-muted">${formatarData(p.vencimento)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <div class="table-responsive admin-table-wrap">
      <table class="table table-hover align-middle admin-table mb-0">
        <thead>
          <tr>
            <th>Pago em</th>
            <th>Contrato</th>
            <th>Cliente</th>
            <th>Referência</th>
            <th>Valor</th>
            <th>Vencimento original</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderTabelaAgenda(linhas: LinhaAgenda[], busca: string): string {
  const termo = busca.trim().toLowerCase();
  const filtrados = linhas.filter(
    (l) =>
      !termo ||
      l.contratoNumero.toLowerCase().includes(termo) ||
      l.contratoNome.toLowerCase().includes(termo) ||
      l.referencia.toLowerCase().includes(termo)
  );

  if (filtrados.length === 0) {
    return `<p class="text-muted small mb-0 fst-italic">Nenhum vencimento na agenda.</p>`;
  }

  const rows = filtrados
    .map((l) => {
      const badge = badgeVencimento(l.vencimento);
      const tipoBadge =
        l.tipo === "atual"
          ? '<span class="badge text-bg-primary">Em aberto</span>'
          : '<span class="badge text-bg-secondary">Previsto</span>';

      return `
        <tr>
          <td class="text-nowrap">${formatarData(l.vencimento)}</td>
          <td class="font-monospace">${escapeHtml(l.contratoNumero)}</td>
          <td>${escapeHtml(l.contratoNome)}</td>
          <td>${escapeHtml(l.referencia)}</td>
          <td class="text-nowrap fw-semibold">${formatarMoeda(l.valor)}</td>
          <td>${tipoBadge}</td>
          <td><span class="badge ${badge.className}">${badge.label}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-responsive admin-table-wrap">
      <table class="table table-hover align-middle admin-table mb-0">
        <thead>
          <tr>
            <th>Vencimento</th>
            <th>Contrato</th>
            <th>Cliente</th>
            <th>Referência</th>
            <th>Valor</th>
            <th>Tipo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderModalPagamento(): string {
  return `
    <div class="modal fade" id="modal-pagamento" tabindex="-1" aria-labelledby="modal-pagamento-label" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header border-secondary">
            <h2 class="modal-title h5" id="modal-pagamento-label">Registrar pagamento</h2>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>
          <div class="modal-body">
            <p class="mb-2" id="modal-pagamento-cliente"></p>
            <p class="small text-muted mb-3" id="modal-pagamento-detalhe"></p>
            <div class="mb-3">
              <label for="modal-pagamento-data" class="form-label fw-semibold">Data do pagamento</label>
              <input type="date" class="form-control" id="modal-pagamento-data" required />
            </div>
            <div id="modal-pagamento-erro" class="alert alert-danger d-none mb-0" role="alert"></div>
          </div>
          <div class="modal-footer border-secondary">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-success" id="modal-pagamento-confirmar">Confirmar pagamento</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDashboard(options: AdminOptions): void {
  if (!options.getData()) {
    options.app.innerHTML = `<div class="p-4"><div class="alert alert-danger">Dados não carregados.</div></div>`;
    return;
  }

  let abaAtiva: AbaAdmin = "clientes";
  let filtroStatus: StatusCobranca | "todos" = "todos";
  let busca = "";
  let buscaTimer: number | undefined;
  let alteracoesPendentes = false;
  let contratoPagamento: string | null = null;

  const paint = (): void => {
    const data = options.getData()!;
    const resumo = calcularResumo(data);
    const pagamentos = listarPagamentos(data);
    const agenda = listarAgenda(data);

    const conteudoHtml = (): string => {
      if (abaAtiva === "clientes") {
        return renderTabelaClientes(data.contratos, filtroStatus, busca);
      }
      if (abaAtiva === "pagamentos") {
        return renderTabelaPagamentos(pagamentos, busca);
      }
      return renderTabelaAgenda(agenda, busca);
    };

    const exportarCsvAba = (): void => {
      if (abaAtiva === "clientes") exportarCsvClientes(data);
      else if (abaAtiva === "pagamentos") exportarCsvPagamentos(data);
      else exportarCsvAgenda(data);
    };
    const filtroBtns = (["todos", "em_dia", "proximo", "vence_hoje", "vencido"] as const)
      .map((f) => {
        const active = filtroStatus === f;
        const label = f === "todos" ? "Todos" : STATUS_LABEL[f];
        const count =
          f === "todos"
            ? data.contratos.length
            : data.contratos.filter((c) => statusCobranca(c.atual.vencimento) === f)
                .length;
        return `
          <button
            type="button"
            class="btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"} admin-filtro-status"
            data-filtro="${f}"
          >${label} <span class="badge ${active ? "text-bg-light" : "text-bg-secondary"} ms-1">${count}</span></button>
        `;
      })
      .join("");

    const abaBtn = (id: AbaAdmin, label: string) => {
      const active = abaAtiva === id;
      return `
        <button
          type="button"
          class="nav-link ${active ? "active" : ""} admin-aba"
          data-aba="${id}"
        >${label}</button>
      `;
    };

    options.app.innerHTML = `
      <div class="page-admin min-vh-100 d-flex flex-column">
        <header class="admin-topbar border-bottom">
          <div class="container-fluid py-3 d-flex flex-wrap align-items-center gap-3">
            ${renderLogoHtml(options.logoSrc, { className: "brand-logo brand-logo--compact" })}
            <div class="flex-grow-1 min-w-0">
              <h1 class="h5 mb-0">Painel administrativo</h1>
              <p class="small text-muted mb-0">Cobranças, clientes e pagamentos</p>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="admin-export-csv" title="Exportar aba atual">
                CSV
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" id="admin-export-pdf" title="Relatório em PDF">
                PDF
              </button>
              <button
                type="button"
                class="btn btn-sm ${alteracoesPendentes ? "btn-warning" : "btn-outline-secondary"}"
                id="admin-download-json"
                title="Baixar cobrancas.json para publicar no servidor"
              >
                ${alteracoesPendentes ? "Baixar JSON *" : "Baixar JSON"}
              </button>
              ${
                alteracoesPendentes
                  ? `<button type="button" class="btn btn-outline-danger btn-sm" id="admin-descartar">Descartar</button>`
                  : ""
              }
              <button type="button" class="btn btn-outline-secondary btn-sm" id="admin-atualizar">
                Atualizar
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" id="admin-sair">Sair</button>
            </div>
          </div>
        </header>

        <main class="container-fluid py-4 flex-grow-1">
          <div id="admin-alerta-rascunho"></div>
          ${
            alteracoesPendentes
              ? `<div class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4" role="status">
                  <span>Alterações pendentes — baixe o JSON e substitua <code>public/cobrancas.json</code> no servidor.</span>
                  <button type="button" class="btn btn-warning btn-sm" id="admin-download-json-banner">Baixar cobrancas.json</button>
                </div>`
              : ""
          }
          ${renderSecaoKpis(resumo)}

          <section class="card shadow-sm admin-panel-card">
            <div class="card-header d-flex flex-wrap align-items-center gap-2 justify-content-between">
              <ul class="nav nav-pills admin-nav-tabs gap-1">
                <li class="nav-item">${abaBtn("clientes", "Clientes")}</li>
                <li class="nav-item">${abaBtn("pagamentos", `Pagamentos (${pagamentos.length})`)}</li>
                <li class="nav-item">${abaBtn("agenda", `Agenda (${agenda.length})`)}</li>
              </ul>
              <div class="admin-search-wrap">
                <input
                  type="search"
                  class="form-control form-control-sm"
                  id="admin-busca"
                  placeholder="Buscar contrato, cliente…"
                  value="${escapeHtml(busca)}"
                />
              </div>
            </div>
            <div class="card-body p-0">
              ${
                abaAtiva === "clientes"
                  ? `<div class="p-3 border-bottom d-flex flex-wrap gap-2">${filtroBtns}</div>`
                  : ""
              }
              <div class="p-3" id="admin-conteudo">${conteudoHtml()}</div>
            </div>
          </section>

          <p class="small text-muted mt-3 mb-0">
            Cada cobrança em aberto aparece em uma linha (ex.: fatura e mensalidade no mesmo vencimento).
            Use <strong>Pago</strong> na cobrança <strong>Principal</strong> para registrar pagamento; a próxima em <code>proximas</code> passa a ser a atual.
            Baixe o JSON e publique em <code>public/cobrancas.json</code>.
          </p>
        </main>

        <footer class="app-footer text-center py-3 small text-muted border-top">
          © ${new Date().getFullYear()} — ${escapeHtml(FOOTER_LEGAL)}
        </footer>
      </div>
      ${renderModalPagamento()}
    `;

    document.querySelectorAll<HTMLButtonElement>(".admin-aba").forEach((btn) => {
      btn.addEventListener("click", () => {
        abaAtiva = btn.dataset.aba as AbaAdmin;
        paint();
      });
    });

    document.querySelectorAll<HTMLButtonElement>(".admin-filtro-status").forEach((btn) => {
      btn.addEventListener("click", () => {
        filtroStatus = btn.dataset.filtro as StatusCobranca | "todos";
        paint();
      });
    });

    const inputBusca = document.querySelector<HTMLInputElement>("#admin-busca")!;
    inputBusca.addEventListener("input", () => {
      busca = inputBusca.value;
      clearTimeout(buscaTimer);
      buscaTimer = window.setTimeout(() => {
        document.querySelector("#admin-conteudo")!.innerHTML = conteudoHtml();
        bindAcoesTabela();
      }, 180);
    });

    const bindCopiarBtns = (): void => {
      document.querySelectorAll<HTMLButtonElement>(".admin-btn-copiar").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const numero = btn.dataset.contrato ?? "";
          try {
            await navigator.clipboard.writeText(numero);
            btn.textContent = "Copiado!";
            setTimeout(() => {
              btn.textContent = "Copiar";
            }, 1500);
          } catch {
            btn.textContent = "Erro";
          }
        });
      });
    };

    const bindPagarBtns = (): void => {
      document.querySelectorAll<HTMLButtonElement>(".admin-btn-pagar").forEach((btn) => {
        btn.addEventListener("click", () => {
          contratoPagamento = btn.dataset.contrato ?? null;
          if (!contratoPagamento) return;

          const c = buscarContratoPorNumero(data, contratoPagamento);
          if (!c) return;

          document.querySelector("#modal-pagamento-cliente")!.textContent =
            `${c.nome} — contrato ${c.numero}`;
          document.querySelector("#modal-pagamento-detalhe")!.textContent =
            `${c.atual.referencia} · ${formatarMoeda(c.atual.valor)} · vence em ${formatarData(c.atual.vencimento)}`;
          const inputData = document.querySelector<HTMLInputElement>(
            "#modal-pagamento-data"
          )!;
          inputData.value = hojeIso();
          document
            .querySelector("#modal-pagamento-erro")!
            .classList.add("d-none");

          const modalEl = document.querySelector("#modal-pagamento")!;
          Modal.getOrCreateInstance(modalEl).show();
        });
      });
    };

    const bindAcoesTabela = (): void => {
      bindCopiarBtns();
      bindPagarBtns();
    };

    bindAcoesTabela();

    const confirmarPagamento = (): void => {
      if (!contratoPagamento) return;
      const pagoEm =
        document.querySelector<HTMLInputElement>("#modal-pagamento-data")!.value;
      const erroEl = document.querySelector("#modal-pagamento-erro")!;

      if (!pagoEm) {
        erroEl.textContent = "Informe a data do pagamento.";
        erroEl.classList.remove("d-none");
        return;
      }

      const atual = options.getData()!;
      const resultado = registrarPagamento(atual, contratoPagamento, pagoEm);

      if (resultado.erro) {
        erroEl.textContent = resultado.erro;
        erroEl.classList.remove("d-none");
        return;
      }

      options.setData(resultado.data);
      salvarRascunho(resultado.data);
      alteracoesPendentes = true;

      const modalEl = document.querySelector("#modal-pagamento")!;
      Modal.getInstance(modalEl)?.hide();

      paint();
    };

    document
      .querySelector("#modal-pagamento-confirmar")!
      .addEventListener("click", confirmarPagamento);

    const baixarJson = (): void => {
      baixarCobrancasJson(options.getData()!);
    };

    document
      .querySelector("#admin-download-json")
      ?.addEventListener("click", baixarJson);
    document
      .querySelector("#admin-download-json-banner")
      ?.addEventListener("click", baixarJson);

    document
      .querySelector("#admin-export-csv")
      ?.addEventListener("click", exportarCsvAba);
    document
      .querySelector("#admin-export-pdf")
      ?.addEventListener("click", () => exportarRelatorioPdf(data));

    document.querySelector("#admin-descartar")?.addEventListener("click", async () => {
      if (
        !confirm(
          "Descartar alterações locais e recarregar os dados do servidor?"
        )
      ) {
        return;
      }
      limparRascunho();
      alteracoesPendentes = false;
      await options.reload();
      paint();
    });

    document.querySelector<HTMLButtonElement>("#admin-sair")!.addEventListener("click", () => {
      sair();
      location.hash = "";
      options.onExit();
    });

    document
      .querySelector<HTMLButtonElement>("#admin-atualizar")!
      .addEventListener("click", async () => {
        if (
          alteracoesPendentes &&
          !confirm(
            "Há alterações não publicadas. Recarregar do servidor vai descartá-las. Continuar?"
          )
        ) {
          return;
        }
        const btn = document.querySelector<HTMLButtonElement>("#admin-atualizar")!;
        btn.disabled = true;
        btn.textContent = "Atualizando…";
        try {
          limparRascunho();
          alteracoesPendentes = false;
          await options.reload();
          paint();
        } finally {
          btn.disabled = false;
          btn.textContent = "Atualizar";
        }
      });

    renderAlertaRascunho();
  };

  const renderAlertaRascunho = (): void => {
    const rascunho = carregarRascunho();
    const el = document.querySelector("#admin-alerta-rascunho");
    if (!el || !rascunho) return;

    el.innerHTML = `
      <div class="alert alert-info d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4" role="status">
        <span>Rascunho salvo neste navegador (${rascunho.contratos.length} cliente(s)).</span>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-primary btn-sm" id="admin-restaurar-rascunho">Restaurar</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="admin-descartar-rascunho">Descartar rascunho</button>
        </div>
      </div>
    `;

    document
      .querySelector("#admin-restaurar-rascunho")!
      .addEventListener("click", () => {
        options.setData(rascunho);
        alteracoesPendentes = true;
        paint();
      });

    document
      .querySelector("#admin-descartar-rascunho")!
      .addEventListener("click", () => {
        limparRascunho();
        el.innerHTML = "";
      });
  };

  paint();
}

export function mountAdmin(options: AdminOptions): void {
  const showDashboard = () => renderDashboard(options);

  if (isAutenticado()) {
    showDashboard();
    return;
  }

  renderLogin(options.app, options.logoSrc, options.senha, showDashboard);
}

export function isAdminRoute(): boolean {
  const hash = location.hash.replace(/^#/, "");
  return hash === "/admin" || hash.startsWith("/admin/");
}
