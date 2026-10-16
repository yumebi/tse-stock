mod stock;

use stock::{fetch_index, fetch_news_for_code, fetch_stock, update_jpx_cache_if_needed};
use tauri::Manager;

#[tauri::command]
async fn fetch_stock_cmd(
    app_handle: tauri::AppHandle,
    code: String,
    known_name: Option<String>,
    need_intraday_closes: bool,
) -> Result<stock::StockData, String> {
    fetch_stock(&app_handle, &code, known_name, need_intraday_closes).await
}

#[tauri::command]
async fn fetch_index_cmd(app_handle: tauri::AppHandle, symbol: String) -> Result<stock::IndexData, String> {
    fetch_index(&app_handle, &symbol).await
}

#[tauri::command]
async fn fetch_news_cmd(code: String) -> Result<Vec<stock::NewsItem>, String> {
    fetch_news_for_code(&code).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ウインドウは位置を復元してから表示するため visible:false で作る。
            // フロントエンドの初期化が途中で失敗して show() に届かなくても、ウインドウが
            // 出ないままプロセスだけが残らないように、一定時間後に表示されていなければ表示する。
            let window_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Some(window) = window_handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                }
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                update_jpx_cache_if_needed(&handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![fetch_stock_cmd, fetch_index_cmd, fetch_news_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
