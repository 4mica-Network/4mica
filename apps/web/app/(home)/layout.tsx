import GlobalNetworkBackground from "@components/GlobalNetworkBackgroundLazy";
import Shell from "@components/Shell";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <GlobalNetworkBackground />
      <Shell>{children}</Shell>
    </>
  );
}
