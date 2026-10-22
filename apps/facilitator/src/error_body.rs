/// The `error` or `message` field of a JSON body, or the body itself as text.
pub(crate) fn parse_error_message(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return "unknown error".to_string();
    }

    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) {
        if let Some(msg) = value.get("error").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
        if let Some(msg) = value.get("message").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
    }

    match std::str::from_utf8(bytes) {
        Ok(text) if !text.trim().is_empty() => text.trim().to_string(),
        _ => "unknown error".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_error_message_prefers_error_field() {
        let message = parse_error_message(json!({ "error": "bad request" }).to_string().as_bytes());
        assert_eq!(message, "bad request");
    }

    #[test]
    fn parse_error_message_falls_back_to_message_field() {
        let message = parse_error_message(
            json!({ "message": "invalid signature" })
                .to_string()
                .as_bytes(),
        );
        assert_eq!(message, "invalid signature");
    }

    #[test]
    fn parse_error_message_falls_back_to_text() {
        let message = parse_error_message(b"plain text failure");
        assert_eq!(message, "plain text failure");
    }

    #[test]
    fn parse_error_message_handles_empty_body() {
        let message = parse_error_message(&[]);
        assert_eq!(message, "unknown error");
    }
}
