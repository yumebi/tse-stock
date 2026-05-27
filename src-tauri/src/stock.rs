use serde::{Deserialize, Serialize};

// ===== フロントエンドに返すデータ型 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockData {
    pub code: String,
    pub name: String,
    pub name_ja: Option<String>,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub high: f64,
    pub high_time: Option<String>,
    pub low: f64,
    pub low_time: Option<String>,
    pub open: f64,
    pub prev_close: f64,
    pub volume: i64,
    pub ma5: Option<f64>,
    pub ma25: Option<f64>,
    pub ma75: Option<f64>,
    pub macd: Option<f64>,
    pub macd_signal: Option<f64>,
    pub rsi: Option<f64>,
    pub signals: Vec<String>,
}

// ===== Yahoo Finance API レスポンス型 =====

#[derive(Debug, Deserialize)]
struct YahooResponse {
    chart: YahooChart,
}

#[derive(Debug, Deserialize)]
struct YahooChart {
    result: Option<Vec<YahooResult>>,
    error: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct YahooResult {
    meta: YahooMeta,
    #[allow(dead_code)]
    timestamp: Option<Vec<i64>>,
    indicators: YahooIndicators,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct YahooMeta {
    symbol: String,
    #[serde(default)]
    long_name: Option<String>,
    #[serde(default)]
    short_name: Option<String>,
    regular_market_price: Option<f64>,
    #[serde(default)]
    previous_close: Option<f64>,
    #[serde(default)]
    chart_previous_close: Option<f64>,
    regular_market_day_high: Option<f64>,
    regular_market_day_low: Option<f64>,
    #[serde(default)]
    regular_market_open: Option<f64>,
    regular_market_volume: Option<i64>,
    #[serde(default)]
    exchange_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YahooIndicators {
    quote: Vec<YahooQuote>,
}

#[derive(Debug, Deserialize)]
struct YahooQuote {
    #[serde(default)]
    open: Vec<Option<f64>>,
    #[serde(default)]
    #[allow(dead_code)]
    high: Vec<Option<f64>>,
    #[serde(default)]
    #[allow(dead_code)]
    low: Vec<Option<f64>>,
    #[serde(default)]
    close: Vec<Option<f64>>,
    #[serde(default)]
    #[allow(dead_code)]
    volume: Vec<Option<i64>>,
}

// ===== メイン: 株価取得 =====

pub async fn fetch_stock(app_handle: &tauri::AppHandle, code: &str) -> Result<StockData, String> {
    use tauri::Emitter;
    let emit = |step: &str| {
        let _ = app_handle.emit("stock-progress", serde_json::json!({ "code": code, "step": step }));
    };

    emit("接続中...");
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    // 4つのリクエストを並列実行
    let url_current = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}.T?interval=1d&range=1d", code);
    let url_hist = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}.T?interval=1d&range=6mo", code);
    let url_intra = format!("https://query1.finance.yahoo.com/v8/finance/chart/{}.T?interval=1m&range=1d", code);
    let url_ja = format!("https://minkabu.jp/stock/{}", code);

    let (resp_cur, resp_hist, resp_intra, resp_ja) = tokio::join!(
        client.get(&url_current).send(),
        client.get(&url_hist).send(),
        client.get(&url_intra).send(),
        client.get(&url_ja).send(),
    );

    // -- 現在値 --
    emit("株価取得中...");
    let resp_cur = resp_cur.map_err(|e| format!("Request error: {}", e))?;
    let data_cur: YahooResponse = resp_cur.json().await.map_err(|e| format!("Parse error: {}", e))?;
    let chart_cur = data_cur.chart;
    if let Some(err) = chart_cur.error { return Err(format!("API error: {:?}", err)); }
    let result_cur = chart_cur.result.and_then(|mut r| r.pop()).ok_or("No data")?;
    let meta = result_cur.meta;

    let price = meta.regular_market_price.unwrap_or(0.0);
    let prev_close = meta.previous_close.or(meta.chart_previous_close).unwrap_or(price);
    let change = price - prev_close;
    let change_percent = if prev_close != 0.0 { (change / prev_close) * 100.0 } else { 0.0 };
    let name_en = meta.long_name.or(meta.short_name).unwrap_or_else(|| code.to_string());

    emit("企業名取得中...");
    // -- 日本語企業名（みんかぶ → 内蔵マッピング） --
    let name_ja = if let Ok(resp) = resp_ja {
        fetch_japanese_name(resp).await.or_else(|| japanese_name(code))
    } else {
        japanese_name(code)
    };

    // -- 履歴データ (6ヶ月) --
    let (closes, volumes, opens_full, highs_full, lows_full) = if let Ok(resp) = resp_hist {
        let data: YahooResponse = resp.json().await.unwrap_or_else(|_| YahooResponse { chart: YahooChart { result: None, error: None } });
        if let Some(result) = data.chart.result.and_then(|mut r| r.pop()) {
            if let Some(q) = result.indicators.quote.into_iter().next() {
                let c: Vec<f64> = q.close.iter().filter_map(|v| *v).collect();
                let v: Vec<i64> = q.volume.iter().filter_map(|v| *v).collect();
                let o: Vec<f64> = q.open.iter().filter_map(|v| *v).collect();
                let h: Vec<f64> = q.high.iter().filter_map(|v| *v).collect();
                let l: Vec<f64> = q.low.iter().filter_map(|v| *v).collect();
                (c, v, o, h, l)
            } else { (vec![], vec![], vec![], vec![], vec![]) }
        } else { (vec![], vec![], vec![], vec![], vec![]) }
    } else { (vec![], vec![], vec![], vec![], vec![]) };

    // 当日の始値
    let open_val = if meta.regular_market_open.unwrap_or(0.0) != 0.0 {
        meta.regular_market_open.unwrap()
    } else {
        opens_full.last().copied().unwrap_or(0.0)
    };

    // -- 分足から高値・安値の時刻を抽出 --
    let (high_time, low_time) = if let Ok(resp) = resp_intra {
        let data: YahooResponse = resp.json().await.unwrap_or_else(|_| YahooResponse { chart: YahooChart { result: None, error: None } });
        if let Some(result) = data.chart.result.and_then(|mut r| r.pop()) {
            find_high_low_time(&result)
        } else { (None, None) }
    } else { (None, None) };

    emit("指標計算中...");
    // -- テクニカル指標 --
    let (ma5, ma5_prev) = last_two_sma(&closes, 5);
    let (ma25, ma25_prev) = last_two_sma(&closes, 25);
    let (ma75, ma75_prev) = last_two_sma(&closes, 75);
    let (macd_val, macd_sig, macd_prev, macd_sig_prev) = calc_macd_latest(&closes);
    let rsi_val = calc_rsi(&closes, 14);
    let bb = calc_bb(&closes, 20, 2.0);
    let vol_avg = volumes.iter().map(|&v| v as f64).sum::<f64>() / volumes.len().max(1) as f64;
    let cur_vol = meta.regular_market_volume.unwrap_or(0) as f64;
    let day_range_pct = if meta.regular_market_day_high.unwrap_or(0.0) != 0.0 {
        (price - meta.regular_market_day_low.unwrap_or(price))
            / (meta.regular_market_day_high.unwrap_or(price) - meta.regular_market_day_low.unwrap_or(price))
            * 100.0
    } else { 50.0 };
    let atr = calc_atr(&closes, &highs_full, &lows_full, 14);
    let consecutive = consecutive_direction(&closes);
    let day_high = meta.regular_market_day_high.unwrap_or(0.0);
    let day_low = meta.regular_market_day_low.unwrap_or(0.0);

    let signals = check_signals(
        ma5, ma5_prev, ma25, ma25_prev, ma75, ma75_prev,
        macd_val, macd_sig, macd_prev, macd_sig_prev, rsi_val,
        &bb, price, cur_vol, vol_avg, day_range_pct,
        change_percent, atr, consecutive, day_high, day_low,
    );

    Ok(StockData {
        code: code.to_string(),
        name: name_en,
        name_ja,
        price: round2(price),
        change: round2(change),
        change_percent: round2(change_percent),
        high: round2(meta.regular_market_day_high.unwrap_or(0.0)),
        high_time,
        low: round2(meta.regular_market_day_low.unwrap_or(0.0)),
        low_time,
        open: round2(open_val),
        prev_close: round2(prev_close),
        volume: meta.regular_market_volume.unwrap_or(0),
        ma5: ma5.map(round2),
        ma25: ma25.map(round2),
        ma75: ma75.map(round2),
        macd: macd_val.map(round2),
        macd_signal: macd_sig.map(round2),
        rsi: rsi_val.map(round2),
        signals,
    })
}

// ===== 日本語企業名（Yahoo Finance Japanのtitleタグから抽出） =====

async fn fetch_japanese_name(resp: reqwest::Response) -> Option<String> {
    let html = resp.text().await.ok()?;
    // <title>トヨタ自動車 (7203) : 株価... - みんかぶ</title>
    let title_start = html.find("<title>")?;
    let title_end = html[title_start..].find("</title>")?;
    let title = &html[title_start + 7..title_start + title_end];
    // " (" の前までが企業名
    let name = title.split(" (").next()?.trim();
    if name.is_empty() || name.contains("みんかぶ") { None } else { Some(name.to_string()) }
}

fn japanese_name(code: &str) -> Option<String> {
    match code {
        "1301" => Some("極洋".into()),
        "1332" => Some("ニッスイ".into()),
        "1333" => Some("マルハニチロ".into()),
        "1605" => Some("INPEX".into()),
        "1721" => Some("コムシスHD".into()),
        "1801" => Some("大成建設".into()),
        "1802" => Some("大林組".into()),
        "1803" => Some("清水建設".into()),
        "1812" => Some("鹿島建設".into()),
        "1878" => Some("大東建託".into()),
        "1925" => Some("大和ハウス工業".into()),
        "1928" => Some("積水ハウス".into()),
        "1963" => Some("日揮HD".into()),
        "2002" => Some("日清製粉G本社".into()),
        "2269" => Some("明治HD".into()),
        "2282" => Some("日本ハム".into()),
        "2501" => Some("サッポロHD".into()),
        "2502" => Some("アサヒ".into()),
        "2503" => Some("キリンHD".into()),
        "2802" => Some("味の素".into()),
        "2871" => Some("ニチレイ".into()),
        "2914" => Some("JT".into()),
        "3003" => Some("ヒューリック".into()),
        "3099" => Some("三越伊勢丹HD".into()),
        "3101" => Some("東洋紡".into()),
        "3105" => Some("日清紡HD".into()),
        "3289" => Some("東急不動産HD".into()),
        "3382" => Some("セブン＆アイHD".into()),
        "3401" => Some("帝人".into()),
        "3402" => Some("東レ".into()),
        "3407" => Some("旭化成".into()),
        "3436" => Some("SUMCO".into()),
        "3659" => Some("ネクソン".into()),
        "3861" => Some("王子HD".into()),
        "4004" => Some("レゾナックHD".into()),
        "4005" => Some("住友化学".into()),
        "4021" => Some("日産化学".into()),
        "4063" => Some("信越化学工業".into()),
        "4151" => Some("協和キリン".into()),
        "4188" => Some("三菱ケミカルG".into()),
        "4204" => Some("積水化学工業".into()),
        "4307" => Some("野村総研".into()),
        "4324" => Some("電通グループ".into()),
        "4452" => Some("花王".into()),
        "4502" => Some("武田薬品工業".into()),
        "4503" => Some("アステラス製薬".into()),
        "4507" => Some("塩野義製薬".into()),
        "4519" => Some("中外製薬".into()),
        "4523" => Some("エーザイ".into()),
        "4528" => Some("小野薬品工業".into()),
        "4543" => Some("テルモ".into()),
        "4568" => Some("第一三共".into()),
        "4578" => Some("大塚HD".into()),
        "4661" => Some("オリエンタルランド".into()),
        "4684" => Some("OBIC".into()),
        "4689" => Some("LINEヤフー".into()),
        "4704" => Some("トレンドマイクロ".into()),
        "4755" => Some("楽天グループ".into()),
        "4901" => Some("富士フイルムHD".into()),
        "4902" => Some("コニカミノルタ".into()),
        "4911" => Some("資生堂".into()),
        "5020" => Some("ENEOS HD".into()),
        "5101" => Some("横浜ゴム".into()),
        "5108" => Some("ブリヂストン".into()),
        "5201" => Some("AGC".into()),
        "5214" => Some("日本電気硝子".into()),
        "5301" => Some("東海カーボン".into()),
        "5332" => Some("TOTO".into()),
        "5333" => Some("日本ガイシ".into()),
        "5401" => Some("日本製鉄".into()),
        "5406" => Some("神戸製鋼所".into()),
        "5411" => Some("JFE HD".into()),
        "5541" => Some("大平洋金属".into()),
        "5631" => Some("日本製鋼所".into()),
        "5711" => Some("三菱マテリアル".into()),
        "5713" => Some("住友金属鉱山".into()),
        "5801" => Some("古河電気工業".into()),
        "5802" => Some("住友電気工業".into()),
        "5803" => Some("フジクラ".into()),
        "6098" => Some("リクルートHD".into()),
        "6146" => Some("ディスコ".into()),
        "6178" => Some("日本郵政".into()),
        "6201" => Some("豊田自動織機".into()),
        "6273" => Some("SMC".into()),
        "6301" => Some("小松製作所".into()),
        "6302" => Some("住友重機械工業".into()),
        "6326" => Some("クボタ".into()),
        "6367" => Some("ダイキン工業".into()),
        "6471" => Some("日本精工".into()),
        "6472" => Some("NTN".into()),
        "6473" => Some("ジェイテクト".into()),
        "6501" => Some("日立製作所".into()),
        "6502" => Some("東芝".into()),
        "6503" => Some("三菱電機".into()),
        "6504" => Some("富士電機".into()),
        "6506" => Some("安川電機".into()),
        "6526" => Some("ソシオネクスト".into()),
        "6586" => Some("マキタ".into()),
        "6594" => Some("ニデック".into()),
        "6645" => Some("オムロン".into()),
        "6674" => Some("GSユアサ".into()),
        "6701" => Some("NEC".into()),
        "6702" => Some("富士通".into()),
        "6723" => Some("ルネサスエレクトロニクス".into()),
        "6724" => Some("セイコーエプソン".into()),
        "6752" => Some("パナソニックHD".into()),
        "6753" => Some("シャープ".into()),
        "6758" => Some("ソニーグループ".into()),
        "6762" => Some("TDK".into()),
        "6770" => Some("アルプスアルパイン".into()),
        "6841" => Some("横河電機".into()),
        "6857" => Some("アドバンテスト".into()),
        "6861" => Some("キーエンス".into()),
        "6902" => Some("デンソー".into()),
        "6920" => Some("レーザーテック".into()),
        "6954" => Some("ファナック".into()),
        "6971" => Some("京セラ".into()),
        "6976" => Some("太陽誘電".into()),
        "6981" => Some("村田製作所".into()),
        "6988" => Some("日東電工".into()),
        "7003" => Some("三井E&S".into()),
        "7004" => Some("日立造船".into()),
        "7011" => Some("三菱重工業".into()),
        "7012" => Some("川崎重工業".into()),
        "7013" => Some("IHI".into()),
        "7201" => Some("日産自動車".into()),
        "7202" => Some("いすゞ自動車".into()),
        "7203" => Some("トヨタ自動車".into()),
        "7205" => Some("日野自動車".into()),
        "7211" => Some("三菱自動車工業".into()),
        "7261" => Some("マツダ".into()),
        "7267" => Some("本田技研工業".into()),
        "7269" => Some("スズキ".into()),
        "7270" => Some("SUBARU".into()),
        "7272" => Some("ヤマハ発動機".into()),
        "7309" => Some("シマノ".into()),
        "7731" => Some("ニコン".into()),
        "7733" => Some("オリンパス".into()),
        "7735" => Some("SCREEN HD".into()),
        "7741" => Some("HOYA".into()),
        "7747" => Some("朝日インテック".into()),
        "7751" => Some("キヤノン".into()),
        "7752" => Some("リコー".into()),
        "7832" => Some("バンダイナムコHD".into()),
        "7911" => Some("TOPPAN HD".into()),
        "7912" => Some("大日本印刷".into()),
        "7951" => Some("ヤマハ".into()),
        "7974" => Some("任天堂".into()),
        "8001" => Some("伊藤忠商事".into()),
        "8002" => Some("丸紅".into()),
        "8015" => Some("豊田通商".into()),
        "8031" => Some("三井物産".into()),
        "8035" => Some("東京エレクトロン".into()),
        "8053" => Some("住友商事".into()),
        "8058" => Some("三菱商事".into()),
        "8113" => Some("ユニ・チャーム".into()),
        "8233" => Some("高島屋".into()),
        "8253" => Some("クレディセゾン".into()),
        "8267" => Some("イオン".into()),
        "8303" => Some("三菱UFJニコス".into()),
        "8304" => Some("あおぞら銀行".into()),
        "8306" => Some("三菱UFJフィナンシャルG".into()),
        "8308" => Some("りそなHD".into()),
        "8309" => Some("三井住友トラストHD".into()),
        "8316" => Some("三井住友フィナンシャルG".into()),
        "8331" => Some("千葉銀行".into()),
        "8354" => Some("ふくおかフィナンシャルG".into()),
        "8411" => Some("みずほフィナンシャルG".into()),
        "8418" => Some("山口フィナンシャルG".into()),
        "8439" => Some("東京センチュリー".into()),
        "8473" => Some("SBI HD".into()),
        "8591" => Some("オリックス".into()),
        "8593" => Some("三菱HCキャピタル".into()),
        "8601" => Some("大和証券グループ本社".into()),
        "8604" => Some("野村HD".into()),
        "8628" => Some("松井証券".into()),
        "8630" => Some("SOMPO HD".into()),
        "8697" => Some("日本取引所グループ".into()),
        "8725" => Some("MS&ADインシュアランス".into()),
        "8750" => Some("第一生命HD".into()),
        "8766" => Some("東京海上HD".into()),
        "8795" => Some("T&D HD".into()),
        "8801" => Some("三井不動産".into()),
        "8802" => Some("三菱地所".into()),
        "8803" => Some("平和不動産".into()),
        "8804" => Some("東京建物".into()),
        "8830" => Some("住友不動産".into()),
        "9001" => Some("東武鉄道".into()),
        "9005" => Some("東急".into()),
        "9006" => Some("京浜急行電鉄".into()),
        "9007" => Some("小田急電鉄".into()),
        "9008" => Some("京王電鉄".into()),
        "9009" => Some("京成電鉄".into()),
        "9020" => Some("JR東日本".into()),
        "9021" => Some("JR西日本".into()),
        "9022" => Some("JR東海".into()),
        "9024" => Some("西武HD".into()),
        "9041" => Some("近鉄グループHD".into()),
        "9042" => Some("阪急阪神HD".into()),
        "9064" => Some("ヤマトHD".into()),
        "9101" => Some("日本郵船".into()),
        "9104" => Some("商船三井".into()),
        "9107" => Some("川崎汽船".into()),
        "9142" => Some("JR九州".into()),
        "9201" => Some("日本航空".into()),
        "9202" => Some("ANA HD".into()),
        "9301" => Some("三菱倉庫".into()),
        "9432" => Some("NTT".into()),
        "9433" => Some("KDDI".into()),
        "9434" => Some("ソフトバンク".into()),
        "9435" => Some("光通信".into()),
        "9501" => Some("東京電力HD".into()),
        "9502" => Some("中部電力".into()),
        "9503" => Some("関西電力".into()),
        "9531" => Some("東京ガス".into()),
        "9532" => Some("大阪ガス".into()),
        "9602" => Some("東宝".into()),
        "9613" => Some("NTTデータ".into()),
        "9684" => Some("スクウェア・エニックスHD".into()),
        "9697" => Some("カプコン".into()),
        "9766" => Some("コナミグループ".into()),
        "9843" => Some("ニトリHD".into()),
        "9882" => Some("イエローハット".into()),
        "9962" => Some("ミスミグループ本社".into()),
        "9983" => Some("ファーストリテイリング".into()),
        "9984" => Some("ソフトバンクグループ".into()),
        "9987" => Some("スズケン".into()),
        "9997" => Some("ベルーナ".into()),
        _ => None,
    }
}

// ===== 分足から高値・安値の時刻抽出 =====

fn find_high_low_time(result: &YahooResult) -> (Option<String>, Option<String>) {
    let timestamps = match &result.timestamp {
        Some(ts) => ts,
        None => return (None, None),
    };
    let quote = match result.indicators.quote.first() {
        Some(q) => q,
        None => return (None, None),
    };

    let mut max_val = f64::MIN;
    let mut min_val = f64::MAX;
    let mut max_idx = 0usize;
    let mut min_idx = 0usize;

    for i in 0..timestamps.len().min(quote.high.len()).min(quote.low.len()) {
        if let Some(h) = quote.high.get(i).and_then(|v| *v) {
            if h > max_val { max_val = h; max_idx = i; }
        }
        if let Some(l) = quote.low.get(i).and_then(|v| *v) {
            if l < min_val { min_val = l; min_idx = i; }
        }
    }

    let jst = chrono::FixedOffset::east_opt(9 * 3600).unwrap();
    let to_time = |idx: usize| -> Option<String> {
        let ts = *timestamps.get(idx)?;
        let dt = chrono::DateTime::from_timestamp(ts, 0)?;
        Some(dt.with_timezone(&jst).format("%H:%M").to_string())
    };

    (to_time(max_idx), to_time(min_idx))
}

// ===== 単純移動平均 (最新 + 1つ前) =====

fn last_two_sma(data: &[f64], period: usize) -> (Option<f64>, Option<f64>) {
    if data.len() < period { return (None, None); }
    let latest = data[data.len() - period..].iter().sum::<f64>() / period as f64;
    if data.len() < period + 1 { return (Some(latest), None); }
    let prev = data[data.len() - period - 1..data.len() - 1].iter().sum::<f64>() / period as f64;
    (Some(latest), Some(prev))
}

// ===== EMA（指数移動平均） =====

fn calc_ema(data: &[f64], period: usize) -> Vec<f64> {
    let n = data.len();
    if n < period { return vec![]; }
    let k = 2.0 / (period as f64 + 1.0);
    let mut ema = vec![0.0; n];
    // 初期値はSMA
    ema[period - 1] = data[..period].iter().sum::<f64>() / period as f64;
    for i in period..n {
        ema[i] = data[i] * k + ema[i - 1] * (1.0 - k);
    }
    ema
}

// ===== MACD (12, 26, 9) =====

fn calc_macd_latest(data: &[f64]) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    if data.len() < 35 { return (None, None, None, None); }
    let ema12 = calc_ema(data, 12);
    let ema26 = calc_ema(data, 26);
    let n = data.len();

    let mut macd_line = vec![0.0; n];
    for i in 0..n {
        macd_line[i] = ema12[i] - ema26[i];
    }

    // MACDシグナル = MACDの9日EMA（最初の有効位置から）
    let start = 26; // ema26が有効になる位置
    let macd_slice: Vec<f64> = macd_line.iter().skip(start).copied().collect();
    let sig_ema = calc_ema(&macd_slice, 9);

    if sig_ema.len() < 2 { return (None, None, None, None); }
    let sig_last = sig_ema[sig_ema.len() - 1];
    let sig_prev = sig_ema[sig_ema.len() - 2];
    let macd_last = macd_line[n - 1];
    let macd_prev = macd_line[n - 2];

    (Some(macd_last), Some(sig_last), Some(macd_prev), Some(sig_prev))
}

// ===== RSI (14日) =====

fn calc_rsi(data: &[f64], period: usize) -> Option<f64> {
    if data.len() < period + 1 { return None; }

    let mut gains = 0.0;
    let mut losses = 0.0;
    let n = data.len();

    // 初回
    for i in n - period..n {
        let diff = data[i] - data[i - 1];
        if diff > 0.0 { gains += diff; } else { losses += -diff; }
    }

    let avg_gain = gains / period as f64;
    let avg_loss = losses / period as f64;
    if avg_loss == 0.0 { return Some(100.0); }

    let rs = avg_gain / avg_loss;
    Some(100.0 - 100.0 / (1.0 + rs))
}

// ===== ボリンジャーバンド =====

fn calc_bb(data: &[f64], period: usize, mult: f64) -> Option<(f64, f64, f64)> {
    // returns (middle=SMA, upper, lower) or None
    if data.len() < period { return None; }
    let slice = &data[data.len() - period..];
    let mean = slice.iter().sum::<f64>() / period as f64;
    let var = slice.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / period as f64;
    let std = var.sqrt();
    Some((mean, mean + mult * std, mean - mult * std))
}

// ===== ATR（平均真の値幅） =====

fn calc_atr(closes: &[f64], highs: &[f64], lows: &[f64], period: usize) -> Option<f64> {
    let n = closes.len();
    if n < period + 1 || highs.len() < n || lows.len() < n { return None; }
    let mut tr_sum = 0.0;
    let start = n - period;
    for i in start..n {
        let prev_close = closes[i - 1];
        let tr = (highs[i] - lows[i])
            .max((highs[i] - prev_close).abs())
            .max((lows[i] - prev_close).abs());
        tr_sum += tr;
    }
    Some(tr_sum / period as f64)
}

// ===== 連続方向 =====

fn consecutive_direction(closes: &[f64]) -> Option<(i32, bool)> {
    // returns (count, is_up) or None
    if closes.len() < 3 { return None; }
    let n = closes.len();
    let mut count = 1;
    let is_up = closes[n - 1] > closes[n - 2];
    let mut i = n - 2;
    while i > 0 {
        let current_up = closes[i] > closes[i - 1];
        if current_up == is_up {
            count += 1;
            i -= 1;
        } else {
            break;
        }
    }
    if count >= 3 { Some((count, is_up)) } else { None }
}

// ===== シグナル判定 =====

fn check_signals(
    ma5: Option<f64>, ma5_prev: Option<f64>,
    ma25: Option<f64>, ma25_prev: Option<f64>,
    ma75: Option<f64>, ma75_prev: Option<f64>,
    macd: Option<f64>, macd_sig: Option<f64>,
    macd_prev: Option<f64>, macd_sig_prev: Option<f64>,
    rsi: Option<f64>,
    bb: &Option<(f64, f64, f64)>,
    price: f64,
    cur_vol: f64,
    vol_avg: f64,
    day_range_pct: f64,
    change_pct: f64,
    atr: Option<f64>,
    consecutive: Option<(i32, bool)>,
    day_high: f64,
    day_low: f64,
) -> Vec<String> {
    let mut sigs = Vec::new();

    // --- MAクロス + 状態 ---
    // MA5 × MA25
    if let (Some(m5), Some(m5p), Some(m25), Some(m25p)) = (ma5, ma5_prev, ma25, ma25_prev) {
        if m5p <= m25p && m5 > m25 {
            sigs.push("🟢 GC: MA5がMA25を上抜け".to_string());
        } else if m5p >= m25p && m5 < m25 {
            sigs.push("🔴 DC: MA5がMA25を下抜け".to_string());
        } else if m5 > m25 {
            // 継続中（クロスなし）→ 表示しない（情報過多防止）
        }
    }
    // MA25 × MA75
    if let (Some(m25), Some(m25p), Some(m75), Some(m75p)) = (ma25, ma25_prev, ma75, ma75_prev) {
        if m25p <= m75p && m25 > m75 {
            sigs.push("🟢 GC: MA25がMA75を上抜け".to_string());
        } else if m25p >= m75p && m25 < m75 {
            sigs.push("🔴 DC: MA25がMA75を下抜け".to_string());
        }
    }

    // --- MACDクロス + 状態 ---
    if let (Some(m), Some(s), Some(mp), Some(sp)) = (macd, macd_sig, macd_prev, macd_sig_prev) {
        if mp <= sp && m > s {
            sigs.push("🟢 MACDがシグナルを上抜け（買い）".to_string());
        } else if mp >= sp && m < s {
            sigs.push("🔴 MACDがシグナルを下抜け（売り）".to_string());
        } else if m > s {
            sigs.push("🟢 MACD > Sig（買い継続）".to_string());
        } else {
            sigs.push("🔴 MACD < Sig（売り継続）".to_string());
        }
    }

    // --- RSI ---
    if let Some(r) = rsi {
        if r > 70.0 {
            sigs.push(format!("🟠 RSI={:.0} 買われすぎ（売りサイン）", r));
        } else if r < 30.0 {
            sigs.push(format!("🔵 RSI={:.0} 売られすぎ（買いサイン）", r));
        }
    }

    // --- ボリンジャーバンド ---
    if let Some((_mid, upper, lower)) = bb {
        if price >= *upper {
            sigs.push(format!("🟣 BB+2σ タッチ (上限¥{:.0})", upper));
        } else if price <= *lower {
            sigs.push(format!("🟣 BB-2σ タッチ (下限¥{:.0})", lower));
        }
    }

    // --- 出来高スパイク ---
    if vol_avg > 0.0 && cur_vol > vol_avg * 1.5 {
        let ratio = cur_vol / vol_avg;
        sigs.push(format!("📊 出来高増 {:.1}倍", ratio));
    }

    // --- 日中位置 ---
    if day_range_pct > 80.0 {
        sigs.push("🔺 高値圏".to_string());
    } else if day_range_pct < 20.0 {
        sigs.push("🔻 安値圏".to_string());
    }

    // --- 急変（前日比） ---
    if change_pct >= 5.0 {
        sigs.push(format!("🚀 急騰 +{:.1}%", change_pct));
    } else if change_pct <= -5.0 {
        sigs.push(format!("💥 急落 {:.1}%", change_pct));
    } else if change_pct >= 3.0 {
        sigs.push(format!("📈 大幅高 +{:.1}%", change_pct));
    } else if change_pct <= -3.0 {
        sigs.push(format!("📉 大幅安 {:.1}%", change_pct));
    }

    // --- ATRブレイク ---
    if let Some(a) = atr {
        let day_range = day_high - day_low;
        if a > 0.0 && day_range > a * 2.0 {
            sigs.push("⚡ ATR2倍超 高ボラティリティ".to_string());
        }
    }

    // --- 連続方向 ---
    if let Some((cnt, is_up)) = consecutive {
        if is_up {
            sigs.push(format!("🔥 {}日続騰", cnt));
        } else {
            sigs.push(format!("❄️ {}日続落", cnt));
        }
    }

    sigs
}

// ===== ヘルパー =====

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
