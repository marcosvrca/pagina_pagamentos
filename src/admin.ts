import {
  exportarCsvAgenda,
  exportarCsvClientes,
  exportarCsvPagamentos,
  exportarRelatorioPdf,
} from "./admin-export";
import { FOOTER_LEGAL, renderLogoHtml } from "./brand";
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

function renderKpi(
  label: string,
  valor: string,
  extraClass = "",
  hint = ""
): string {
  return `
    <div class="col-6 col-md-4 col-xl-2">
      <div class="admin-kpi card h-100 ${extraClass}">
        <div class="card-body py-3 px-3">
          <p class="admin-kpi__label text-muted small text-uppercase mb-1">${escapeHtml(label)}</p>
          <p class="admin-kpi__value h5 mb-0 fw-bold">${valor}</p>
          ${hint ? `<p class="admin-kpi__hint small text-muted mb-0 mt-1">${escapeHtml(hint)}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderTabelaClientes(
  contratos: Contrato[],
  filtroStatus: StatusCobranca | "todos",
  busca: string
): string {
  const termo = busca.trim().toLowerCase();
  const filtrados = contratos.filter((c) => {
    const matchBusca =
      !termo ||
      c.numero.toLowerCase().includes(termo) ||
      c.nome.toLowerCase().includes(termo) ||
      c.atual.referencia.toLowerCase().includes(termo);

    const st = statusCobranca(c.atual.vencimento);
    const matchStatus = filtroStatus === "todos" || st === filtroStatus;
    return matchBusca && matchStatus;
  });

  if (filtrados.length === 0) {
    return `<p class="text-muted small mb-0 fst-italic">Nenhum cliente encontrado com os filtros atuais.</p>`;
  }

  const rows = filtrados
    .map((c) => {
      const badge = badgeVencimento(c.atual.vencimento);
      const dias = diasAteVencimento(c.atual.vencimento);
      const diasLabel =
        dias < 0
          ? `${Math.abs(dias)} dia(s) em atraso`
          : dias === 0
            ? "Vence hoje"
            : `Em ${dias} dia(s)`;

      return `
        <tr>
          <td class="font-monospace">${escapeHtml(c.numero)}</td>
          <td>
            <span class="fw-semibold">${escapeHtml(c.nome)}</span>
            <span class="d-block small text-muted">${c.historico.length} pagamento(s) no histórico</span>
          </td>
          <td>
            <span class="d-block">${escapeHtml(c.atual.referencia)}</span>
            ${c.atual.descricao ? `<span class="small text-muted">${escapeHtml(c.atual.descricao)}</span>` : ""}
          </td>
          <td class="text-nowrap fw-semibold">${formatarMoeda(c.atual.valor)}</td>
          <td class="text-nowrap">
            ${formatarData(c.atual.vencimento)}
            <span class="d-block small text-muted">${diasLabel}</span>
          </td>
          <td><span class="badge ${badge.className}">${badge.label}</span></td>
          <td class="text-nowrap">
            <div class="d-flex flex-wrap gap-1">
              <button
                type="button"
                class="btn btn-success btn-sm admin-btn-pagar"
                data-contrato="${escapeHtml(c.numero)}"
                title="Registrar pagamento da cobrança atual"
              >Pago</button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm admin-btn-copiar"
                data-contrato="${escapeHtml(c.numero)}"
                title="Copiar número do contrato"
              >Copiar</button>
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
            <th>Cobrança atual</th>
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
          <section class="row g-3 mb-4">
            ${renderKpi("Clientes", String(resumo.totalClientes))}
            ${renderKpi("Em dia", String(resumo.emDia), "admin-kpi--ok")}
            ${renderKpi("Vence em breve", String(resumo.proximo), "admin-kpi--warn")}
            ${renderKpi("Vence hoje", String(resumo.venceHoje), "admin-kpi--warn")}
            ${renderKpi("Vencidos", String(resumo.vencido), "admin-kpi--danger")}
            ${renderKpi("Em aberto", formatarMoeda(resumo.totalAberto), "", "cobranças atuais")}
          </section>

          <section class="row g-3 mb-4">
            <div class="col-md-6">
              ${renderKpi("Total recebido", formatarMoeda(resumo.totalRecebido), "admin-kpi--wide")}
            </div>
            <div class="col-md-6">
              ${renderKpi(
                "Recebido no mês",
                formatarMoeda(resumo.recebidoMes),
                "admin-kpi--wide",
                mesAtualIso()
              )}
            </div>
          </section>

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
            Use <strong>Pago</strong> na lista de clientes para registrar pagamento. A próxima cobrança em <code>proximas</code> passa a ser a atual.
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
          const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
          modal.show();
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
      window.bootstrap.Modal.getInstance(modalEl)?.hide();

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
