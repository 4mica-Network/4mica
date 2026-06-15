import localFont from "next/font/local";

const intervar = localFont({
  src: "./Intervar.woff2",
  display: "swap",
  variable: "--font-intervar",
  weight: "100 900",
});

export default intervar.variable;
