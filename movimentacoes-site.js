import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import zlib from 'zlib';
import initSqlJs from 'sql.js';

dotenv.config();

const app = express();
const port = 3055;

const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: parseInt(process.env.SQL_PORT || '6543'),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false }
});

app.get('/api/data', async (req, res) => {
  try {
    const dbRes = await pool.query("SELECT data FROM system_snapshots WHERE key = 'main_db'");
    if (dbRes.rows.length === 0) {
      return res.status(404).json({ error: 'No snapshot found' });
    }
    
    const b64Data = dbRes.rows[0].data;
    const buffer = Buffer.from(b64Data, 'base64');
    const unzipped = zlib.gunzipSync(buffer);
    
    const SQL = await initSqlJs();
    const db = new SQL.Database(unzipped);
    
    // Fetch transactions
    const txQuery = db.exec("SELECT date, amount, description, bank_name, type, status, counterparty_name FROM transactions ORDER BY date DESC");
    
    if (txQuery.length === 0) {
       return res.json([]);
    }
    
    const columns = txQuery[0].columns;
    const values = txQuery[0].values;
    
    const data = values.map(row => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
    
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Visualizador de Movimentações</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <link rel="stylesheet" href="https://cdn.datatables.net/1.13.6/css/dataTables.bootstrap5.min.css">
      <style>
        body { background-color: #f8f9fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        .container { margin-top: 30px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .credit { color: #198754; font-weight: bold; }
        .debit { color: #dc3545; font-weight: bold; }
        .total-box { font-size: 1.5rem; font-weight: bold; text-align: center; margin-bottom: 20px; padding: 15px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1 class="text-center mb-4">Movimentações - ConciliaPix</h1>
        
        <div class="row mb-4">
            <div class="col-md-4">
                <div class="total-box bg-light border">Total Transações: <span id="count">...</span></div>
            </div>
            <div class="col-md-4">
                <div class="total-box bg-success text-white">Créditos: <span id="credits">...</span></div>
            </div>
            <div class="col-md-4">
                <div class="total-box bg-danger text-white">Débitos: <span id="debits">...</span></div>
            </div>
        </div>

        <table id="txTable" class="table table-striped table-bordered" style="width:100%">
          <thead>
            <tr>
              <th>Data</th>
              <th>Banco</th>
              <th>Descrição</th>
              <th>Contraparte</th>
              <th>Tipo</th>
              <th>Valor (R$)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
          </tbody>
        </table>
      </div>

      <script src="https://code.jquery.com/jquery-3.7.0.js"></script>
      <script src="https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js"></script>
      <script src="https://cdn.datatables.net/1.13.6/js/dataTables.bootstrap5.min.js"></script>
      <script>
        $(document).ready(function() {
          $.getJSON('/api/data', function(data) {
            let credits = 0;
            let debits = 0;
            
            data.forEach(d => {
                if(d.type === 'CREDIT') credits += parseFloat(d.amount);
                else debits += parseFloat(d.amount);
            });

            $('#count').text(data.length);
            $('#credits').text('R$ ' + credits.toLocaleString('pt-BR', {minimumFractionDigits: 2}));
            $('#debits').text('R$ ' + debits.toLocaleString('pt-BR', {minimumFractionDigits: 2}));

            $('#txTable').DataTable({
              data: data,
              columns: [
                { data: 'date', render: function(data) { 
                    if(!data) return '';
                    const parts = data.split('-');
                    return parts.length === 3 ? parts[2]+'/'+parts[1]+'/'+parts[0] : data;
                }},
                { data: 'bank_name' },
                { data: 'description' },
                { data: 'counterparty_name' },
                { data: 'type', render: function(data) {
                    return data === 'CREDIT' ? '<span class="badge bg-success">Crédito</span>' : '<span class="badge bg-danger">Débito</span>';
                }},
                { data: 'amount', render: function(data, type, row) {
                    let val = parseFloat(data).toLocaleString('pt-BR', {minimumFractionDigits: 2});
                    if (row.type === 'CREDIT') return '<span class="credit">+R$ ' + val + '</span>';
                    return '<span class="debit">-R$ ' + val + '</span>';
                }},
                { data: 'status' }
              ],
              order: [[0, 'desc']],
              language: {
                url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/pt-BR.json',
              }
            });
          }).fail(function() {
             alert('Erro ao buscar dados do banco.');
          });
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Servidor rodando! Acesse: http://localhost:${port}`);
});
