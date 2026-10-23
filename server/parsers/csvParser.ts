import Papa from 'papaparse';
import {
  ParsedBankStatement,
  ParsedTransaction,
  checkIfPix,
  checkIfPixReturn,
  extractCounterpartyInfo,
  isBalanceLine
} from './ofxParser.js';

export function repairMojibake(str?: string | null): string {
  if (!str) return '';
  let s = String(str);
  if (/(?:Ã[¡-¿\u0080-\u00BF]|Ã§|Ã£|Ã©|Ã³|Ãª|Ã­|Ãº|Ã¢|Ãµ|Â)/.test(s)) {
    try {
      const repaired = Buffer.from(s, 'binary').toString('utf-8');
      if (!repaired.includes('\uFFFD')) {
        s = repaired;
      }
    } catch {}
    s = s
      .replace(/CobranÃ§a/g, 'Cobrança')
      .replace(/HistÃ³rico/g, 'Histórico')
      .replace(/TransaÃ§Ã£o/g, 'Transação')
      .replace(/TransferÃªncia/g, 'Transferência')
      .replace(/DevoluÃ§Ã£o/g, 'Devolução')
      .replace(/CrÃ©dito/g, 'Crédito')
      .replace(/DÃ©bito/g, 'Débito')
      .replace(/LiquidaÃ§Ã£o/g, 'Liquidação')
      .replace(/NÃ£o/g, 'Não')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã£/g, 'ã')
      .replace(/Ã©/g, 'é')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã­/g, 'í')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã¢/g, 'â')
      .replace(/Ãµ/g, 'õ')
      .replace(/Â/g, '');
  }
  return s;
}

function cleanHeaderCell(str: any): string {
  if (!str) return '';
  return repairMojibake(String(str))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents (ó -> o, ç -> c, etc.)
    .replace(/[\uFFFD\u0000-\u001F]/g, '') // remove Unicode replacement / control chars
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function parseCsvStatement(
  csvContent: string,
  bankName = 'Extrato Bancário',
  bankCode = ''
): ParsedBankStatement {
  // Strip BOM and clean edges
  let cleaned = csvContent.replace(/^\uFEFF/, '').trim();

  const papaInstance = (Papa as any)?.default || Papa;
  let parsed = papaInstance.parse(cleaned, {
    skipEmptyLines: 'greedy',
    header: false
  });

  let rows = parsed.data as string[][];
  if (!rows || rows.length < 2) {
    throw new Error('Arquivo CSV não contém linhas de dados suficientes.');
  }

  // Check if delimiter was misidentified due to preamble header lines (very common in BB & Caixa)
  const sampleRows = rows.slice(0, 12).filter((r) => r && r.length > 0);
  const unparsedWithSemicolon = sampleRows.filter((r) => r.length === 1 && r[0].includes(';')).length;
  const unparsedWithTab = sampleRows.filter((r) => r.length === 1 && r[0].includes('\t')).length;
  const unparsedWithComma = sampleRows.filter((r) => r.length === 1 && r[0].includes(',')).length;

  if (unparsedWithSemicolon >= 2) {
    parsed = papaInstance.parse(cleaned, { delimiter: ';', skipEmptyLines: 'greedy', header: false });
    rows = parsed.data as string[][];
  } else if (unparsedWithTab >= 2) {
    parsed = papaInstance.parse(cleaned, { delimiter: '\t', skipEmptyLines: 'greedy', header: false });
    rows = parsed.data as string[][];
  } else if (unparsedWithComma >= 2 && parsed.meta.delimiter !== ',') {
    parsed = papaInstance.parse(cleaned, { delimiter: ',', skipEmptyLines: 'greedy', header: false });
    rows = parsed.data as string[][];
  }

  let headerIndex = -1;
  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let creditCol = -1;
  let debitCol = -1;
  let docCol = -1;
  let typeCol = -1;

  // Search for the header row among the first 50 lines (supports statements with long preambles)
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const rawRow = rows[i] || [];
    const row = rawRow.map((c) => cleanHeaderCell(c));

    // Prefer exact 'data', 'data mov', 'data lanc' over secondary date columns like 'data do balancete'
    let dIdx = row.findIndex(
      (c) => c === 'data' || c === 'dt' || c === 'date' || c.startsWith('data mov') || c.startsWith('data lanc')
    );
    if (dIdx === -1) {
      dIdx = row.findIndex((c) => c.includes('data') || c.includes('date') || c.includes('periodo'));
    }

    const sIdx = row.findIndex(
      (c) =>
        c.includes('hist') ||
        c.includes('desc') ||
        c.includes('lanc') ||
        c.includes('memo') ||
        c.includes('detalhe') ||
        c.includes('movimentacao')
    );

    const crIdx = row.findIndex(
      (c) => c.includes('credit') || c.includes('entrada') || c.includes('receb')
    );
    const dbIdx = row.findIndex(
      (c) => c.includes('debit') || c.includes('saida') || c.includes('pag')
    );

    // Amount column (exclude 'saldo')
    let vIdx = row.findIndex(
      (c) =>
        (c.includes('valor') ||
          c.includes('quantia') ||
          c.includes('montante') ||
          c === 'amount' ||
          c === 'val') &&
        !c.includes('saldo')
    );
    if (vIdx === -1 && crIdx === -1) {
      vIdx = row.findIndex((c) => c.includes('valor'));
    }

    if (dIdx !== -1 && sIdx !== -1 && (vIdx !== -1 || (crIdx !== -1 && dbIdx !== -1))) {
      headerIndex = i;
      dateCol = dIdx;
      descCol = sIdx;
      if (crIdx !== -1 && dbIdx !== -1) {
        creditCol = crIdx;
        debitCol = dbIdx;
        amountCol = -1;
      } else {
        amountCol = vIdx;
        creditCol = -1;
        debitCol = -1;
      }

      docCol = row.findIndex(
        (c) =>
          c.includes('doc') ||
          c.includes('ident') ||
          c.includes('num') ||
          c.includes('nro') ||
          c.includes('comprovante') ||
          c.includes('autentica') ||
          c.includes('lote')
      );

      typeCol = row.findIndex(
        (c) =>
          c === 'tipo' ||
          c === 'd/c' ||
          c === 'dc' ||
          c.includes('natureza') ||
          c.includes('operacao')
      );
      break;
    }
  }

  // Detect standard Banco do Brasil 13-column layout without textual header:
  // Col 0: Agência, Col 1: Conta, Col 3: Data Lançamento, Col 7: Doc/Fitid, Col 9: Histórico, Col 10: Valor, Col 11: C/D, Col 12: Detalhes
  let isBb13ColLayout = false;
  const sampleNonEmpty = rows.slice(0, 20).filter((r) => r && r.length >= 12);
  if (headerIndex === -1 && sampleNonEmpty.length >= 1) {
    const bbMatches = sampleNonEmpty.filter(
      (r) =>
        normalizeCsvDate(r[3] || '') &&
        ['C', 'D'].includes((r[11] || '').trim().toUpperCase()) &&
        parseCurrency(r[10]) !== 0
    ).length;

    if (bbMatches >= 1) {
      isBb13ColLayout = true;
      headerIndex = -1;
      dateCol = 3;
      descCol = 9;
      amountCol = 10;
      typeCol = 11;
      docCol = 7;
    }
  }

  // Heuristic column detection fallback if no textual header was recognized
  if (headerIndex === -1 && !isBb13ColLayout) {
    const maxCols = Math.max(...rows.slice(0, 30).map((r) => r.length));
    const colStats: { dates: number; amounts: number; decimals: number; textLen: number; typeCd: number }[] = [];
    for (let c = 0; c < maxCols; c++) {
      colStats[c] = { dates: 0, amounts: 0, decimals: 0, textLen: 0, typeCd: 0 };
    }

    for (let r = 0; r < Math.min(rows.length, 30); r++) {
      const row = rows[r];
      if (!row || row.length < 2) continue;
      for (let c = 0; c < row.length; c++) {
        const val = (row[c] || '').trim();
        if (normalizeCsvDate(val)) colStats[c].dates++;
        const parsedCur = parseCurrency(val);
        if (parsedCur !== 0) {
          colStats[c].amounts++;
          if (/[\,\.]\d{2}$/.test(val)) colStats[c].decimals++;
        }
        if (['C', 'D', 'CR', 'DB'].includes(val.toUpperCase())) {
          colStats[c].typeCd++;
        }
        colStats[c].textLen += val.length;
      }
    }

    let bestDate = -1, maxDates = 0;
    let bestAmount = -1, bestAmountScore = 0;
    let bestTypeCol = -1, maxTypeCd = 0;

    for (let c = 0; c < maxCols; c++) {
      if (colStats[c].dates > maxDates) {
        maxDates = colStats[c].dates;
        bestDate = c;
      }
      const score = colStats[c].decimals * 10 + colStats[c].amounts;
      if (score > bestAmountScore && c !== bestDate) {
        bestAmountScore = score;
        bestAmount = c;
      }
      if (colStats[c].typeCd > maxTypeCd && c !== bestDate) {
        maxTypeCd = colStats[c].typeCd;
        bestTypeCol = c;
      }
    }

    if (bestDate !== -1 && bestAmount !== -1) {
      dateCol = bestDate;
      amountCol = bestAmount;
      if (maxTypeCd >= 2 && bestTypeCol !== amountCol) {
        typeCol = bestTypeCol;
      }
      let bestDesc = -1, maxDescLen = 0;
      for (let c = 0; c < maxCols; c++) {
        if (c !== dateCol && c !== amountCol && c !== typeCol && colStats[c].textLen > maxDescLen) {
          maxDescLen = colStats[c].textLen;
          bestDesc = c;
        }
      }
      descCol = bestDesc !== -1 ? bestDesc : (dateCol === 0 ? 1 : 0);
      headerIndex = 0;
      for (let r = 0; r < rows.length; r++) {
        if (normalizeCsvDate(rows[r][dateCol] || '')) {
          headerIndex = Math.max(0, r - 1);
          break;
        }
      }
    }
  }

  if (headerIndex === -1 && !isBb13ColLayout) {
    headerIndex = 0;
    dateCol = 0;
    descCol = 1;
    amountCol = 2;
  }

  const transactions: ParsedTransaction[] = [];
  const startRow = headerIndex + 1;
  const occurrenceMap = new Map<string, number>();

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawDate = (row[dateCol] || '').toString().trim();
    const rawDesc = (row[descCol] || '').toString().trim();
    if (!rawDate || !rawDesc) continue;

    if (isBalanceLine(rawDesc, rawDesc)) {
      continue; // Skip balance lines (Saldo do dia, Saldo anterior, etc.)
    }

    const normalizedDate = normalizeCsvDate(rawDate);
    if (!normalizedDate) continue;

    let amount = 0;
    let type: 'CREDIT' | 'DEBIT' = 'CREDIT';

    if (creditCol !== -1 && debitCol !== -1) {
      const crVal = parseCurrency(row[creditCol]);
      const dbVal = parseCurrency(row[debitCol]);
      if (crVal > 0) {
        amount = crVal;
        type = 'CREDIT';
      } else if (dbVal > 0) {
        amount = dbVal;
        type = 'DEBIT';
      } else {
        continue;
      }
    } else if (amountCol !== -1) {
      const rawVal = row[amountCol] || '';
      const parsedVal = parseCurrency(rawVal);
      if (parsedVal === 0) continue;

      let explicitType: 'CREDIT' | 'DEBIT' | null = null;
      if (typeCol !== -1) {
        const rawType = cleanHeaderCell(row[typeCol] || '');
        if (rawType.startsWith('c') || rawType.includes('cred') || rawType.includes('entrad')) {
          explicitType = 'CREDIT';
        } else if (rawType.startsWith('d') || rawType.includes('deb') || rawType.includes('said')) {
          explicitType = 'DEBIT';
        }
      }

      const isExplicitDebit =
        String(rawVal).includes('-') ||
        String(rawVal).toUpperCase().endsWith('D') ||
        String(rawVal).includes('(');
      const isExplicitCredit =
        String(rawVal).includes('+') || String(rawVal).toUpperCase().endsWith('C');

      if (explicitType) {
        type = explicitType;
      } else if (isExplicitDebit) {
        type = 'DEBIT';
      } else if (isExplicitCredit) {
        type = 'CREDIT';
      } else {
        type = parsedVal >= 0 ? 'CREDIT' : 'DEBIT';
      }
      amount = Math.abs(parsedVal);
    }

    const rawDoc = docCol !== -1 ? (row[docCol] || '').toString().trim() : '';
    // Avoid treating trivial doc values (0, 000000, -, PIX) as unique IDs
    const isTrivialDoc =
      !rawDoc ||
      rawDoc === '0' ||
      /^0+$/.test(rawDoc) ||
      rawDoc === '-' ||
      rawDoc.toLowerCase() === 'pix';

    let counterpartyName: string | undefined = undefined;
    let counterpartyDoc: string | undefined = undefined;
    let descToUse = rawDesc;
    let memoToUse = rawDesc;

    if (isBb13ColLayout && row[12]) {
      const rawDetalhe = (row[12] || '').trim();
      memoToUse = rawDetalhe;
      const match = rawDetalhe.match(/^(?:\d{2}\/\d{2}(?:\s+\d{2}:\d{2})?\s+)?(?:(\d{11}|\d{14})\s+)?(.*)$/);
      if (match) {
        if (match[1]) counterpartyDoc = match[1];
        if (match[2] && match[2].trim()) counterpartyName = match[2].trim();
      }
      if (counterpartyName) {
        descToUse = `${rawDesc} - ${counterpartyName}`;
      }
    } else {
      const extracted = extractCounterpartyInfo('', rawDesc, '', rawDesc);
      counterpartyName = extracted.counterpartyName;
      counterpartyDoc = extracted.counterpartyDoc;
    }

    const lineSignature = `${normalizedDate}|${amount.toFixed(2)}|${type}|${cleanHeaderCell(descToUse)}`;
    const occ = (occurrenceMap.get(lineSignature) || 0) + 1;
    occurrenceMap.set(lineSignature, occ);

    const fitid = !isTrivialDoc
      ? rawDoc
      : `CSV-${normalizedDate}-${amount.toFixed(2)}-${occ}`;

    const isPix = checkIfPix(descToUse, memoToUse);
    const isPixReturn = checkIfPixReturn(descToUse, memoToUse);

    const rawData = JSON.stringify({
      rowIndex: i,
      rawRow: row,
      headerRow: headerIndex >= 0 ? rows[headerIndex] : null
    });

    transactions.push({
      fitid,
      date: normalizedDate,
      type,
      amount,
      description: repairMojibake(descToUse),
      memo: repairMojibake(memoToUse),
      documentNumber: !isTrivialDoc ? rawDoc : undefined,
      isPix,
      isPixReturn,
      counterpartyName: counterpartyName ? repairMojibake(counterpartyName) : undefined,
      counterpartyDoc,
      rawData
    });
  }

  const dates = transactions.map((t) => t.date).sort();

  return {
    bankName,
    bankCode,
    periodStart: dates[0] || new Date().toISOString().slice(0, 10),
    periodEnd: dates[dates.length - 1] || new Date().toISOString().slice(0, 10),
    transactions
  };
}

export function parseCurrency(val: any): number {
  if (val === null || val === undefined) return 0;
  let str = String(val).trim();
  if (!str) return 0;

  const isNegative =
    str.includes('-') ||
    (str.startsWith('(') && str.endsWith(')')) ||
    str.toUpperCase().endsWith('D');

  // Strip symbols, spaces, parentheses, CD indicators, and stray signs
  str = str.replace(/[R$\s()CDcd]/g, '').replace(/-/g, '');

  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (str.includes('.') && str.length > 3) {
    if (/\.\d{3}$/.test(str)) {
      str = str.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

export function normalizeCsvDate(raw: string): string | null {
  if (!raw) return null;
  const str = raw.trim();

  const brMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (brMatch) {
    let day = brMatch[1].padStart(2, '0');
    let month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  const isoMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const digits8 = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (digits8) {
    return `${digits8[1]}-${digits8[2]}-${digits8[3]}`;
  }

  return null;
}
