import GlobalNetworkBackground from "@components/GlobalNetworkBackgroundLazy";
import Shell from "@components/Shell";

// The network background renders only here, and must stay a sibling *before*
// Shell: its canvas is sized to the viewport in px and anchors to the document
// origin, so nesting it inside Shell's centered `max-w-300` main would offset
// it horizontally and paint it above the page content.
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
