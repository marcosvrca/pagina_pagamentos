import { diasAteVencimento, formatarData, formatarMoeda } from "./format";
import { publicUrl } from "./public-url";
import type { Contrato } from "./types";

export function normalizarWhatsApp(numero: string): string {
  return numero.replace(/\D/g, "");
}

export function urlPortalPagamento(): string {
  const path = publicUrl("");
  if (typeof window !== "undefined") {
    return new URL(path, window.location.href).href.replace(/\/$/, "");
  }
  return "https://marcosvrca.github.io/pagina_pagamentos";
}

export function mensagemCobranca(contrato: Contrato, portalUrl: string): string {
  const { atual } = contrato;
  const dias = diasAteVencimento(atual.vencimento);
  const primeiroNome = contrato.nome.trim().split(/\s+/)[0] ?? contrato.nome;

  let situacao = "está disponível para pagamento";
  if (dias < 0) {
    situacao = `está em atraso há ${Math.abs(dias)} dia(s)`;
  } else if (dias === 0) {
    situacao = "vence hoje";
  } else if (dias <= 5) {
    situacao = `vence em ${dias} dia(s)`;
  }

  return [
    `Olá, ${primeiroNome}!`,
    "",
    `Passando para lembrar que a cobrança abaixo ${situacao}:`,
    "",
    `Contrato: ${contrato.numero}`,
    `Referência: ${atual.referencia}`,
    ...(atual.descricao ? [`Descrição: ${atual.descricao}`] : []),
    `Valor: ${formatarMoeda(atual.valor)}`,
    `Vencimento: ${formatarData(atual.vencimento)}`,
    "",
    "Acesse o portal para consultar e pagar via PIX:",
    portalUrl,
    "",
    `Ao entrar no portal, informe o número do contrato ${contrato.numero}.`,
    "",
    "Qualquer dúvida, estamos à disposição.",
    "mvFlow Sistemas e Gestão",
  ].join("\n");
}

export function linkWhatsAppCobranca(
  contrato: Contrato,
  portalUrl = urlPortalPagamento()
): string | null {
  if (!contrato.whatsapp) return null;
  const numero = normalizarWhatsApp(contrato.whatsapp);
  if (!numero) return null;
  const texto = mensagemCobranca(contrato, portalUrl);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function mensagemEnvioBoleto(
  contrato: Contrato,
  boletoUrl: string
): string {
  const { atual } = contrato;
  const primeiroNome = contrato.nome.trim().split(/\s+/)[0] ?? contrato.nome;

  return [
    `Olá, ${primeiroNome}!`,
    "",
    "Segue o boleto para pagamento:",
    "",
    `Contrato: ${contrato.numero}`,
    `Referência: ${atual.referencia}`,
    ...(atual.descricao ? [`Descrição: ${atual.descricao}`] : []),
    `Valor: ${formatarMoeda(atual.valor)}`,
    `Vencimento: ${formatarData(atual.vencimento)}`,
    "",
    `Boleto (PDF): ${boletoUrl}`,
    "",
    "Qualquer dúvida, estamos à disposição.",
    "mvFlow Sistemas e Gestão",
  ].join("\n");
}

export function linkWhatsAppBoletoAtual(contrato: Contrato): string | null {
  if (!contrato.whatsapp || !contrato.atual.boletoPdf) return null;
  const numero = normalizarWhatsApp(contrato.whatsapp);
  if (!numero) return null;

  const boletoPath = publicUrl(contrato.atual.boletoPdf);
  const boletoUrl = new URL(boletoPath, window.location.href).href;
  const texto = mensagemEnvioBoleto(contrato, boletoUrl);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
