fetch('http://localhost:3000/api/database/capitalize', { method: 'POST' })
  .then(res => res.json())
  .then(data => console.log('Capitalized API Success:', data))
  .catch(console.error);
