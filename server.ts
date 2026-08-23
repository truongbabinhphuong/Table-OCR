import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

// Set high limits for image base64 payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy/Safe initialization for Gemini API
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper for robust Gemini generation with retry and fallback across models
// Models prioritized by lowest congestion and highest throughput for document OCR
const AVAILABLE_GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3.7-flash",
];

async function generateContentWithRetry(
  ai: GoogleGenAI,
  requestParams: {
    contents: any;
    config: any;
  },
  models: string[] = AVAILABLE_GEMINI_MODELS
) {
  let lastError: any = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: requestParams.contents,
        config: requestParams.config,
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
      console.warn(
        `[Gemini Fallback] Model ${model} returned error (${errMsg.slice(0, 100)}). Switching to next model...`
      );
      // Brief pause before trying the next alternative model
      if (i < models.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  throw lastError;
}

function formatErrorMessage(error: any): string {
  if (!error) return "Đã xảy ra lỗi không xác định";
  let msg = error.message || (typeof error === "object" ? JSON.stringify(error) : String(error));

  // Extract inner message if JSON string
  try {
    const jsonMatch = msg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error?.message) {
        msg = parsed.error.message;
      }
    }
  } catch (_) {}

  if (msg.includes("high demand") || msg.includes("503") || msg.includes("UNAVAILABLE")) {
    return "Hệ thống AI đang chịu tải cao tạm thời (503). Vui lòng thử lại sau vài giây.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return "Hệ thống AI đang đạt giới hạn tần suất yêu cầu (429). Vui lòng đợi 5-10 giây rồi thử lại.";
  }
  return msg;
}

// Generates simulated fallback table rows when upstream AI servers are totally unavailable
function generateSmartFallbackRows(columns: any[]): any[] {
  return [
    columns.reduce((acc, col, idx) => {
      const key = col.key || col.name;
      if (col.type === "number" || key.toLowerCase().includes("stt")) acc[key] = "1";
      else if (col.type === "currency" || key.toLowerCase().includes("gia") || key.toLowerCase().includes("tien")) acc[key] = "1.500.000";
      else if (key.toLowerCase().includes("dvt")) acc[key] = "Bộ";
      else if (key.toLowerCase().includes("ten") || key.toLowerCase().includes("noidung")) acc[key] = "Hàng hóa / Dịch vụ mẫu 01";
      else if (col.type === "code" || key.toLowerCase().includes("ma")) acc[key] = "SP-001";
      else if (col.type === "date") acc[key] = "20/08/2025";
      else acc[key] = `Giá trị mẫu ${idx + 1}`;
      return acc;
    }, {} as Record<string, string>),
    columns.reduce((acc, col, idx) => {
      const key = col.key || col.name;
      if (col.type === "number" || key.toLowerCase().includes("stt")) acc[key] = "2";
      else if (col.type === "currency" || key.toLowerCase().includes("gia") || key.toLowerCase().includes("tien")) acc[key] = "2.800.000";
      else if (key.toLowerCase().includes("dvt")) acc[key] = "Cái";
      else if (key.toLowerCase().includes("ten") || key.toLowerCase().includes("noidung")) acc[key] = "Hàng hóa / Dịch vụ mẫu 02";
      else if (col.type === "code" || key.toLowerCase().includes("ma")) acc[key] = "SP-002";
      else if (col.type === "date") acc[key] = "21/08/2025";
      else acc[key] = `Giá trị mẫu ${idx + 1}`;
      return acc;
    }, {} as Record<string, string>),
  ];
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API: Extract Table Data from Cropped Image Area
app.post("/api/ocr/extract-table", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png", columns, options = {} } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Thiếu dữ liệu ảnh vùng quét (imageBase64)" });
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: "Cần khai báo danh sách cột để trích xuất" });
    }

    const ai = getGeminiClient();

    // Clean base64 string if data URL prefix exists
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");

    const columnsPromptList = columns
      .map((col: { name: string; key?: string; description?: string; type?: string }, idx: number) => {
        return `${idx + 1}. Column Name: "${col.name}" (Key: "${col.key || col.name}"${col.type ? `, Expected Type: ${col.type}` : ""}${col.description ? `, Note: ${col.description}` : ""})`;
      })
      .join("\n");

    const systemPrompt = `You are a high-precision Optical Character Recognition (OCR) and document intelligence specialist for Vietnamese and multilingual tabular documents.
Your mission is to extract EVERY SINGLE DATA ROW in the table from the provided scanned document crop with 100% completeness and fidelity to the original text.

CRITICAL RULES:
1. EXTRACT ALL ROWS COMPLETELY: Scan the entire table from top to bottom. Do NOT omit, skip, or summarize any rows. Extract every line item, product row, transaction row, subtotal row, or note row that appears in the table.
2. VIETNAMESE ACCURACY: Transcribe Vietnamese diacritics with extreme precision (e.g., â, ă, ê, ô, ơ, ư, đ, á, à, ả, ã, ạ, ắ, ằ, ẳ, ẵ, ặ, ấ, ầ, ẩ, ẫ, ậ, ế, ề, ể, ễ, ệ, tố, tờ, v.v.). Never strip accents or guess different spellings.
3. NO DATA CHANGE / VERBATIM EXTRACTION: Do NOT alter, summarize, calculate, round, or correct numbers, dates, codes, or text. Copy exact characters, digits, punctuation, currency symbols (₫, VNĐ, VND, $), percentages, decimal separators (dots/commas), and serial numbers.
4. COLUMN MAPPING: Map the extracted table cells strictly to the user-defined columns:
${columnsPromptList}
5. EMPTY CELLS: If a cell is empty or merged across rows, use an empty string "" (or omit content, not fake data).
6. MULTI-ROW / WRAPPED TEXT: If text in a single logical table row is wrapped onto multiple visual lines inside a cell, merge it with a single space into that cell.
7. OUTPUT FORMAT: Return a valid, clean JSON object matching this exact schema:
{
  "rows": [
    {
      "${columns[0]?.key || columns[0]?.name || "col1"}": "Exact extracted text",
      ...
    }
  ],
  "rowCount": number,
  "notes": "Any brief OCR observations (e.g. low resolution, blurred stamps)"
}

Do not enclose the JSON in markdown code fences other than standard json or plain JSON string. Return valid JSON only.`;

    const userPrompt = `Thoroughly scan the entire image from the top row to the bottom row of the table. Extract 100% of all data rows into the defined columns without missing any row.
Columns to extract:
${columns.map((c: any) => `"${c.name}"`).join(", ")}

Ensure Vietnamese characters and numbers are transcribed with 100% accuracy without modifying any values.`;

    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: cleanBase64,
            },
          },
          {
            text: userPrompt,
          },
        ],
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        temperature: 0.1, // Low temperature for high OCR fidelity
      },
    });

    const responseText = response.text || "{}";
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseErr) {
      // If there's markdown wrapper
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Không thể phân tích định dạng JSON từ kết quả nhận diện AI.");
      }
    }

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error("OCR Extraction Error:", error);
    const friendlyMsg = formatErrorMessage(error);
    const isTransientOverload =
      friendlyMsg.includes("503") ||
      friendlyMsg.includes("429") ||
      friendlyMsg.includes("quá tải") ||
      friendlyMsg.includes("giới hạn");

    if (isTransientOverload && req.body?.columns) {
      console.warn("Returning smart fallback table rows due to AI temporary overload");
      const fallbackRows = generateSmartFallbackRows(req.body.columns);
      return res.json({
        success: true,
        isFallback: true,
        data: {
          rows: fallbackRows,
          rowCount: fallbackRows.length,
          notes: "Chế độ nhận diện dự phòng (máy chủ AI đang chịu tải cao)",
        },
        message: "Máy chủ AI đang chịu tải tạm thời (503). Đã tạo cấu trúc dòng dự phòng để bạn chỉnh sửa hoặc thử quét lại sau ít phút.",
      });
    }

    res.status(500).json({
      error: friendlyMsg,
    });
  }
});

// API: Auto-detect columns from a selected table crop or document page
app.post("/api/ocr/detect-columns", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Thiếu dữ liệu ảnh (imageBase64)" });
    }

    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");

    const prompt = `You are a high-precision document AI specialist for Vietnamese table layout and structure analysis.
Carefully analyze this scanned table snippet, specifically scanning the TABLE TITLE / HEADER ROW and the FIRST DATA ROW immediately underneath it.

Instructions:
1. Scan the Table Title / Header Row to identify all column names in order from left to right.
   - Preserve exact Vietnamese diacritics (e.g., "STT", "Mã hàng", "Tên hàng hóa, quy cách", "Đơn vị tính", "Số lượng", "Đơn giá", "Thành tiền", "Ngày tháng", "Ghi chú").
2. Scan the FIRST DATA ROW to inspect real values and infer the accurate data type for each column:
   - "text": for names, descriptions, notes, addresses
   - "number": for integer quantities, counts, index
   - "currency": for monetary amounts, unit prices, total values with decimal/thousands separators (e.g., 50.000, 1.200.000 VNĐ)
   - "date": for date formats (dd/mm/yyyy, yyyy-mm-dd)
   - "code": for product codes, invoice numbers, tax IDs, SKUs (e.g., SP-001, HD1234)
3. For each column, include the real sample value read from the first data row in "sample".
4. Generate a clean, unique camelCase alphanumeric key for each column.

Return clean JSON in this format:
{
  "detectedColumns": [
    {
      "name": "STT",
      "key": "stt",
      "type": "number",
      "sample": "1"
    },
    {
      "name": "Tên hàng hóa, dịch vụ",
      "key": "tenHangHoa",
      "type": "text",
      "sample": "Cà phê Robusta Đắk Lắk"
    },
    {
      "name": "Đơn vị tính",
      "key": "dvt",
      "type": "text",
      "sample": "Kg"
    },
    {
      "name": "Số lượng",
      "key": "soLuong",
      "type": "number",
      "sample": "50"
    },
    {
      "name": "Đơn giá",
      "key": "donGia",
      "type": "currency",
      "sample": "85.000"
    },
    {
      "name": "Thành tiền",
      "key": "thanhTien",
      "type": "currency",
      "sample": "4.250.000"
    }
  ],
  "documentType": "Hóa đơn / Bảng kê / Bảng lương / Bảng điểm / Phiếu kho / Khác",
  "titleRowFound": true,
  "firstDataRowFound": true
}`;

    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error("Detect Columns Error:", error);
    const friendlyMsg = formatErrorMessage(error);
    const isTransientOverload =
      friendlyMsg.includes("503") ||
      friendlyMsg.includes("429") ||
      friendlyMsg.includes("quá tải") ||
      friendlyMsg.includes("giới hạn");

    if (isTransientOverload) {
      console.warn("Returning default Vietnamese columns due to AI temporary overload");
      return res.json({
        success: true,
        isFallback: true,
        data: {
          detectedColumns: [
            { name: "STT", key: "stt", type: "number" },
            { name: "Tên hàng hóa, quy cách", key: "tenHangHoa", type: "text" },
            { name: "Đơn vị tính", key: "dvt", type: "text" },
            { name: "Số lượng", key: "soLuong", type: "number" },
            { name: "Đơn giá", key: "donGia", type: "currency" },
            { name: "Thành tiền", key: "thanhTien", type: "currency" },
            { name: "Ghi chú", key: "ghiChu", type: "text" },
          ],
          documentType: "Invoice / General Table",
        },
        message: "Máy chủ AI đang chịu tải tạm thời (503). Đã áp dụng mẫu cột chuẩn tiếng Việt.",
      });
    }

    res.status(500).json({
      error: friendlyMsg,
    });
  }
});

// API: Detect Bounding Box of Table in a Document Page (0-1000 normalized or percentage)
app.post("/api/ocr/detect-table-box", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Thiếu dữ liệu ảnh (imageBase64)" });
    }

    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");

    const prompt = `You are a computer vision specialist analyzing document layout.
Identify the ENTIRE bounding box of the main data table in this page.
The table box must include:
- The top table column header row (e.g. STT, Tên hàng, Số lượng, Đơn giá, Thành tiền)
- ALL data rows from top to bottom
- Any sub-total or summary rows belonging to the bottom of the table
- From the leftmost column border to the rightmost column border

Exclude unrelated page elements (e.g., top company letterhead logos, document headers/titles, footer signatures/stamps at the very bottom of the page) unless they are part of the table grid.

Return coordinates normalized to percentages (0 to 100) or normalized [ymin, xmin, ymax, xmax] on a scale of 0 to 1000:
{
  "ymin": number (0-1000, top edge of table),
  "xmin": number (0-1000, left edge of table),
  "ymax": number (0-1000, bottom edge of table),
  "xmax": number (0-1000, right edge of table),
  "confidence": number,
  "hasTable": boolean
}`;

    const response = await generateContentWithRetry(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error("Detect Table Box Error:", error);
    const friendlyMsg = formatErrorMessage(error);
    res.status(500).json({
      error: friendlyMsg,
    });
  }
});

// Setup Vite middleware for dev or static serving in prod
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VietTable OCR server running on http://localhost:${PORT}`);
  });
}

startServer();
