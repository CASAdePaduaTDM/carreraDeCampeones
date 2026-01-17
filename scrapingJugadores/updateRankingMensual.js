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
// LEER PARTICIPACIONES
// ======================
async function obtenerParticipaciones() {
  const sheets = await getSheetsClient();
  
  // Leer todas las filas de participaciones (desde A2 hasta la última)
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "participaciones!A2:H" // A hasta H (todos los datos)
  });

  return response.data.values || [];
}

// ======================
// CALCULAR RANKING
// ======================
function calcularRanking(participaciones) {
  const ranking = {}; // Objeto para guardar: {idJugador: {mes: puntos}}

  // Recorrer cada participación
  participaciones.forEach((fila) => {
    const idJugador = fila[0];      // Columna A: idJugador
    const mes = parseInt(fila[3]);  // Columna D: mes
    const anio = parseInt(fila[4]); // Columna E: anio
    const puntos = parseInt(fila[7]) || 0; // Columna H: puntosObtenidos

    // Crear clave única: "2026-01" por ejemplo
    const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;

    // Si el jugador no existe, crear objeto
    if (!ranking[idJugador]) {
      ranking[idJugador] = {};
    }

    // Si el mes no existe para este jugador, crear entrada
    if (!ranking[idJugador][claveMes]) {
      ranking[idJugador][claveMes] = 0;
    }

    // Sumar puntos
    ranking[idJugador][claveMes] += puntos;
  });

  return ranking;
}

// ======================
// CONVERTIR A FORMATO PARA GOOGLE SHEETS
// ======================
function formatearParaSheets(ranking) {
  const filas = [["idJugador", "mes", "anio", "puntosTotales"]]; // Header

  // Recorrer el ranking
  for (const idJugador in ranking) {
    for (const claveMes in ranking[idJugador]) {
      const [anio, mes] = claveMes.split("-");
      const puntos = ranking[idJugador][claveMes];

      filas.push([
        idJugador,
        parseInt(mes),
        parseInt(anio),
        puntos
      ]);
    }
  }

  return filas;
}

// ======================
// LIMPIAR TABLA rankingMensual
// ======================
async function limpiarRankingMensual() {
  const sheets = await getSheetsClient();

  // Obtener el ID de la hoja "rankingMensual"
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const sheet = meta.data.sheets.find(s => s.properties.title === "rankingMensual");
  
  if (!sheet) {
    console.log("⚠️ La hoja 'rankingMensual' no existe. Créala en Google Sheets primero.");
    return false;
  }

  // Eliminar todas las filas excepto el header
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: "rankingMensual!A2:Z1000" // Limpiar datos, mantener header
    });
    console.log("✅ Tabla rankingMensual limpiada");
    return true;
  } catch (error) {
    console.error("❌ Error limpiando tabla:", error.message);
    return false;
  }
}

// ======================
// GUARDAR RANKING EN GOOGLE SHEETS
// ======================
async function guardarRanking(filas) {
  const sheets = await getSheetsClient();

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "rankingMensual!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: filas
      }
    });
    console.log(`✅ Ranking actualizado: ${filas.length - 1} registros guardados`);
  } catch (error) {
    console.error("❌ Error guardando ranking:", error.message);
  }
}

// ======================
// FUNCIÓN PRINCIPAL
// ======================
async function main() {
  console.log("🚀 Iniciando actualización de ranking mensual...");

  try {
    // 1. Obtener participaciones
    console.log("📥 Leyendo participaciones...");
    const participaciones = await obtenerParticipaciones();
    console.log(`   ✓ Se encontraron ${participaciones.length} registros`);

    // 2. Calcular ranking
    console.log("🧮 Calculando ranking...");
    const ranking = calcularRanking(participaciones);
    const cantidadJugadores = Object.keys(ranking).length;
    console.log(`   ✓ ${cantidadJugadores} jugadores procesados`);

    // 3. Formatear para Google Sheets
    console.log("📋 Formateando datos...");
    const filasFormateadas = formatearParaSheets(ranking);
    console.log(`   ✓ ${filasFormateadas.length - 1} filas preparadas`);

    // 4. Limpiar tabla vieja
    console.log("🧹 Limpiando tabla anterior...");
    const limpieza = await limpiarRankingMensual();
    if (!limpieza) return;

    // 5. Guardar nuevo ranking
    console.log("💾 Guardando nuevo ranking...");
    await guardarRanking(filasFormateadas);

    console.log("✨ ¡Actualización completada exitosamente!");

  } catch (error) {
    console.error("❌ Error en el proceso:", error);
  }
}

// Ejecutar
main();
