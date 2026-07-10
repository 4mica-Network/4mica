export const metadata = {
  title: "4Mica x402 seller (Next.js)",
  description: "A paywalled Next.js route protected by @4mica/sdk-next",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
