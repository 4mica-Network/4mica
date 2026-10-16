import Shell from "@components/Shell";
import LiquidLines from "./_components/LiquidLines";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <LiquidLines />
      <Shell>{children}</Shell>
    </>
  );
}
