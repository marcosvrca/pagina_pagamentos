import { jsPDF } from "jspdf";
import { EMPRESA_NOME, FOOTER_LEGAL } from "./brand";
import { formatarData, formatarMoeda } from "./format";
import type { Contrato, Mensalidade, PixConfig } from "./types";

export interface BoletoParams {
  contrato: Contrato;
  mensalidade: Mensalidade;
  pixConfig: PixConfig;
  pixPayload: string;
  qrDataUrl: string;
  logoDataUrl?: string | null;
}

function linhaDigitavelDecorativa(
  numeroContrato: string,
  valor: number,
  vencimento: string
): string {
  const contrato = numeroContrato.replace(/\D/g, "").padStart(8, "0");
  const centavos = Math.round(valor * 100)
    .toString()
    .padStart(10, "0");
  const venc = vencimento.replace(/-/g, "").slice(2);
  const bloco1 = `34191.${contrato.slice(0, 5)}`;
  const bloco2 = `${contrato.slice(5)}${venc.slice(0, 2)}.${centavos.slice(0, 5)}`;
  const bloco3 = `${centavos.slice(5)}1 ${venc.slice(2)}40000000123456`;
  const dv = String(
    (Number(contrato) + Number(centavos) + Number(venc)) % 97
  ).padStart(2, "0");
  return `${bloco1} ${bloco2} ${bloco3} ${dv}`;
}

function nomeArquivo(contrato: string, referencia: string): string {
  const ref = referencia
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
  return `boleto-${contrato}-${ref}.pdf`;
}

function quebrarTexto(
  doc: jsPDF,
  texto: string,
  maxWidth: number
): string[] {
  return doc.splitTextToSize(texto, maxWidth) as string[];
}

function desenharCampo(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  rotulo: string,
  valor: string,
  valorFontSize = 10
): void {
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(rotulo, x + 2, y + 4);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(valorFontSize);
  doc.setTextColor(15, 23, 42);
  const linhas = quebrarTexto(doc, valor, w - 4);
  doc.text(linhas, x + 2, y + 4 + (rotulo ? 5 : 0) + valorFontSize * 0.35);
}

export async function baixarBoletoPdf(params: BoletoParams): Promise<void> {
  const { contrato, mensalidade, pixConfig, pixPayload, qrDataUrl, logoDataUrl } =
    params;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  const linhaDigitavel = linhaDigitavelDecorativa(
    contrato.numero,
    mensalidade.valor,
    mensalidade.vencimento
  );

  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageW, 297, "F");

  doc.setDrawColor(0, 174, 239);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 18, pageW - margin, y + 18);

  if (logoDataUrl) {
    const formato = logoDataUrl.includes("image/jpeg")
      ? "JPEG"
      : logoDataUrl.includes("image/webp")
        ? "WEBP"
        : "PNG";
    try {
      doc.addImage(logoDataUrl, formato, margin, y, 28, 14);
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(61, 90, 254);
      doc.text("mvFlow", margin, y + 10);
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(61, 90, 254);
    doc.text("mvFlow", margin, y + 10);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(EMPRESA_NOME, margin + 32, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Documento de cobrança — pagamento via PIX", margin + 32, y + 11);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const emissao = new Date().toLocaleDateString("pt-BR");
  doc.text(`Emissão: ${emissao}`, pageW - margin, y + 6, { align: "right" });

  y += 24;

  doc.setFillColor(61, 90, 254);
  doc.rect(margin, y, contentW, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("RECIBO DO PAGADOR", margin + 3, y + 4.8);
  y += 9;

  const colW = contentW / 2;
  const rowH = 14;
  desenharCampo(
    doc,
    margin,
    y,
    colW,
    rowH,
    "Beneficiário",
    pixConfig.nomeRecebedor,
    8
  );
  desenharCampo(doc, margin + colW, y, colW, rowH, "Pagador", contrato.nome, 8);
  y += rowH;

  desenharCampo(
    doc,
    margin,
    y,
    colW * 0.45,
    rowH,
    "Contrato",
    contrato.numero,
    9
  );
  desenharCampo(
    doc,
    margin + colW * 0.45,
    y,
    colW * 0.55,
    rowH,
    "Referência",
    mensalidade.referencia,
    9
  );
  desenharCampo(
    doc,
    margin + colW,
    y,
    colW,
    rowH,
    "Vencimento",
    formatarData(mensalidade.vencimento),
    9
  );
  y += rowH;

  desenharCampo(
    doc,
    margin,
    y,
    contentW * 0.35,
    rowH + 2,
    "Valor do documento",
    formatarMoeda(mensalidade.valor),
    14
  );
  desenharCampo(
    doc,
    margin + contentW * 0.35,
    y,
    contentW * 0.65,
    rowH + 2,
    "Chave PIX (telefone)",
    pixConfig.chave.replace("+55", ""),
    9
  );
  y += rowH + 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Autenticação mecânica — recibo do pagador",
    pageW - margin,
    y,
    { align: "right" }
  );
  y += 6;

  doc.setLineDashPattern([2, 2], 0);
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineDashPattern([], 0);
  y += 5;

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentW, 7, "F");
  doc.setDrawColor(30, 41, 59);
  doc.rect(margin, y, contentW, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("FICHA DE COMPENSAÇÃO — PIX", margin + 3, y + 4.8);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Local de pagamento", margin + 2, y + 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("PAGÁVEL EM QUALQUER BANCO VIA PIX (APP DO BANCO)", margin + 2, y + 8);
  y += 12;

  doc.setDrawColor(30, 41, 59);
  doc.rect(margin, y, contentW, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Linha digitável (identificação do documento)", margin + 2, y + 4);
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(linhaDigitavel, margin + 2, y + 8.5);
  y += 14;

  const qrSize = 42;
  const infoX = margin + qrSize + 6;

  doc.addImage(qrDataUrl, "PNG", margin, y, qrSize, qrSize);
  doc.setDrawColor(30, 41, 59);
  doc.rect(margin, y, qrSize, qrSize);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Instruções", infoX, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  const instrucoes = [
    "1. Abra o app do seu banco e escolha Pagar com PIX.",
    "2. Escaneie o QR Code ao lado ou use o código copia e cola abaixo.",
    "3. Confira valor e beneficiário antes de confirmar.",
    "4. Após pagar, envie o comprovante pelo portal ou WhatsApp.",
  ];
  let instrY = y + 10;
  for (const linha of instrucoes) {
    doc.text(linha, infoX, instrY);
    instrY += 4.5;
  }

  y += qrSize + 4;

  doc.setDrawColor(30, 41, 59);
  doc.rect(margin, y, contentW, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Código PIX (copia e cola)", margin + 2, y + 4);
  doc.setFont("courier", "normal");
  doc.setFontSize(6);
  doc.setTextColor(30, 41, 59);
  const pixLinhas = quebrarTexto(doc, pixPayload, contentW - 4);
  doc.text(pixLinhas.slice(0, 4), margin + 2, y + 8);
  y += 26;

  const rodapeY = 285;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${FOOTER_LEGAL} — Este documento não é boleto bancário registrado. Utilize o PIX para quitação.`,
    pageW / 2,
    rodapeY,
    { align: "center" }
  );

  doc.save(nomeArquivo(contrato.numero, mensalidade.referencia));
}

export async function carregarLogoComoDataUrl(
  src: string | null
): Promise<string | null> {
  if (!src) return null;

  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
