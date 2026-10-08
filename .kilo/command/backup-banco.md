---
name: backup-banco-conciliapix
description: Cria uma copia de seguranca do banco conciliapix.sqlite antes de qualquer operacao destrutiva (commit, push, clone, restauracao de git).
---

# Backup do banco Conciliapix

Use SEMPRE antes de executar `git commit`, `git push`, `git reset --hard`, `git clean`,
ou qualquer operacao que possa sobrescrever `data/conciliapix.sqlite`.

## Comando

```powershell
$bk = "D:\Projetos Sistemas\_backups"
if (-not (Test-Path -LiteralPath $bk)) { New-Item -ItemType Directory -Path $bk -Force | Out-Null }
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath "D:\Projetos Sistemas\Conciliapix\data\conciliapix.sqlite" `
          -Destination (Join-Path $bk "conciliapix-$stamp.sqlite") -Force
```

## Por que

O repositorio Conciliapix contem o banco de producao (11.996 transacoes) versionado
no git. Um `clone`/`reset`/`checkout` substitui esse arquivo pelo conteudo do
commit mais antigo, apagando tudo que foi gravado depois. O git nao consegue
recuperar esse tipo de perda porque o dado alterado nunca foi commitado.

## Verificacao pos-backup

```powershell
$src = "D:\Projetos Sistemas\Conciliapix\data\conciliapix.sqlite"
$dst = Get-ChildItem "D:\Projetos Sistemas\_backups\conciliapix-*.sqlite" |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
(Get-FileHash $src).Hash -eq (Get-FileHash $dst.FullName).Hash
```

## Demonstração

Executado em 08/10/2026 16:35 — gerou
`D:\Projetos Sistemas\_backups\conciliapix-20261008-163507.sqlite` (10.539.008 bytes),
idêntico ao banco ativo.