export interface ParsedTransaction {
  fitid: string;
  date: string; // YYYY-MM-DD
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  memo: string;
  documentNumber?: string;
  isPix: boolean;
  isPixReturn: boolean;
  counterpartyName?: string;
  counterpartyDoc?: string;
  rawData?: string;
}

export interface ParsedBankStatement {
  bankName: string;
  bankCode?: string;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  transactions: ParsedTransaction[];
}

export function parseOfx(content: string, defaultBankName = 'Extrato Bancário'): ParsedBankStatement {
  let bankCode = '';
  let bankName = defaultBankName;
  let accountNumber = '';
  let dtStart = '';
  let dtEnd = '';

  // Extract metadata from header/tags
  const bankIdMatch = content.match(/<BANKID>([^<\n\r]+)/i);
  if (bankIdMatch && bankIdMatch[1]) {
    bankCode = bankIdMatch[1].trim();
  }

  const acctIdMatch = content.match(/<ACCTID>([^<\n\r]+)/i);
  if (acctIdMatch && acctIdMatch[1]) {
    accountNumber = acctIdMatch[1].trim();
  }

  const dtStartMatch = content.match(/<DTSTART>([^<\n\r]+)/i);
  if (dtStartMatch && dtStartMatch[1]) {
    dtStart = parseOfxDate(dtStartMatch[1].trim());
  }

  const dtEndMatch = content.match(/<DTEND>([^<\n\r]+)/i);
  if (dtEndMatch && dtEndMatch[1]) {
    dtEnd = parseOfxDate(dtEndMatch[1].trim());
  }

  // Detect bank name from code if recognized
  if (bankCode) {
    const knownBanks: Record<string, string> = {
      '341': 'Banco Itaú Unibanco',
      '001': 'Banco do Brasil',
      '237': 'Banco Bradesco',
      '033': 'Banco Santander',
      '077': 'Banco Inter',
      '260': 'Nubank / Nu Pagamentos',
      '756': 'Sicoob Cooperativa',
      '104': 'Caixa Econômica Federal',
      '748': 'Sicredi',
      '422': 'Banco Safra',
      '655': 'Banco Votorantim',
      '212': 'Banco Original',
      '336': 'C6 Bank'
    };
    if (knownBanks[bankCode]) {
      bankName = knownBanks[bankCode];
    }
  }

  // Parse transactions <STMTTRN>...</STMTTRN>
  const transactions: ParsedTransaction[] = [];
  const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = stmtTrnRegex.exec(content)) !== null) {
    const block = match[1];
    if (!block || !block.trim()) continue;

    const trnType = getTagValue(block, 'TRNTYPE')?.toUpperCase() || '';
    const dtPostedRaw = getTagValue(block, 'DTPOSTED') || '';
    const trnAmtRaw = getTagValue(block, 'TRNAMT') || '0';
    const fitid = getTagValue(block, 'FITID') || generateFallbackId(dtPostedRaw, trnAmtRaw, block);
    const memo = getTagValue(block, 'MEMO') || '';
    const name = getTagValue(block, 'NAME') || '';
    const payee = getTagValue(block, 'PAYEE') || '';
    const checkNum = getTagValue(block, 'CHECKNUM') || getTagValue(block, 'REFNUM') || '';

    const cleanDate = parseOfxDate(dtPostedRaw);
    let amount = parseFloat(trnAmtRaw.replace(',', '.'));
    if (isNaN(amount)) amount = 0;

    const isCredit = trnType === 'CREDIT' || amount > 0;
    const absAmount = Math.abs(amount);
    const type: 'CREDIT' | 'DEBIT' = isCredit ? 'CREDIT' : 'DEBIT';

    // Build the full un-truncated description
    const fullDescParts = [name, memo, payee].filter(Boolean);
    const fullDesc = fullDescParts.length > 0 ? fullDescParts.join(' - ') : 'Transação Bancária';
    
    // Ignore statement balance lines (e.g. Saldo do dia, Saldo anterior, Saldo final, etc.)
    if (isBalanceLine(fullDesc, memo, name)) {
      continue;
    }

    const isPix = checkIfPix(fullDesc, memo, name);
    const isPixReturn = checkIfPixReturn(fullDesc, memo, name);

    // Extract counterparty name and document from memo, name and payee
    const { counterpartyName, counterpartyDoc } = extractCounterpartyInfo(name, memo, payee, fullDesc);

    // Keep all raw tags in rawData so no byte from the imported file is lost
    const rawData = JSON.stringify({
      trnType,
      dtPostedRaw,
      trnAmtRaw,
      fitid,
      name,
      memo,
      payee,
      checkNum,
      rawBlock: block.trim()
    });

    transactions.push({
      fitid,
      date: cleanDate,
      type,
      amount: absAmount,
      description: fullDesc, // FULL, never truncated
      memo: memo || fullDesc, // FULL, never truncated
      documentNumber: checkNum || fitid,
      isPix,
      isPixReturn,
      counterpartyName,
      counterpartyDoc,
      rawData
    });
  }

  // Determine actual period from transactions if missing
  if (transactions.length > 0) {
    const dates = transactions.map((t) => t.date).filter(Boolean).sort();
    if (!dtStart && dates.length > 0) dtStart = dates[0];
    if (!dtEnd && dates.length > 0) dtEnd = dates[dates.length - 1];
  }

  return {
    bankName,
    bankCode,
    accountNumber,
    periodStart: dtStart,
    periodEnd: dtEnd,
    transactions
  };
}

function getTagValue(block: string, tag: string): string | null {
  const regexWithClosing = new RegExp(`<${tag}>([^<\\n\\r]+)(?:<\\/${tag}>)?`, 'i');
  const match = block.match(regexWithClosing);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

export function parseOfxDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const cleaned = raw.replace(/\D/g, '');
  if (cleaned.length >= 8) {
    const y = cleaned.substring(0, 4);
    const m = cleaned.substring(4, 6);
    const d = cleaned.substring(6, 8);
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export function checkIfPix(desc: string, memo: string, name: string = ''): boolean {
  const raw = `${desc} ${memo} ${name}`;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  return (
    normalized.includes('PIX') ||
    normalized.includes('PAG.PIX') ||
    normalized.includes('REC.PIX') ||
    normalized.includes('CHAVE PIX') ||
    normalized.includes('TRANSF. PIX') ||
    normalized.includes('TRANSF PIX') ||
    normalized.includes('RECEBIMENTO PIX') ||
    normalized.includes('QR CODE PIX') ||
    normalized.includes('QRCODE PIX') ||
    normalized.includes('PIX TRANSF') ||
    checkIfPixReturn(desc, memo, name)
  );
}

export function checkIfPixReturn(desc: string, memo: string, name: string = ''): boolean {
  const raw = `${desc} ${memo} ${name}`;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const hasPix = normalized.includes('PIX');
  const hasReturnKeyword =
    normalized.includes('DEVOLU') ||
    normalized.includes('DEVOLVID') ||
    normalized.includes('DEV.') ||
    normalized.includes('DEV ') ||
    normalized.includes('ESTORN') ||
    normalized.includes('REVERS') ||
    normalized.includes('REEMB');

  return (
    (hasPix && hasReturnKeyword) ||
    normalized.includes('DEV PIX') ||
    normalized.includes('PIX DEV') ||
    normalized.includes('DEV.PIX') ||
    normalized.includes('DEV-PIX') ||
    normalized.includes('PIX-DEV') ||
    normalized.includes('ESTORNO PIX') ||
    normalized.includes('PIX ESTORNO') ||
    normalized.includes('RECEBIMENTO DEVOLVIDO') ||
    normalized.includes('RECEBIMENTO DEV') ||
    normalized.includes('RECEBIMENTO ESTORNADO') ||
    normalized.includes('PIX-RECEBIMENTO DEVOLVIDO') ||
    normalized.includes('PIX RECEBIMENTO DEVOLVIDO')
  );
}

export function isBalanceLine(desc: string, memo: string = '', name: string = ''): boolean {
  const raw = `${desc} ${memo} ${name}`;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

  return (
    normalized.includes('SALDO DO DIA') ||
    normalized.includes('SALDO ANTERIOR') ||
    normalized.includes('SALDO ATUAL') ||
    normalized.includes('SALDO FINAL') ||
    normalized.includes('SALDO INICIAL') ||
    normalized.includes('SDO DO DIA') ||
    normalized.includes('SDO ANTERIOR') ||
    normalized.includes('SDO ATUAL') ||
    normalized.includes('SDO FINAL') ||
    normalized.includes('SDO INICIAL') ||
    normalized.includes('SALDO TOTAL') ||
    normalized.includes('SALDO DISPONIVEL') ||
    normalized.includes('SALDO BLOQUEADO') ||
    normalized.includes('SALDO APLIC') ||
    normalized.includes('SALDO CONTA') ||
    normalized.includes('SALDO PROVISORIO') ||
    normalized.includes('SALDO EM CONTA') ||
    normalized.includes('SALDO EM C/C') ||
    normalized.includes('SALDO C/C') ||
    normalized.includes('SALDO CC') ||
    normalized.includes('SALDO REAL') ||
    normalized.startsWith('SALDO') ||
    normalized.startsWith('SDO ') ||
    normalized === 'SALDO' ||
    normalized === 'SDO' ||
    normalized.includes('TOTAL DO DIA') ||
    normalized.includes('RESUMO DO DIA') ||
    normalized.includes('POSICAO DO DIA')
  );
}

/**
 * Extracts counterparty name and CPF/CNPJ from Brazilian bank statement text.
 */
export function extractCounterpartyInfo(
  name: string,
  memo: string,
  payee: string = '',
  fullDesc: string = ''
): { counterpartyName?: string; counterpartyDoc?: string } {
  let counterpartyDoc: string | undefined;
  let counterpartyName: string | undefined;

  const candidateStrings = [name, memo, payee, fullDesc].filter(Boolean);

  // Extract CPF / CNPJ if present
  const cpfCnpjRegex = /(\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\*{3}\.\d{3}\.\d{3}-\*{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{11}\b|\b\d{14}\b)/;
  for (const s of candidateStrings) {
    const docMatch = s.match(cpfCnpjRegex);
    if (docMatch && docMatch[1]) {
      counterpartyDoc = docMatch[1];
      break;
    }
  }

  // Pattern 1: Brazilian bank format: PIX - RECEBIDO - DD/MM HH:MM [CPF/CNPJ] [NOME]
  const bbBradescoPat = /(?:PIX\s*[-–]?\s*RECEBIDO(?:\s*QR\s*CODE)?|PIX\s*[-–]?\s*ENVIADO|DEV(?:\.?|OLUÇÃO|OLUCAO)?\s*PIX)\s*[-–]?\s*(?:\d{2}\/\d{2}\s*\d{2}:\d{2}\s*)?(\d{11,14})?\s*(.*)/i;
  for (const s of candidateStrings) {
    const m = s.match(bbBradescoPat);
    if (m) {
      if (m[1] && !counterpartyDoc) counterpartyDoc = m[1].trim();
      if (m[2] && m[2].trim().length >= 3) {
        const candidate = m[2].trim();
        if (!/^(ELETRO|PIX|TRANSF|CONTA)$/i.test(candidate)) {
          counterpartyName = candidate;
          break;
        }
      }
    }
  }

  // Pattern 2: NAME tag is already a person/company name
  // In many OFX files, NAME contains "MARIA DA SILVA" and MEMO contains "PIX RECEBIDO"
  if (!counterpartyName) {
    const cleanName = (name || '').trim();
    const isGenericName =
      !cleanName ||
      /^(PIX|TRANSF|TRANSFERENCIA|PAGAMENTO|RECEBIMENTO|CREDITO|DEBITO|TED|DOC|ESTORNO|DEV PIX)/i.test(cleanName) ||
      cleanName.length < 3;

    if (!isGenericName) {
      counterpartyName = cleanName;
    }
  }

  // Pattern 3: Extract after keywords in MEMO or Description
  if (!counterpartyName) {
    const patterns = [
      /(?:PIX\s+TRANSF(?:ERENCIA)?(?:\s+ELETRO)?\s+)(?:DE\s+|PARA\s+)?([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:PIX\s+RECEBIDO\s*(?:-|DE|:)\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:PIX\s+ENVIADO\s*(?:-|PARA|:)\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:DEV(?:OLUCAO)?\s+PIX\s*(?:-|PARA|DE|:)\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:PAGADOR\s*:\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:BENEFICIARIO\s*:\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:DE:\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i,
      /(?:PARA:\s*)([A-ZÀ-Ú\s]{3,40})(?:\s+CPF|\s+CNPJ|\s+\d|\s+-|$)/i
    ];

    for (const pat of patterns) {
      for (const str of candidateStrings) {
        const m = str.match(pat);
        if (m && m[1] && m[1].trim().length >= 3) {
          const candidate = m[1].trim();
          // Discard if candidate is just "ELETRO" or "PIX"
          if (!/^(ELETRO|PIX|TRANSF|CONTA)$/i.test(candidate)) {
            counterpartyName = candidate;
            break;
          }
        }
      }
      if (counterpartyName) break;
    }
  }

  // Fallback to Payee if present
  if (!counterpartyName && payee && payee.trim().length >= 3) {
    counterpartyName = payee.trim();
  }

  if (counterpartyName) {
    counterpartyName = cleanCounterpartyName(counterpartyName);
  }

  return { counterpartyName, counterpartyDoc };
}

export function cleanCounterpartyName(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  const mSuffix = s.match(/(?:PIX\s*[-–]?\s*RECEBIDO(?:\s*QR\s*CODE)?|PIX\s*[-–]?\s*ENVIADO|DEV(?:\.?|OLUÇÃO|OLUCAO)?\s*PIX)\s*[-–]?\s*(?:\d{2}\/\d{2}\s*\d{2}:\d{2}\s*)?(?:\d{11,14}\s*)?(.*)/i);
  if (mSuffix && mSuffix[1] && mSuffix[1].trim().length >= 2) {
    s = mSuffix[1].trim();
  }
  s = s.replace(/\b\d{2}\/\d{2}\s+\d{2}:\d{2}\b/g, '');
  s = s.replace(/\b\d{11,14}\b/g, '');
  s = s.replace(/^(?:PIX|TRANSF|TRANSFERENCIA|PAGAMENTO|RECEBIMENTO|CREDITO|DEBITO|TED|DOC|ESTORNO|DEV PIX)\s*[-–:]?\s*/i, '');
  s = s.replace(/\s*[-–:]\s*$/, '').trim();
  return s;
}

function generateFallbackId(dt: string, amt: string, block: string): string {
  let hash = 0;
  const str = `${dt}-${amt}-${block.substring(0, 100)}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `FIT-${Math.abs(hash)}`;
}
