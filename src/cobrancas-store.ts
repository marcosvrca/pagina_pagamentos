import type { CobrancasData, Contrato, MensalidadePaga } from "./types";

const DRAFT_KEY = "mvflow-cobrancas-draft";

export function hojeIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function clonarCobrancas(data: CobrancasData): CobrancasData {
  return JSON.parse(JSON.stringify(data)) as CobrancasData;
}

export function registrarPagamento(
  data: CobrancasData,
  numeroContrato: string,
  pagoEm: string
): { data: CobrancasData; erro?: string } {
  const copia = clonarCobrancas(data);
  const contrato = copia.contratos.find((c) => c.numero === numeroContrato);
  if (!contrato) {
    return { data, erro: "Contrato não encontrado." };
  }
  if (contrato.proximas.length === 0) {
    return {
      data,
      erro:
        "Não há cobrança em «proximas». Cadastre a próxima mensalidade no JSON antes de registrar o pagamento.",
    };
  }

  const paga: MensalidadePaga = { ...contrato.atual, pagoEm };
  contrato.historico.push(paga);
  contrato.atual = contrato.proximas.shift()!;

  return { data: copia };
}

export function salvarRascunho(data: CobrancasData): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    /* quota ou modo privado */
  }
}

export function limparRascunho(): void {
  localStorage.removeItem(DRAFT_KEY);
}

export function carregarRascunho(): CobrancasData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CobrancasData;
  } catch {
    return null;
  }
}

export function baixarCobrancasJson(data: CobrancasData): void {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cobrancas.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function buscarContratoPorNumero(
  data: CobrancasData,
  numero: string
): Contrato | undefined {
  return data.contratos.find((c) => c.numero === numero);
}
