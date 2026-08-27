import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import { brand, palette, styles } from "./theme";

export interface LayoutProps {
  /** Inbox preview line. Keep under ~90 characters. */
  preview: string;
  children: ReactNode;
  /** Rendered under the divider, above the standard footer. */
  footerNote?: ReactNode;
}

export const Layout = ({ preview, children, footerNote }: LayoutProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.body}>
      <Container style={styles.container}>
        <Section style={{ marginBottom: "24px" }}>
          <Link href={brand.website}>
            <Img
              alt={brand.name}
              height="28"
              src={brand.logoUrl}
              style={{ display: "block" }}
            />
          </Link>
        </Section>

        {children}

        <Hr style={styles.hr} />

        {footerNote ? <Text style={styles.muted}>{footerNote}</Text> : null}

        <Text style={styles.muted}>
          Questions? Reply to this email or write to{" "}
          <Link
            href={`mailto:${brand.support}`}
            style={{ color: palette.brand }}
          >
            {brand.support}
          </Link>
          .
        </Text>
        <Text style={styles.muted}>
          <Link href={brand.website} style={{ color: palette.muted }}>
            {brand.name}
          </Link>
          {" · "}
          <Link href={brand.docs} style={{ color: palette.muted }}>
            Docs
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default Layout;
