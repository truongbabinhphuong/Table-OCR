import * as pdfjsLib from "pdfjs-dist";
import { DocumentPage } from "../types";

// Configure pdfjs worker safely
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || "4.10.38"}/pdf.worker.min.mjs`;
} catch (e) {
  console.warn("Could not set external PDF worker, continuing with standard worker if available", e);
}

/**
 * Loads a PDF file and renders each page to a high-resolution data URL image
 */
export async function loadPdfPages(file: File): Promise<DocumentPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
    cMapPacked: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pages: DocumentPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    // Render at 2.0 scale for crisp OCR text recognition
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (context) {
      // White background
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      // @ts-ignore
      await page.render(renderContext).promise;
      const imageUrl = canvas.toDataURL("image/png", 0.95);

      pages.push({
        pageNumber: pageNum,
        imageUrl,
        width: viewport.width,
        height: viewport.height,
        originalWidth: viewport.width / 2.0,
        originalHeight: viewport.height / 2.0,
      });
    }
  }

  return pages;
}

/**
 * Loads an image file as a DocumentPage
 */
export async function loadImagePage(file: File): Promise<DocumentPage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          pageNumber: 1,
          imageUrl: img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          originalWidth: img.naturalWidth,
          originalHeight: img.naturalHeight,
        });
      };
      img.onerror = () => reject(new Error("Không thể tải hình ảnh"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Lỗi khi đọc file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Crops a specific region from a page image URL
 */
export async function cropImageArea(
  pageImageUrl: string,
  crop: { x: number; y: number; width: number; height: number },
  displayDim: { width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;

      // Scale crop relative to natural dimensions
      const scaleX = naturalW / displayDim.width;
      const scaleY = naturalH / displayDim.height;

      const cropX = Math.max(0, crop.x * scaleX);
      const cropY = Math.max(0, crop.y * scaleY);
      const cropW = Math.min(naturalW - cropX, crop.width * scaleX);
      const cropH = Math.min(naturalH - cropY, crop.height * scaleY);

      // Cap max dimension to 1600px to maintain high OCR clarity without unnecessary payload bloat
      let targetW = Math.max(10, Math.round(cropW));
      let targetH = Math.max(10, Math.round(cropH));
      const maxDim = 1600;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return reject(new Error("Canvas context is unavailable"));
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(
        img,
        cropX,
        cropY,
        cropW,
        cropH,
        0,
        0,
        targetW,
        targetH
      );

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Không thể tải ảnh để cắt vùng"));
    img.src = pageImageUrl;
  });
}

/**
 * Generates a realistic scanned Vietnamese Document with tabular data for immediate testing
 */
export function generateSampleDocument(type: "invoice" | "inventory" | "payroll"): DocumentPage[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  // A4 ratio high res (1654 x 2338 ~ 200 DPI)
  canvas.width = 1654;
  canvas.height = 2338;

  // Background scanned paper texture (slight warm off-white)
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle paper noise / grain
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 8;
    imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + noise));
    imgData.data[i + 1] = Math.min(255, Math.max(0, imgData.data[i + 1] + noise));
    imgData.data[i + 2] = Math.min(255, Math.max(0, imgData.data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  // Slight margin box
  ctx.save();
  ctx.translate(20, 20);

  if (type === "invoice") {
    renderSampleInvoice(ctx);
  } else if (type === "inventory") {
    renderSampleInventory(ctx);
  } else {
    renderSamplePayroll(ctx);
  }

  ctx.restore();

  const imageUrl = canvas.toDataURL("image/png", 0.95);

  return [
    {
      pageNumber: 1,
      imageUrl,
      width: canvas.width,
      height: canvas.height,
      originalWidth: canvas.width / 2,
      originalHeight: canvas.height / 2,
    },
  ];
}

function renderSampleInvoice(ctx: CanvasRenderingContext2D) {
  // Header
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HÓA ĐƠN GIÁ TRỊ GIA TĂNG (BẢN THỂ HIỆN HÓA ĐƠN ĐIỆN TỬ)", 800, 100);

  ctx.font = "italic 22px sans-serif";
  ctx.fillText("Ngày 15 tháng 08 năm 2026 - Ký hiệu: 1C26TAD - Số: 0004829", 800, 140);

  // Company info
  ctx.textAlign = "left";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("Đơn vị bán hàng: CÔNG TY TNHH GIẢI PHÁP CÔNG NGHỆ ÁNH DƯƠNG", 100, 220);
  ctx.font = "20px sans-serif";
  ctx.fillText("Mã số thuế: 0314892716 | Điện thoại: (028) 3822 9988", 100, 260);
  ctx.fillText("Địa chỉ: Tầng 8, Tòa nhà Bitexco Financial, 02 Hải Triều, Q.1, TP. Hồ Chí Minh", 100, 295);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(100, 325);
  ctx.lineTo(1514, 325);
  ctx.stroke();

  // Buyer info
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("Họ tên người mua hàng: Ông Hoàng Quốc Bảo", 100, 370);
  ctx.font = "20px sans-serif";
  ctx.fillText("Tên đơn vị: CÔNG TY CỔ PHẦN THƯƠNG MẠI & ĐẦU TƯ NAM Á", 100, 405);
  ctx.fillText("Mã số thuế: 0109283745 | Hình thức thanh toán: Chuyển khoản (TM/CK)", 100, 440);
  ctx.fillText("Địa chỉ: Số 45 Trần Hưng Đạo, Phường Phan Chu Trinh, Quận Hoàn Kiếm, TP. Hà Nội", 100, 475);

  // Table bounding box
  const startX = 100;
  const startY = 530;
  const colWidths = [80, 520, 120, 140, 240, 314];
  const colNames = ["STT", "Tên hàng hóa, dịch vụ", "ĐVT", "Số lượng", "Đơn giá (VNĐ)", "Thành tiền (VNĐ)"];
  const rows = [
    ["1", "Laptop Dell Vostro 5410 Core i7-11370H / 16GB / 512GB SSD", "Chiếc", "5", "21.500.000", "107.500.000"],
    ["2", "Màn hình chuyên đồ họa LG UltraFine 27UP850 4K IPS Type-C", "Cái", "10", "8.900.000", "89.000.000"],
    ["3", "Chuột không dây công thái học Logitech MX Master 3S For Mac", "Con", "15", "2.250.000", "33.750.000"],
    ["4", "Bàn phím cơ không dây Keychron K2 Pro QMK/VIA Hot-swap", "Cái", "15", "2.450.000", "36.750.000"],
    ["5", "Bộ mở rộng cổng Hub HyperDrive 10-in-1 Dual 4K HDMI Type-C", "Chiếc", "8", "1.850.000", "14.800.000"],
    ["6", "Dịch vụ triển khai, cấu hình máy trạm và cài đặt bản quyền", "Gói", "1", "12.000.000", "12.000.000"],
  ];

  drawTable(ctx, startX, startY, colWidths, colNames, rows);

  // Table summary
  const tableBottomY = startY + 50 + rows.length * 60;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Cộng tiền hàng (chưa thuế):", 1100, tableBottomY + 40);
  ctx.fillText("293.800.000 VNĐ", 1500, tableBottomY + 40);

  ctx.fillText("Thuế suất GTGT (10%):", 1100, tableBottomY + 80);
  ctx.fillText("29.380.000 VNĐ", 1500, tableBottomY + 80);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("TỔNG CỘNG THANH TOÁN:", 1100, tableBottomY + 130);
  ctx.fillText("323.180.000 VNĐ", 1500, tableBottomY + 130);

  ctx.textAlign = "left";
  ctx.font = "italic 22px sans-serif";
  ctx.fillText("Số tiền bằng chữ: Ba trăm hai mươi ba triệu một trăm tám mươi nghìn đồng chẵn.", 100, tableBottomY + 175);

  // Signatures
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("NGƯỜI MUA HÀNG", 350, tableBottomY + 250);
  ctx.font = "italic 18px sans-serif";
  ctx.fillText("(Ký, ghi rõ họ tên)", 350, tableBottomY + 280);

  ctx.font = "bold 22px sans-serif";
  ctx.fillText("NGƯỜI BÁN HÀNG / THỦ TRƯỞNG ĐƠN VỊ", 1250, tableBottomY + 250);
  ctx.font = "italic 18px sans-serif";
  ctx.fillText("(Ký, đóng dấu điện tử)", 1250, tableBottomY + 280);

  // Simulated digital signature badge
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 2;
  ctx.strokeRect(1100, tableBottomY + 310, 300, 100);
  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("ĐÃ KÝ ĐIỆN TỬ BỞI:", 1250, tableBottomY + 340);
  ctx.font = "16px sans-serif";
  ctx.fillText("CÔNG TY TNHH ÁNH DƯƠNG", 1250, tableBottomY + 365);
  ctx.fillText("Ngày ký: 15/08/2026 14:28:10", 1250, tableBottomY + 390);
}

function renderSampleInventory(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 38px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BẢNG KÊ CHI TIẾT VẬT TƯ & HÀNG HÓA TỒN KHO", 800, 100);
  ctx.font = "italic 22px sans-serif";
  ctx.fillText("Kỳ báo cáo: Tháng 08/2026 - Kho trung tâm: Tân Bình Industrial Zone", 800, 140);

  const startX = 100;
  const startY = 220;
  const colWidths = [70, 180, 434, 90, 140, 150, 150, 200];
  const colNames = ["STT", "Mã vật tư", "Tên quy cách vật tư", "ĐVT", "Tồn đầu", "Nhập kỳ", "Xuất kỳ", "Tồn cuối kỳ"];
  const rows = [
    ["1", "VT-XM-001", "Xi măng Portland hỗn hợp PCB40 Bao 50kg Hà Tiên", "Bao", "450", "1.200", "980", "670"],
    ["2", "VT-TH-012", "Thép cuộn xây dựng CB240T phi 6 Hòa Phát", "Tấn", "18.5", "45.0", "38.2", "25.3"],
    ["3", "VT-CT-005", "Cát vàng sàng lọc hạt lớn đổ bê tông Tân Châu", "m³", "120", "350", "310", "160"],
    ["4", "VT-DA-008", "Đá 1x2 xanh khai thác mỏ Biên Hòa tuyển rửa", "m³", "95", "280", "260", "115"],
    ["5", "VT-GO-021", "Gạch tuynel 4 lỗ kích thước 8x8x18 Bình Dương", "Viên", "25.000", "80.000", "72.500", "32.500"],
    ["6", "VT-SN-034", "Sơn lót chống kiềm ngoại thất Dulux WeatherShield 18L", "Thùng", "35", "90", "78", "47"],
    ["7", "VT-SN-035", "Sơn phủ bóng cao cấp nội thất Maxilite Total 18L", "Thùng", "50", "120", "105", "65"],
    ["8", "VT-OC-102", "Ống nhựa uPVC Tiền Phong D110 x 3.2mm Class 2", "Cây", "80", "200", "175", "105"],
  ];

  drawTable(ctx, startX, startY, colWidths, colNames, rows);
}

function renderSamplePayroll(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BẢNG THANH TOÁN TIỀN LƯƠNG VÀ PHỤ CẤP THÁNG 08/2026", 800, 100);
  ctx.font = "italic 22px sans-serif";
  ctx.fillText("Đơn vị: CÔNG TY CỔ PHẦN PHẦN MỀM SAO VIỆT - Khối Công nghệ & Sản phẩm", 800, 140);

  const startX = 80;
  const startY = 220;
  const colWidths = [60, 120, 320, 214, 180, 160, 120, 280];
  const colNames = ["STT", "Mã NV", "Họ và tên", "Chức vụ", "Lương CB", "Phụ cấp", "Công", "Thực lĩnh (VNĐ)"];
  const rows = [
    ["1", "NV001", "Nguyễn Văn Hùng", "Giám đốc Kỹ thuật (CTO)", "45.000.000", "5.000.000", "22", "45.850.000"],
    ["2", "NV002", "Trần Thị Mai Phương", "Trưởng nhóm AI Research", "32.000.000", "3.500.000", "22", "32.400.000"],
    ["3", "NV003", "Lê Hoàng Nam", "Kỹ sư Fullstack Senior", "28.000.000", "2.500.000", "21.5", "27.800.000"],
    ["4", "NV004", "Phạm Quốc Cường", "Kỹ sư DevOps & Cloud", "26.000.000", "2.000.000", "22", "25.750.000"],
    ["5", "NV005", "Đỗ Thị Thu Trang", "Chuyên viên UX/UI Designer", "22.000.000", "2.000.000", "22", "21.900.000"],
    ["6", "NV006", "Vũ Đức Minh", "Kỹ sư Frontend React", "18.000.000", "1.500.000", "20", "17.650.000"],
  ];

  drawTable(ctx, startX, startY, colWidths, colNames, rows);
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  colWidths: number[],
  colNames: string[],
  rows: string[][]
) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerHeight = 55;
  const rowHeight = 55;

  // Header background
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(startX, startY, totalWidth, headerHeight);

  // Header border & text
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, totalWidth, headerHeight);

  let curX = startX;
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";

  for (let i = 0; i < colNames.length; i++) {
    const w = colWidths[i];
    ctx.strokeRect(curX, startY, w, headerHeight);
    ctx.fillText(colNames[i], curX + w / 2, startY + 35);
    curX += w;
  }

  // Rows
  for (let r = 0; r < rows.length; r++) {
    const rowY = startY + headerHeight + r * rowHeight;
    const isEven = r % 2 === 0;

    ctx.fillStyle = isEven ? "#ffffff" : "#f8fafc";
    ctx.fillRect(startX, rowY, totalWidth, rowHeight);

    curX = startX;
    const rowData = rows[r];

    for (let c = 0; c < colWidths.length; c++) {
      const w = colWidths[c];
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1;
      ctx.strokeRect(curX, rowY, w, rowHeight);

      const cellText = rowData[c] || "";
      ctx.fillStyle = "#1e293b";
      ctx.font = "20px sans-serif";

      // Align numbers right, text left, STT/codes center
      if (c === 0 || c === 1 || c === 3) {
        ctx.textAlign = "center";
        ctx.fillText(cellText, curX + w / 2, rowY + 35);
      } else if (c >= colWidths.length - 2) {
        ctx.textAlign = "right";
        ctx.fillText(cellText, curX + w - 15, rowY + 35);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(cellText, curX + 15, rowY + 35);
      }

      curX += w;
    }
  }
}
