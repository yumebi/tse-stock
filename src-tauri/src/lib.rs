mod stock;

use stock::{fetch_index, fetch_stock};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_stock_cmd, fetch_index_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
