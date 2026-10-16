#[derive(Debug, PartialEq)]
pub enum TextError {
    NotText,
}

/// Düzenleyicide açılabilecek bir metin mi? Geçersiz UTF-8 ya da NUL baytı içeren veri metin sayılmaz.
pub fn decode_text(bytes: Vec<u8>) -> Result<String, TextError> {
    if bytes.contains(&0) {
        return Err(TextError::NotText);
    }
    let text = String::from_utf8(bytes).map_err(|_| TextError::NotText)?;
    Ok(text.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_text_with_newlines_and_unicode_is_accepted() {
        assert_eq!(decode_text("merhaba\r\ndünya ş ğ 😀\n".as_bytes().to_vec()).unwrap(), "merhaba\r\ndünya ş ğ 😀\n");
        assert_eq!(decode_text(Vec::new()).unwrap(), "");
    }

    #[test]
    fn binary_or_non_utf8_data_is_refused() {
        assert_eq!(decode_text(vec![0x7f, b'E', b'L', b'F', 0, 1, 2]), Err(TextError::NotText));
        assert_eq!(decode_text(vec![0xff, 0xfe, 0x41]), Err(TextError::NotText));
        assert_eq!(decode_text(b"abc\0def".to_vec()), Err(TextError::NotText));
    }

    #[test]
    fn a_utf8_bom_is_dropped() {
        assert_eq!(decode_text(vec![0xEF, 0xBB, 0xBF, b'h', b'i']).unwrap(), "hi");
    }
}
