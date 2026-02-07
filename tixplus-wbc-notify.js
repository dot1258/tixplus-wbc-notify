const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, ".env") })
const axios = require("axios")
const cheerio = require("cheerio")
const cron = require("node-cron")

const CONFIG = {
  CHANNEL_ACCESS_TOKEN: process.env.CHANNEL_ACCESS_TOKEN, // LINE Messaging API 的 Channel Access Token
  USER_ID: process.env.USER_ID, // 你的 LINE User ID (U開頭)
  TARGET_URL: "https://tradead.tixplus.jp/wbc2026", // tixplus 售票網址
  CHECK_INTERVAL: "*/5 * * * *", // cron 格式，每 5 分鐘檢查一次（可自行調整）
  NUMBER_OF_REMINDERS: 1, // 刊登數量提醒，預設 1，意即只要有刊登就會提醒
}

// 主程式
async function checkTicketsAndNotify() {
  try {
    console.log("正在檢查票務資訊...")

    if (!CONFIG.CHANNEL_ACCESS_TOKEN || !CONFIG.USER_ID) {
      console.error("錯誤: 未設定 CHANNEL_ACCESS_TOKEN 或 USER_ID。請檢查 .env 檔案或環境變數。")
      return
    }

    // 1. 抓取網頁內容
    const response = await axios.get(CONFIG.TARGET_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.4472.124 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
    })

    const html = response.data
    const $ = cheerio.load(html)

    // 2. 尋找含有 data-page 的元素
    // 注意：通常在 body 或 id="app" 的 div 上。這裡假設在 body 或某個主要容器
    // 如果找不到，請檢查網頁原始碼該屬性在哪個 tag 上
    let encodedData = $("[data-page]").attr("data-page")

    if (!encodedData) {
      console.log("未找到 data-page 屬性，可能網頁結構改變或需要登入。")
      return
    }

    //   console.log(encodedData)
    // 3. 解碼 JSON
    // 網頁通常使用 URL Encode，所以我們使用 decodeURIComponent
    const jsonString = decodeURIComponent(encodedData)
    const data = JSON.parse(jsonString)

    //   console.log("解碼後的資料:", JSON.stringify(data, null, 2)) // 偵錯用，第一次執行建議打開看結構

    // 4. 解析需要的資訊 (這裡需要根據實際 JSON 結構調整)
    // 假設 data 結構裡有 props -> tickets 或類似的陣列
    // 請根據實際 log 出來的結構修改以下變數路徑

    // 範例：假設資料在 data.props.initialState.tickets
    // 如果 data 本身就是陣列，直接用 data.map
    const ticketInfoList = extractTicketInfo(data)

    if (ticketInfoList.length === 0) {
      console.log("目前沒有刊登資訊。")
      return
    }

    // 5. 製作 LINE 訊息內容
    const messageText = formatLineMessage(ticketInfoList)
    console.log(messageText)

    // 6. 發送訊息
    await sendLineMessage(messageText)
  } catch (error) {
    console.error("發生錯誤:", error.message)
    // In CI/Action environment, failure should exit with error code
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      process.exit(1)
    }
  }
}

// 輔助函式：提取關鍵資訊 (需根據實際 JSON 結構客製化)
function extractTicketInfo(jsonData) {
  let results = []

  // !!! 關鍵修改點 !!!
  // 以下是假設結構，你需要根據 console.log 的結果來修改路徑
  // 例如：可能是 jsonData.props.events 或 jsonData.componentProps.items

  // 模擬抓取邏輯 (範例)
  const items = jsonData?.props?.concerts || []

  items.forEach((item) => {
    // Check if listing count meets threshold AND name contains target team
    if (
      item.listings_count >= CONFIG.NUMBER_OF_REMINDERS &&
      item.name &&
      item.name.includes("チャイニーズ・タイペイ")
    ) {
      results.push({
        name: item.name || "未知賽事",
        date: item.concert_date || "未知日期",
        //  status: item.status || "銷售中", // 例如：有無票券
        listings_count: item.listings_count || "詳見官網",
      })
    }
  })

  // 如果找不到陣列，為了測試先回傳一個假資料 (正式上線請移除)
  //   if (results.length === 0) {
  //     results.push({ name: "WBC 2026 測試票券", date: "2026/03/08", status: "有票", price: "1000 JPY" })
  //   }

  return results
}

async function sendLineMessage(text) {
  const url = "https://api.line.me/v2/bot/message/push"

  const payload = {
    to: CONFIG.USER_ID,
    messages: [
      {
        type: "text",
        text: text,
      },
    ],
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.CHANNEL_ACCESS_TOKEN}`,
      },
    })

    if (response.status === 200) {
      console.log("LINE 通知發送成功")
    } else {
      console.error("LINE 發送失敗:", response.data)
    }
  } catch (error) {
    console.error("LINE 發送錯誤:", error.response?.data || error.message)
  }
}

// 輔助函式：排版 LINE 訊息
function formatLineMessage(ticketList) {
  let content = `⚾ TIXPLUS 2026WBC 票務快訊 ⚾\n\n`

  ticketList.forEach((ticket) => {
    content += `🏟 ${ticket.name}\n`
    content += `📅 賽事日期：: ${ticket.date}\n`
    content += `💰 刊登數: ${ticket.listings_count}\n`
    //   content += `📊 狀態: ${ticket.status}\n`
    content += `------------------\n`
  })

  content += `\n🔗 立即查看:\n${CONFIG.TARGET_URL}`

  return content
}

// ==================== 啟動 ====================

// Check if running in GitHub Actions or CI environment
if (process.env.GITHUB_ACTIONS || process.env.CI) {
  console.log("Running in CI/One-off mode...")
  checkTicketsAndNotify()
} else {
  // Running locally or on a VPS
  console.log("門票監控腳本已啟動，檢查間隔:", CONFIG.CHECK_INTERVAL)

  // Run immediately on start
  checkTicketsAndNotify()

  // Schedule periodic checks
  cron.schedule(CONFIG.CHECK_INTERVAL, () => {
    checkTicketsAndNotify()
  })
}

