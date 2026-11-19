# Interfaz de STI-OS para el entorno de ensayo, compilada con la misma versión de Node que el servidor.
# Solo para ensayo: el servidor compila por su cuenta desde la etiqueta (CLAUDE.md, sección 8).
#
#   docker build -f backend/scripts/ensayo/frontend.Dockerfile --build-arg STI_API_ORIGIN=http://127.0.0.1:8099 -t sti-ensayo-frontend frontend
#
# Lo arma backend/scripts/ensayo.ps1 (-Accion Interfaz y -Accion Levantar). El contexto es frontend/.
FROM node:24.22.1-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# STI_API_ORIGIN se resuelve al compilar: las reescrituras de /api quedan en el manifiesto de rutas.
ARG STI_API_ORIGIN
# AGENTE=1 compila con las variables con las que Next detecta que lo ejecuta un agente
# (node_modules/next/dist/compiled/@vercel/detect-agent). Si el build sale con error, la imagen no se crea.
ARG AGENTE=1
RUN node -v > /node-version.txt \
 && if [ "$AGENTE" = "1" ]; then export CLAUDECODE=1 AI_AGENT=claude-code; fi \
 && STI_API_ORIGIN="$STI_API_ORIGIN" npm run build

ENV NODE_ENV=production
CMD ["node", ".next/standalone/server.js"]
