$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw 'Node.js is required. Install Node.js before starting Novel Reader.'
    }
    & node.exe (Join-Path $PSScriptRoot 'tools\start.mjs')
    exit $LASTEXITCODE
} catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message)
    exit 1
}
