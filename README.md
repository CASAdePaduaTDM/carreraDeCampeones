# Carrera de Campeones - CASA de Padua

Sistema automático para gestionar un ranking de tenistas de mesa que se actualiza diariamente con los resultados de los torneos.

## Características

- ✅ Scraping automático de jugadores y participaciones
- ✅ Cálculo automático de ranking mensual
- ✅ Podios históricos por mes
- ✅ Página web responsiva con diseño profesional
- ✅ Actualización automática diaria mediante GitHub Actions

## Estructura del Proyecto

```
.
├── .github/workflows/
│   └── update-champions.yml          # Configuración de automatización
├── scrapingJugadores/
│   ├── scrapingJugadores.js          # Script para traer jugadores
│   ├── scrapingParticipaciones.js    # Script para traer participaciones
│   ├── updateRankingMensual.js       # Script que calcula ranking
│   ├── updatePodios.js               # Script que calcula podios
│   ├── exportaDatos.js               # Script que genera JSON
│   └── datos.json                    # Datos generados (actualizado diariamente)
├── web/
│   ├── index.html                    # Página principal
│   ├── imgs/
│   │   ├── escudoPadua.png           # Logo del club
│   │   └── default.png               # Foto por defecto
│   └── datos.json                    # Copia de datos para la web
├── credentials.json                  # Credenciales de Google (NO subir a Git)
└── package.json                      # Dependencias del proyecto
```

## Cómo funciona la automatización

1. **Diariamente a las 9:00 AM UTC** (6:00 AM Argentina), GitHub Actions ejecuta automáticamente:
   - `scrapingJugadores.js` → Obtiene lista de jugadores
   - `scrapingParticipaciones.js` → Obtiene participaciones
   - `updateRankingMensual.js` → Calcula ranking por mes
   - `updatePodios.js` → Calcula top 3 por mes
   - `exportaDatos.js` → Genera JSON para la web

2. Los datos se guardan en Google Sheets y se exportan a `datos.json`

3. La página web se actualiza automáticamente con los nuevos datos

## Visualizar la página

La página web está disponible en:
- **Desarrollo local**: Abre `web/index.html` en tu navegador
- **GitHub Pages**: https://[tu-usuario].github.io/carrera-campeones-casapadua/

## Instalación local

```bash
# 1. Clonar repositorio
git clone https://github.com/[tu-usuario]/carrera-campeones-casapadua.git
cd carrera-campeones-casapadua

# 2. Instalar dependencias
npm install

# 3. Añadir credenciales de Google
cp /ruta/a/credentials.json .

# 4. Ejecutar scripts manualmente (opcional)
node scrapingJugadores/scrapingJugadores.js
node scrapingJugadores/scrapingParticipaciones.js
node scrapingJugadores/updateRankingMensual.js
node scrapingJugadores/updatePodios.js
node scrapingJugadores/exportaDatos.js
```

## Configuración de Secretos en GitHub

Para que GitHub Actions funcione, debes guardar tus credenciales como "Secret":

1. Ve a tu repositorio en GitHub
2. Settings → Secrets and variables → Actions
3. Crea un nuevo secret llamado `GOOGLE_CREDENTIALS`
4. Pega el contenido de tu `credentials.json`

## Actualización manual

Si necesitas actualizar antes de las 9:00 AM, puedes ejecutar el workflow manualmente:
1. Ve a GitHub → Actions → "Actualizar Carrera de Campeones"
2. Haz clic en "Run workflow"

## Notas importantes

- `credentials.json` NO se sube a GitHub (está en .gitignore)
- Los datos JSON se generan automáticamente cada día
- Las fotos de jugadores se cargan desde `imgs/` localmente
- Para cambiar la hora de ejecución, edita `update-champions.yml`

## Soporte

Para problemas o sugerencias, puedes revisar los logs de GitHub Actions en la pestaña "Actions" de tu repositorio.

---

**CASA de Padua - Tenis de Mesa**
