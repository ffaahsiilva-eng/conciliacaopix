const fs = require('fs');
let content = fs.readFileSync('src/views/ReportsView.tsx', 'utf8');
content = content.replace(/className="(py-3\.5|py-3) px-4/g, 'className="$1 px-2');
content = content.replace(/className="py-3\.5 px-4 text-center/g, 'className="py-3.5 px-2 text-center');
content = content.replace(/className="py-3\.5 px-4 text-right/g, 'className="py-3.5 px-2 text-right');
fs.writeFileSync('src/views/ReportsView.tsx', content);
