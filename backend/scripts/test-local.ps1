param(
    [string]$PgBin = 'C:/Program Files/PostgreSQL/15/bin',
    [string]$JavaHome = 'C:/Program Files/Java/jdk-21'
)
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
$runRoot = Join-Path (Split-Path $backendRoot -Parent) ('output/backend-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runRoot | Out-Null
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $runRoot /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict temporary directory permissions' }
$cluster = Join-Path $runRoot 'pgdata'
$passwordFile = Join-Path $runRoot 'initdb-password'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$variables = @('JAVA_HOME','PGPASSWORD','STI_DB_URL','STI_DB_USER','STI_DB_PASSWORD','STI_MIGRATION_USER','STI_MIGRATION_PASSWORD')
$previous = @{}
foreach ($name in $variables) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$startAttempted = $false
try {
    $adminPassword = [guid]::NewGuid().ToString('N')
    $env:STI_MIGRATION_PASSWORD = [guid]::NewGuid().ToString('N')
    $env:STI_DB_PASSWORD = [guid]::NewGuid().ToString('N')
    [System.IO.File]::WriteAllText($passwordFile, $adminPassword)
    & "$PgBin/initdb.exe" -D $cluster -U postgres --auth=scram-sha-256 "--pwfile=$passwordFile" --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
    Remove-Item -LiteralPath $passwordFile
    $startAttempted = $true
    & "$PgBin/pg_ctl.exe" -D $cluster -l (Join-Path $runRoot 'postgres.log') -o "-h 127.0.0.1 -p $port" -w start
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL start failed' }
    $env:PGPASSWORD = $adminPassword
    @"
CREATE ROLE sti_migrator LOGIN PASSWORD '$env:STI_MIGRATION_PASSWORD';
CREATE ROLE sti_runtime LOGIN PASSWORD '$env:STI_DB_PASSWORD';
CREATE DATABASE sti_os OWNER sti_migrator;
REVOKE ALL ON DATABASE sti_os FROM PUBLIC;
GRANT CONNECT ON DATABASE sti_os TO sti_runtime;
"@ | & "$PgBin/psql.exe" -h 127.0.0.1 -p $port -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Database provisioning failed' }
    @'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA sti AUTHORIZATION sti_migrator;
GRANT USAGE ON SCHEMA sti TO sti_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sti_migrator IN SCHEMA sti GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sti_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sti_migrator IN SCHEMA sti GRANT USAGE, SELECT ON SEQUENCES TO sti_runtime;
ALTER ROLE sti_runtime IN DATABASE sti_os SET search_path=pg_catalog,sti;
ALTER ROLE sti_migrator IN DATABASE sti_os SET search_path=pg_catalog,sti;
'@ | & "$PgBin/psql.exe" -h 127.0.0.1 -p $port -U postgres -d sti_os -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Schema provisioning failed' }
    Remove-Item Env:PGPASSWORD
    $env:JAVA_HOME = $JavaHome
    $env:STI_DB_URL = "jdbc:postgresql://127.0.0.1:$port/sti_os"
    $env:STI_DB_USER = 'sti_runtime'
    $env:STI_MIGRATION_USER = 'sti_migrator'
    Push-Location $backendRoot
    try {
        & mvn -B -ntp verify
        if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed' }
    } finally { Pop-Location }
} finally {
    $cleanupFailed = $false
    try {
        if ($startAttempted) {
            & "$PgBin/pg_ctl.exe" -D $cluster status
            if ($LASTEXITCODE -eq 0) {
                & "$PgBin/pg_ctl.exe" -D $cluster -m fast -w stop
                if ($LASTEXITCODE -ne 0) { $cleanupFailed = $true }
            } elseif ($LASTEXITCODE -ne 3) { $cleanupFailed = $true }
            & "$PgBin/pg_ctl.exe" -D $cluster status
            if ($LASTEXITCODE -ne 3) { $cleanupFailed = $true }
        }
    } finally {
        try {
            if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
        } finally {
            foreach ($name in $variables) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
        }
    }
    if ($cleanupFailed) { throw "Could not confirm synthetic cluster shutdown. Inspect $cluster before continuing." }
    Write-Output "No synthetic cluster running; diagnostic files retained at $runRoot"
}
