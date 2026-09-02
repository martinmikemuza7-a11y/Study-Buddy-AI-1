declare module "pdf-parse" {
  type PdfParseResult = { text: string; numpages?: number };
  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>;
  export default pdfParse;
}