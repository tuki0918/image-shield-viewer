import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { ImageRestorerBrowser } from "./restorer.browser";
import type { ManifestData } from "./types";

const dropAreaStyle: React.CSSProperties = {
  border: "2px dashed #888",
  borderRadius: 8,
  padding: "2em",
  textAlign: "center",
  color: "#888",
  marginBottom: "2em",
  background: "#fff",
};

export const ImageRestorerDemo: React.FC = () => {
  const [restoredUrls, setRestoredUrls] = useState<string[]>([]);
  const [status, setStatus] = useState<string>(
    "画像ファイルとmanifest.jsonをドラッグ＆ドロップしてください (複数画像 + manifest.json)"
  );
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    setRestoredUrls([]);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (!files.length) return;
    const manifestFile: File | undefined = files.find((f: File) => f.name.endsWith("manifest.json"));
    if (!manifestFile) {
      setStatus("manifest.jsonが必要です");
      return;
    }
    const imageFiles: File[] = files.filter((f: File) => f !== manifestFile);
    if (!imageFiles.length) {
      setStatus("画像ファイルが必要です");
      return;
    }
    let manifest: ManifestData;
    try {
      const manifestText = await manifestFile.text();
      manifest = JSON.parse(manifestText);
    } catch (e) {
      setStatus("manifest.jsonのパースに失敗しました");
      return;
    }
    setStatus("復元中...");
    try {
      const restorer = new ImageRestorerBrowser();
      const restoredBlobs = await restorer.restoreImages(imageFiles, manifest);
      const urls = restoredBlobs.map((blob) => URL.createObjectURL(blob));
      setRestoredUrls(urls);
      setStatus("復元完了！もう一度ドロップできます");
    } catch (e) {
      setStatus("復元に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    // FileListをDataTransfer風に変換してhandleDropを呼ぶ
    const dt = new DataTransfer();
    Array.from(e.target.files).forEach((f) => dt.items.add(f as File));
    const fakeEvent = {
      preventDefault: () => {},
      dataTransfer: dt,
    } as unknown as React.DragEvent<HTMLDivElement>;
    await handleDrop(fakeEvent);
  }, [handleDrop]);

  return (
    <div>
      <h1>Image Restorer (Browser Demo)</h1>
      <div
        style={{
          ...dropAreaStyle,
          background: dragOver ? "#eef" : dropAreaStyle.background,
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
      >
        {status}
        <br />
        <input
          type="file"
          multiple
          style={{ display: "none" }}
          ref={inputRef}
          onChange={handleFileInput}
          accept=".json,image/*"
        />
        <div style={{ fontSize: "0.9em", color: "#aaa", marginTop: "1em" }}>
          クリックでファイル選択も可能
        </div>
      </div>
      <div id="images">
        {restoredUrls.map((url, i) => (
          <img key={i} src={url} alt={`restored-${i}`} style={{ maxWidth: 200, margin: 8, border: "1px solid #ccc" }} />
        ))}
      </div>
    </div>
  );
}; 