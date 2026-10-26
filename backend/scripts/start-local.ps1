param(
    [string]$PgBin = 'C:/Program Files/PostgreSQL/15/bin',
    [string]$JavaHome = 'C:/Program Files/Java/jdk-21',
    [int]$Port = 55432
)
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $backendRoot -Parent
$localRoot = Join-Path $repoRoot 'output/backend-local'
$cluster = Join-Path $localRoot 'pgdata'
$secretsFile = Join-Path $localRoot 'credentials.json'
$readyFile = Join-Path $localRoot 'provisioned'
$passwordFile = Join-Path $localRoot 'initdb-password'
$variables = @('JAVA_HOME','PGPASSWORD','STI_DB_URL','STI_DB_USER','STI_DB_PASSWORD','STI_MIGRATION_USER','STI_MIGRATION_PASSWORD','STI_INITIAL_ADMIN_NAME','STI_INITIAL_ADMIN_EMAIL','STI_INITIAL_ADMIN_PASSWORD')
$previous = @{}
foreach ($name in $variables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

function Invoke-Checked([scriptblock]$command, [string]$message) {
    & $command
    if ($LASTEXITCODE -ne 0) { throw $message }
}

function Test-PortFree([int]$portNumber) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $portNumber)
    try { $listener.Start() } finally { $listener.Stop() }
}

try {
    if (-not (Test-Path -LiteralPath $cluster)) {
        if (Test-Path -LiteralPath $localRoot) { throw "Incomplete local cluster exists at $localRoot. Inspect it before continuing." }
        Test-PortFree $Port
        New-Item -ItemType Directory -Path $localRoot | Out-Null
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls.exe $localRoot /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict local directory permissions' }
        $secrets = [ordered]@{
            port = $Port
            jdbcUrl = "jdbc:postgresql://127.0.0.1:$Port/sti_os"
            postgresPassword = [guid]::NewGuid().ToString('N')
            migrationUser = 'sti_migrator'
            migrationPassword = [guid]::NewGuid().ToString('N')
            runtimeUser = 'sti_runtime'
            runtimePassword = [guid]::NewGuid().ToString('N')
            adminName = 'Local Administrator'
            adminEmail = 'admin@sti.local'
            adminPassword = [guid]::NewGuid().ToString('N')
        }
        [System.IO.File]::WriteAllText($secretsFile, ($secrets | ConvertTo-Json))
        [System.IO.File]::WriteAllText($passwordFile, $secrets.postgresPassword)
        Invoke-Checked { & "$PgBin/initdb.exe" -D $cluster -U postgres --auth=scram-sha-256 "--pwfile=$passwordFile" --encoding=UTF8 --locale=C } 'initdb failed'
        Remove-Item -LiteralPath $passwordFile
    } else {
        if (-not (Test-Path -LiteralPath $secretsFile)) { throw "Missing local credentials: $secretsFile" }
        $secrets = Get-Content -LiteralPath $secretsFile -Raw | ConvertFrom-Json
        if ($Port -ne $secrets.port) { throw "This cluster uses port $($secrets.port). Use -Port $($secrets.port)." }
    }

    & "$PgBin/pg_ctl.exe" -D $cluster status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Test-PortFree $Port
        Invoke-Checked { & "$PgBin/pg_ctl.exe" -D $cluster -l (Join-Path $localRoot 'postgres.log') -o "-h 127.0.0.1 -p $Port" -w start } 'PostgreSQL start failed'
    }

    $env:PGPASSWORD = $secrets.postgresPassword
    if (-not (Test-Path -LiteralPath $readyFile)) {
        @"
SELECT format('CREATE ROLE sti_migrator LOGIN PASSWORD %L', '$($secrets.migrationPassword)') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sti_migrator') \gexec
SELECT format('CREATE ROLE sti_runtime LOGIN PASSWORD %L', '$($secrets.runtimePassword)') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sti_runtime') \gexec
SELECT 'CREATE DATABASE sti_os OWNER sti_migrator' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'sti_os') \gexec
REVOKE ALL ON DATABASE sti_os FROM PUBLIC;
GRANT CONNECT ON DATABASE sti_os TO sti_runtime;
"@ | & "$PgBin/psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Database provisioning failed; inspect local cluster before retrying' }
        @'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS sti AUTHORIZATION sti_migrator;
GRANT USAGE ON SCHEMA sti TO sti_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sti_migrator IN SCHEMA sti GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sti_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sti_migrator IN SCHEMA sti GRANT USAGE, SELECT ON SEQUENCES TO sti_runtime;
ALTER ROLE sti_runtime IN DATABASE sti_os SET search_path=pg_catalog,sti;
ALTER ROLE sti_migrator IN DATABASE sti_os SET search_path=pg_catalog,sti;
'@ | & "$PgBin/psql.exe" -h 127.0.0.1 -p $Port -U postgres -d sti_os -v ON_ERROR_STOP=1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Schema provisioning failed; inspect local cluster before retrying' }
    }
    Remove-Item Env:PGPASSWORD

    $env:JAVA_HOME = $JavaHome
    $env:STI_DB_URL = $secrets.jdbcUrl
    $env:STI_MIGRATION_USER = $secrets.migrationUser
    $env:STI_MIGRATION_PASSWORD = $secrets.migrationPassword
    Push-Location $backendRoot
    try {
        Invoke-Checked { & mvn -B -ntp -DskipTests package } 'Backend package failed'
        Invoke-Checked { & "$JavaHome/bin/java.exe" -jar target/sti-os-backend-0.1.0-SNAPSHOT-migrator.jar } 'Migration failed'
        if (-not (Test-Path -LiteralPath $readyFile)) {
            $env:STI_INITIAL_ADMIN_NAME = $secrets.adminName
            $env:STI_INITIAL_ADMIN_EMAIL = $secrets.adminEmail
            $env:STI_INITIAL_ADMIN_PASSWORD = $secrets.adminPassword
            Invoke-Checked { & "$JavaHome/bin/java.exe" -jar target/sti-os-backend-0.1.0-SNAPSHOT-bootstrap.jar } 'Initial administrator bootstrap failed'
            [System.IO.File]::WriteAllText($readyFile, 'provisioned')
        }
    } finally { Pop-Location }
    Write-Output "Local PostgreSQL ready: $($secrets.jdbcUrl)"
    Write-Output "Runtime JDBC user: $($secrets.runtimeUser)"
    Write-Output "Credentials (including local admin): $secretsFile"
    Write-Output 'To start the backend, run backend/scripts/run-local.ps1 in another terminal.'
} finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
    foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
