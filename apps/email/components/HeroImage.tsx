import { Img, Section } from "react-email";
import { palette } from "./theme";

export interface HeroImageProps {
  src: string;
  alt: string;
  /** Defaults to the container's inner width (600px container, 32px padding). */
  width?: number;
}

/**
 * A full-width illustration or GIF.
 *
 * Animated GIFs play everywhere except Outlook on Windows, which shows the
 * first frame only — so the first frame has to make sense on its own. Keep
 * files under ~1MB; several clients refuse to load larger ones on mobile data.
 *
 * The explicit `width` attribute (not just CSS) is what stops Outlook blowing
 * the image up to its natural size, and `display: block` kills the baseline gap
 * that otherwise shows as a hairline under the image.
 */
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
