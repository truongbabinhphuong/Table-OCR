import * as XLSX from "xlsx";
import JSZip from "jszip";
import { ColumnDef, TableRow } from "../types";

/**
 * Export data to an Excel (.xlsx) file
 */
export function exportToExcel(
  columns: ColumnDef[],
  rows: TableRow[],
  filename: string = "extracted_table.xlsx"
) {
  // Construct 2D array of values
  const headerRow = columns.map((c) => c.name);
  const dataRows = rows.map((row) => {
    return columns.map((c) => {
      const val = row[c.key];
      if (val === undefined || val === null) return "";
      return String(val);
    });
  });

  const sheetData = [headerRow, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto column widths
  const colWidths = columns.map((c) => {
    let maxLength = c.name.length;
    for (const row of rows) {
      const cellVal = String(row[c.key] || "");
      if (cellVal.length > maxLength) {
        maxLength = cellVal.length;
      }
    }
    return { wch: Math.min(60, Math.max(12, maxLength + 3)) };
  });
  worksheet["!cols"] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dữ liệu OCR");

  // Generate binary and trigger download
  const cleanFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanFilename);
}

/**
 * Export multiple file results into a single Excel (.xlsx) workbook with multiple sheets
 */
export function exportMultiSheetExcel(
  fileResults: Array<{
    fileName: string;
    sheetName?: string;
    columns: ColumnDef[];
    rows: TableRow[];
  }>,
  filename: string = "ket_qua_hang_loat.xlsx"
) {
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  fileResults.forEach((item, idx) => {
    const rawName = (item.sheetName || item.fileName.replace(/\.[^/.]+$/, "") || `File ${idx + 1}`)
      .replace(/[\\/?*[\]:]/g, "_")
      .trim()
      .substring(0, 28); // Excel sheet names max 31 chars

    let uniqueSheetName = rawName || `Sheet${idx + 1}`;
    let counter = 1;
    while (usedSheetNames.has(uniqueSheetName)) {
      uniqueSheetName = `${rawName.substring(0, 25)}_${counter++}`;
    }
    usedSheetNames.add(uniqueSheetName);

    const headerRow = item.columns.map((c) => c.name);
    const dataRows = item.rows.map((row) => {
      return item.columns.map((c) => {
        const val = row[c.key];
        if (val === undefined || val === null) return "";
        return String(val);
      });
    });

    const sheetData = [headerRow, ...dataRows];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Auto column widths
    const colWidths = item.columns.map((c) => {
      let maxLength = c.name.length;
      for (const row of item.rows) {
        const cellVal = String(row[c.key] || "");
        if (cellVal.length > maxLength) {
          maxLength = cellVal.length;
        }
      }
      return { wch: Math.min(60, Math.max(12, maxLength + 3)) };
    });
    worksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, uniqueSheetName);
  });

  const cleanFilename = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanFilename);
}

/**
 * Export multiple file results as a ZIP archive containing separate .xlsx or .csv files
 */
export async function exportZipFiles(
  fileResults: Array<{
    fileName: string;
    columns: ColumnDef[];
    rows: TableRow[];
  }>,
  zipFilename: string = "ket_qua_ocr_hang_loat.zip",
  format: "xlsx" | "csv" = "xlsx"
) {
  const zip = new JSZip();

  for (let i = 0; i < fileResults.length; i++) {
    const item = fileResults[i];
    const baseName = item.fileName.replace(/\.[^/.]+$/, "") || `file_${i + 1}`;

    if (format === "xlsx") {
      const headerRow = item.columns.map((c) => c.name);
      const dataRows = item.rows.map((row) => {
        return item.columns.map((c) => {
          const val = row[c.key];
          if (val === undefined || val === null) return "";
          return String(val);
        });
      });

      const sheetData = [headerRow, ...dataRows];
      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Dữ liệu OCR");

      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      zip.file(`${baseName}.xlsx`, excelBuffer);
    } else {
      const headerRow = item.columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
      const dataRows = item.rows.map((row) => {
        return item.columns
          .map((c) => {
            const val = row[c.key];
            if (val === undefined || val === null) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(",");
      });

      const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
      zip.file(`${baseName}.csv`, csvContent);
    }
  }

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", zipFilename.endsWith(".zip") ? zipFilename : `${zipFilename}.zip`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export data to CSV with UTF-8 BOM for perfect Vietnamese support in MS Excel
 */
export function exportToCSV(
  columns: ColumnDef[],
  rows: TableRow[],
  filename: string = "extracted_table.csv"
) {
  const headerRow = columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
  const dataRows = rows.map((row) => {
    return columns
      .map((c) => {
        const val = row[c.key];
        if (val === undefined || val === null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",");
  });

  // \uFEFF is the UTF-8 BOM so Excel opens Vietnamese characters correctly
  const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copy table data formatted for spreadsheet paste (TSV format)
 */
export async function copyTableToClipboard(
  columns: ColumnDef[],
  rows: TableRow[]
): Promise<boolean> {
  try {
    const headerRow = columns.map((c) => c.name).join("\t");
    const dataRows = rows.map((row) => {
      return columns
        .map((c) => {
          const val = row[c.key];
          if (val === undefined || val === null) return "";
          return String(val).replace(/[\t\n\r]/g, " ");
        })
        .join("\t");
    });

    const tsvContent = [headerRow, ...dataRows].join("\n");
    await navigator.clipboard.writeText(tsvContent);
    return true;
  } catch (err) {
    console.error("Clipboard copy error:", err);
    return false;
  }
}
