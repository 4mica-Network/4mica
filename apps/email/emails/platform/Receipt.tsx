import type { TemplateProps } from "@4mica/email-client";
import {
  CallToAction,
  DetailList,
  formatDate,
  formatMoney,
  Layout,
  palette,
  styles,
} from "@components/index";
import { Column, Heading, Hr, Row, Section, Text } from "react-email";

export const Receipt = ({
  userName,
  orderNumber,
  purchaseDate,
  total,
  items,
  invoiceUrl,
}: TemplateProps<"receipt">) => (
  <Layout
    preview={`Receipt ${orderNumber} — ${formatMoney(total.amount, total.currency)}`}
  >
    <Heading style={styles.heading}>Your receipt</Heading>

    <Text style={styles.paragraph}>
      Thanks {userName}. Here's a copy of your receipt for your records.
    </Text>

    <DetailList
      rows={[
        { label: "Order", value: orderNumber },
        { label: "Date", value: formatDate(purchaseDate) },
      ]}
    />

    <Section style={{ ...styles.table, marginTop: "20px" }}>
      {items.map((item) => (
        <Row key={`${item.name}-${item.quantity}`}>
          <Column style={{ ...styles.cell, width: "60%" }}>
            {item.name}
            {item.quantity > 1 ? ` × ${item.quantity}` : ""}
          </Column>
          <Column style={styles.cellRight}>
            {formatMoney(
              item.price.amount * item.quantity,
              item.price.currency,
            )}
          </Column>
        </Row>
      ))}
      <Row>
        <Column
          style={{
            ...styles.cell,
            borderBottom: "none",
            fontWeight: 700,
            width: "60%",
          }}
        >
          Total
        </Column>
        <Column
          style={{
            ...styles.cellRight,
            borderBottom: "none",
            color: palette.text,
            fontWeight: 700,
          }}
        >
          {formatMoney(total.amount, total.currency)}
        </Column>
      </Row>
    </Section>

    {invoiceUrl ? (
      <CallToAction href={invoiceUrl} label="View invoice" />
    ) : (
      <Hr style={styles.hr} />
    )}
  </Layout>
);

Receipt.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  orderNumber: "4M-2026-000481",
  purchaseDate: "2026-08-03T09:12:00.000Z",
  total: { amount: 12_900, currency: "USD" },
  items: [
    {
      name: "Scale plan",
      quantity: 1,
      price: { amount: 9_900, currency: "USD" },
    },
    {
      name: "Additional agent",
      quantity: 3,
      price: { amount: 1_000, currency: "USD" },
    },
  ],
  invoiceUrl: "https://app.4mica.io/billing/invoices/preview",
} satisfies TemplateProps<"receipt">;

export default Receipt;
