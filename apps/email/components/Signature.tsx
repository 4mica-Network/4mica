import { Text } from "react-email";
import { palette, sender, styles } from "./theme";

/**
 * Sign-off for the emails written in a person's voice. Sits last in the body,
 * after the call to action, so the message reads as a note that happens to
 * contain a button rather than a campaign that happens to be signed.
 */
export const Signature = () => (
  <Text style={{ ...styles.paragraph, margin: "24px 0 0" }}>
    — {sender.firstName}
    <br />
    <span style={{ color: palette.muted, fontSize: "13px" }}>
      {sender.role}
    </span>
  </Text>
);

export default Signature;
