# CA-54 — Vuelta atrás: v0.2.1 sobre el esquema 6

- **Fecha:** 2026-11-20.
- **Base:** el ensayo con PostgreSQL 18.6. La base la migró el migrador de `5ab80f4` hasta V6.
- **JAR web:** el de `v0.2.1-candidato.1`, que es `608d85b`.
  - **Dónde se compiló:** en un clon local de la etiqueta, porque en un worktree el manifiesto toma el HEAD del repositorio principal; ver "Nota sobre el manifiesto".
  - **Manifiesto:** `Git-Commit: 608d85be3dacea51458502f4d829cc346c432445`, `Git-Dirty: false`.
  - **sha256:** `d15f65e6ebb9d9664a0bed68249562d90a26a4a56b2cde4c4980a6482362e90e`.
  - **Diferencia con E-013:** el JAR que registró E-013 tiene otro sha256 (`2acb6676…`). La compilación no es reproducible byte a byte, aunque el commit es el mismo.
- **Matriz:** la de v0.2.1, sin cambios, tomada del mismo clon.

## Corrida A: sin tareas NO_FACTURABLE

- **Resultado:** **256 OK, 0 FALLA, 6 observaciones.** Es lo mismo que la matriz final del 2B (`docs/evidencia-corte-2b/matriz-api-2026-11-20-final.md`: 256, 0 y 6).
- **Detalle:** `ca54-matriz-v021-esquema6-sin-no-facturable.md`.

## Corrida B: con una tarea NO_FACTURABLE cargada antes

- **La tarea:** una tarea `NO_FACTURABLE` con motivo GARANTIA, de un cliente y un proyecto propios. Se cargó por SQL, porque v0.2.1 no puede crearla.
- **Resultado:** **256 OK, 0 FALLA, 6 observaciones.**
- **Detalle:** `ca54-matriz-v021-esquema6-con-no-facturable.md`.

## Qué muestra v0.2.1 frente a una tarea NO_FACTURABLE (sonda)

- **Cómo se armó:** sobre la base de la corrida A, la TAR-0007 (FINALIZADO, del técnico 1 y de la empresa del cliente 1) pasó por SQL a `NO_FACTURABLE`/GARANTIA. El script es `backend/scripts/ensayo/ca54-sonda.mjs` y el detalle está en `ca54-sonda-v021-no-facturable.md`.
- **Lectura, para ADMIN, técnico asignado y cliente de la empresa:**
  - el detalle responde 200 con el estado `NO_FACTURABLE`;
  - la tarea aparece en la lista;
  - el filtro `?status=NO_FACTURABLE` responde 400.
- **El técnico y el cliente la ven.** Es el límite aceptado en D-220.
- **Escritura:** pasar a FINALIZADO, EN_PROCESO o FACTURADO, subir una foto o firmar responden 400. La tarea queda `NO_FACTURABLE GARANTIA`, sin cambios.

## Qué no se ejecutó

- **La pantalla de v0.2.1 frente a NO_FACTURABLE:** no se levantó la interfaz de v0.2.1. Por el código de `608d85b`:
  - el tablero arma las columnas desde `STAGES`, así que la tarea no aparece en ninguna;
  - la vista de lista muestra el texto crudo `NO_FACTURABLE` (E-015, respuesta 3).
- **El migrador de v0.2.1 contra el esquema 6:** no se corrió. Su Flyway conoce hasta V5.

## Nota sobre el manifiesto

Al compilar desde un `git worktree`, el plugin que escribe `Git-Commit` en el manifiesto tomó el HEAD del repositorio principal (`7c76ede`), no el de la etiqueta. Ese JAR se descartó. La evidencia de CA-42 del 2B dice "compilado en un worktree"; el código compilado era el de la etiqueta, pero su manifiesto pudo haber dicho otro commit. Ese dato no se usó en el 2B.
