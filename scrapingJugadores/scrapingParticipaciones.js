const puppeteer = require("puppeteer");
const { google } = require("googleapis");
const path = require("path");

// ================= CONFIG =================
const SPREADSHEET_ID = "1cMGOHlhpTtOyLAtkzmnC4ubF6khQbOspOFvb9xvVpfs";
const SHEET_NAME = "participaciones";

const CREDENTIALS_PATH = path.resolve("C:/Users/Tomo Astellano/Documents/CASA de Padua/Puppeteer/credentials.json");

const HOY = new Date();
const MES_ACTUAL = HOY.getMonth() + 1;
const ANIO_ACTUAL = HOY.getFullYear();
const FECHA_MES_ANTERIOR = new Date(HOY.getFullYear(), HOY.getMonth() - 1, 1);
const MES_ANTERIOR = FECHA_MES_ANTERIOR.getMonth() + 1;
const ANIO_MES_ANTERIOR = FECHA_MES_ANTERIOR.getFullYear();

const TABLA_PUNTOS = { "Fase de grupos": 2, "64vos de final": 2, "32vos de final": 4, "16vos de final": 4, "8vos de final": 8, "4tos de final": 10, "Semifinal": 20, "Final": 40, "Campeón": 50 };

// Función para esperar X milisegundos
const delay = (ms) => new Promise(res => setTimeout(res, ms));

// ================= GOOGLE SHEETS =================
async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({ keyFile: CREDENTIALS_PATH, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    return google.sheets({ version: "v4", auth });
}

async function obtenerJugadores() {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "jugadores!A2:A" });
    return response.data.values ? response.data.values.map(row => row[0]) : [];
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

async function eliminarDuplicados() {
    console.log("🧹 Iniciando limpieza de duplicados...");
    const sheets = await getSheetsClient();
    
    // 1. Obtener todos los datos de la hoja
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:I` // Leemos hasta la columna I (created)
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) return;

    const headers = rows[0];
    const data = rows.slice(1);
    const registrosUnicos = {};

    // 2. Lógica de filtrado (mantener el más antiguo)
    data.forEach((fila) => {
        const idJugador = fila[0];
        const nombreTorneo = fila[1];
        const division = fila[5];
        const fechaCreatedStr = fila[8];

        const clave = `${idJugador}|${nombreTorneo}|${division}`;
        
        // Convertimos el string "14/1/2026, 10:25:55" a objeto Date
        const [fechaPart, horaPart] = fechaCreatedStr.split(", ");
        const [d, m, a] = fechaPart.split("/").map(Number);
        const [h, min, s] = horaPart.split(":").map(Number);
        const fechaActual = new Date(a, m - 1, d, h, min, s);

        if (!registrosUnicos[clave] || fechaActual < registrosUnicos[clave].fecha) {
            registrosUnicos[clave] = { datos: fila, fecha: fechaActual };
        }
    });

    const datosLimpios = [headers, ...Object.values(registrosUnicos).map(item => item.datos)];

    // 3. Sobrescribir la hoja con los datos limpios
    // Primero limpiamos la hoja actual
    await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:I`
    });

    // Luego escribimos los datos nuevos
    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: datosLimpios }
    });

    console.log(`✅ Limpieza completada. Quedaron ${datosLimpios.length - 1} registros únicos.`);
}

// ================= SCRAPING =================
async function scrapearJugador(browser, idJugador) {
    let page;
    try {
        page = await browser.newPage();
        // Aumentamos el tiempo de espera por si la web está lenta
        await page.setDefaultNavigationTimeout(90000);
        const url = `https://tenisdemesaparatodos.com/partidos_xjugador.asp?codigo=${idJugador}`;
        
        await page.goto(url, { waitUntil: "networkidle2" });

        const data = await page.evaluate(({ MES_ACTUAL, ANIO_ACTUAL, MES_ANTERIOR, ANIO_MES_ANTERIOR, idJugador }) => {
            const filas = Array.from(document.querySelectorAll("tr"));
            const resultadosFinales = [];
            const indicesTorneos = [];

            filas.forEach((row, index) => {
                if (row.getAttribute("bgcolor") === "#FF6600") {
                    const torneoTd = row.querySelector("td.tournament-name");
                    if (torneoTd) {
                        const texto = torneoTd.innerText.trim();
                        const fechaTxt = texto.substring(0, 10);
                        const [, m, a] = fechaTxt.split("/").map(Number);
                        const nombre = torneoTd.querySelector("a") ? torneoTd.querySelector("a").innerText.trim() : "Sin nombre";
                        indicesTorneos.push({ index, nombre, fecha: fechaTxt, mes: m, anio: a });
                    }
                }
            });

            const ORDEN = { "Fase de grupos": 1, "64vos de final": 2, "32vos de final": 3, "16vos de final": 4, "8vos de final": 5, "4tos de final": 6, "Semifinal": 7, "Final": 8, "Campeón": 9 };

            indicesTorneos.forEach((torneo, i) => {
                const esMesActual = (torneo.mes === MES_ACTUAL && torneo.anio === ANIO_ACTUAL);
                const esMesAnterior = (torneo.mes === MES_ANTERIOR && torneo.anio === ANIO_MES_ANTERIOR);
                if (!esMesActual && !esMesAnterior) return;

                const inicio = torneo.index;
                const fin = indicesTorneos[i + 1] ? indicesTorneos[i + 1].index : filas.length;
                const mejorPorCategoria = {}; 

                for (let k = inicio; k < fin; k++) {
                    const row = filas[k];
                    const link = row.querySelector(`a[href*="codigo=${idJugador}"]`);
                    
                    if (link) {
                        let catCompleta = null;
                        let instPartido = null;

                        for (let x = k; x >= inicio; x--) {
                            const tdSeparador = filas[x].querySelector("td[colspan='10']");
                            if (tdSeparador && tdSeparador.innerText.includes("|")) {
                                const partes = tdSeparador.innerText.split("|").map(s => s.trim());
                                let rawInst = partes[partes.length - 1];
                                instPartido = rawInst.includes("Grupo") ? "Fase de grupos" : rawInst;
                                catCompleta = partes.slice(0, partes.length - 1).join(" | ");
                                if (!catCompleta) catCompleta = partes[0];

                                if (instPartido.includes("Final")) {
                                    instPartido = (row.getAttribute("bgcolor") === "#FFEACA") ? "Campeón" : "Final";
                                }
                                break;
                            }
                        }

                        if (catCompleta && instPartido) {
                            const rankActual = ORDEN[instPartido] || 0;
                            const rankGuardado = mejorPorCategoria[catCompleta] ? ORDEN[mejorPorCategoria[catCompleta].instancia] : 0;
                            if (rankActual > rankGuardado) {
                                mejorPorCategoria[catCompleta] = {
                                    torneo: torneo.nombre,
                                    fecha: torneo.fecha,
                                    categoria: catCompleta,
                                    instancia: instPartido
                                };
                            }
                        }
                    }
                }
                Object.values(mejorPorCategoria).forEach(res => resultadosFinales.push(res));
            });
            return resultadosFinales;
        }, { MES_ACTUAL, ANIO_ACTUAL, MES_ANTERIOR, ANIO_MES_ANTERIOR, idJugador });

        await page.close();
        return { id: idJugador, data: data, success: true };
    } catch (e) {
        console.error(`❌ Falló ID ${idJugador}: ${e.message}`);
        if (page) await page.close();
        return { id: idJugador, data: [], success: false };
    }
}

// ================= MAIN =================
(async () => {
    let browser;
    try {
        const idJugadores = await obtenerJugadores();
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

        console.log(`🚀 Iniciando scraping secuencial de ${idJugadores.length} jugadores...`);

        for (let i = 0; i < idJugadores.length; i++) {
            const id = idJugadores[i];
            console.log(`\n🔍 [${i + 1}/${idJugadores.length}] Procesando ID: ${id}...`);
            
            const res = await scrapearJugador(browser, id);
            
            if (res.success && res.data.length > 0) {
                let filasNuevas = [];
                res.data.forEach(p => {
                    const [, m, a] = p.fecha.split("/").map(Number);
                    filasNuevas.push([
                        res.id, p.torneo, p.fecha, m, a, p.categoria, p.instancia, TABLA_PUNTOS[p.instancia] || 0, new Date().toLocaleString("es-AR")
                    ]);
                });

                await appendRows(filasNuevas);
                console.log(`✅ ${filasNuevas.length} participaciones agregadas para ID ${id}.`);
            }
            await delay(500);
        }

        // --- AQUÍ LA MAGIA ---
        if (browser) await browser.close(); // Cerramos browser primero
        await eliminarDuplicados(); // Limpiamos la hoja al final
        // ---------------------

    } catch (error) {
        console.error("❌ Error en el proceso general:", error);
    } finally {
        if (browser) await browser.close();
        console.log("\n🏁 Proceso terminado. Todo cargado y depurado.");
    }
})();