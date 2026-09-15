import { Img, Section } from "react-email";
import { palette } from "./theme";

export interface HeroImageProps {
  src: string;
  alt: string;
  width?: number;
}

export const HeroImage = ({ src, alt, width = 536 }: HeroImageProps) => (
  <Section style={{ margin: "0 0 24px" }}>
    <Img
      alt={alt}
      src={src}
      style={{
        backgroundColor: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "10px",
        display: "block",
        height: "auto",
        maxWidth: "100%",
        width: "100%",
      }}
      width={width}
    />
  </Section>
);

export default HeroImage;
