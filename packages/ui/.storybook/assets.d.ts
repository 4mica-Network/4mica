declare module "*.svg" {
  const src: string;
  export default src;
}

// Vite resolves the stylesheet; this only keeps the editor from flagging the
// side-effect import in preview.tsx.
declare module "*.css";
