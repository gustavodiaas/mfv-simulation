export type PaperSize = 'a1' | 'a2' | 'a3' | 'a4';

const EXPORT_PADDING = 28;

function download(url: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}

function croppedSvg(svg: SVGSVGElement) {
  const content = svg.querySelector<SVGGElement>('[data-export-content]');
  if (!content) throw new Error('Conteúdo do MFV não encontrado.');

  const bounds = content.getBBox();
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error('O MFV está vazio.');

  const clone = content.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  clone.querySelectorAll('[data-export-ui], .edit-btn-group, .selection-rect').forEach((node) => node.remove());

  const x = bounds.x - EXPORT_PADDING;
  const y = bounds.y - EXPORT_PADDING;
  const width = bounds.width + EXPORT_PADDING * 2;
  const height = bounds.height + EXPORT_PADDING * 2;
  const markup = new XMLSerializer().serializeToString(clone);
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>${markup}</svg>`;

  return { source, width, height };
}

async function rasterize(svg: SVGSVGElement) {
  const cropped = croppedSvg(svg);
  const blob = new Blob([cropped.source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível renderizar o MFV.'));
      image.src = url;
    });

    const longestSide = Math.max(cropped.width, cropped.height);
    const scale = Math.max(1, Math.min(3, 7200 / longestSide));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(cropped.width * scale);
    canvas.height = Math.ceil(cropped.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas de exportação indisponível.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, ...cropped };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPDF(svg: SVGSVGElement, filename: string, paperSize: PaperSize) {
  const { canvas, width, height } = await rasterize(svg);
  const { jsPDF } = await import('jspdf');
  const orientation = width >= height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: paperSize });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = paperSize === 'a4' ? 8 : paperSize === 'a3' ? 10 : 12;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const ratio = Math.min(availableWidth / width, availableHeight / height);
  const drawWidth = width * ratio;
  const drawHeight = height * ratio;

  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    (pageWidth - drawWidth) / 2,
    (pageHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
    undefined,
    'FAST',
  );
  pdf.save(`${filename}_${paperSize.toUpperCase()}.pdf`);
}

export async function exportJPEG(svg: SVGSVGElement, filename: string) {
  const { canvas } = await rasterize(svg);
  download(canvas.toDataURL('image/jpeg', 0.96), `${filename}.jpg`);
}

export function exportSVG(svg: SVGSVGElement, filename: string) {
  const { source } = croppedSvg(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  download(url, `${filename}.svg`);
  URL.revokeObjectURL(url);
}
