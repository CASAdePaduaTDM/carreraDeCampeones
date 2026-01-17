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
// LEER RANKING MENSUAL
// ======================
async function obtenerRankingMensual() {
  const sheets = await getSheetsClient();
  
  // Leer todas las filas de rankingMensual (desde A2 hasta la última)
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "rankingMensual!A2:D" // A hasta D (todos los datos)
  });

  return response.data.values || [];
}

// ======================
// CALCULAR PODIOS (TOP 3)
// ======================
function calcularPodios(rankingMensual) {
  const mesesAgrupados = {}; // {mes-año: [{idJugador, puntos}, ...]}

  // Agrupar por mes y año
  rankingMensual.forEach((fila) => {
    const idJugador = fila[0];
    const mes = parseInt(fila[1]);
    const anio = parseInt(fila[2]);
    const puntos = parseInt(fila[3]) || 0;

    // Crear clave: "2026-01"
    const claveMes = `${anio}-${String(mes).padStart(2, "0")}`;

    // Si no existe este mes, crear array
    if (!mesesAgrupados[claveMes]) {
      mesesAgrupados[claveMes] = [];
    }

    // Agregar jugador
    mesesAgrupados[claveMes].push({
      idJugador,
      puntos
    });
  });

  // Extraer top 3 de cada mes
  const podios = [];

  for (const claveMes in mesesAgrupados) {
    const [anio, mes] = claveMes.split("-");

    // Ordenar por puntos (mayor a menor)
    const jugadoresOrdenados = mesesAgrupados[claveMes]
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, 3); // Tomar solo los primeros 3

    // Crear filas para cada posición
    jugadoresOrdenados.forEach((jugador, index) => {
      const puesto = index + 1; // 1º, 2º, 3º
      podios.push([
        parseInt(mes),  // mes
        parseInt(anio), // anio
        puesto,         // puesto
        jugador.idJugador,  // idJugador
        jugador.puntos      // puntosTotales
      ]);
    });
  }

  return podios;
}

// ======================
// LIMPIAR TABLA podios
// ======================
async function limpiarPodios() {
  const sheets = await getSheetsClient();

  // Obtener el ID de la hoja "podios"
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const sheet = meta.data.sheets.find(s => s.properties.title === "podios");
  
  if (!sheet) {
    console.log("⚠️ La hoja 'podios' no existe. Créala en Google Sheets primero.");
    return false;
  }

  // Eliminar todas las filas excepto el header
  try {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: "podios!A2:Z1000" // Limpiar datos, mantener header
    });
    console.log("✅ Tabla podios limpiada");
    return true;
  } catch (error) {
    console.error("❌ Error limpiando tabla:", error.message);
    return false;
  }
}

// ======================
// GUARDAR PODIOS EN GOOGLE SHEETS
// ======================
async function guardarPodios(podios) {
  const sheets = await getSheetsClient();

  // Agregar el header
  const filasConHeader = [
    ["mes", "anio", "puesto", "idJugador", "puntosTotales"],
    ...podios
  ];

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "podios!A1",
      valueInputOption: "RAW",
      requestBody: {
        values: filasConHeader
      }
    });
    console.log(`✅ Podios actualizado: ${podios.length} registros guardados`);
  } catch (error) {
    console.error("❌ Error guardando podios:", error.message);
  }
}

// ======================
// FUNCIÓN PRINCIPAL
// ======================
async function main() {
  console.log("🏆 Iniciando actualización de podios...");

  try {
    // 1. Obtener ranking mensual
    console.log("📥 Leyendo ranking mensual...");
    const rankingMensual = await obtenerRankingMensual();
    console.log(`   ✓ Se encontraron ${rankingMensual.length} registros`);

    // 2. Calcular podios (top 3)
    console.log("🥇 Calculando top 3 de cada mes...");
    const podios = calcularPodios(rankingMensual);
    console.log(`   ✓ ${podios.length} posiciones en podios`);

    // 3. Limpiar tabla vieja
    console.log("🧹 Limpiando tabla anterior...");
    const limpieza = await limpiarPodios();
    if (!limpieza) return;

    // 4. Guardar nuevos podios
    console.log("💾 Guardando nuevos podios...");
    await guardarPodios(podios);

    console.log("✨ ¡Actualización completada exitosamente!");

  } catch (error) {
    console.error("❌ Error en el proceso:", error);
  }
}

// Ejecutar
main();
