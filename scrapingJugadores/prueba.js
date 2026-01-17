const puppeteer = require("puppeteer");
const { google } = require("googleapis");
const path = require("path");

// ================= CONFIG =================

const SPREADSHEET_ID = "1cMGOHlhpTtOyLAtkzmnC4ubF6khQbOspOFvb9xvVpfs";
const SHEET_NAME = "participaciones";

const CREDENTIALS_PATH = path.resolve(
  "C:/Users/Tomo Astellano/Documents/CASA de Padua/Puppeteer/credentials.json"
);

// 🔹 FIJO PARA PRUEBA
const MES_ACTUAL = 12;   // Diciembre
const ANIO_ACTUAL = 2025;
const JUGADOR_PRUEBA = "16118";

// ================= GOOGLE SHEETS =================

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

async function obtenerParticipacionesExistentes() {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "participaciones!A2:B"
  });

  const participaciones = response.data.values || [];
  const existentes = new Set();

  for (const row of participaciones) {
    if (row[0] && row[1]) {
      existentes.add(`${row[0]}|${row[1]}`);
    }
  }
  return existentes;
}

async function appendRows(rows) {
  if (!rows.length) return;
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows }
  });
}

// ================= PUNTOS =================

const TABLA_PUNTOS = {
  "Fase de grupos": 2,
  "64vos de final": 2,
  "32vos de final": 4,
  "16vos de final": 4,
  "8vos de final": 8,
  "4tos de final": 10,
  "Semifinal": 20,
  "Final": 40,
  "Campeón": 50
};

// ================= SCRAPING =================

async function scrapearJugador(idJugador) {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 40,
    defaultViewport: null
  });

  const page = await browser.newPage();
  const url = `https://tenisdemesaparatodos.com/partidos_xjugador.asp?codigo=${idJugador}`;
  await page.goto(url, { waitUntil: "networkidle2" });

  const data = await page.evaluate(
    ({ MES_ACTUAL, ANIO_ACTUAL, idJugador }) => {

      const filas = Array.from(document.querySelectorAll("tr"));
      const participaciones = [];

      const todosTorneos = [];

      for (let i = 0; i < filas.length; i++) {
        const row = filas[i];
        if (row.getAttribute("bgcolor") === "#FF6600") {
          const torneoTd = row.querySelector("td.tournament-name");
          if (torneoTd) {
            const texto = torneoTd.innerText.trim();
            const fechaTxt = texto.substring(0, 10);
            const [, m, a] = fechaTxt.split("/").map(Number);
            const nombreTorneo = torneoTd.querySelector("a").innerText.trim();

            todosTorneos.push({
              indice: i,
              fecha: fechaTxt,
              nombre: nombreTorneo,
              mes: m,
              anio: a
            });
          }
        }
      }

      for (let t = 0; t < todosTorneos.length; t++) {
        const torneo = todosTorneos[t];

        if (torneo.mes !== MES_ACTUAL || torneo.anio !== ANIO_ACTUAL) continue;

        const inicio = torneo.indice;
        const fin = t + 1 < todosTorneos.length ? todosTorneos[t + 1].indice : filas.length;

        for (let i = inicio; i < fin; i++) {
          const row = filas[i];
          const link = row.querySelector(`a[href*="codigo=${idJugador}"]`);
          if (!link) continue;

          let instancia = null;
          let categoria = null;

          for (let j = i; j >= inicio; j--) {
            const instTd = filas[j].querySelector("td[colspan='10']");
            if (instTd && instTd.innerText.includes("|")) {
              const [catTxt, instTxt] = instTd.innerText.split("|").map(s => s.trim());
              categoria = parseInt(catTxt, 10);
              instancia = instTxt.includes("Grupo") ? "Fase de grupos" : instTxt;
              break;
            }
          }

          if (instancia && categoria) {
            participaciones.push({
              torneo: torneo.nombre,
              fecha: torneo.fecha,
              categoria,
              instancia
            });
          }
        }
      }

      const ORDEN_INSTANCIAS = {
  "Fase de grupos": 1,
  "64vos de final": 2,
  "32vos de final": 3,
  "16vos de final": 4,
  "8vos de final": 5,
  "4tos de final": 6,
  "Semifinal": 7,
  "Final": 8,
  "Campeón": 9
};

// Consolidar: una sola participación por torneo + categoría
const consolidado = {};

for (const p of participaciones) {
  const key = `${p.torneo}|${p.fecha}|${p.categoria}`;

  if (!consolidado[key]) {
    consolidado[key] = p;
    continue;
  }

  const actual = ORDEN_INSTANCIAS[p.instancia] || 0;
  const guardada = ORDEN_INSTANCIAS[consolidado[key].instancia] || 0;

  if (actual > guardada) {
    consolidado[key] = p;
  }
}

return Object.values(consolidado);
    },
    { MES_ACTUAL, ANIO_ACTUAL, idJugador }
  );

  await browser.close();
  return data;
}

// ================= MAIN (PRUEBA) =================

(async () => {
  try {
    console.log("🧪 Modo prueba: jugador 16118 / Diciembre 2025");

    const participacionesExistentes = await obtenerParticipacionesExistentes();
    let totalNuevas = 0;

    const participaciones = await scrapearJugador(JUGADOR_PRUEBA);
    console.log(`📊 Encontradas ${participaciones.length} participaciones`);

    const nuevas = participaciones.filter(p => {
      const key = `${JUGADOR_PRUEBA}|${p.torneo}`;
      return !participacionesExistentes.has(key);
    });

    const rows = nuevas.map(p => {
      const puntos = TABLA_PUNTOS[p.instancia] || 0;
      const [, m, a] = p.fecha.split("/").map(Number);

      return [
        JUGADOR_PRUEBA,
        p.torneo,
        p.fecha,
        m,
        a,
        p.categoria,
        p.instancia,
        puntos,
        new Date().toLocaleString("es-AR")
      ];
    });

    if (rows.length) {
      await appendRows(rows);
      totalNuevas = rows.length;
    }

    console.log(`✅ Prueba finalizada. Participaciones cargadas: ${totalNuevas}`);
  } catch (e) {
    console.error("❌ Error:", e.message);
  }
})();
