const url = 'http://localhost:3000/api/reconciliation/sessions/sess-1791235144779';
fetch(url, {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'matriz'
  },
  body: JSON.stringify({
    actorUser: { id: 'test', name: 'Test', role: 'ADMIN', companies: ['matriz'] }
  })
}).then(res => res.json()).then(console.log).catch(console.error);
