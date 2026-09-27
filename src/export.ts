import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 3,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    // Garante que o canvas captura o tamanho real do elemento
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: el.scrollWidth + 100,
    windowHeight: el.scrollHeight + 100,
  });
}

export async function exportPDF(el: HTMLElement, filename = 'MFV') {
  const canvas = await captureElement(el);
  const imgW = canvas.width;
  const imgH = canvas.height;

  // Página A3 landscape para caber bem
  const pageW = 420; // mm A3 landscape
  const pageH = 297;
  const margin = 8;
  const drawW = pageW - margin * 2;
  const drawH = (imgH / imgW) * drawW;

  // Se o conteúdo for mais alto que a página, usa o modo retrato
  const orientation: 'l' | 'p' = drawH <= pageH - margin * 2 ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a3' });

  const finalW = orientation === 'l' ? drawW : pageW - margin * 2;
  const finalH = (imgH / imgW) * finalW;

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, finalW, finalH);
  pdf.save(`${filename}.pdf`);
}

export async function exportJPEG(el: HTMLElement, filename = 'MFV') {
  const canvas = await captureElement(el);
  const link = document.createElement('a');
  link.download = `${filename}.jpg`;
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
}

export async function exportSVG(el: HTMLElement, filename = 'MFV') {
  // Serializa o DOM como SVG via foreignObject
  const w = el.scrollWidth;
  const h = el.scrollHeight;
  const xml = new XMLSerializer().serializeToString(el);
  const encoded = encodeURIComponent(xml);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml">${xml}</div>
  </foreignObject>
</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.svg`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
