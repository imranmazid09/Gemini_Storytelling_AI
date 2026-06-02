const textEncoder = new TextEncoder();

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function wrappedLines(context, text, maxWidth) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function renderVisualAsset(asset) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const context = canvas.getContext("2d");
      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

      if (asset.overlayText?.trim()) {
        const gradient = context.createLinearGradient(0, 480, 0, 1080);
        gradient.addColorStop(0, "rgba(9, 20, 44, 0)");
        gradient.addColorStop(1, "rgba(9, 20, 44, 0.82)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1080, 1080);
        context.fillStyle = "#ffffff";
        context.font = "700 64px Arial, sans-serif";
        context.textBaseline = "bottom";
        const lines = wrappedLines(context, asset.overlayText, 920);
        lines.reverse().forEach((line, index) => {
          context.fillText(line, 80, 994 - (index * 82));
        });
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not prepare a downloadable image."));
      }, "image/png");
    };
    image.onerror = () => reject(new Error("Could not load a generated image for download."));
    image.src = asset.src;
  });
}

function crc32(bytes) {
  let crc = -1;
  bytes.forEach((byte) => {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  });
  return (crc ^ -1) >>> 0;
}

function join(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let position = 0;
  parts.forEach((part) => {
    output.set(part, position);
    position += part.length;
  });
  return output;
}

export async function createZip(entries) {
  const localParts = [];
  const directoryParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, bytes);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, bytes.length, true);
    directoryView.setUint32(24, bytes.length, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint32(42, offset, true);
    directory.set(name, 46);
    directoryParts.push(directory);
    offset += local.length + bytes.length;
  }

  const directory = join(directoryParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directory.length, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, directory, end], { type: "application/zip" });
}
