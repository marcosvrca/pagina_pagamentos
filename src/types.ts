export interface PixConfig {
  chave: string;
  nomeRecebedor: string;
  cidade: string;
}

export interface Mensalidade {
  referencia: string;
  valor: number;
  vencimento: string;
  /** Texto exibido ao cliente (ex.: tipo de cobrança) */
  descricao?: string;
  /** Identificador do mês no PIX (ex.: "2026-05") */
  id?: string;
}

export interface MensalidadePaga extends Mensalidade {
  pagoEm: string;
}

export interface Contrato {
  numero: string;
  nome: string;
  atual: Mensalidade;
  proximas: Mensalidade[];
  historico: MensalidadePaga[];
}

export interface CobrancasData {
  contratos: Contrato[];
}

export interface AdminConfig {
  senha: string;
}

export interface AppConfig {
  pix: PixConfig;
  admin?: AdminConfig;
}
