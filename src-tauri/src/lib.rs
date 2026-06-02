mod stock;

use stock::{fetch_index, fetch_stock, save_csv};

#[tauri::command]
async fn fetch_stock_cmd(app_handle: tauri::AppHandle, code: String) -> Result<stock::StockData, String> {
    fetch_stock(&app_handle, &code).await
}

#[tauri::command]
async fn fetch_index_cmd(app_handle: tauri::AppHandle, symbol: String) -> Result<stock::IndexData, String> {
    fetch_index(&app_handle, &symbol).await
}

#[tauri::command]
fn save_csv_cmd(data: String, filename: String) -> Result<String, String> {
    save_csv(&data, &filename)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_stock_cmd, fetch_index_cmd, save_csv_cmd])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
