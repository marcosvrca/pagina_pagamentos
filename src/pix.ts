import QRCode from "qrcode";
import { BRAND } from "./brand";
import type { Mensalidade, PixConfig } from "./types";

function sanitizePixText(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

function formatField(id: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ polynomial;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

/** Gera payload BR Code (copia e cola) para PIX estático com valor fixo. */
export function gerarPayloadPix(
  numeroContrato: string,
  mensalidade: Mensalidade,
  config: PixConfig
): string {
  const nome = sanitizePixText(config.nomeRecebedor, 25);
  const cidade = sanitizePixText(config.cidade, 15);
  const valor = mensalidade.valor.toFixed(2);
  const sufixo = mensalidade.id?.replace(/-/g, "") ?? "";
  const txid = sanitizePixText(
    `CT${numeroContrato}${sufixo}`,
    25
  ).replace(/\s/g, "");

  const merchantAccount =
    formatField("00", "br.gov.bcb.pix") + formatField("01", config.chave);

  const additionalData = formatField("05", txid);

  const payloadSemCrc =
    formatField("00", "01") +
    formatField("26", merchantAccount) +
    formatField("52", "0000") +
    formatField("53", "986") +
    formatField("54", valor) +
    formatField("58", "BR") +
    formatField("59", nome) +
    formatField("60", cidade) +
    formatField("62", additionalData) +
    "6304";

  return payloadSemCrc + crc16(payloadSemCrc);
}

export async function gerarPix(
  numeroContrato: string,
  mensalidade: Mensalidade,
  config: PixConfig
): Promise<{ payload: string; qrDataUrl: string }> {
  const payload = gerarPayloadPix(numeroContrato, mensalidade, config);
  const qrDataUrl = await QRCode.toDataURL(payload, {
    width: 280,
    margin: 2,
    color: { dark: BRAND.surfaceElevated, light: "#ffffff" },
  });

  return { payload, qrDataUrl };
}
