function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('storylab-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Image storage is unavailable. Keep the page open and download your work.'));
  });
}
export async function saveMedia(projectId, id, dataUrl) {
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite');
      transaction.objectStore('images').put({ key: `${projectId}:${id}`, projectId, id, dataUrl });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(new Error('The image could not be saved. Free browser storage and try again.'));
      transaction.onabort = transaction.onerror;
    });
  } finally { db.close(); }
}
export async function readMedia(projectId) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound(`${projectId}:`, `${projectId}:\uffff`);
      const request = db.transaction('images').objectStore('images').getAll(range);
      request.onsuccess = () => resolve(Object.fromEntries(request.result.map(image => [image.id, image.dataUrl])));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function prepareUpload(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose an image smaller than 15 MB.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas.toDataURL('image/jpeg', .9);
}
