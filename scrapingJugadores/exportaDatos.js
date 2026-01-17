const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// ======================
// CONFIGURACIÓN
// ======================
const SPREADSHEET_ID = "1cMGOHlhpTtOyLAtkzmnC4ubF6khQbOspOFvb9xvVpfs";
const CREDENTIALS_PATH = path.resolve("C:/Users/Tomo Astellano/Documents/CASA de Padua/Puppeteer/credentials.json");

// ======================
// CONECTAR A GOOGLE SHEETS
// ======================
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// ======================
// LEER DATOS DE GOOGLE SHEETS
// ======================
async function obtenerJugadores() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "jugadores!A2:D"
  });
  
  const datos = response.data.values || [];
  return datos.map(fila => ({
    idJugador: fila[0],
    nombreJugador: fila[1],
    activo: fila[2] === "TRUE",
    categoria: fila[3]
  }));
}

async function obtenerRankingMensual() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "rankingMensual!A2:D"
  });

  const datos = response.data.values || [];
  return datos.map(fila => ({
    idJugador: fila[0],
    mes: parseInt(fila[1]),
    anio: parseInt(fila[2]),
    puntosTotales: parseInt(fila[3]) || 0
  }));
}

async function obtenerPodios() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "podios!A2:E"
  });

  const datos = response.data.values || [];
  return datos.map(fila => ({
    mes: parseInt(fila[0]),
    anio: parseInt(fila[1]),
    puesto: parseInt(fila[2]),
    idJugador: fila[3],
    puntosTotales: parseInt(fila[4]) || 0
  }));
}

// ======================
// OBTENER MES ACTUAL
// ======================
function getMesActual() {
  const hoy = new Date();
  return {
    mes: hoy.getMonth() + 1,
    anio: hoy.getFullYear()
  };
}

// ======================
// CONSTRUIR OBJETO DE DATOS
// ======================
async function construirDatos() {
  console.log("📥 Leyendo datos de Google Sheets...");
  
  const jugadores = await obtenerJugadores();
  const rankingMensual = await obtenerRankingMensual();
  const podios = await obtenerPodios();
  const mesActual = getMesActual();

  console.log("   ✓ Jugadores leídos: " + jugadores.length);
  console.log("   ✓ Registros de ranking: " + rankingMensual.length);
  console.log("   ✓ Registros de podios: " + podios.length);

  // Filtrar ranking del mes actual
  const rankingMesActual = rankingMensual.filter(
    r => r.mes === mesActual.mes && r.anio === mesActual.anio
  );

  // Agregar nombre del jugador al ranking
  const rankingConNombres = rankingMesActual.map(registro => {
    const jugador = jugadores.find(j => j.idJugador === registro.idJugador);
    return {
      ...registro,
      nombreJugador: jugador ? jugador.nombreJugador : "Desconocido",
      categoria: jugador ? jugador.categoria : ""
    };
  });

  // Ordenar ranking por puntos (mayor a menor)
  rankingConNombres.sort((a, b) => b.puntosTotales - a.puntosTotales);

  // Agregar número de puesto
  rankingConNombres.forEach((jugador, index) => {
    jugador.puesto = index + 1;
  });

  // Construir objeto final
  const datos = {
    ultimaActualizacion: new Date().toISOString(),
    mesActual: mesActual.mes,
    anioActual: mesActual.anio,
    nombreMes: obtenerNombreMes(mesActual.mes),
    
    // Ranking del mes actual (lo más importante)
    rankingMesActual: rankingConNombres,
    
    // Todos los ranking históricos (para navegación)
    rankingHistorico: rankingMensual.map(registro => {
      const jugador = jugadores.find(j => j.idJugador === registro.idJugador);
      return {
        ...registro,
        nombreJugador: jugador ? jugador.nombreJugador : "Desconocido",
        categoria: jugador ? jugador.categoria : ""
      };
    }),
    
    // Podios históricos
    podios: podios.map(p => {
      const jugador = jugadores.find(j => j.idJugador === p.idJugador);
      return {
        ...p,
        nombreJugador: jugador ? jugador.nombreJugador : "Desconocido",
        categoria: jugador ? jugador.categoria : ""
      };
    }),
    
    // Lista de todos los jugadores activos
    jugadores: jugadores.filter(j => j.activo)
  };

  return datos;
}

// ======================
// OBTENER NOMBRE DEL MES
// ======================
function obtenerNombreMes(mes) {
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return meses[mes - 1];
}

// ======================
// GUARDAR JSON
// ======================
function guardarJSON(datos) {
  const rutaArchivo = path.join(__dirname, "datos.json");
  
  fs.writeFileSync(
    rutaArchivo,
    JSON.stringify(datos, null, 2),
    "utf8"
  );

  console.log("💾 Archivo datos.json guardado en: " + rutaArchivo);
  return rutaArchivo;
}

// ======================
// FUNCIÓN PRINCIPAL
// ======================
async function main() {
  console.log("📊 Iniciando exportación de datos...\n");

  try {
    const datos = await construirDatos();
    guardarJSON(datos);
    console.log("\n✨ ¡Exportación completada exitosamente!");
    console.log("   El archivo datos.json está listo para ser subido a GitHub");

  } catch (error) {
    console.error("❌ Error en la exportación:", error);
  }
}

// Ejecutar
main();
