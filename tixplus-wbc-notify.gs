/**************************************
 * 設定
 **************************************/
const TARGET_URL = "https://tradead.tixplus.jp/wbc2026"

/**************************************
 * 主程式
 **************************************/
function checkTicketsAndNotify() {
  try {
    Logger.log("正在檢查票務資訊...")

    // 1. 抓取網頁
    const response = UrlFetchApp.fetch(TARGET_URL, {
      muteHttpExceptions: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
      },
    })

    const html = response.getContentText()

    // 2. 擷取 data-page（GAS 無 cheerio，用正則）
    const match = html.match(/data-page="([^"]+)"/)

    if (!match || !match[1]) {
      Logger.log("未找到 data-page，可能結構改變或需登入")
      return
    }

    // 3. 解碼並轉 JSON
    const rawDataPage = match[1]

    // HTML Entity 解碼
    const jsonString = decodeHtmlEntities(rawDataPage)

    // 偵錯用（第一次一定要看）
    // Logger.log(jsonString.substring(0, 500))

    const data = JSON.parse(jsonString)

    // 4. 解析票務資料
    const ticketInfoList = extractTicketInfo(data)

    if (ticketInfoList.length === 0) {
      Logger.log("目前沒有刊登資訊")
      return
    }

    // 5. 組 LINE 訊息
    const messageText = formatLineMessage(ticketInfoList)

    // 6. 發送 LINE 通知
    sendLinePushMessage(messageText)

    Logger.log("LINE 通知已送出")
  } catch (err) {
    Logger.log("發生錯誤：" + err)
  }
}

/**************************************
 * 解析票務資料（依實際結構自行調整）
 **************************************/
function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function extractTicketInfo(jsonData) {
  const NUMBER_OF_REMINDERS = PropertiesService.getScriptProperties().getProperty("NUMBER_OF_REMINDERS")
  const results = []

  // ⚠️ 這裡是「假設結構」，請用 Logger.log(JSON.stringify(jsonData)) 檢查
  const items = jsonData?.props?.concerts || []

  items.forEach((item) => {
    if (item.listings_count >= NUMBER_OF_REMINDERS) {
      results.push({
        name: item.name || "未知賽事",
        date: item.concert_date || "未知日期",
        listings_count: item.listings_count,
      })
    }
  })

  // 測試用（正式可刪）
  // if (results.length === 0) {
  //   results.push({
  //     name: "WBC 2026 測試票券",
  //     date: "2026/03/08",
  //     listings_count: 5,
  //   })
  // }

  return results
}

/**************************************
 * 組 LINE 訊息
 **************************************/
function formatLineMessage(ticketList) {
  let content = "⚾ TIXPLUS 2026WBC 票務快訊 ⚾\n\n"

  ticketList.forEach((ticket) => {
    content += `🏟 ${ticket.name}\n`
    content += `📅 賽事日期：${ticket.date}\n`
    content += `🎫 刊登數：${ticket.listings_count}\n`
    content += "------------------\n"
  })

  content += `\n🔗 立即查看：\n${TARGET_URL}`

  return content
}

/**************************************
 * LINE Push Message
 **************************************/
function sendLinePushMessage(messageText) {
  const CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty("CHANNEL_ACCESS_TOKEN")
  const LINE_USER_ID = PropertiesService.getScriptProperties().getProperty("LINE_USER_ID")

  const url = "https://api.line.me/v2/bot/message/push"

  const payload = {
    to: LINE_USER_ID,
    messages: [
      {
        type: "text",
        text: messageText,
      },
    ],
  }

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + CHANNEL_ACCESS_TOKEN,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  }

  UrlFetchApp.fetch(url, options)
}
