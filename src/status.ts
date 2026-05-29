import { diasAteVencimento } from "./format";

export type StatusCobranca = "em_dia" | "proximo" | "vence_hoje" | "vencido";

export function statusCobranca(vencimento: string): StatusCobranca {
  const dias = diasAteVencimento(vencimento);
  if (dias < 0) return "vencido";
  if (dias === 0) return "vence_hoje";
  if (dias <= 5) return "proximo";
  return "em_dia";
}

export function badgeVencimento(iso: string): {
  label: string;
  className: string;
  status: StatusCobranca;
} {
  const status = statusCobranca(iso);
  const dias = diasAteVencimento(iso);

  switch (status) {
    case "vencido":
      return { label: "Vencida", className: "text-bg-danger", status };
    case "vence_hoje":
      return { label: "Vence hoje", className: "text-bg-warning", status };
    case "proximo":
      return { label: `${dias} dia(s)`, className: "text-bg-warning", status };
    default:
      return { label: "Em dia", className: "text-bg-success", status };
  }
}

export const STATUS_LABEL: Record<StatusCobranca, string> = {
  em_dia: "Em dia",
  proximo: "Vence em breve",
  vence_hoje: "Vence hoje",
  vencido: "Vencida",
};
