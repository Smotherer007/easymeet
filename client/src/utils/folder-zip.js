import { zip } from 'fflate';

/** Reads all files from a directory recursively */
async function readDir(entry, path = '') {
  const files = {};
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    const buf = await file.arrayBuffer();
    files[path || file.name] = new Uint8Array(buf);
    return files;
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    let entries = [];
    let batch;
    do {
      batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      entries = entries.concat(batch);
    } while (batch.length > 0);
    for (const e of entries) {
      const name = e.name;
      const subPath = path ? `${path}/${name}` : name;
      Object.assign(files, await readDir(e, subPath));
    }
  }
  return files;
}

export function extractDropData(items) {
  const files = [];
  const dirs = [];
  if (!items?.length) return { files, dirs };
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (!entry) {
      const file = item.getAsFile();
      if (file) files.push(file);
      continue;
    }
    if (entry.isDirectory) {
      dirs.push(entry);
    } else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return { files, dirs };
}

export async function processDropData({ files, dirs }) {
  const result = [...files];
  for (const dir of dirs) {
    const dirFiles = await readDir(dir);
    if (Object.keys(dirFiles).length === 0) continue;
    const zipData = await new Promise((resolve, reject) => {
      zip(dirFiles, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    result.push(new File([zipData], `${dir.name}.zip`, { type: 'application/zip' }));
  }
  return result;
}

export async function zipFileList(fileList) {
  const files = {};
  if (!fileList?.length) return null;
  for (const file of fileList) {
    const path = file.webkitRelativePath || file.name;
    if (!path) continue;
    const buf = await file.arrayBuffer();
    files[path] = new Uint8Array(buf);
  }
  if (Object.keys(files).length === 0) return null;
  const zipData = await new Promise((resolve, reject) => {
    zip(files, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  const baseName = fileList[0]?.webkitRelativePath?.split('/')[0] || 'ordner';
  return new File([zipData], `${baseName}.zip`, { type: 'application/zip' });
}
