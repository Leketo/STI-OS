param([string]$JavaHome = 'C:/Program Files/Java/jdk-21')
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$secretsFile = Join-Path (Split-Path $backendRoot -Parent) 'output/backend-local/credentials.json'
if (-not (Test-Path -LiteralPath $secretsFile)) { throw 'Run start-local.ps1 first.' }
$secrets = Get-Content -LiteralPath $secretsFile -Raw | ConvertFrom-Json
$names = @('STI_DB_URL','STI_DB_USER','STI_DB_PASSWORD','JAVA_HOME')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:STI_DB_URL = $secrets.jdbcUrl
    $env:STI_DB_USER = $secrets.runtimeUser
    $env:STI_DB_PASSWORD = $secrets.runtimePassword
    $env:JAVA_HOME = $JavaHome
    & "$JavaHome/bin/java.exe" -jar (Join-Path $backendRoot 'target/sti-os-backend-0.1.0-SNAPSHOT.jar') --spring.profiles.active=local
    if ($LASTEXITCODE -ne 0) { throw 'Backend exited with an error' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
