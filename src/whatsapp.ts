import { diasAteVencimento, formatarData, formatarMoeda } from "./format";
import { publicUrl } from "./public-url";
import type { Contrato, Mensalidade } from "./types";

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

export function mensagemCobranca(
  contrato: Contrato,
  cobranca: Mensalidade,
  portalUrl: string
): string {
  const dias = diasAteVencimento(cobranca.vencimento);
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
    `Referência: ${cobranca.referencia}`,
    ...(cobranca.descricao ? [`Descrição: ${cobranca.descricao}`] : []),
    `Valor: ${formatarMoeda(cobranca.valor)}`,
    `Vencimento: ${formatarData(cobranca.vencimento)}`,
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
  cobranca: Mensalidade,
  portalUrl = urlPortalPagamento()
): string | null {
  if (!contrato.whatsapp) return null;
  const numero = normalizarWhatsApp(contrato.whatsapp);
  if (!numero) return null;
  const texto = mensagemCobranca(contrato, cobranca, portalUrl);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function mensagemEnvioBoleto(
  contrato: Contrato,
  cobranca: Mensalidade,
  boletoUrl: string
): string {
  const primeiroNome = contrato.nome.trim().split(/\s+/)[0] ?? contrato.nome;

  return [
    `Olá, ${primeiroNome}!`,
    "",
    "Segue o boleto para pagamento:",
    "",
    `Contrato: ${contrato.numero}`,
    `Referência: ${cobranca.referencia}`,
    ...(cobranca.descricao ? [`Descrição: ${cobranca.descricao}`] : []),
    `Valor: ${formatarMoeda(cobranca.valor)}`,
    `Vencimento: ${formatarData(cobranca.vencimento)}`,
    "",
    `Boleto (PDF): ${boletoUrl}`,
    "",
    "Qualquer dúvida, estamos à disposição.",
    "mvFlow Sistemas e Gestão",
  ].join("\n");
}

export function linkWhatsAppBoleto(
  contrato: Contrato,
  cobranca: Mensalidade
): string | null {
  if (!contrato.whatsapp || !cobranca.boletoPdf) return null;
  const numero = normalizarWhatsApp(contrato.whatsapp);
  if (!numero) return null;

  const boletoPath = publicUrl(cobranca.boletoPdf);
  const boletoUrl = new URL(boletoPath, window.location.href).href;
  const texto = mensagemEnvioBoleto(contrato, cobranca, boletoUrl);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
