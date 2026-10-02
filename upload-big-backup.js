import fs from 'fs';

async function upload() {
  console.log('Reading 13.5MB backup file...');
  const rawData = fs.readFileSync('backup-conciliapix.json', 'utf8');
  const userJson = JSON.parse(rawData);
  
  console.log('Uploading to Vercel...');
  const res = await fetch('https://conciliacaopix.vercel.app/api/database/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      backupData: userJson,
      actorUser: { id: 'usr-admin', name: 'franco duran', role: 'ADMIN' }
    })
  });
  const text = await res.text();
  console.log('Result HTTP status:', res.status);
  console.log('Result body:', text);
}

upload().catch(console.error);
