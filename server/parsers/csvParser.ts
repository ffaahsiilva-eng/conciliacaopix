import Papa from 'papaparse';
import { ParsedBankStatement, ParsedTransaction, checkIfPix, checkIfPixReturn, extractCounterpartyInfo, isBalanceLine } from './ofxParser.js';

export function parseCsvStatement(
  csvContent: string,
  bankName = 'Extrato Bancário',
  bankCode = ''
): ParsedBankStatement {
  let cleaned = csvContent;
  if (cleaned.charCodeAt(0) === 0xFEFF) {
    cleaned = cleaned.slice(1);
  }

  const papaInstance = (Papa as any)?.default || Papa;
  const parsed = papaInstance.parse(cleaned, {
    skipEmptyLines: 'greedy',
    header: false
  });

  const rows = parsed.data as string[][];
  if (!rows || rows.length < 2) {
    throw new Error('Arquivo CSV não contém linhas de dados suficientes.');
  }

  let headerIndex = -1;
  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let creditCol = -1;
  let debitCol = -1;
  let docCol = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(c => (c || '').toString().trim().toLowerCase());
    
    const dIdx = row.findIndex(c => c.includes('data') || c === 'dt' || c === 'date');
    const vIdx = row.findIndex(c => c.includes('valor') || c === 'amount' || c === 'quantia');
    const crIdx = row.findIndex(c => c.includes('crédito') || c.includes('credito') || c === 'entradas');
    const dbIdx = row.findIndex(c => c.includes('débito') || c.includes('debito') || c === 'saídas' || c === 'saidas');
    const sIdx = row.findIndex(c => c.includes('histórico') || c.includes('historico') || c.includes('descri') || c.includes('lançamento') || c.includes('lancamento') || c === 'memo');

    if (dIdx !== -1 && (vIdx !== -1 || (crIdx !== -1 && dbIdx !== -1)) && sIdx !== -1) {
      headerIndex = i;
      dateCol = dIdx;
      descCol = sIdx;
      // Prioritize explicit credit/debit columns over generic amount
      if (crIdx !== -1 && dbIdx !== -1) {
          amountCol = -1; // Force use of cr/db cols
          creditCol = crIdx;
          debitCol = dbIdx;
      } else {
          amountCol = vIdx;
          creditCol = -1;
          debitCol = -1;
      }
      docCol = row.findIndex(c => c.includes('doc') || c.includes('identificador') || c.includes('número') || c.includes('numero'));
      break;
    }
  }

  // ... further down, inside the loop ...

  function isCurrencyFormat(val: string): boolean {
      // Look for format like 0,00 or 0.00
      return /[\d]+[.,][\d]{2}/.test(val);
  }

  // Bradesco specific check: detect column structure based on row content if header detection is unreliable
  // Based on user data: [date, description, doc, amount, ...]
  if (headerIndex !== -1) {
    const headerRow = rows[headerIndex].map(c => c.toLowerCase());
    
    // Check if column 2 looks like a description and column 3 like amount
    if (headerRow[1].includes('descri') && headerRow[3].includes('valor')) {
        dateCol = 0;
        descCol = 1;
        docCol = 2;
        amountCol = 3;
        creditCol = -1;
        debitCol = -1;
    }
  }

  // Fallback to strict indexes if header detection fails for Bradesco
  if (amountCol === -1 && creditCol === -1 && debitCol === -1) {
      dateCol = 0;
      descCol = 1;
      docCol = 2;
      amountCol = 3;
  }



  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    descCol = 1;
    amountCol = 2;
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const rawDate = (row[dateCol] || '').toString().trim();
    const rawDesc = (row[descCol] || '').toString().trim();
    if (!rawDate || !rawDesc) continue;

    if (isBalanceLine(rawDesc, rawDesc)) {
      continue; // Skip daily/monthly/accumulated balance rows
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

      const isExplicitDebit = String(rawVal).includes('-') || String(rawVal).toUpperCase().endsWith('D') || String(rawVal).includes('(');
      const isExplicitCredit = String(rawVal).includes('+') || String(rawVal).toUpperCase().endsWith('C');

      if (isExplicitDebit) {
        type = 'DEBIT';
        amount = Math.abs(parsedVal);
      } else if (isExplicitCredit) {
        type = 'CREDIT';
        amount = Math.abs(parsedVal);
      } else {
        type = parsedVal >= 0 ? 'CREDIT' : 'DEBIT';
        amount = Math.abs(parsedVal);
      }
    }

    const docNumber = docCol !== -1 ? (row[docCol] || '').toString().trim() : '';
    const fitid = docNumber || `CSV-${i}-${normalizedDate}-${amount.toFixed(2)}`;

    const isPix = checkIfPix(rawDesc, rawDesc);
    const isPixReturn = checkIfPixReturn(rawDesc, rawDesc);

    const { counterpartyName, counterpartyDoc } = extractCounterpartyInfo('', rawDesc, '', rawDesc);

    const rawData = JSON.stringify({
      rowIndex: i,
      rawRow: row,
      headerRow: rows[headerIndex]
    });

    transactions.push({
      fitid,
      date: normalizedDate,
      type,
      amount,
      description: rawDesc, // FULL, never truncated
      memo: rawDesc, // FULL, never truncated
      documentNumber: docNumber || undefined,
      isPix,
      isPixReturn,
      counterpartyName,
      counterpartyDoc,
      rawData
    });
  }

  const dates = transactions.map(t => t.date).sort();

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

  const isNegative = str.includes('-') || (str.startsWith('(') && str.endsWith(')'));
  // Remove currency symbols, spaces, parentheses, CD indicators, but keep commas/dots for now
  str = str.replace(/[R$\s()CDcd]/g, '');

  // If there's both a comma and a dot, we need to determine which one is the decimal separator.
  // Bradesco format often uses dots for thousands and comma for decimal (e.g., 1.234,56).
  if (str.includes(',') && str.includes('.')) {
    // If comma is at the end or near the end, it's likely the decimal separator
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56 -> 1234.56
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // 1234,56 -> 1234.56
    str = str.replace(',', '.');
  } else if (str.includes('.') && str.length > 3) {
    // Check if the dot is a thousands separator or decimal separator.
    // If there are exactly two digits after the dot, it might be a decimal.
    // However, Bradesco files often put the dot for thousands.
    // Let's assume dot is thousands separator if there are 3 digits after it, 
    // or if we have another logic.
    // The problematic case "460.997" is likely 460997.
    
    // Heuristic: If we have multiple dots or the dot is followed by 3 digits, it's likely a thousands separator.
    if (/\.\d{3}$/.test(str)) {
        str = str.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed)) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

export function normalizeCsvDate(raw: string): string | null {
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

  return null;
}
