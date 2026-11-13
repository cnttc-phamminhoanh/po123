import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 420;
const MARGIN_MM = 10;
const JPEG_QUALITY = 0.96;
const RENDER_SCALE = 2.2;
/** Ảnh nhỏ vẫn dùng PNG để chữ nét; ảnh lớn dùng JPEG để xuất nhanh. */
const PNG_MAX_PIXELS = 8_000_000;

export interface ExportedPdf {
  blob: Blob;
  fileName: string;
  pages: number;
}

const readAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Image read failed'));
    reader.readAsDataURL(blob);
  });

const inlineNodeImages = async (node: HTMLElement): Promise<() => void> => {
  const images: HTMLImageElement[] = Array.from(node.querySelectorAll('img'));
  const restores: Array<() => void> = [];

  await Promise.all(
    images.map(async (img: HTMLImageElement) => {
      const src: string = img.currentSrc || img.src;
      if (!src || src.startsWith('data:')) return;
      const originalSrc: string = img.getAttribute('src') ?? '';
      try {
        const response: Response = await fetch(src);
        if (!response.ok) throw new Error(String(response.status));
        const dataUrl: string = await readAsDataUrl(await response.blob());
        restores.push(() => img.setAttribute('src', originalSrc));
        img.setAttribute('src', dataUrl);
        await img.decode().catch(() => undefined);
      } catch {
        const originalStyle: string = img.getAttribute('style') ?? '';
        restores.push(() => img.setAttribute('style', originalStyle));
        img.style.visibility = 'hidden';
      }
    }),
  );

  return () => {
    restores.forEach((restore: () => void) => restore());
  };
};

export const exportNodeToA3Pdf = async (
  node: HTMLElement,
  fileName: string,
): Promise<ExportedPdf> => {
  const width: number = node.scrollWidth;
  const height: number = node.scrollHeight;

  const restoreImages: () => void = await inlineNodeImages(node);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(node, {
      backgroundColor: '#FFFFFF',
      scale: RENDER_SCALE,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    });
  } finally {
    restoreImages();
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a3',
    compress: true,
  });

  const contentWidth: number = PAGE_WIDTH_MM - MARGIN_MM * 2;
  const contentHeight: number = PAGE_HEIGHT_MM - MARGIN_MM * 2;
  const imageHeight: number = (canvas.height * contentWidth) / canvas.width;
  const pxPerMm: number = canvas.width / contentWidth;
  const sliceHeightPx: number = Math.floor(contentHeight * pxPerMm);
  const canFitOnePage: boolean = imageHeight <= contentHeight * 1.2;

  if (canFitOnePage) {
    const scaledWidth: number = Math.min(
      contentWidth,
      (canvas.width * contentHeight) / canvas.height,
    );
    const scaledHeight: number = (canvas.height * scaledWidth) / canvas.width;
    const usePng: boolean = canvas.width * canvas.height <= PNG_MAX_PIXELS;
    pdf.addImage(
      canvas.toDataURL(
        usePng ? 'image/png' : 'image/jpeg',
        usePng ? undefined : JPEG_QUALITY,
      ),
      usePng ? 'PNG' : 'JPEG',
      MARGIN_MM + (contentWidth - scaledWidth) / 2,
      MARGIN_MM,
      scaledWidth,
      scaledHeight,
    );
  } else {
    let offset: number = 0;
    let page: number = 0;
    while (offset < canvas.height) {
      const currentHeight: number = Math.min(sliceHeightPx, canvas.height - offset);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = currentHeight;
      const context = slice.getContext('2d');
      if (!context) {
        throw new Error('Canvas 2D context is unavailable');
      }
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(
        canvas,
        0,
        offset,
        canvas.width,
        currentHeight,
        0,
        0,
        canvas.width,
        currentHeight,
      );
      if (page > 0) {
        pdf.addPage();
      }
      pdf.addImage(
        slice.toDataURL('image/jpeg', JPEG_QUALITY),
        'JPEG',
        MARGIN_MM,
        MARGIN_MM,
        contentWidth,
        currentHeight / pxPerMm,
      );
      offset += currentHeight;
      page += 1;
    }
  }

  return {
    blob: pdf.output('blob'),
    fileName,
    pages: pdf.getNumberOfPages(),
  };
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url: string = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
};
