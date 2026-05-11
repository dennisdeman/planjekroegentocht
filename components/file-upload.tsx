"use client";

import { useRef, useState } from "react";
import { read, utils } from "xlsx";

interface FileUploadProps {
  /** Called with the raw CSV text after reading a file (CSV or converted from Excel). */
  onFileLoaded: (csvText: string, fileName: string) => void;
}

function excelToCsv(buffer: ArrayBuffer): string {
  const workbook = read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return "";
  return utils.sheet_to_csv(firstSheet, { FS: ";" });
}

const ACCEPT = ".csv,.tsv,.txt,.xls,.xlsx,.ods";

export function FileUpload({ onFileLoaded }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function processFile(file: File) {
    setError(null);
    setFileName(file.name);
    const isExcel = /\.(xlsx?|ods)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const csv = excelToCsv(reader.result as ArrayBuffer);
          if (!csv.trim()) {
            setError("Het bestand lijkt leeg te zijn.");
            return;
          }
          onFileLoaded(csv, file.name);
        } catch {
          setError("Kon Excel-bestand niet lezen. Controleer het formaat.");
        }
      };
      reader.onerror = () => setError("Bestand lezen mislukt.");
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        if (!text.trim()) {
          setError("Het bestand lijkt leeg te zijn.");
          return;
        }
        onFileLoaded(text, file.name);
      };
      reader.onerror = () => setError("Bestand lezen mislukt.");
      reader.readAsText(file);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--brand)" : "var(--line)"}`,
          borderRadius: 12,
          padding: "20px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "rgba(15, 108, 115, 0.04)" : "rgba(255, 255, 255, 0.5)",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
          {fileName ?? "Kies een bestand of sleep het hierheen"}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
          CSV, Excel (.xlsx/.xls), of tab-gescheiden (.tsv)
        </p>
      </div>
      {error && <p className="error-text" style={{ marginTop: 6, fontSize: "0.88rem" }}>{error}</p>}
    </div>
  );
}
