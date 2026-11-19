<#
Entorno efímero de ensayo para STI-OS: la base en un contenedor PostgreSQL de la misma versión que
producción (18.6 en el VPS), la aplicación real fuera de Docker (java -jar y Next), y un Bajar que deja
todo limpio. Nunca toca la base de desarrollo persistente (output/backend-local).

  ./backend/scripts/ensayo.ps1 -Accion Levantar [-Compilar] [-Frontend prod|dev|ninguno]
  ./backend/scripts/ensayo.ps1 -Accion Estado
  ./backend/scripts/ensayo.ps1 -Accion Bajar
  ./backend/scripts/ensayo.ps1 -Accion Suite      # tests de integración contra su propio contenedor

Puertos, todos en 127.0.0.1: base de ensayo 5434, base de la suite 5433, backend 8099, frontend 3000.
Secretos generados al momento en output/ensayo/secretos.json (fuera de Git); Bajar los borra.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('Levantar', 'Bajar', 'Estado', 'Suite')][string]$Accion,
    [ValidateSet('prod', 'dev', 'ninguno')][string]$Frontend = 'prod',
    [switch]$Compilar,
    [string]$JavaHome = 'C:/Program Files/Java/jdk-21',
    [string]$Imagen = 'postgres:18.6'
)
# Continue, no Stop: en Windows PowerShell 5.1 cualquier línea que un ejecutable nativo escribe en stderr
# (Maven, Mockito, docker, java) se vuelve un error terminante con Stop. Los nativos se juzgan por
# $LASTEXITCODE y los cmdlets que importan llevan -ErrorAction Stop.
$ErrorActionPreference = 'Continue'
$backendRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = Split-Path $backendRoot -Parent
$root = Join-Path $repoRoot 'output/ensayo'
$secretsFile = Join-Path $root 'secretos.json'
$pidFile = Join-Path $root 'pids.json'
$contEnsayo = 'sti-ensayo'
$contSuite = 'sti-suite'
$puertoEnsayo = 5434
$puertoSuite = 5433
$puertoBackend = 8099
$puertoFrontend = 3000

function Nuevo-Secreto { [guid]::NewGuid().ToString('N') }

function Existe-Contenedor([string]$nombre) {
    $found = & docker ps -a --filter "name=^/$nombre$" --format '{{.Names}}'
    return [bool]$found
}

function Esperar-Postgres([string]$nombre) {
    for ($i = 0; $i -lt 60; $i++) {
        & docker exec $nombre pg_isready -U postgres -h 127.0.0.1 *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "PostgreSQL en $nombre no quedó listo"
}

function Invocar-Sql([string]$nombre, [string]$db, [string]$sql) {
    $sql | & docker exec -i $nombre psql -U postgres -d $db -v ON_ERROR_STOP=1 -q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "SQL falló en $nombre/$db" }
}

# Mismo aprovisionamiento que start-local.ps1: el migrador es dueño del esquema y el runtime solo hace DML.
function Aprovisionar([string]$nombre, [string]$migPass, [string]$runPass) {
    Invocar-Sql $nombre 'postgres' @"
CREATE ROLE sti_migrator LOGIN PASSWORD '$migPass';
CREATE ROLE sti_runtime LOGIN PASSWORD '$runPass';
CREATE DATABASE sti_os OWNER sti_migrator;
REVOKE ALL ON DATABASE sti_os FROM PUBLIC;
GRANT CONNECT ON DATABASE sti_os TO sti_runtime;
"@
    Invocar-Sql $nombre 'sti_os' @'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA sti AUTHORIZATION sti_migrator;
GRANT USAGE ON SCHEMA sti TO sti_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sti_migrator IN SCHEMA sti GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sti_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE sti_migrator IN SCHEMA sti GRANT USAGE, SELECT ON SEQUENCES TO sti_runtime;
ALTER ROLE sti_runtime IN DATABASE sti_os SET search_path=pg_catalog,sti;
ALTER ROLE sti_migrator IN DATABASE sti_os SET search_path=pg_catalog,sti;
'@
}

function Crear-Contenedor([string]$nombre, [int]$puerto, [string]$pgPass) {
    if (Existe-Contenedor $nombre) { throw "El contenedor $nombre ya existe. Corré -Accion Bajar primero." }
    & docker run -d --name $nombre -e "POSTGRES_PASSWORD=$pgPass" -p "127.0.0.1:${puerto}:5432" $Imagen | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker run falló para $nombre" }
    Esperar-Postgres $nombre
}

function Compilar-Backend([string]$objetivo) {
    $prev = $env:JAVA_HOME
    $env:JAVA_HOME = $JavaHome   # el JAVA_HOME de esta máquina apunta a 17
    Push-Location $backendRoot
    try {
        & ./mvnw.cmd -B -ntp $objetivo.Split(' ')
        if ($LASTEXITCODE -ne 0) { throw "Maven falló: $objetivo" }
    } finally { Pop-Location; $env:JAVA_HOME = $prev }
}

function Matar-Arbol([int]$processId) {
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) { & taskkill.exe /T /F /PID $processId *> $null }
}

function Esperar-Http([string]$url, [int]$segundos) {
    for ($i = 0; $i -lt ($segundos * 2); $i++) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -MaximumRedirection 0 -ErrorAction Stop
            return $r.StatusCode
        } catch {
            if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Sin respuesta de $url"
}

switch ($Accion) {
    'Levantar' {
        if (Test-Path -LiteralPath $pidFile) { throw "Hay un ensayo levantado ($pidFile). Corré -Accion Bajar primero." }
        New-Item -ItemType Directory -Force -ErrorAction Stop -Path $root, (Join-Path $root 'uploads'), (Join-Path $root 'logs') | Out-Null
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls.exe $root /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
        $s = [ordered]@{
            imagen = $Imagen; puerto = $puertoEnsayo
            jdbcUrl = "jdbc:postgresql://127.0.0.1:$puertoEnsayo/sti_os"
            postgresPassword = Nuevo-Secreto
            migrationUser = 'sti_migrator'; migrationPassword = Nuevo-Secreto
            runtimeUser = 'sti_runtime'; runtimePassword = Nuevo-Secreto
            adminName = 'Admin Ensayo'; adminEmail = 'admin.ensayo@example.invalid'; adminPassword = Nuevo-Secreto
            backend = "http://127.0.0.1:$puertoBackend"; frontend = "http://127.0.0.1:$puertoFrontend"
        }
        [System.IO.File]::WriteAllText($secretsFile, ($s | ConvertTo-Json))

        Crear-Contenedor $contEnsayo $puertoEnsayo $s.postgresPassword
        Aprovisionar $contEnsayo $s.migrationPassword $s.runtimePassword
        $version = (& docker exec $contEnsayo psql -U postgres -tAc 'show server_version').Trim()
        Write-Output "PostgreSQL $version en $contEnsayo (127.0.0.1:$puertoEnsayo)"

        if ($Compilar -or -not (Test-Path (Join-Path $backendRoot 'target/sti-os-backend-0.1.0-SNAPSHOT.jar'))) {
            Compilar-Backend 'clean package -DskipTests'
        }
        # Copia de los JAR: Windows bloquea el que está corriendo y el próximo package fallaría.
        foreach ($j in 'sti-os-backend-0.1.0-SNAPSHOT', 'sti-os-backend-0.1.0-SNAPSHOT-migrator', 'sti-os-backend-0.1.0-SNAPSHOT-bootstrap') {
            Copy-Item (Join-Path $backendRoot "target/$j.jar") (Join-Path $root "$j.jar") -Force -ErrorAction Stop
        }
        $java = "$JavaHome/bin/java.exe"
        $names = 'STI_DB_URL', 'STI_DB_USER', 'STI_DB_PASSWORD', 'STI_MIGRATION_USER', 'STI_MIGRATION_PASSWORD',
            'STI_INITIAL_ADMIN_NAME', 'STI_INITIAL_ADMIN_EMAIL', 'STI_INITIAL_ADMIN_PASSWORD', 'STI_PORT', 'STI_UPLOADS_DIR', 'STI_API_ORIGIN', 'PORT', 'HOSTNAME'
        $prev = @{}; foreach ($n in $names) { $prev[$n] = [Environment]::GetEnvironmentVariable($n, 'Process') }
        $pids = [ordered]@{}
        try {
            # Flyway sobre una base nueva: cada levantada prueba la instalación limpia desde cero.
            $env:STI_DB_URL = $s.jdbcUrl; $env:STI_MIGRATION_USER = $s.migrationUser; $env:STI_MIGRATION_PASSWORD = $s.migrationPassword
            & $java -jar (Join-Path $root 'sti-os-backend-0.1.0-SNAPSHOT-migrator.jar') *> (Join-Path $root 'logs/migrator.log')
            if ($LASTEXITCODE -ne 0) { throw 'Migración falló (logs/migrator.log)' }
            $env:STI_INITIAL_ADMIN_NAME = $s.adminName; $env:STI_INITIAL_ADMIN_EMAIL = $s.adminEmail; $env:STI_INITIAL_ADMIN_PASSWORD = $s.adminPassword
            & $java -jar (Join-Path $root 'sti-os-backend-0.1.0-SNAPSHOT-bootstrap.jar') *> (Join-Path $root 'logs/bootstrap.log')
            if ($LASTEXITCODE -ne 0) { throw 'Bootstrap del ADMIN falló (logs/bootstrap.log)' }
            foreach ($n in 'STI_MIGRATION_USER', 'STI_MIGRATION_PASSWORD', 'STI_INITIAL_ADMIN_NAME', 'STI_INITIAL_ADMIN_EMAIL', 'STI_INITIAL_ADMIN_PASSWORD') {
                [Environment]::SetEnvironmentVariable($n, $null, 'Process')
            }
            # El proceso web recibe solo credenciales de runtime.
            $env:STI_DB_USER = $s.runtimeUser; $env:STI_DB_PASSWORD = $s.runtimePassword
            $env:STI_PORT = "$puertoBackend"; $env:STI_UPLOADS_DIR = (Join-Path $root 'uploads')
            $p = Start-Process -FilePath $java -WindowStyle Hidden -PassThru `
                -ArgumentList '-jar', "`"$(Join-Path $root 'sti-os-backend-0.1.0-SNAPSHOT.jar')`"", '--spring.profiles.active=local' `
                -RedirectStandardOutput (Join-Path $root 'logs/backend.out.log') -RedirectStandardError (Join-Path $root 'logs/backend.err.log')
            $pids.backend = $p.Id
            [System.IO.File]::WriteAllText($pidFile, ($pids | ConvertTo-Json))
            $health = Esperar-Http "http://127.0.0.1:$puertoBackend/api/health" 90
            Write-Output "Backend PID $($p.Id) en 127.0.0.1:$puertoBackend, /api/health $health"

            if ($Frontend -ne 'ninguno') {
                $front = Join-Path $repoRoot 'frontend'
                # STI_API_ORIGIN se resuelve al compilar (rewrites) y al correr (/app): tiene que estar en ambos.
                $env:STI_API_ORIGIN = "http://127.0.0.1:$puertoBackend"
                if ($Frontend -eq 'prod') {
                    Push-Location $front
                    try {
                        $inicio = Get-Date
                        $buildLog = Join-Path $root 'logs/frontend-build.log'
                        & npm.cmd run build *> $buildLog
                        if ($LASTEXITCODE -ne 0) {
                            # Next 16.4.2 corta con SecurityFatalError DESPUÉS de compilar cuando detecta un agente
                            # (ver docs/informe-e2e-2026-11-18.md, D7). Solo en ese caso, con un build nuevo, se completa
                            # el empaquetado; cualquier otro error se trata como falla real.
                            $buildId = Get-Item '.next/BUILD_ID' -ErrorAction SilentlyContinue
                            $aviso = Select-String -Path $buildLog -Pattern 'SecurityFatalError' -Quiet
                            if (-not ($aviso -and $buildId -and $buildId.LastWriteTime -gt $inicio)) { throw "npm run build falló ($buildLog)" }
                            Write-Output 'AVISO: next build terminó con SecurityFatalError después de compilar (D7); se completa prepare-standalone.'
                            & node scripts/prepare-standalone.mjs
                            if ($LASTEXITCODE -ne 0) { throw 'prepare-standalone falló' }
                        }
                        $manifest = Get-Content '.next/routes-manifest.json' -Raw | ConvertFrom-Json
                        if (-not $manifest.rewrites.afterFiles -or $manifest.rewrites.afterFiles.Count -eq 0) { throw 'El build salió sin rewrites de /api' }
                    } finally { Pop-Location }
                    $env:PORT = "$puertoFrontend"; $env:HOSTNAME = '127.0.0.1'
                    $f = Start-Process -FilePath 'node' -WorkingDirectory $front -WindowStyle Hidden -PassThru `
                        -ArgumentList '.next/standalone/server.js' `
                        -RedirectStandardOutput (Join-Path $root 'logs/frontend.out.log') -RedirectStandardError (Join-Path $root 'logs/frontend.err.log')
                } else {
                    $f = Start-Process -FilePath 'cmd.exe' -WorkingDirectory $front -WindowStyle Hidden -PassThru `
                        -ArgumentList '/c', "npx next dev -H 127.0.0.1 -p $puertoFrontend" `
                        -RedirectStandardOutput (Join-Path $root 'logs/frontend.out.log') -RedirectStandardError (Join-Path $root 'logs/frontend.err.log')
                }
                $pids.frontend = $f.Id; $pids.frontendModo = $Frontend
                [System.IO.File]::WriteAllText($pidFile, ($pids | ConvertTo-Json))
                $code = Esperar-Http "http://127.0.0.1:$puertoFrontend/login" 120
                Write-Output "Frontend ($Frontend) PID $($f.Id) en http://127.0.0.1:$puertoFrontend, /login $code"
            }
        } finally {
            foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $prev[$n], 'Process') }
        }
        Write-Output "Credenciales del ADMIN de ensayo: $secretsFile"
    }
    'Estado' {
        $c = & docker ps -a --filter "name=^/$contEnsayo$" --format '{{.Status}}'
        Write-Output "Contenedor ${contEnsayo}: $(if ($c) { $c } else { 'no existe' })"
        if (Test-Path -LiteralPath $pidFile) {
            $pids = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
            foreach ($k in 'backend', 'frontend') {
                if ($pids.$k) { Write-Output "${k}: PID $($pids.$k) $(if (Get-Process -Id $pids.$k -ErrorAction SilentlyContinue) { 'vivo' } else { 'muerto' })" }
            }
        } else { Write-Output 'Sin procesos registrados' }
        foreach ($u in "http://127.0.0.1:$puertoBackend/api/health", "http://127.0.0.1:$puertoFrontend/login") {
            try { Write-Output "$u -> $(Esperar-Http $u 1)" } catch { Write-Output "$u -> sin respuesta" }
        }
    }
    'Bajar' {
        if (Test-Path -LiteralPath $pidFile) {
            $pids = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
            foreach ($k in 'frontend', 'backend') { if ($pids.$k) { Matar-Arbol ([int]$pids.$k) } }
            Remove-Item -LiteralPath $pidFile
        }
        foreach ($c in $contEnsayo, $contSuite) { if (Existe-Contenedor $c) { & docker rm -f $c | Out-Null; Write-Output "Contenedor $c borrado" } }
        if (Test-Path -LiteralPath $secretsFile) { Remove-Item -LiteralPath $secretsFile; Write-Output 'Secretos borrados' }
        foreach ($j in Get-ChildItem -Path $root -Filter '*.jar' -ErrorAction SilentlyContinue) { Remove-Item -LiteralPath $j.FullName }
        foreach ($port in $puertoBackend, $puertoFrontend) {
            $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            Write-Output "Puerto ${port}: $(if ($l) { "TODAVÍA OCUPADO por PID $($l[0].OwningProcess)" } else { 'libre' })"
        }
    }
    'Suite' {
        # Se corre sola: dos Maven contra la misma base dan errores falsos.
        $pgPass = Nuevo-Secreto; $mig = Nuevo-Secreto; $run = Nuevo-Secreto
        Crear-Contenedor $contSuite $puertoSuite $pgPass
        $names = 'STI_DB_URL', 'STI_DB_USER', 'STI_DB_PASSWORD', 'STI_MIGRATION_USER', 'STI_MIGRATION_PASSWORD'
        $prev = @{}; foreach ($n in $names) { $prev[$n] = [Environment]::GetEnvironmentVariable($n, 'Process') }
        try {
            Aprovisionar $contSuite $mig $run
            Write-Output "PostgreSQL $((& docker exec $contSuite psql -U postgres -tAc 'show server_version').Trim()) en $contSuite"
            $env:STI_DB_URL = "jdbc:postgresql://127.0.0.1:$puertoSuite/sti_os"
            $env:STI_DB_USER = 'sti_runtime'; $env:STI_DB_PASSWORD = $run
            $env:STI_MIGRATION_USER = 'sti_migrator'; $env:STI_MIGRATION_PASSWORD = $mig
            Compilar-Backend 'clean verify'
        } finally {
            foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $prev[$n], 'Process') }
            & docker rm -f $contSuite | Out-Null
            Write-Output "Contenedor $contSuite borrado"
        }
    }
}
