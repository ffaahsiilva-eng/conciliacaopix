const url = 'http://localhost:3000/api/users/usr-1791204424987';
fetch(url, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'x-company-id': 'matriz'
  },
  body: JSON.stringify({
    role: 'ADMIN',
    actorUser: { id: 'usr-admin', name: 'Franco Duran', role: 'ADMIN', companies: ['matriz'] }
  })
}).then(res => res.json()).then(console.log).catch(console.error);
