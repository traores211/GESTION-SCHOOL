/** Minimal typing of the pdf.js 3.x legacy CommonJS build (the package only types the ESM entry). */
declare module 'pdfjs-dist/legacy/build/pdf.js' {
  interface TextContent {
    items: unknown[];
  }
  interface PdfPage {
    getViewport(options: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<TextContent>;
    cleanup(): void;
  }
  interface PdfDocument {
    numPages: number;
    getPage(n: number): Promise<PdfPage>;
    destroy(): Promise<void>;
  }
  export function getDocument(source: {
    data: Uint8Array;
    isEvalSupported?: boolean;
    disableFontFace?: boolean;
    useSystemFonts?: boolean;
    verbosity?: number;
  }): { promise: Promise<PdfDocument> };
}
