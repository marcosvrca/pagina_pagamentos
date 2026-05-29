import { jsPDF } from "jspdf";
import { EMPRESA_NOME } from "./brand";
import { formatarData, formatarMoeda } from "./format";
import { STATUS_LABEL, statusCobranca } from "./status";
import type { CobrancasData } from "./types";

function csvEscape(val: string | number): string {
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function linhaCsv(cols: (string | number)[]): string {
  return cols.map(csvEscape).join(";");
}

function baixarArquivo(nome: string, conteudo: string, mime: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportarCsvClientes(data: CobrancasData): void {
  const linhas = [
    linhaCsv([
      "Contrato",
      "Cliente",
      "Referência",
      "Valor",
      "Vencimento",
      "Status",
      "Pagamentos no histórico",
    ]),
  ];

  for (const c of data.contratos) {
    const st = STATUS_LABEL[statusCobranca(c.atual.vencimento)];
    linhas.push(
      linhaCsv([
        c.numero,
        c.nome,
        c.atual.referencia,
        c.atual.valor.toFixed(2).replace(".", ","),
        c.atual.vencimento,
        st,
        c.historico.length,
      ])
    );
  }

  const dataStr = new Date().toISOString().slice(0, 10);
  baixarArquivo(
    `clientes-${dataStr}.csv`,
    linhas.join("\n"),
    "text/csv;charset=utf-8"
  );
}

export function exportarCsvPagamentos(data: CobrancasData): void {
  const linhas = [
    linhaCsv([
      "Pago em",
      "Contrato",
      "Cliente",
      "Referência",
      "Valor",
      "Vencimento original",
    ]),
  ];

  const todos = data.contratos.flatMap((c) =>
    c.historico.map((p) => ({ contrato: c, pago: p }))
  );
  todos.sort((a, b) => b.pago.pagoEm.localeCompare(a.pago.pagoEm));

  for (const { contrato: c, pago: p } of todos) {
    linhas.push(
      linhaCsv([
        p.pagoEm,
        c.numero,
        c.nome,
        p.referencia,
        p.valor.toFixed(2).replace(".", ","),
        p.vencimento,
      ])
    );
  }

  const dataStr = new Date().toISOString().slice(0, 10);
  baixarArquivo(
    `pagamentos-${dataStr}.csv`,
    linhas.join("\n"),
    "text/csv;charset=utf-8"
  );
}

export function exportarCsvAgenda(data: CobrancasData): void {
  const linhas = [
    linhaCsv([
      "Vencimento",
      "Contrato",
      "Cliente",
      "Referência",
      "Valor",
      "Tipo",
      "Status",
    ]),
  ];

  for (const c of data.contratos) {
    const itens = [
      { ...c.atual, tipo: "Em aberto" },
      ...c.proximas.map((p) => ({ ...p, tipo: "Previsto" })),
    ];
    for (const item of itens) {
      linhas.push(
        linhaCsv([
          item.vencimento,
          c.numero,
          c.nome,
          item.referencia,
          item.valor.toFixed(2).replace(".", ","),
          item.tipo,
          STATUS_LABEL[statusCobranca(item.vencimento)],
        ])
      );
    }
  }

  const dataStr = new Date().toISOString().slice(0, 10);
  baixarArquivo(`agenda-${dataStr}.csv`, linhas.join("\n"), "text/csv;charset=utf-8");
}

export function exportarRelatorioPdf(data: CobrancasData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margem = 14;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  let y = margem;

  const addLinha = (texto: string, tamanho = 10, negrito = false) => {
    doc.setFontSize(tamanho);
    doc.setFont("helvetica", negrito ? "bold" : "normal");
    const linhas = doc.splitTextToSize(texto, largura) as string[];
    for (const ln of linhas) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = margem;
      }
      doc.text(ln, margem, y);
      y += tamanho * 0.45 + 2;
    }
  };

  const hoje = new Date().toLocaleDateString("pt-BR");
  addLinha(EMPRESA_NOME, 14, true);
  addLinha(`Relatório de cobranças — ${hoje}`, 11, false);
  y += 4;

  let emDia = 0;
  let vencido = 0;
  let totalAberto = 0;
  let totalRecebido = 0;

  for (const c of data.contratos) {
    const st = statusCobranca(c.atual.vencimento);
    totalAberto += c.atual.valor;
    if (st === "vencido") vencido++;
    else if (st === "em_dia") emDia++;
    for (const p of c.historico) totalRecebido += p.valor;
  }

  addLinha("Resumo", 12, true);
  addLinha(`Clientes: ${data.contratos.length}`);
  addLinha(`Em dia: ${emDia}  |  Vencidos: ${vencido}`);
  addLinha(`Em aberto: ${formatarMoeda(totalAberto)}`);
  addLinha(`Total recebido: ${formatarMoeda(totalRecebido)}`);
  y += 4;

  addLinha("Clientes e cobrança atual", 12, true);
  y += 2;

  doc.setFontSize(8);
  for (const c of data.contratos) {
    const st = STATUS_LABEL[statusCobranca(c.atual.vencimento)];
    const texto = `${c.numero} — ${c.nome} | ${c.atual.referencia} | ${formatarMoeda(c.atual.valor)} | Venc. ${formatarData(c.atual.vencimento)} | ${st}`;
    const linhas = doc.splitTextToSize(texto, largura) as string[];
    for (const ln of linhas) {
      if (y > doc.internal.pageSize.getHeight() - 16) {
        doc.addPage();
        y = margem;
      }
      doc.text(ln, margem, y);
      y += 4;
    }
  }

  const dataStr = new Date().toISOString().slice(0, 10);
  doc.save(`relatorio-cobrancas-${dataStr}.pdf`);
}
