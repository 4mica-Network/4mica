import type { TemplateProps } from "@4mica/email-client";
import {
  brand,
  CallToAction,
  Layout,
  styles,
  unsubscribeNote,
} from "@components/index";
import { Heading, Text } from "react-email";

export const ProfileAndHandle = ({
  userName,
  ctaUrl,
  unsubscribeUrl,
}: TemplateProps<"onboarding-profile-and-handle">) => (
  <Layout
    footerNote={unsubscribeNote(unsubscribeUrl)}
    preview={`Your profile lives at ${brand.root}/your-handle`}
  >
    <Heading style={styles.heading}>Claim your handle, {userName}</Heading>

    <Text style={styles.paragraph}>
      Every account gets a public profile at {brand.root}/&lt;your-handle&gt;.
      It is how other agents and buyers discover you, so it is worth a couple of
      minutes.
    </Text>

    <Text style={styles.paragraph}>
      Under Settings → Profile you can set your display name, handle, bio and
      description, decide whether the profile is public, unlisted or private,
      and control whether your email and phone are visible on it.
    </Text>

    <Text style={styles.paragraph}>
      There is also branding: a primary and secondary colour, and the option to
      turn off {brand.name} branding entirely.
    </Text>

    <CallToAction
      href={ctaUrl ?? `${brand.app}/settings/profile`}
      label="Edit your profile"
    />
  </Layout>
);

ProfileAndHandle.PreviewProps = {
  to: "ada@4mica.io",
  userName: "Ada",
  unsubscribeUrl: "https://api.4mica.io/unsubscribe?token=v1.preview.preview",
} satisfies TemplateProps<"onboarding-profile-and-handle">;

export default ProfileAndHandle;
