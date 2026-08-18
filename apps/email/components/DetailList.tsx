import { Column, Row, Section } from "react-email";
import { palette, styles } from "./theme";

export interface DetailRow {
  label: string;
  value: string;
  /** Renders in the positive/negative accent colour instead of body text. */
  tone?: "positive" | "negative";
}

export interface DetailListProps {
  rows: DetailRow[];
}

const toneColor = (tone: DetailRow["tone"]) => {
  if (tone === "positive") {
    return palette.positive;
  }

  if (tone === "negative") {
    return palette.negative;
  }

  return palette.text;
};

export const DetailList = ({ rows }: DetailListProps) => (
  <Section style={styles.table}>
    {rows.map((row) => (
      <Row key={row.label}>
        <Column style={{ ...styles.cell, color: palette.muted, width: "45%" }}>
          {row.label}
        </Column>
        <Column style={{ ...styles.cellRight, color: toneColor(row.tone) }}>
          {row.value}
        </Column>
      </Row>
    ))}
  </Section>
);

export default DetailList;
