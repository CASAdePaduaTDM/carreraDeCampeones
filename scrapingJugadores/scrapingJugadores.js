const puppeteer = require("puppeteer");
const { google } = require("googleapis");
const fs = require("fs");

// ======================
// CONFIGURACIÓN
// ======================
const SPREADSHEET_ID = "1cMGOHlhpTtOyLAtkzmnC4ubF6khQbOspOFvb9xvVpfs";
const SHEET_NAME = "jugadores";

const CREDENTIALS_PATH =
  "C:\\Users\\Tomo Astellano\\Documents\\CASA de Padua\\Puppeteer\\credentials.json";

// ======================
// GOOGLE SHEETS
// ======================
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8")),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

async function obtenerSheetId(sheets) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });

  const sheet = meta.data.sheets.find(
    s => s.properties.title === SHEET_NAME
  );

  return sheet.properties.sheetId;
}

// ======================
// LÓGICA DE NEGOCIO
// ======================
function calcularCategoria(rating) {
  if (rating <= 979) return "8º";
  if (rating <= 1079) return "7º";
  if (rating <= 1199) return "6º";
  if (rating <= 1399) return "5º";
  if (rating <= 1599) return "4º";
  if (rating <= 1799) return "3º";
  if (rating <= 2099) return "2º";
  return "1º";
}

// ======================
// SCRAPING
// ======================
async function scrapearJugadores() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.goto(
    "https://tenisdemesaparatodos.com/jugadores.asp?codigo=&tipo=busqueda&buscar=&letra=&club=67&localidad=&provincia=todos&pagina=1",
    { waitUntil: "networkidle2" }
  );

  let jugadores = [];
  let haySiguiente = true;

  while (haySiguiente) {
    await page.waitForSelector("table tr[bgcolor='#FFFFFF']");

    const jugadoresPagina = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll("table tr[bgcolor='#FFFFFF']")
      )
        .map(fila => {
          const tds = fila.querySelectorAll("td");
          if (tds.length < 4) return null;

          const link = tds[1].querySelector("a");
          if (!link) return null;

          const match = link.href.match(/codigo=(\d+)/);
          if (!match) return null;

          return {
            idJugador: match[1],
            nombreJugador: link.textContent.trim(),
            activo:
              tds[0].querySelector("img")?.src.includes("icono_tilde.gif") ||
              false,
            rating: Number(tds[3].textContent.trim()) || 0
          };
        })
        .filter(Boolean);
    });

    jugadores.push(...jugadoresPagina);

    haySiguiente = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).some(
        a => a.textContent.trim() === "Siguiente"
      )
    );

    if (haySiguiente) {
      await Promise.all([
  page.evaluate(() => {
    const link = Array.from(document.querySelectorAll("a"))
      .find(a => a.textContent.trim() === "Siguiente");
    link.click();
  }),
  page.waitForNavigation({ waitUntil: "networkidle2" })
]);
    }
  }

  await browser.close();

  return jugadores.map(j => ({
    ...j,
    categoria: calcularCategoria(j.rating)
  }));
}

// ======================
// SINCRONIZACIÓN
// ======================
async function sincronizarJugadores(jugadoresScraping) {
  const sheets = await getSheetsClient();
  const sheetId = await obtenerSheetId(sheets);

  // Leer hoja UNA SOLA VEZ
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:D`
  });

  const filas = res.data.values || [];

  const sheetMap = new Map();
  filas.forEach((fila, i) => {
    sheetMap.set(fila[0], { fila: i + 2 });
  });

  const scrapingIds = new Set(jugadoresScraping.map(j => j.idJugador));

  // === UPDATES & APPENDS ===
  const updates = [];
  const appends = [];

  jugadoresScraping.forEach(j => {
    const filaSheet = sheetMap.get(j.idJugador);
    const valores = [
      j.idJugador,
      j.nombreJugador,
      j.activo ? "TRUE" : "FALSE",
      j.categoria
    ];

    if (filaSheet) {
      updates.push({
        range: `${SHEET_NAME}!A${filaSheet.fila}:D${filaSheet.fila}`,
        values: [valores]
      });
    } else {
      appends.push(valores);
    }
  });

  if (updates.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data: updates
      }
    });
  }

  if (appends.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:D`,
      valueInputOption: "RAW",
      requestBody: { values: appends }
    });
  }

  // === ELIMINAR BAJAS ===
  const filasEliminar = [];
  filas.forEach((fila, i) => {
    if (!scrapingIds.has(fila[0])) {
      filasEliminar.push({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: i + 1,
            endIndex: i + 2
          }
        }
      });
    }
  });

  if (filasEliminar.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: filasEliminar.reverse()
      }
    });
  }
}

// ======================
// MAIN
// ======================
(async () => {
  const jugadores = await scrapearJugadores();
  await sincronizarJugadores(jugadores);
  console.log("✔ Sincronización completa");
})();
