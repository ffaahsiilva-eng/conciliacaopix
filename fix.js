import fs from 'fs';
let data = fs.readFileSync('restore-user-data.js', 'utf8');
const correctUsers = [
  {id:'usr-op-aliny',name:'Aliny',email:'aliny@aguacristalsul.com.br',role:'OPERATOR',pin:'1234',avatar:null,active:1,created_at:'2026-09-30T08:34:33.296Z',allowed_companies:'["matriz","filial"]'},
  {id:'usr-op-miguel',name:'Miguel Duran',email:'miguel@aguacristalsul.com.br',role:'OPERATOR',pin:'Imperatriz00',avatar:null,active:1,created_at:'2026-09-30T10:02:11.306Z',allowed_companies:'["matriz","filial"]'},
  {id:'usr-admin-fab',name:'fabricio',email:'fabricio@cristal.com.br',role:'ADMIN',pin:'1234',avatar:null,active:1,created_at:'2026-09-30T08:34:33.296Z',allowed_companies:'["matriz","filial"]'},
  {id:'usr-admin',name:'franco duran',email:'franco_junior120@hotmail.com',role:'ADMIN',pin:'FrJr4866',avatar:null,active:1,created_at:'2026-09-30T08:34:33.296Z',allowed_companies:'["matriz","filial"]'}
];
data = data.replace(/"users":\[.*\],"drivers"/, '"users":' + JSON.stringify(correctUsers) + ',"drivers"');
fs.writeFileSync('restore-user-data.js', data);
