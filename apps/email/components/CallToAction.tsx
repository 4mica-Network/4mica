import { Button, Section } from "react-email";
import { palette } from "./theme";

export interface CallToActionProps {
  href: string;
  label: string;
}

export const CallToAction = ({ href, label }: CallToActionProps) => (
  <Section style={{ margin: "24px 0" }}>
    <Button
      href={href}
      style={{
        backgroundColor: palette.brand,
        borderRadius: "8px",
        color: palette.brandContrast,
        display: "inline-block",
        fontSize: "15px",
        fontWeight: 600,
        padding: "12px 22px",
        textDecoration: "none",
      }}
    >
      {label}
    </Button>
  </Section>
);

export default CallToAction;
