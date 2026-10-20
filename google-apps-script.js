/**
 * ==============================================================================
 * CONCILIAPIX PRO — SCRIPT DO GOOGLE APPS SCRIPT
 * Sincronização Automática com Google Drive e Planilha Google (Excel)
 * ==============================================================================
 * 
 * INSTRUÇÕES RÁPIDAS DE INSTALAÇÃO (1 MINUTO):
 * 1. No seu Google Drive, crie uma Planilha em branco com o nome "ConciliaPix - Controle & Extratos".
 * 2. No menu superior da planilha, clique em: Extensões > Apps Script.
 * 3. Apague todo o código que estiver lá e cole este script completo.
 * 4. Clique em "Implantar" (botão azul no canto superior direito) > "Nova implantação".
 * 5. Selecione o tipo "App da Web" (ícone de engrenagem).
 * 6. Preencha:
 *    - Descrição: "ConciliaPix Sync"
 *    - Executar como: "Eu (seu_email@gmail.com)"
 *    - Quem pode acessar: "Qualquer pessoa" (Anyone) -> ESSENCIAL para o ConciliaPix poder enviar!
 * 7. Clique em "Implantar" e conceda as permissões de acesso ao seu Google Drive.
 * 8. Copie a "URL do app da Web" gerada e cole nas configurações do ConciliaPix!
 * ==============================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJson({ success: false, error: "Nenhum dado recebido no POST." });
    }

    var payload = JSON.parse(e.postData.contents);
    var now = new Date();
    var timeZone = Session.getScriptTimeZone() || "GMT-3";
    var dateStamp = Utilities.formatDate(now, timeZone, "yyyy-MM-dd_HH-mm-ss");

    // ==========================================================================
    // 1. SALVAR ARQUIVO DE BACKUP COMPLETO (.JSON) NO GOOGLE DRIVE
    // ==========================================================================
    var folderName = "ConciliaPix_Backups";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    var backupJson = JSON.stringify(payload.backupData || payload);
    var fileName = "conciliapix-backup-" + dateStamp + ".json";
    folder.createFile(fileName, backupJson, MimeType.PLAIN_TEXT);

    // Atualiza também o arquivo com nome fixo LATEST (para restauração rápida de emergência)
    var latestFiles = folder.getFilesByName("conciliapix-backup-LATEST.json");
    if (latestFiles.hasNext()) {
      latestFiles.next().setContent(backupJson);
    } else {
      folder.createFile("conciliapix-backup-LATEST.json", backupJson, MimeType.PLAIN_TEXT);
    }

    // Rotação: manter os 30 backups mais recentes para não ocupar espaço excessivo
    var files = folder.getFiles();
    var list = [];
    while (files.hasNext()) {
      var f = files.next();
      if (f.getName().indexOf("conciliapix-backup-20") === 0) {
        list.push(f);
      }
    }
    if (list.length > 30) {
      list.sort(function (a, b) {
        return b.getDateCreated().getTime() - a.getDateCreated().getTime();
      });
      for (var i = 30; i < list.length; i++) {
        list[i].setTrashed(true);
      }
    }

    // ==========================================================================
    // 2. ATUALIZAR AS ABAS DA PLANILHA GOOGLE (EXCEL ONLINE)
    // ==========================================================================
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      // Se o script for criado direto em script.google.com (projeto independente)
      var sheetFiles = DriveApp.getFilesByName("ConciliaPix - Controle & Extratos");
      if (sheetFiles.hasNext()) {
        ss = SpreadsheetApp.open(sheetFiles.next());
      } else {
        ss = SpreadsheetApp.create("ConciliaPix - Controle & Extratos");
      }
    }
    var rowsUpdated = 0;

    if (ss && payload.spreadsheetData) {
      var sData = payload.spreadsheetData;

      // Aba 1: Lançamentos & Extratos
      if (sData.transactionsHeaders && sData.transactionsRows) {
        updateTab(
          ss,
          "📊 Lançamentos & Extratos",
          sData.transactionsHeaders,
          sData.transactionsRows,
          [5] // Coluna 5 é Valor (R$)
        );
        rowsUpdated += sData.transactionsRows.length;
      }

      // Aba 2: Acertos & Conciliações
      if (sData.sessionsHeaders && sData.sessionsRows) {
        updateTab(
          ss,
          "🚚 Acertos & Conciliações",
          sData.sessionsHeaders,
          sData.sessionsRows,
          [8, 9] // Colunas 8 e 9 são Valores (R$)
        );
        rowsUpdated += sData.sessionsRows.length;
      }

      // Aba 3: Resumo por Motorista
      if (sData.driversHeaders && sData.driversRows) {
        updateTab(
          ss,
          "📈 Resumo por Motorista",
          sData.driversHeaders,
          sData.driversRows,
          [8] // Coluna 8 é Total Conciliado (R$)
        );
        rowsUpdated += sData.driversRows.length;
      }
    }

    return responseJson({
      success: true,
      message: "Backup salvo no Google Drive (" + fileName + ") e " + rowsUpdated + " linhas atualizadas na Planilha!",
      fileName: fileName,
      folder: folderName,
      updatedAt: now.toISOString()
    });

  } catch (err) {
    return responseJson({
      success: false,
      error: err.toString(),
      stack: err.stack || ""
    });
  }
}

/**
 * Atualiza uma aba da planilha com estilização executiva
 */
function updateTab(ss, tabName, headers, rows, currencyColIndexes) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  sheet.clear();

  var allValues = [headers].concat(rows || []);
  if (allValues.length === 0 || allValues[0].length === 0) return;

  var range = sheet.getRange(1, 1, allValues.length, headers.length);
  range.setValues(allValues);

  // Formatação do Cabeçalho
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#0f172a"); // Azul escuro executivo
  headerRange.setFontColor("#ffffff"); // Texto branco
  headerRange.setFontWeight("bold");
  headerRange.setFontSize(10);
  headerRange.setHorizontalAlignment("center");
  sheet.setFrozenRows(1);

  // Formatação de valores monetários (R$)
  if (currencyColIndexes && rows.length > 0) {
    for (var i = 0; i < currencyColIndexes.length; i++) {
      var colIdx = currencyColIndexes[i];
      if (colIdx <= headers.length) {
        var numRange = sheet.getRange(2, colIdx, rows.length, 1);
        numRange.setNumberFormat('"R$ "#,##0.00');
        numRange.setHorizontalAlignment("right");
      }
    }
  }

  // Linhas zebradas suaves
  if (rows.length > 0) {
    var dataRange = sheet.getRange(2, 1, rows.length, headers.length);
    dataRange.setFontSize(9);
    dataRange.setVerticalAlignment("middle");
  }

  // Ajuste rápido de largura de colunas (execução instantânea sem travar)
  for (var c = 1; c <= headers.length; c++) {
    sheet.setColumnWidth(c, c === 7 ? 280 : c === 1 ? 140 : 120);
  }
}

function responseJson(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput(
    "Webhook do ConciliaPix Pro está ativo e pronto para receber backups!"
  );
}
