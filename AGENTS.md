# AGENTS.md — Conciliapix

## REGRA CRÍTICA: o banco de produção NÃO pode ser sobrescrito

`data/conciliapix.sqlite` é o banco de produção do sistema (11.996 transações,
85 sessões de conciliação). Ele está versionado no git, e **isso é o que causa perda
de dados**: qualquer `clone`, `reset`, `checkout`, `restore` ou `clean` substitui
o arquivo pelo conteúdo do commit mais antigo, apagando tudo que foi gravado depois.

O git **não consegue** recuperar esse tipo de perda, porque o dado alterado nunca
foi commitado. Não existe stash, reflog, dangling object ou entrada na Lixeira que
reponha o conteúdo.

### Antes de qualquer operação destrutiva

Rode o backup primeiro (`/backup-banco` ou o comando abaixo):

```powershell
$bk = "D:\Projetos Sistemas\_backups"
if (-not (Test-Path -LiteralPath $bk)) { New-Item -ItemType Directory -Path $bk -Force | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath "D:\Projetos Sistemas\Conciliapix\data\conciliapix.sqlite" `
          -Destination (Join-Path $bk "conciliapix-$stamp.sqlite") -Force
```

### Operações que exigem backup prévio

- `git commit` / `git push` (o banco entra no histórico)
- `git reset --hard`, `git clean`, `git checkout`, `git restore`
- `git clone` em cima de um diretório existente
- Qualquer restauração de arquivos a partir do git

### Incidente registrado em 08/10/2026

A pasta `D:\Projetos Sistemas` foi criada às 13:53 e o Conciliapix foi clonado às
14:02, sobrescrevendo o diretório de trabalho anterior. Como o banco e o código
local não estavam commitados, tudo voltou ao estado de 07/10 21:10. Os backups
em `D:\Projetos Sistemas\_backups` são a única rede de segurança deste projeto.

### Backup automático (instalado em 08/10/2026)

Tarefa agendada do Windows: **`Conciliapix - Backup Banco`**.

- Script: `.kilo/scripts/backup-banco.ps1`
- Horários: **09:00, 13:00 e 18:00** (diários)
- Destino: `D:\Projetos Sistemas\_backups`
- Logs: `D:\Projetos Sistemas\_backups\logs\backup-AAAA-MM.log`

O script é seguro com o servidor no ar porque o app usa `sql.js` e grava o banco
de forma atômica (`server/db.ts:308-310`: escreve em `.tmp` e faz `rename`). O
arquivo `.sqlite` está sempre em estado completo e consistente.

Proteções do script:

1. Recusa banco menor que 1 MB
2. Valida o cabeçalho `SQLite format 3`
3. Só cria backup se o banco mudou (comparação SHA-256) — evita cópias redundantes
4. Valida o hash da cópia após gravar
5. Rotaciona, mantendo os 60 backups mais recentes

**Limite conhecido:** o backup roda 3x ao dia. Uma alteração feita às 10h só é
capturada às 13h. Se precisar de proteção imediata, rode `/backup-banco`.

### Verificação

```powershell
Get-ScheduledTask -TaskName "Conciliapix - Backup Banco"
Get-ScheduledTaskInfo -TaskName "Conciliapix - Backup Banco"   # LastTaskResult 0 = sucesso
Get-ChildItem "D:\Projetos Sistemas\_backups\conciliapix-*.sqlite"
```

## Commandos do projeto

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `/backup-banco` — backup verificado do SQLite antes de operação destrutiva