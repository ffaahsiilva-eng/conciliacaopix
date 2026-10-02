import fs from 'fs';

async function upload() {
  console.log('Lendo arquivo de backup de 13.5MB...');
  const rawData = fs.readFileSync('backup-conciliapix.json', 'utf8');
  const userJson = JSON.parse(rawData);
  
  console.log('Enviando para o servidor local...');
  const res = await fetch('http://localhost:3000/api/database/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      backupData: userJson,
      actorUser: { id: 'usr-admin', name: 'franco duran', role: 'ADMIN' }
    })
  });
  const text = await res.text();
  console.log('Resultado (Status):', res.status);
  console.log('Mensagem:', text);
}

upload().catch(console.error);
