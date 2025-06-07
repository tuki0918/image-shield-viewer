import * as React from "react";
import { useCallback, useRef, useState } from "react";
import { ImageRestorerBrowser } from "./restorer.browser";
import type { ManifestData } from "./types";
import { verifySecretKey, generateFragmentFileName } from "./utils/helpers";
import JSZip from "jszip";

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
  const [restoredBlobs, setRestoredBlobs] = useState<Blob[]>([]);
  const [status, setStatus] = useState<string>(
    "画像ファイルとmanifest.jsonを一緒にドラッグ＆ドロップしてください (複数画像 + manifest.json)"
  );
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [secretKey, setSecretKey] = useState("");
  const [requireSecret, setRequireSecret] = useState(false);
  const [manifestCache, setManifestCache] = useState<ManifestData | null>(null);
  const [imageFilesCache, setImageFilesCache] = useState<File[] | null>(null);
  const [manifestInfo, setManifestInfo] = useState<ManifestData | null>(null);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    setRestoredUrls([]);
    setRestoredBlobs([]);
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
      setManifestInfo(manifest);
    } catch (e) {
      setStatus("manifest.jsonのパースに失敗しました");
      return;
    }
    // 暗号化対応: secretKey 入力を促す
    if (manifest.secure) {
      setRequireSecret(true);
      setManifestCache(manifest);
      setImageFilesCache(imageFiles);
      setManifestInfo(manifest);
      setStatus("この画像は暗号化されています。復号キーを入力してください。");
      return;
    }
    setStatus("復元中...");
    try {
      const restorer = new ImageRestorerBrowser();
      const restoredBlobs = await restorer.restoreImages(imageFiles, manifest);
      const urls = restoredBlobs.map((blob) => URL.createObjectURL(blob));
      setRestoredUrls(urls);
      setRestoredBlobs(restoredBlobs);
      setStatus("復元完了！");
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

  // 暗号化画像用: secretKey 入力後の復元処理
  const handleSecretSubmit = useCallback(async () => {
    if (!manifestCache || !imageFilesCache) return;
    if (!secretKey) {
      setStatus("復号キーを入力してください");
      return;
    }
    setStatus("復元中...");
    setRequireSecret(false);
    try {
      const restorer = new ImageRestorerBrowser(verifySecretKey(secretKey));
      const restoredBlobs = await restorer.restoreImages(imageFilesCache, manifestCache);
      const urls = restoredBlobs.map((blob) => URL.createObjectURL(blob));
      setRestoredUrls(urls);
      setRestoredBlobs(restoredBlobs);
      setManifestInfo(manifestCache);
      setStatus("復元完了！もう一度ドロップできます");
    } catch (e) {
      setStatus("復元に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    }
    setSecretKey("");
    setManifestCache(null);
    setImageFilesCache(null);
  }, [secretKey, manifestCache, imageFilesCache]);

  // ファイル名生成の共通関数
  const getRestoredFileName = (i: number) => {
    if (!manifestInfo) return `restored-${i + 1}.png`;
    const prefix = manifestInfo.config.prefix || "fragment";
    return generateFragmentFileName(prefix, i, restoredUrls.length, "png");
  };

  return (
    <div>
      <h1>Image Restorer (Demo)</h1>
      {requireSecret && (
        <div style={{ margin: "1em 0", padding: "1em", border: "1px solid #ccc", borderRadius: 8, background: "#fffbe6" }}>
          <div>復号キー（secretKey）を入力してください:</div>
          <input
            type="password"
            value={secretKey}
            onChange={e => setSecretKey(e.target.value)}
            style={{ margin: "0.5em 0", padding: "0.5em", width: 200 }}
          />
          <button onClick={handleSecretSubmit} style={{ marginLeft: 8 }}>復元</button>
        </div>
      )}
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
          accept=".json,image/*,.enc"
        />
        <div style={{ fontSize: "0.9em", color: "#aaa", marginTop: "1em" }}>
          クリックでファイル選択も可能
        </div>
      </div>
      <div id="images">
        {restoredUrls.map((url, i) => {
          const fileName = getRestoredFileName(i);
          return (
            <div key={i} style={{ display: "inline-block", textAlign: "center" }}>
              <img src={url} alt={`restored-${i}`} style={{ maxWidth: 200, margin: 8, border: "1px solid #ccc" }} />
              <br />
              <a
                href={url}
                download={fileName}
                style={{ display: "inline-block", marginTop: 4, padding: "0.3em 1em", background: "#1976d2", color: "#fff", borderRadius: 4, textDecoration: "none", fontSize: "0.9em" }}
                id={`download-link-${i}`}
              >
                ダウンロード
              </a>
            </div>
          );
        })}
        {restoredUrls.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={async () => {
                if (!restoredBlobs.length || !manifestInfo) return;
                const zip = new JSZip();
                for (let i = 0; i < restoredBlobs.length; i++) {
                  const fileName = getRestoredFileName(i);
                  zip.file(fileName, restoredBlobs[i]);
                }
                const content = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement("a");
                a.href = url;
                a.download = manifestInfo ? `restored_${manifestInfo.id}.zip` : "images.zip";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
              style={{ padding: "0.6em 2em", background: "#1976d2", color: "#fff", borderRadius: 6, fontSize: "1em", marginTop: 8 }}
            >
              ZIPで一括ダウンロード
            </button>
          </div>
        )}
      </div>
      {/* フッター: GitHub クレジット */}
      <footer style={{ marginTop: 40, textAlign: "center", color: "#888" }}>
        <a
          href="https://github.com/tuki0918/image-shield"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#888", textDecoration: "none", fontSize: "1em" }}
        >
          {/* GitHub アイコン SVG */}
          <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor" style={{ verticalAlign: "middle" }}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.01.08-2.11 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.91.08 2.11.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          tuki0918/image-shield
        </a>
      </footer>
    </div>
  );
}; 