<#
  backup-banco.ps1
  Copia o banco de producao do Conciliapix para D:\Projetos Sistemas\_backups.

  Seguro para rodar com o servidor no ar: o app usa sql.js e grava o banco de
  forma atomica (escreve em .tmp e faz rename), entao o arquivo .sqlite esta
  sempre em um estado completo e consistente.

  Somente cria um novo backup quando o banco realmente mudou (comparacao de
  hash), e mantem os N mais recentes,-rotacionando os antigos.
#>
[CmdletBinding()]
param(
    [int]$Manter = 60,
    [string]$Origem = "D:\Projetos Sistemas\Conciliapix\data\conciliapix.sqlite",
    [string]$Destino = "D:\Projetos Sistemas\_backups"
)

$ErrorActionPreference = "Stop"

$LogDir = "D:\Projetos Sistemas\_backups\logs"
if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
    param([string]$Mensagem, [string]$Nivel = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $linha = "[$ts] [$Nivel] $Mensagem"
    Write-Host $linha
    try {
        Add-Content -LiteralPath (Join-Path $LogDir "backup-$(Get-Date -Format 'yyyy-MM').log") -Value $linha
    } catch { }
}

# --- 1. Origem existe? ---
if (-not (Test-Path -LiteralPath $Origem)) {
    Write-Log "Banco nao encontrado: $Origem" "ERRO"
    exit 1
}

$info = Get-Item -LiteralPath $Origem
if ($info.Length -lt 1MB) {
    Write-Log "Banco suspeito de estar corrompido ($($info.Length) bytes). Backup abortado." "ERRO"
    exit 1
}

# --- 2. Verifica cabecalho SQLite ---
try {
    $head = [System.IO.File]::ReadAllBytes($Origem)[0..15]
    $magic = [System.Text.Encoding]::ASCII.GetString($head)
} catch {
    Write-Log "Nao foi possivel ler o banco: $($_.Exception.Message)" "ERRO"
    exit 1
}
if ($magic -ne "SQLite format 3`0") {
    Write-Log "Cabecalho invalido (nao e um banco SQLite). Backup abortado." "ERRO"
    exit 1
}

# --- 3. Garante o diretorio de destino ---
if (-not (Test-Path -LiteralPath $Destino)) {
    New-Item -ItemType Directory -Path $Destino -Force | Out-Null
    Write-Log "Diretorio criado: $Destino"
}

# --- 4. O banco mudou desde o ultimo backup? ---
$atual = (Get-FileHash -LiteralPath $Origem -Algorithm SHA256).Hash
$ultimo = Get-ChildItem -LiteralPath $Destino -Filter "conciliapix-*.sqlite" -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($ultimo) {
    try {
        $anterior = (Get-FileHash -LiteralPath $ultimo.FullName -Algorithm SHA256).Hash
        if ($anterior -eq $atual) {
            Write-Log "Banco inalterado desde $($ultimo.Name). Backup nao necessario."
            exit 0
        }
    } catch {
        Write-Log "Nao foi possivel comparar com o backup anterior: $($_.Exception.Message)"
    }
}

# --- 5. Copia atomica para o destino ---
$stamp  = Get-Date -Format "yyyyMMdd-HHmmss"
$alvo   = Join-Path $Destino "conciliapix-$stamp.sqlite"
$temp   = "$alvo.tmp"

try {
    Copy-Item -LiteralPath $Origem -Destination $temp -Force
    Move-Item -LiteralPath $temp -Destination $alvo -Force
} catch {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
    Write-Log "Falha ao copiar: $($_.Exception.Message)" "ERRO"
    exit 1
}

# --- 6. Confere a integridade da copia ---
$copia = Get-Item -LiteralPath $alvo
try {
    $hashCopia = (Get-FileHash -LiteralPath $alvo -Algorithm SHA256).Hash
    if ($hashCopia -ne $atual) {
        Write-Log "Hash divergente na copia. Verifique $alvo" "ERRO"
        exit 1
    }
} catch {
    Write-Log "Nao foi possivel validar a copia: $($_.Exception.Message)" "ERRO"
    exit 1
}

Write-Log "Backup OK: $($copia.Name) ($($copia.Length) bytes)"

# --- 7. Rotacao: mantem apenas os N backups mais recentes ---
$todos = Get-ChildItem -LiteralPath $Destino -Filter "conciliapix-*.sqlite" -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending

if ($todos.Count -gt $Manter) {
    $excedente = $todos[$Manter..($todos.Count - 1)]
    foreach ($antigo in $excedente) {
        Remove-Item -LiteralPath $antigo.FullName -Force -ErrorAction SilentlyContinue
    }
    Write-Log "Rotacao: $($excedente.Count) backup(s) antigo(s) removido(s). Mantidos: $Manter"
}