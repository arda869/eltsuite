// The browser build of tesseract.js, as an ES module.
declare module 'tesseract.js/dist/tesseract.esm.min.js' {
  const T: typeof import('tesseract.js');
  export default T;
  export const createWorker: typeof import('tesseract.js').createWorker;
}
