import { hojeIso } from "./cobrancas-store";
import type { Contrato, Mensalidade } from "./types";

export interface CobrancaAberta {
  contrato: Contrato;
  cobranca: Mensalidade;
  ehAtual: boolean;
}

/** Cobrança em aberto além da atual: mesmo vencimento, vencida ou com boleto cadastrado. */
export function cobrancaEmAberto(
  cobranca: Mensalidade,
  vencimentoAtual: string,
  hoje = hojeIso()
): boolean {
  return (
    Boolean(cobranca.boletoPdf) ||
    cobranca.vencimento <= hoje ||
    cobranca.vencimento === vencimentoAtual
  );
}

export function listarCobrancasAbertas(contrato: Contrato): CobrancaAberta[] {
  const vencAtual = contrato.atual.vencimento;
  const lista: CobrancaAberta[] = [
    { contrato, cobranca: contrato.atual, ehAtual: true },
  ];

  for (const p of contrato.proximas) {
    if (cobrancaEmAberto(p, vencAtual)) {
      lista.push({ contrato, cobranca: p, ehAtual: false });
    }
  }

  return lista;
}
