#[tauri::command]
pub fn report_ui_ready(
    url: String,
    ready_state: String,
    nuxt_child_count: u32,
    body_text_length: u32,
    interactive_element_count: u32,
) -> bool {
    let rendered = url.starts_with("tauri://localhost/")
        && ready_state == "complete"
        && nuxt_child_count > 0
        && body_text_length >= 20
        && interactive_element_count > 0;

    if rendered && std::env::var("YHTUA_UI_SMOKE_TEST").as_deref() == Ok("1") {
        eprintln!("YHTUA_UI_SMOKE_READY");
    }

    rendered
}

#[cfg(test)]
mod tests {
    use super::report_ui_ready;

    #[test]
    fn accepts_a_rendered_packaged_ui() {
        assert!(report_ui_ready(
            "tauri://localhost/token/create".into(),
            "complete".into(),
            1,
            124,
            6,
        ));
    }

    #[test]
    fn rejects_an_unrendered_ui() {
        assert!(!report_ui_ready(
            "about:blank".into(),
            "complete".into(),
            0,
            0,
            0,
        ));
    }
}
