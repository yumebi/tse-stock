mod stock;

use stock::fetch_stock;

#[tauri::command]
async fn fetch_stock_cmd(app_handle: tauri::AppHandle, code: String) -> Result<stock::StockData, String> {
    fetch_stock(&app_handle, &code).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_stock_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
