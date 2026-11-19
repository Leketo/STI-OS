<#
Entorno efímero de ensayo para STI-OS: la base en un contenedor PostgreSQL de la misma versión que
producción (18.6 en el VPS), la aplicación real fuera de Docker (java -jar y Next), y un Bajar que deja
todo limpio. Nunca toca la base de desarrollo persistente (output/backend-local).

  ./backend/scripts/ensayo.ps1 -Accion Levantar [-Compilar] [-Frontend contenedor|prod|dev|ninguno]
  ./backend/scripts/ensayo.ps1 -Accion Estado
  ./backend/scripts/ensayo.ps1 -Accion Bajar
  ./backend/scripts/ensayo.ps1 -Accion Suite      # tests de integración contra su propio contenedor
  ./backend/scripts/ensayo.ps1 -Accion Interfaz   # build, lint, tipos, test:ui y npm audit con Node 24.22.1

La interfaz de una entrega se compila y se prueba en un contenedor con Node 24.22.1, la versión del servidor
(imagen fija node:24.22.1-bookworm-slim, backend/scripts/ensayo/frontend.Dockerfile). En la PC no se instala
Node 24. -Frontend contenedor sirve esa misma imagen; prod y dev usan el Node de la PC y no valen como evidencia.

Puertos, todos en 127.0.0.1: base de ensayo 5434, base de la suite 5433, backend 8099, frontend 3000.
Secretos generados al momento en output/ensayo/secretos.json (fuera de Git); Bajar los borra.
#>
param(
    [Parameter(Mandatory = $true)][ValidateSet('Levantar', 'Bajar', 'Estado', 'Suite', 'Interfaz')][string]$Accion,
    [ValidateSet('contenedor', 'prod', 'dev', 'ninguno')][string]$Frontend = 'contenedor',
    [switch]$Compilar,
    # 1: la interfaz se compila con las variables con las que Next detecta un agente (CA-01).
    [ValidateSet('0', '1')][string]$Agente = '1',
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
$contFrontend = 'sti-ensayo-frontend'
$imagenFrontend = 'sti-ensayo-frontend:local'
$dirEnsayo = Join-Path $PSScriptRoot 'ensayo'

function Nuevo-Secreto { [guid]::NewGuid().ToString('N') }

# Compila la interfaz en la imagen de Node 24.22.1. Un build que termina con error no crea la imagen.
function Construir-Interfaz([string]$log) {
    $front = Join-Path $repoRoot 'frontend'
    & docker build --progress=plain -f (Join-Path $dirEnsayo 'frontend.Dockerfile') `
        --build-arg "STI_API_ORIGIN=http://127.0.0.1:$puertoBackend" --build-arg "AGENTE=$Agente" `
        -t $imagenFrontend $front *> $log
    if ($LASTEXITCODE -ne 0) { throw "La compilación de la interfaz falló ($log)" }
    $v = (& docker run --rm $imagenFrontend cat /node-version.txt) -join ''
    Write-Output "Interfaz compilada con Node $($v.Trim()) en $imagenFrontend (agente=$Agente)"
    Verificar-Reescrituras ((& docker run --rm $imagenFrontend cat .next/routes-manifest.json) -join "`n")
}

# Por contenido, como lo comprueba el servidor: no alcanza con que haya alguna reescritura.
function Verificar-Reescrituras([string]$manifiesto) {
    $destino = "http://127.0.0.1:$puertoBackend"
    $reglas = @((ConvertFrom-Json $manifiesto).rewrites.afterFiles)
    $faltan = @()
    foreach ($ruta in '/api/auth/:path*', '/api/tasks/:path*', '/api/tasks', '/api/projects/:path*', '/api/projects') {
        $regla = $reglas | Where-Object { $_.source -eq $ruta } | Select-Object -First 1
        if (-not $regla -or -not $regla.destination.StartsWith("$destino/")) { $faltan += $ruta }
    }
    if ($faltan.Count) { throw "El manifiesto de rutas no reescribe a ${destino}: $($faltan -join ', ')" }
    Write-Output "Reescrituras de /api/auth, /api/tasks y /api/projects hacia $destino presentes en el manifiesto"
}

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
                if ($Frontend -eq 'contenedor') {
                    if (Existe-Contenedor $contFrontend) { throw "El contenedor $contFrontend ya existe. Corré -Accion Bajar primero." }
                    Construir-Interfaz (Join-Path $root 'logs/frontend-build.log')
                    # En el contenedor, 127.0.0.1:8099 es un puente (ensayo/relay.mjs) hacia el backend del host.
                    & docker run -d --name $contFrontend -p "127.0.0.1:${puertoFrontend}:3000" `
                        -e PORT=3000 -e HOSTNAME=0.0.0.0 -e "STI_API_ORIGIN=http://127.0.0.1:$puertoBackend" `
                        -v "${dirEnsayo}:/ensayo:ro" $imagenFrontend `
                        sh -c "node /ensayo/relay.mjs $puertoBackend & exec node .next/standalone/server.js" | Out-Null
                    if ($LASTEXITCODE -ne 0) { throw "docker run falló para $contFrontend" }
                    $pids.frontendModo = 'contenedor'; $pids.frontendContenedor = $contFrontend
                    [System.IO.File]::WriteAllText($pidFile, ($pids | ConvertTo-Json))
                    $code = Esperar-Http "http://127.0.0.1:$puertoFrontend/login" 120
                    Write-Output "Frontend (contenedor $contFrontend) en http://127.0.0.1:$puertoFrontend, /login $code"
                } elseif ($Frontend -eq 'prod') {
                    Push-Location $front
                    try {
                        $buildLog = Join-Path $root 'logs/frontend-build.log'
                        # Igual que el servidor: un build que termina con error detiene el ensayo (CLAUDE.md, sección 8).
                        & npm.cmd run build *> $buildLog
                        if ($LASTEXITCODE -ne 0) { throw "npm run build falló ($buildLog)" }
                        Verificar-Reescrituras (Get-Content '.next/routes-manifest.json' -Raw)
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
                if ($Frontend -ne 'contenedor') {
                    $pids.frontend = $f.Id; $pids.frontendModo = $Frontend
                    [System.IO.File]::WriteAllText($pidFile, ($pids | ConvertTo-Json))
                    $code = Esperar-Http "http://127.0.0.1:$puertoFrontend/login" 120
                    Write-Output "Frontend ($Frontend) PID $($f.Id) en http://127.0.0.1:$puertoFrontend, /login $code"
                }
            }
        } finally {
            foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $prev[$n], 'Process') }
        }
        Write-Output "Credenciales del ADMIN de ensayo: $secretsFile"
    }
    'Estado' {
        foreach ($nombre in $contEnsayo, $contFrontend) {
            $c = & docker ps -a --filter "name=^/$nombre$" --format '{{.Status}}'
            Write-Output "Contenedor ${nombre}: $(if ($c) { $c } else { 'no existe' })"
        }
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
        foreach ($c in $contFrontend, $contEnsayo, $contSuite) { if (Existe-Contenedor $c) { & docker rm -f $c | Out-Null; Write-Output "Contenedor $c borrado" } }
        if (Test-Path -LiteralPath $secretsFile) { Remove-Item -LiteralPath $secretsFile; Write-Output 'Secretos borrados' }
        foreach ($j in Get-ChildItem -Path $root -Filter '*.jar' -ErrorAction SilentlyContinue) { Remove-Item -LiteralPath $j.FullName }
        foreach ($port in $puertoBackend, $puertoFrontend) {
            $l = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            Write-Output "Puerto ${port}: $(if ($l) { "TODAVÍA OCUPADO por PID $($l[0].OwningProcess)" } else { 'libre' })"
        }
    }
    'Interfaz' {
        # Todo dentro de la imagen de Node 24.22.1; nada usa el Node de la PC.
        $logs = Join-Path $root 'logs'
        New-Item -ItemType Directory -Force -ErrorAction Stop -Path $logs | Out-Null
        Construir-Interfaz (Join-Path $logs 'interfaz-build.log')
        $fallas = @()
        foreach ($check in 'lint', 'typecheck', 'test:ui') {
            $log = Join-Path $logs "interfaz-$($check.Replace(':', '-')).log"
            & docker run --rm $imagenFrontend npm run $check *> $log
            if ($LASTEXITCODE -eq 0) { Write-Output "npm run ${check}: OK" } else { $fallas += $check; Write-Output "npm run ${check}: FALLA ($log)" }
        }
        $audit = & docker run --rm -v "${dirEnsayo}:/ensayo:ro" $imagenFrontend `
            sh -c 'npm audit --json > /tmp/audit.json; node /ensayo/audit-resumen.mjs /tmp/audit.json'
        $auditCode = $LASTEXITCODE
        $audit | Set-Content -Encoding UTF8 (Join-Path $logs 'interfaz-audit.txt')
        $audit | ForEach-Object { Write-Output "npm audit: $_" }
        if ($auditCode -ne 0) { $fallas += 'npm audit (next)' }
        if ($fallas.Count) { throw "Comprobaciones de la interfaz con falla: $($fallas -join ', ')" }
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
