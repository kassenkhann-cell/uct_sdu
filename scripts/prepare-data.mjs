import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const derivedDir = path.join(dataDir, "derived");
const publicDir = path.join(root, "frontend", "public", "generated");
const backendGeneratedDir = path.join(root, "backend", "app", "generated");

const clean = (value) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const numberValue = (value, fallback = 0) => {
  const normalized = clean(value);
  const numeric = /^\d{1,3}(,\d{3})+$/.test(normalized)
    ? normalized.replaceAll(",", "")
    : normalized.replace(",", ".");
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const intValue = (value, fallback = 0) =>
  Math.max(0, Math.round(numberValue(value, fallback)));

const normalizeKato = (value) => clean(value).replace(/\D/g, "");

const normalizeDistrict = (value) => {
  const raw = clean(value);
  if (!raw) return "Не указан";
  if (/актюбинская область/i.test(raw)) return "Областной уровень";
  if (/актобе/i.test(raw) && /(г\.?\s*а\.?|город)/i.test(raw)) return "Актобе";
  return raw
    .replace(/^район\s+/i, "")
    .replace(/\s+район$/i, "")
    .replace(/\s+р-н$/i, "")
    .trim();
};

const normalizeSettlementName = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^(?:с|п|г)\.?\s*/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const locationKey = (row) =>
  `${normalizeDistrict(row["Район"]).toLowerCase()}::${normalizeSettlementName(row["Нас пункт"])}`;

const generation = (value) => {
  const match = clean(value).toUpperCase().match(/([2-5])\s*G/);
  return match ? Number(match[1]) : 0;
};

const hasMeaningfulValue = (value) => {
  const normalized = clean(value).toLowerCase();
  return Boolean(normalized && !["-", "нет", "0", "не имеется"].includes(normalized));
};

const riskLevel = (score) => {
  if (score >= 65) return "Высокий";
  if (score >= 40) return "Средний";
  return "Низкий";
};

const districtRiskLevel = (score) => {
  if (score >= 45) return "Высокий";
  if (score >= 25) return "Средний";
  return "Низкий";
};

const escapeCsvRows = (rows) => Papa.unparse(rows, { quotes: true, newline: "\n" });

const writeText = (target, content) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
};

const readSheet = (workbook, sheetName, range) => {
  const options = {
    defval: "",
    raw: false,
  };
  if (range !== undefined) options.range = range;
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], options);
};

const findHeaderRange = (workbook, sheetName, requiredHeaders) => {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const index = rows.findIndex((row) =>
    requiredHeaders.every((header) =>
      row.some((value) => clean(value).toLowerCase() === header.toLowerCase()),
    ),
  );
  if (index < 0) {
    throw new Error(
      `Header row not found on sheet "${sheetName}": ${requiredHeaders.join(", ")}`,
    );
  }
  const worksheetStart = XLSX.utils.decode_range(
    workbook.Sheets[sheetName]["!ref"] || "A1:A1",
  ).s.r;
  return worksheetStart + index;
};

const splitMultiline = (value) =>
  String(value ?? "")
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

const parseCoordinatePairs = (value) =>
  splitMultiline(value)
    .map((line) => {
      const numbers = line
        .replace(/;/g, ",")
        .match(/-?\d+(?:[.,]\d+)?/g)
        ?.map((item) => Number.parseFloat(item.replace(",", ".")));
      if (!numbers || numbers.length < 2) return null;
      const [latitude, longitude] = numbers;
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < 40 ||
        latitude > 60 ||
        longitude < 40 ||
        longitude > 75
      ) {
        return null;
      }
      return { latitude, longitude };
    })
    .filter(Boolean);

const displayText = (value, fallback = "") => {
  const text = clean(value);
  return text || fallback;
};

function auditSupplementalWorkbook(workbook, fileName) {
  const reports = workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    });
    const headerIndex = rows.findIndex(
      (row) =>
        row.some((value) => clean(value) === "КАТО") &&
        row.some((value) => /АМС|базов|антенн/i.test(clean(value))),
    );
    const headers =
      headerIndex >= 0 ? rows[headerIndex].map(clean).filter(Boolean) : [];
    return {
      sheetName,
      rows: rows.filter((row) => row.some((value) => clean(value))).length,
      headerIndex,
      headers,
    };
  });

  console.log("\nПроверка файла районам по 213v2.xlsx");
  console.log(`Файл: ${fileName}`);
  console.log(`Найдено листов: ${reports.length}`);
  for (const report of reports) {
    console.log(
      `- Лист "${report.sheetName}": ${report.rows} непустых строк; колонки: ${report.headers.join(" | ") || "заголовок не найден"}`,
    );
  }
  return reports;
}

const xmlAttributes = (source) =>
  Object.fromEntries(
    [...source.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );

function extractProblemRowNumbers(workbook, sheetName) {
  const sheetIndex = workbook.SheetNames.indexOf(sheetName);
  const rawPath = workbook.Directory?.sheets?.[sheetIndex]?.replace(/^\//, "");
  const sheetFile = rawPath ? workbook.files?.[rawPath] : null;
  const stylesFile = workbook.files?.["xl/styles.xml"];
  if (!sheetFile?.content || !stylesFile?.content) {
    throw new Error("Raw XLSX styles are unavailable for the problem sheet");
  }

  const stylesXml = stylesFile.content.toString("utf8");
  const sheetXml = sheetFile.content.toString("utf8");
  const fontsXml = stylesXml.match(/<fonts\b[\s\S]*?<\/fonts>/)?.[0] || "";
  const fillsXml = stylesXml.match(/<fills\b[\s\S]*?<\/fills>/)?.[0] || "";
  const cellXfsXml =
    stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || "";
  const fontBlocks = [...fontsXml.matchAll(/<font>([\s\S]*?)<\/font>/g)].map(
    (match) => match[1],
  );
  const fillBlocks = [...fillsXml.matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(
    (match) => match[1],
  );
  const redPattern = /rgb="(?:FF)?FF0000"/i;
  const redFontIds = new Set(
    fontBlocks
      .map((font, index) => (redPattern.test(font) ? index : null))
      .filter((index) => index !== null),
  );
  const redFillIds = new Set(
    fillBlocks
      .map((fill, index) => (redPattern.test(fill) ? index : null))
      .filter((index) => index !== null),
  );
  const styleTags = [...cellXfsXml.matchAll(/<xf\b([^>]*)\/?>/g)].map(
    (match) => xmlAttributes(match[1]),
  );
  const redStyleIds = new Set(
    styleTags
      .map((style, index) =>
        redFontIds.has(Number(style.fontId || 0)) ||
        redFillIds.has(Number(style.fillId || 0))
          ? index
          : null,
      )
      .filter((index) => index !== null),
  );

  const redRows = new Set();
  const settlementStyleByRow = new Map();
  for (const match of sheetXml.matchAll(/<c\b([^>]*)>/g)) {
    const attributes = xmlAttributes(match[1]);
    const reference = attributes.r || "";
    const rowMatch = reference.match(/\d+/);
    if (!rowMatch) continue;
    const rowNumber = Number(rowMatch[0]);
    const styleId = Number(attributes.s || 0);
    if (redStyleIds.has(styleId)) redRows.add(rowNumber);
    if (/^H\d+$/.test(reference)) settlementStyleByRow.set(rowNumber, styleId);
  }

  const problemSettlementStyles = new Set(
    [...redRows]
      .map((rowNumber) => settlementStyleByRow.get(rowNumber))
      .filter((styleId) => styleId !== undefined),
  );
  return new Set(
    [...settlementStyleByRow.entries()]
      .filter(
        ([rowNumber, styleId]) =>
          rowNumber > 1 && problemSettlementStyles.has(styleId),
      )
      .map(([rowNumber]) => rowNumber),
  );
}

function operatorSummary(row) {
  const provider = clean(row["Покрытие обеспечивает (ЛО)"]);
  if (provider) return provider;
  const operators = [
    ["Beeline", row["Билайн"]],
    ["Kcell", row["Кселл"]],
    ["Tele2", row["Теле2"]],
  ]
    .filter(([, value]) => generation(value) > 0)
    .map(([name, value]) => `${name} ${clean(value)}`);
  return operators.join(", ") || "Нет действующего оператора";
}

function problemDescription(row) {
  const note = clean(row["Примечание"]);
  const coverage = clean(row["Охват"]);
  const operatorValues = [row["Билайн"], row["Кселл"], row["Теле2"]];
  const maxGeneration = Math.max(...operatorValues.map(generation), generation(coverage));
  if (/финансирован/i.test(note)) return "Подключение задержано из-за финансирования";
  if (/востоктелеком/i.test(note)) return "Требуется улучшение канала Востоктелеком";
  if (/starlink|jusan|one\s*web/i.test(note)) {
    return maxGeneration <= 2
      ? "Нет устойчивой мобильной связи; требуется спутниковое решение"
      : "Недостаточное покрытие; запланировано спутниковое решение";
  }
  if (maxGeneration === 0) return "Нет мобильного покрытия";
  if (maxGeneration === 2) return "Только 2G, мобильный интернет недоступен";
  if (maxGeneration === 3) return "Только 3G или нестабильный интернет";
  return note || "Проблема качества связи требует обследования";
}

function problemRecommendation(row) {
  const note = clean(row["Примечание"]);
  const coverage = clean(row["Охват"]);
  const maxGeneration = Math.max(
    generation(coverage),
    generation(row["Билайн"]),
    generation(row["Кселл"]),
    generation(row["Теле2"]),
  );
  const fiber = clean(row["ГЧП ВОЛС 2.0"]);
  if (/финансирован/i.test(note)) {
    return "Закрепить источник финансирования и контрольный срок подключения в 2026 году.";
  }
  if (/востоктелеком/i.test(note)) {
    return "Провести модернизацию канала Востоктелеком и контрольный замер скорости.";
  }
  if (/starlink|jusan|one\s*web/i.test(note) || maxGeneration === 0) {
    return "Подключить временный спутниковый канал и включить СНП в адресный план базовой станции.";
  }
  if (maxGeneration <= 2) {
    return "Обязать оператора модернизировать действующую сеть до 4G.";
  }
  if (maxGeneration === 3) {
    return "Выполнить модернизацию 3G→4G и совместный drive-test операторов.";
  }
  if (!hasMeaningfulValue(fiber)) {
    return "Проработать ВОЛС/радиорелейный backhaul и установить SLA качества.";
  }
  return "Провести техническое обследование, drive-test и утвердить план устранения.";
}

function isInternetAppeal(row) {
  const category = clean(row.category).toLowerCase();
  const issue = clean(row.issue).toLowerCase();
  const subissue = clean(row.subissue).toLowerCase();
  const topic = `${issue} ${subissue}`;

  const excluded =
    /e-?gov|электронн(?:ое|ого)\s+правительств|цифровизац|информационн.*безопас|персональн.*данн|информационн.*систем|call.?centre|1414|интернет[-\s]*(?:ресурс|пространств)|ограничени[ея]\s+доступа|лицензирован/i.test(
      topic,
    );
  if (excluded) return false;

  const hasMobile = topic.includes("мобильн") && !topic.includes("автомобильн");
  const directMatch =
    topic.includes("интернет") ||
    hasMobile ||
    topic.includes("сотов") ||
    topic.includes("телекоммуникац") ||
    topic.includes("средств связи") ||
    topic.includes("качество связи") ||
    topic.includes("услуг связи") ||
    topic.includes("телефонизац") ||
    topic.includes("перебо") ||
    topic.includes("покрытие сети");

  return (
    directMatch &&
    (category.includes("связ") ||
      category.includes("коммуникац") ||
      category.includes("потребител"))
  );
}

function inferAppealTopic(row) {
  const text = `${clean(row.issue)} ${clean(row.subissue)}`.toLowerCase();
  if (text.includes("скорост")) return "Низкая скорость";
  if (text.includes("обеспечение населенного пункта")) return "Нет покрытия";
  if (text.includes("фиксирован")) return "Фиксированный интернет";
  if (text.includes("беспровод") || (text.includes("мобильн") && text.includes("интернет"))) {
    return "Мобильный интернет";
  }
  if (text.includes("мобильн") || text.includes("сотов")) return "Мобильная связь";
  if (text.includes("потребител")) return "Качество услуг";
  if (text.includes("телеком")) return "Телекоммуникации";
  return "Связь и интернет";
}

function parseAppeals(csvPath) {
  const source = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse(source, {
    header: true,
    delimiter: "`",
    skipEmptyLines: "greedy",
    transformHeader: (header) => clean(header.replace(/^"|"$/g, "")),
  });

  const appeals = parsed.data
    .filter((row) => row && isInternetAppeal(row))
    .map((row) => {
      const startDate = clean(row.start_dt || row.modified_date);
      const dateMatch = startDate.match(/^(\d{4})-(\d{2})/);
      const year = dateMatch ? Number(dateMatch[1]) : intValue(row.year, 2025);
      const month = dateMatch ? Number(dateMatch[2]) : intValue(row.month_number, 1);
      return {
        appeal_id: clean(row.appeal_id),
        reg_number: clean(row.reg_number),
        district: normalizeDistrict(row.raion || row.loc_name),
        settlement: clean(row.loc_name || row.kato_6_name_ru || "Не указан"),
        kato: normalizeKato(row.kato),
        category: clean(row.category),
        issue: clean(row.issue),
        subissue: clean(row.subissue),
        status: clean(row.current_working_state || row.current_state),
        overdue: /просроч|overdue/i.test(clean(row.status_overdue)) ? 1 : 0,
        start_date: startDate,
        year,
        month,
        month_key: `${year}-${String(month).padStart(2, "0")}`,
        topic: inferAppealTopic(row),
      };
    });

  const uniqueAppeals = new Map();
  for (const appeal of appeals) {
    const key = appeal.appeal_id || appeal.reg_number;
    if (!key) continue;
    const current = uniqueAppeals.get(key);
    if (!current || appeal.start_date > current.start_date) {
      uniqueAppeals.set(key, appeal);
    }
  }
  return [...uniqueAppeals.values()];
}

function mockAppeals() {
  return [
    {
      appeal_id: "mock-1",
      reg_number: "ЖТ-MOCK-001",
      district: "Мугалжарский",
      settlement: "Кандыагаш",
      kato: "",
      category: "Связь",
      issue: "Связь и информатизация",
      subissue: "Низкая скорость интернета",
      status: "Завершено",
      overdue: 0,
      start_date: "2025-10-12",
      year: 2025,
      month: 10,
      month_key: "2025-10",
      topic: "Низкая скорость",
    },
    {
      appeal_id: "mock-2",
      reg_number: "ЖТ-MOCK-002",
      district: "Шалкарский",
      settlement: "Шалкар",
      kato: "",
      category: "Связь",
      issue: "Связь и информатизация",
      subissue: "Общие вопросы мобильной связи",
      status: "В работе",
      overdue: 1,
      start_date: "2026-02-05",
      year: 2026,
      month: 2,
      month_key: "2026-02",
      topic: "Мобильная связь",
    },
  ];
}

function parseInfrastructure(primaryPath, supplementalPath) {
  const primaryBook = XLSX.readFile(primaryPath, {
    cellDates: false,
    cellStyles: true,
    bookFiles: true,
  });
  const primarySheet =
    primaryBook.SheetNames.find((name) => name.toLowerCase().includes("послед")) ||
    primaryBook.SheetNames.find((name) => name.includes("311")) ||
    primaryBook.SheetNames[0];
  const districtSheet = primaryBook.SheetNames.find((name) =>
    name.toLowerCase().includes("общ"),
  );
  const problemSheet = primaryBook.SheetNames.find(
    (name) => name.includes("40") && name.toLowerCase().includes("проблем"),
  );
  if (!problemSheet) throw new Error("Problem settlement sheet was not found");
  const problemRowNumbers = extractProblemRowNumbers(primaryBook, problemSheet);
  const problemRows = readSheet(primaryBook, problemSheet).filter((row) =>
    problemRowNumbers.has(Number(row.__rowNum__) + 1),
  );
  const problemsByKato = new Map(
    problemRows
      .map((row) => [normalizeKato(row["КАТО"]), row])
      .filter(([kato]) => kato),
  );

  const primaryRows = readSheet(primaryBook, primarySheet);
  const primaryByLocation = new Map();
  for (const row of primaryRows) {
    const key = locationKey(row);
    const candidates = primaryByLocation.get(key) || [];
    candidates.push(row);
    primaryByLocation.set(key, candidates);
  }

  const supplementalBook = XLSX.readFile(supplementalPath, { cellDates: false });
  const supplementalAudit = auditSupplementalWorkbook(
    supplementalBook,
    path.basename(supplementalPath),
  );
  const supplementalSheets = supplementalAudit
    .filter((item) => item.headerIndex >= 0)
    .map((item) => item.sheetName);
  const rawExtraRows = supplementalSheets.flatMap((sheetName) => {
    const range = findHeaderRange(supplementalBook, sheetName, [
      "КАТО",
      "АМС (количество)",
    ]);
    return readSheet(supplementalBook, sheetName, range).map((row) => ({
      ...row,
      __source_sheet: sheetName,
    }));
  });
  let correctedKatoCount = 0;
  const extraRows = rawExtraRows.map((row) => {
    const sourceKato = normalizeKato(row["КАТО"]);
    const key = locationKey(row);
    const candidates = primaryByLocation.get(key) || [];
    if (!candidates.length) return row;
    const sameKato = candidates.find(
      (candidate) => normalizeKato(candidate["КАТО"]) === sourceKato,
    );
    const latitude = numberValue(row["Latitude"]);
    const longitude = numberValue(row["Longitude"]);
    const sortedCandidates = [...candidates].sort((left, right) =>
      normalizeKato(left["КАТО"]).localeCompare(normalizeKato(right["КАТО"])),
    );
    const sourceKatos = [
      ...new Set(
        rawExtraRows
          .filter((candidate) => locationKey(candidate) === key)
          .map((candidate) => normalizeKato(candidate["КАТО"])),
      ),
    ].sort();
    const positionalMatch =
      candidates.length > 1 && sourceKatos.length > 1
        ? sortedCandidates[sourceKatos.indexOf(sourceKato)]
        : undefined;
    const nearestMatch = [...candidates].sort((left, right) => {
      const leftDistance =
        (numberValue(left["Latitude"]) - latitude) ** 2 +
        (numberValue(left["Longitude"]) - longitude) ** 2;
      const rightDistance =
        (numberValue(right["Latitude"]) - latitude) ** 2 +
        (numberValue(right["Longitude"]) - longitude) ** 2;
      return leftDistance - rightDistance;
    })[0];
    const matched = sameKato || positionalMatch || nearestMatch;
    const matchedKato = normalizeKato(matched?.["КАТО"]);
    if (!matchedKato || matchedKato === sourceKato) return row;
    correctedKatoCount += 1;
    return { ...row, __source_kato: sourceKato, "КАТО": matchedKato };
  });
  const extrasByKato = new Map();
  for (const row of extraRows) {
    const kato = normalizeKato(row["КАТО"]);
    if (!kato) continue;
    const current = extrasByKato.get(kato);
    if (!current) {
      extrasByKato.set(kato, { ...row, __tower_rows: [row] });
      continue;
    }
    current.__tower_rows.push(row);
    for (const [key, value] of Object.entries(row)) {
      if (!hasMeaningfulValue(current[key]) && hasMeaningfulValue(value)) {
        current[key] = value;
      }
    }
  }
  const infrastructureByDistrictMap = new Map();
  for (const row of extrasByKato.values()) {
    const district = normalizeDistrict(row["Район"]);
    const stats = infrastructureByDistrictMap.get(district) || {
      district,
      infrastructure_rows: 0,
      ams_count: 0,
      settlements_with_ams: 0,
      coordinate_objects: 0,
    };
    const amsCount = row.__tower_rows.reduce(
      (sum, towerRow) => sum + intValue(towerRow["АМС (количество)"]),
      0,
    );
    stats.infrastructure_rows += 1;
    stats.ams_count += amsCount;
    if (amsCount > 0) stats.settlements_with_ams += 1;
    stats.coordinate_objects += row.__tower_rows.reduce(
      (sum, towerRow) => sum + parseCoordinatePairs(towerRow["Координаты"]).length,
      0,
    );
    infrastructureByDistrictMap.set(district, stats);
  }
  const towerPoints = [];
  for (const settlementRow of extrasByKato.values()) {
    const towerRows = settlementRow.__tower_rows;
    let towerIndex = 0;
    for (const row of towerRows) {
    const kato = normalizeKato(row["КАТО"]);
    if (!kato) continue;
    const count = intValue(row["АМС (количество)"]);
    const coordinates = parseCoordinatePairs(row["Координаты"]);
    const heights = splitMultiline(row["Высота АМС (м)"]);
    const holders = splitMultiline(
      row["Балансодержатель (Акимат, оператор, частный инвестор)"],
    );
    const power = splitMultiline(
      row["Электроппитание (ЛЭП, солнечные батареи), кВ"],
    );
    for (let index = 0; index < count; index += 1) {
      const coordinate = coordinates[index] || coordinates[0];
      if (!coordinate) continue;
      towerIndex += 1;
      towerPoints.push({
        id: `${kato}-${towerIndex}`,
        kato,
        district: normalizeDistrict(row["Район"]),
        settlement: displayText(row["Нас пункт"]),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        height: numberValue(heights[index] || heights[0]),
        holder: displayText(holders[index] || holders[0]),
        power: displayText(
          power[index] ||
            power[0] ||
            row["Источник электропитания (ЛЭП, солнечные батареи, генератор, отсутствует)"],
        ),
        funding: displayText(
          row["За чей счет (существующее, оператор, акимат, спонсор)"],
        ),
        operator_kcell: intValue(row.Kcell),
        operator_beeline: intValue(row.beeline),
        operator_tele2: intValue(row["tele2/altel"]),
      });
    }
    }
  }

  const primaryByKato = new Map(
    primaryRows
      .map((row) => [normalizeKato(row["КАТО"]), row])
      .filter(([kato]) => kato),
  );
  const settlements = [...extrasByKato.values()]
    .map((extra) => {
      const kato = normalizeKato(extra["КАТО"]);
      const row = primaryByKato.get(kato) || extra;
      const problemRow = problemsByKato.get(kato);
      const towerCount = extra.__tower_rows.reduce(
        (sum, towerRow) => sum + intValue(towerRow["АМС (количество)"]),
        0,
      );
      const beeline = clean(extra["Билайн"] || row["Билайн"]);
      const kcell = clean(extra["Кселл"] || row["Кселл"]);
      const tele2 = clean(extra["Теле2"] || row["Теле2"]);
      const coverage = clean(
        extra["Охват МШПД (-, 2G, 3G, 4G)"] || row["Охват"],
      );
      const fiber = clean(row["ГЧП ВОЛС 2.0"]);
      const satellite = clean(row["Спутник"]);
      const plan = clean(row["Планы по подключению МШПД"]);
      const provider = clean(row["Покрытие обеспечивает (ЛО)"]);
      const operatorCount = [beeline, kcell, tele2].filter(
        (value) => generation(value) > 0,
      ).length;
      const fourGCount = [beeline, kcell, tele2].filter(
        (value) => generation(value) >= 4,
      ).length;
      const coverageGeneration = generation(coverage);
      const broadband =
        hasMeaningfulValue(fiber) ||
        hasMeaningfulValue(row["Дата подключения МШПД"]) ||
        /волс|оптик|ттс|кт/i.test(`${provider} ${fiber}`);
      const population = intValue(extra["Население"] || row["Население"]);
      const hasCoordinates =
        numberValue(extra["Latitude"] || row["Latitude"]) > 40 &&
        numberValue(extra["Longitude"] || row["Longitude"]) > 40;

      let score = coverageGeneration >= 4 ? 8 : coverageGeneration === 3 ? 34 : 62;
      score += Math.max(0, 3 - operatorCount) * 7;
      score += fourGCount === 0 ? 12 : fourGCount === 1 ? 5 : 0;
      score += broadband ? 0 : 8;
      score += hasMeaningfulValue(satellite) ? 10 : 0;
      score += towerCount > 0 ? -Math.min(15, towerCount * 5) : 12;
      score += hasMeaningfulValue(plan) && coverageGeneration < 4 ? 4 : 0;
      score += Math.min(8, population / 700);
      if (!hasCoordinates) score += 8;
      score = Math.max(0, Math.min(100, Math.round(score)));

      return {
        kato,
        district: normalizeDistrict(extra["Район"] || row["Район"]),
        settlement: clean(extra["Нас пункт"] || row["Нас пункт"] || "Без названия"),
        rural_county: clean(extra["Сельский округ"] || row["Сельский округ"]),
        latitude: numberValue(extra["Latitude"] || row["Latitude"]),
        longitude: numberValue(extra["Longitude"] || row["Longitude"]),
        population,
        households: intValue(row["Дворы"]),
        coverage,
        beeline,
        kcell,
        tele2,
        fiber,
        satellite,
        plan,
        provider,
        potential: clean(extra["Потенциал развития"]),
        tower_count: towerCount,
        tower_height: extra.__tower_rows.map((item) => clean(item["Высота АМС (м)"])).filter(Boolean).join(" · "),
        tower_coordinates: extra.__tower_rows.map((item) => clean(item["Координаты"])).filter(Boolean).join(" · "),
        tower_holder: displayText(
          extra["Балансодержатель (Акимат, оператор, частный инвестор)"],
        ),
        tower_funding: displayText(
          extra["За чей счет (существующее, оператор, акимат, спонсор)"],
        ),
        tower_cost: numberValue(extra["Сумма строительства, млн тг"]),
        tower_power: displayText(
          extra["Электроппитание (ЛЭП, солнечные батареи), кВ"],
        ),
        operator_count: operatorCount,
        four_g_count: fourGCount,
        broadband: broadband ? 1 : 0,
        appeals: 0,
        is_problem: problemRow ? 1 : 0,
        critical_risk: 0,
        problem_appeals: 0,
        problem: problemRow ? problemDescription(problemRow) : "",
        problem_operator: problemRow ? operatorSummary(problemRow) : "",
        recommendation: problemRow ? problemRecommendation(problemRow) : "",
        risk_score: score,
        risk_level: riskLevel(score),
      };
    })
    .filter((row) => row.kato && row.latitude && row.longitude);

  let districtBase = [];
  if (districtSheet) {
    districtBase = readSheet(primaryBook, districtSheet)
      .filter((row) => clean(row["Районы"]) && !/всего/i.test(clean(row["Районы"])))
      .map((row) => ({
        district: normalizeDistrict(row["Районы"]),
        settlements: intValue(row["СНП"] || row["2025"]),
        population: intValue(row["Нсаление"]),
        households: intValue(row["Двор"]),
        connected: intValue(row["МШПД"]),
        connected_population: intValue(row["Нсаление МШПД"]),
        plan_2025: intValue(row["План 2025"]),
        outside_plan: intValue(row["Вне плана"]),
        target_2026: intValue(row["2026"]),
        target_2030: intValue(row["2030"]),
      }));
  }

  if (problemsByKato.size !== 40) {
    throw new Error(
      `Expected 40 styled problem settlements, found ${problemsByKato.size}`,
    );
  }

  const totalAms = extraRows.reduce(
    (sum, row) => sum + intValue(row["АМС (количество)"]),
    0,
  );
  const rowsWithAms = [...extrasByKato.values()].filter((row) =>
    row.__tower_rows.some((towerRow) => intValue(towerRow["АМС (количество)"]) > 0),
  ).length;
  const usedFields = [
    "КАТО",
    "Район",
    "Нас пункт",
    "АМС (количество)",
    "Высота АМС (м)",
    "Координаты",
    "Балансодержатель",
    "Электропитание",
    "Источник финансирования",
    "Kcell",
    "beeline",
    "tele2/altel",
  ];
  const ignoredFields = [
    "Область (константа)",
    "Сумма строительства без единицы измерения",
  ];
  console.log(`Использованные листы: ${supplementalSheets.join(", ")}`);
  console.log(
    `Исправлено строк с межрайонным КАТО по району, названию СНП и координатам: ${correctedKatoCount}`,
  );
  console.log(
    `Строк инфраструктуры: ${extraRows.length}; строк с АМС: ${rowsWithAms}; всего АМС: ${totalAms}; точек АМС с координатами: ${towerPoints.length}`,
  );
  console.log(`Использованные поля: ${usedFields.join(", ")}`);
  console.log(`Проигнорированные поля: ${ignoredFields.join(", ")}`);
  console.log(
    "Причина прежнего значения 0: импорт начинался до фактической строки заголовков, поэтому КАТО и АМС читались как служебные __EMPTY-поля.",
  );
  console.log(
    "Исправлено: строка заголовков определяется автоматически, АМС связываются с СНП по КАТО, координаты объектов вынесены в отдельный слой.\n",
  );

  return {
    settlements,
    districtBase,
    problemCount: problemsByKato.size,
    towerPoints,
    infrastructureByDistrict: [...infrastructureByDistrictMap.values()],
    infrastructureAudit: {
      sheets_found: supplementalBook.SheetNames.length,
      sheets_used: supplementalSheets,
      rows: extraRows.length,
      rows_with_ams: rowsWithAms,
      total_ams: totalAms,
      mapped_tower_points: towerPoints.length,
      used_fields: usedFields,
      ignored_fields: ignoredFields,
    },
  };
}

function mockInfrastructure() {
  return {
    settlements: [
      {
        kato: "mock-1",
        district: "Алгинский",
        settlement: "Есет батыра Кокиулы",
        rural_county: "",
        latitude: 49.870801,
        longitude: 57.538271,
        population: 1637,
        households: 369,
        coverage: "4G",
        beeline: "4G",
        kcell: "4G",
        tele2: "3G",
        fiber: "ТТС",
        satellite: "",
        plan: "",
        provider: "",
        potential: "высокий",
        tower_count: 1,
        tower_height: "22",
        tower_coordinates: "49.872657, 57.540887",
        tower_holder: "ТОО «Кар-Тел»",
        tower_funding: "существующее",
        tower_cost: 0,
        tower_power: "380",
        operator_count: 3,
        four_g_count: 2,
        broadband: 1,
        appeals: 0,
        is_problem: 0,
        critical_risk: 0,
        problem_appeals: 0,
        problem: "",
        problem_operator: "",
        recommendation: "",
        risk_score: 18,
        risk_level: "Низкий",
      },
      {
        kato: "mock-2",
        district: "Шалкарский",
        settlement: "Кауылжыр",
        rural_county: "",
        latitude: 47.85,
        longitude: 59.62,
        population: 540,
        households: 130,
        coverage: "3G",
        beeline: "3G",
        kcell: "-",
        tele2: "3G",
        fiber: "",
        satellite: "+",
        plan: "2026",
        provider: "",
        potential: "средний",
        tower_count: 1,
        tower_height: "20",
        tower_coordinates: "47.85, 59.62",
        tower_holder: "Акимат",
        tower_funding: "акимат",
        tower_cost: 0,
        tower_power: "",
        operator_count: 2,
        four_g_count: 0,
        broadband: 0,
        appeals: 0,
        is_problem: 1,
        critical_risk: 1,
        problem_appeals: 1,
        problem: "Нет устойчивого мобильного покрытия",
        problem_operator: "Нет действующего оператора",
        recommendation: "Подключить спутниковый канал и включить СНП в план 4G.",
        risk_score: 78,
        risk_level: "Высокий",
      },
    ],
    districtBase: [],
    problemCount: 1,
    towerPoints: [],
    infrastructureByDistrict: [],
    infrastructureAudit: {
      sheets_found: 0,
      sheets_used: [],
      rows: 0,
      rows_with_ams: 0,
      total_ams: 0,
      mapped_tower_points: 0,
      used_fields: [],
      ignored_fields: [],
    },
  };
}

function buildPayload(
  settlements,
  appeals,
  districtBase,
  towerPoints,
  infrastructureByDistrict,
  infrastructureAudit,
  sourceMode,
  warnings,
) {
  const appealsByKato = new Map();
  const appealsByLocation = new Map();
  for (const appeal of appeals) {
    if (appeal.kato) {
      appealsByKato.set(appeal.kato, (appealsByKato.get(appeal.kato) || 0) + 1);
    }
    const locationKey = `${appeal.district}|${clean(appeal.settlement)
      .toLowerCase()
      .replace(/^(с\.?|пос\.?|п\.?)\s*/i, "")}`;
    appealsByLocation.set(
      locationKey,
      (appealsByLocation.get(locationKey) || 0) + 1,
    );
  }

  for (const settlement of settlements) {
    const locationKey = `${settlement.district}|${clean(settlement.settlement)
      .toLowerCase()
      .replace(/^(с\.?|пос\.?|п\.?)\s*/i, "")}`;
    settlement.appeals =
      appealsByKato.get(settlement.kato) || appealsByLocation.get(locationKey) || 0;
    settlement.problem_appeals = settlement.is_problem ? settlement.appeals : 0;
    settlement.critical_risk =
      settlement.is_problem && settlement.problem_appeals > 0 ? 1 : 0;
    settlement.risk_score = settlement.is_problem
      ? settlement.critical_risk
        ? 100
        : Math.max(90, settlement.risk_score)
      : Math.min(100, settlement.risk_score + Math.min(18, settlement.appeals * 3));
    settlement.risk_level = riskLevel(settlement.risk_score);
  }

  const baseByDistrict = new Map(districtBase.map((item) => [item.district, item]));
  const infrastructureByDistrictMap = new Map(
    infrastructureByDistrict.map((item) => [item.district, item]),
  );
  const allDistricts = new Set([
    ...settlements.map((item) => item.district),
    ...appeals.map((item) => item.district),
    ...districtBase.map((item) => item.district),
  ]);

  const districts = [...allDistricts]
    .filter(
      (district) =>
        district &&
        district !== "Не указан" &&
        district !== "Областной уровень",
    )
    .map((district) => {
      const points = settlements.filter((item) => item.district === district);
      const districtAppeals = appeals.filter((item) => item.district === district);
      const base = baseByDistrict.get(district) || {};
      const infrastructure = infrastructureByDistrictMap.get(district) || {};
      const population =
        intValue(base.population) ||
        points.reduce((sum, item) => sum + item.population, 0);
      const settlementCount = intValue(base.settlements) || points.length;
      const connected =
        intValue(base.connected) ||
        points.filter((item) => item.coverage && generation(item.coverage) >= 3).length;
      const highRisk = points.filter((item) => item.risk_level === "Высокий").length;
      const problemSettlements = points.filter((item) => item.is_problem).length;
      const criticalSettlements = points.filter((item) => item.critical_risk).length;
      const amsCount =
        intValue(infrastructure.ams_count) ||
        points.reduce((sum, item) => sum + intValue(item.tower_count), 0);
      const settlementsWithAms =
        intValue(infrastructure.settlements_with_ams) ||
        points.filter((item) => intValue(item.tower_count) > 0).length;
      const settlementsWithoutAms = Math.max(
        0,
        settlementCount - settlementsWithAms,
      );
      const satelliteSettlements = points.filter((item) =>
        hasMeaningfulValue(item.satellite),
      ).length;
      const fourGShare = points.length
        ? (points.filter((item) => item.four_g_count > 0).length / points.length) * 100
        : 0;
      const broadbandShare = points.length
        ? (points.filter((item) => item.broadband).length / points.length) * 100
        : settlementCount
          ? (connected / settlementCount) * 100
          : 0;
      const weightedRisk = points.length
        ? points.reduce(
            (sum, item) => sum + item.risk_score * Math.max(item.population, 1),
            0,
          ) / points.reduce((sum, item) => sum + Math.max(item.population, 1), 0)
        : 30;
      const appealsPer10k = population
        ? (districtAppeals.length / population) * 10_000
        : 0;
      const appealPressure = Math.min(100, appealsPer10k * 4);
      const riskShare = points.length ? (highRisk / points.length) * 100 : 25;
      const baseScore = Math.round(
        Math.min(
          100,
          points.length
            ? weightedRisk * 0.6 + appealPressure * 0.25 + riskShare * 0.15
            : 25 + Math.min(35, districtAppeals.length / 100),
        ),
      );
      const amsPenalty = points.length
        ? Math.round((settlementsWithoutAms / points.length) * 18)
        : 0;
      const satellitePenalty = points.length
        ? Math.round((satelliteSettlements / points.length) * 10)
        : 0;
      const score = Math.max(
        0,
        Math.min(
          100,
          baseScore +
            Math.min(35, problemSettlements * 5) +
            Math.min(15, criticalSettlements * 5) +
            amsPenalty +
            satellitePenalty -
            Math.min(
              12,
              Math.round(
                (settlementsWithAms / Math.max(points.length, 1)) * 12,
              ),
            ),
        ),
      );
      const reasons = [];
      if (!points.length) {
        reasons.push("инфраструктурные показатели требуют уточнения");
      } else {
        if (problemSettlements) reasons.push(`${problemSettlements} проблемных СНП`);
        if (criticalSettlements)
          reasons.push(`${criticalSettlements} критических совпадений`);
        if (settlementsWithoutAms)
          reasons.push(`${settlementsWithoutAms} СНП без учтённой АМС`);
        if (fourGShare < 70)
          reasons.push(`4G только в ${Math.round(fourGShare)}% СНП`);
        if (broadbandShare < 85)
          reasons.push(`МШПД/ВОЛС в ${Math.round(broadbandShare)}% СНП`);
        if (satelliteSettlements)
          reasons.push(`${satelliteSettlements} спутниковых решений`);
      }
      if (districtAppeals.length)
        reasons.push(`${districtAppeals.length} профильных обращений`);

      return {
        district,
        settlements: settlementCount,
        population,
        connected,
        broadband_share: Math.round(broadbandShare * 10) / 10,
        four_g_share: Math.round(fourGShare * 10) / 10,
        risk_settlements: highRisk,
        problem_settlements: problemSettlements,
        critical_settlements: criticalSettlements,
        ams_count: amsCount,
        settlements_with_ams: settlementsWithAms,
        settlements_without_ams: settlementsWithoutAms,
        satellite_settlements: satelliteSettlements,
        appeals: districtAppeals.length,
        overdue: districtAppeals.reduce((sum, item) => sum + item.overdue, 0),
        appeals_per_10k: Math.round(appealsPer10k * 10) / 10,
        risk_score: score,
        risk_level: districtRiskLevel(score),
        planned: intValue(base.plan_2025) + intValue(base.outside_plan),
        target_2030: intValue(base.target_2030),
        data_completeness: points.length ? "Полные данные" : "",
        risk_reasons: reasons.slice(0, 4),
      };
    })
    .sort((a, b) => b.risk_score - a.risk_score);

  const monthMap = new Map();
  for (const appeal of appeals) {
    const item = monthMap.get(appeal.month_key) || {
      month: appeal.month_key,
      appeals: 0,
      overdue: 0,
    };
    item.appeals += 1;
    item.overdue += appeal.overdue;
    monthMap.set(appeal.month_key, item);
  }

  const topicMap = new Map();
  for (const appeal of appeals) {
    topicMap.set(appeal.topic, (topicMap.get(appeal.topic) || 0) + 1);
  }

  const coverageMap = new Map();
  for (const settlement of settlements) {
    const label = generation(settlement.coverage)
      ? `${generation(settlement.coverage)}G`
      : "Без подтверждённого покрытия";
    coverageMap.set(label, (coverageMap.get(label) || 0) + 1);
  }

  const recommendationDistricts = [...districts].sort(
    (a, b) =>
      Number(b.problem_settlements > 0) - Number(a.problem_settlements > 0) ||
      b.critical_settlements - a.critical_settlements ||
      b.problem_settlements - a.problem_settlements ||
      b.risk_score - a.risk_score,
  );
  const recommendations = recommendationDistricts.slice(0, 12).map((district, index) => {
    const priority = district.risk_level;
    const weakCoverage = Math.max(
      0,
      district.settlements - Math.round((district.four_g_share / 100) * district.settlements),
    );
    const problemPoints = settlements
      .filter((item) => item.district === district.district && item.is_problem)
      .sort((a, b) => b.critical_risk - a.critical_risk);
    const settlementsWithoutAms = problemPoints.filter(
      (item) => intValue(item.tower_count) === 0,
    );
    const lowGeneration = problemPoints.filter(
      (item) => generation(item.coverage) < 4,
    );
    const settlementNames = problemPoints
      .map((item) => item.settlement)
      .join(", ");
    const action =
      district.data_completeness !== "Полные данные"
        ? `Провести инвентаризацию инфраструктуры связи по ${district.district}: уточнить АМС, 4G, ВОЛС и население, затем пересчитать риск.`
        : settlementsWithoutAms.length > 0
        ? `Установить или запланировать ${settlementsWithoutAms.length} АМС в СНП ${settlementsWithoutAms
            .map((item) => item.settlement)
            .join(", ")}; закрепить площадки, балансодержателей и источник финансирования.`
        : lowGeneration.length > 0
          ? `Модернизировать ${Math.max(1, lowGeneration.reduce((sum, item) => sum + Math.max(1, item.tower_count), 0))} АМС до 4G в СНП ${lowGeneration
              .map((item) => item.settlement)
              .join(", ")} и провести контрольный drive-test.`
          : district.problem_settlements > 0
        ? `Провести адресное обследование и контроль сроков по ${district.problem_settlements} проблемным СНП: ${settlementNames}${district.problem_settlements > 4 ? " и др." : ""}.`
        : district.four_g_share < 70
        ? `Сформировать адресный план модернизации ${weakCoverage} СНП до 4G с привязкой к операторам и срокам.`
        : district.broadband_share < 85
          ? "Ускорить подключение оптики/МШПД и проверить устойчивость магистральных каналов."
          : "Провести совместный drive-test операторов по точкам с максимальным числом обращений.";
    return {
      id: `${district.district}-${index}`,
      priority: district.problem_settlements > 0 ? "Высокий" : priority,
      district: district.district,
      title:
        district.problem_settlements > 0
          ? "Приоритетный список проблемных населённых пунктов"
          : priority === "Высокий"
          ? "Требуется управленческое вмешательство"
          : "Нужен превентивный контроль качества",
      rationale: `${district.problem_settlements} проблемных СНП, из них ${district.critical_settlements} совпали с обращениями; ${district.appeals} обращений; индекс риска ${district.risk_score}/100.`,
      settlements: settlementNames || "группа СНП района",
      problem:
        problemPoints.map((item) => item.problem).filter(Boolean).join("; ") ||
        district.risk_reasons.join("; "),
      reason: district.risk_reasons.join("; "),
      action,
      owner: "Управление цифровых технологий + операторы связи",
      horizon: district.problem_settlements > 0 || priority === "Высокий" ? "30 дней" : "90 дней",
      target: `Снять с проблемного списка минимум ${Math.max(1, Math.ceil(district.problem_settlements / 3))} СНП и снизить индекс риска.`,
      expected_effect: `Увеличить доступность 4G, сократить число СНП без АМС и снизить индекс риска района минимум на ${district.problem_settlements > 0 ? 10 : 5} пунктов.`,
      assignee:
        settlementsWithoutAms.length > 0
          ? "Управление цифровизации и районный акимат"
          : "Операторы связи под контролем управления цифровизации",
      decision_group:
        district.critical_settlements > 0
          ? "Критично"
          : district.problem_settlements > 0 &&
              (settlementsWithoutAms.length > 0 ||
                lowGeneration.length >= Math.ceil(problemPoints.length / 2))
            ? "Высокий приоритет"
            : district.problem_settlements > 0 && district.planned > 0
              ? "Быстрый эффект"
              : "Средний приоритет",
    };
  });

  const kpis = {
    settlements: settlements.length,
    population: settlements.reduce((sum, item) => sum + item.population, 0),
    broadband_share: settlements.length
      ? Math.round(
          (settlements.filter((item) => item.broadband).length / settlements.length) *
            1000,
        ) / 10
      : 0,
    four_g_share: settlements.length
      ? Math.round(
          (settlements.filter((item) => item.four_g_count > 0).length /
            settlements.length) *
            1000,
        ) / 10
      : 0,
    appeals: appeals.length,
    high_risk_districts: districts.filter((item) => item.risk_level === "Высокий")
      .length,
    high_risk_settlements: settlements.filter(
      (item) => item.risk_level === "Высокий",
    ).length,
    problem_settlements: settlements.filter((item) => item.is_problem).length,
    critical_settlements: settlements.filter((item) => item.critical_risk).length,
    ams_total:
      intValue(infrastructureAudit.total_ams) ||
      settlements.reduce((sum, item) => sum + intValue(item.tower_count), 0),
    settlements_with_ams:
      intValue(infrastructureAudit.rows_with_ams) ||
      settlements.filter((item) => intValue(item.tower_count) > 0).length,
  };

  return {
    meta: {
      title: "Цифровой радар Актюбинской области",
      generated_at: new Date().toISOString(),
      period: "2025–2026",
      source_mode: sourceMode,
      warnings,
      filter_note:
        "Учтены только обращения по интернету, мобильной/сотовой связи, телекоммуникациям, покрытию и качеству услуг. eGov, ИБ и общая цифровизация исключены.",
      source_tables: [
        "gold.connectivity_points",
        "gold.internet_appeals",
        "gold.district_connectivity",
      ],
    },
    kpis,
    settlements,
    appeals,
    districts,
    tower_points: towerPoints,
    infrastructure_audit: infrastructureAudit,
    problem_settlements: settlements
      .filter((item) => item.is_problem)
      .sort(
        (a, b) =>
          b.critical_risk - a.critical_risk ||
          b.population - a.population ||
          a.district.localeCompare(b.district, "ru"),
      ),
    monthly_trend: [...monthMap.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
    issue_breakdown: [...topicMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    coverage_breakdown: [...coverageMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    recommendations,
  };
}

function main() {
  fs.mkdirSync(derivedDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(backendGeneratedDir, { recursive: true });

  const files = fs.readdirSync(dataDir);
  const csvPath = files.find((file) => file.toLowerCase().endsWith(".csv"));
  const xlsxFiles = files
    .filter((file) => file.toLowerCase().endsWith(".xlsx"))
    .map((file) => ({ file, size: fs.statSync(path.join(dataDir, file)).size }))
    .sort((a, b) => b.size - a.size);
  const supplementalXlsx = xlsxFiles.find((item) =>
    item.file.toLowerCase().includes("новые данные"),
  );
  const primaryXlsx = xlsxFiles.find((item) =>
    item.file.toLowerCase().includes("мшпд"),
  );

  const warnings = [];
  let appeals;
  try {
    if (!csvPath) throw new Error("CSV source not found");
    appeals = parseAppeals(path.join(dataDir, csvPath));
    if (!appeals.length) throw new Error("No relevant appeals after filtering");
  } catch (error) {
    warnings.push(`CSV fallback: ${error.message}`);
    appeals = mockAppeals();
  }

  let infrastructure;
  try {
    if (!primaryXlsx || !supplementalXlsx) {
      throw new Error("Primary MШПД and new district XLSX sources are required");
    }
    infrastructure = parseInfrastructure(
      path.join(dataDir, primaryXlsx.file),
      path.join(dataDir, supplementalXlsx.file),
    );
    if (!infrastructure.settlements.length) {
      throw new Error("No settlement rows found");
    }
  } catch (error) {
    warnings.push(`XLSX fallback: ${error.message}`);
    infrastructure = mockInfrastructure();
  }

  const sourceMode = warnings.length ? "mixed-fallback" : "local-files";
  const payload = buildPayload(
    infrastructure.settlements,
    appeals,
    infrastructure.districtBase,
    infrastructure.towerPoints,
    infrastructure.infrastructureByDistrict,
    infrastructure.infrastructureAudit,
    sourceMode,
    warnings,
  );

  writeText(
    path.join(derivedDir, "gold.connectivity_points.csv"),
    escapeCsvRows(payload.settlements),
  );
  writeText(
    path.join(derivedDir, "gold.internet_appeals.csv"),
    escapeCsvRows(payload.appeals),
  );
  writeText(
    path.join(derivedDir, "gold.district_connectivity.csv"),
    escapeCsvRows(payload.districts),
  );

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  writeText(path.join(publicDir, "dashboard.json"), json);
  writeText(path.join(backendGeneratedDir, "dashboard.json"), json);

  console.log(
    `Prepared ${payload.settlements.length} settlements, ${payload.appeals.length} relevant appeals and ${payload.districts.length} district summaries.`,
  );
  if (warnings.length) console.warn(warnings.join("\n"));
}

main();
