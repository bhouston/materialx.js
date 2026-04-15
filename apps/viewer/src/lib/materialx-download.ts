import JSZip from 'jszip';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadMaterialXZip(
  xml: string,
  assetUrls: Record<string, string>,
  label: string,
): Promise<void> {
  const zip = new JSZip();

  zip.file('material.mtlx', xml);

  const fetchPromises = Object.entries(assetUrls).map(async ([relativePath, url]) => {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.arrayBuffer();
      zip.file(relativePath, data);
    } catch {
      // skip assets that can't be fetched
    }
  });

  await Promise.all(fetchPromises);

  const blob = await zip.generateAsync({ type: 'blob' });
  const safeName = label.replace(/\.mtlx$/i, '').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
  downloadBlob(blob, `${safeName}.mtlx.zip`);
}
