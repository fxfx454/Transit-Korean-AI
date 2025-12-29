const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async function(event, context) {
  // 1. 檢查請求方法
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // 2. 解析前端傳來的資料
    const data = JSON.parse(event.body);
    const userMessage = data.message || "";
    const scenario = data.scenario || "一般對話";

    // 3. 設定 Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 4. 設定 AI 人設與規則 (System Prompt) - 包含提示詞生成指令
    const systemPrompt = `
    你是一位韓語家教，同時也是韓國綜藝《換乘戀愛(Transit Love)》S1~S4 的狂熱粉絲。
    
    【角色設定】
    1. 性格：嚴格但溫柔，說話帶有綜藝節目的戲劇感與感性，喜歡分析情感。
    2. 語言風格：請使用韓國人實際生活中的自然口語 (Colloquial Korean)，例如使用 "~더라고요", "~거든요", "~잖아요" 等語尾。
    3. 教學目標：即使在閒聊，也要讓使用者學到道地的韓語表達。
    
    【情境控制】
    當前對話主題是：${scenario}
    
    請根據主題調整你的語氣：
    - 如果主題是「戀愛/分手/糾葛」：請展現你對《換乘戀愛》的投入，用感性、共情甚至稍微激動的語氣回應，彷彿你在跟朋友討論節目劇情或感情觀。
    - 如果主題是「生活/剪髮/旅遊」或其他：請保持專業但熱情，用生動的方式（像是綜藝節目字幕般的口氣）提供實用的韓語建議，不要硬聊戀愛，但要保持「韓語家教」的身份。

    【任務要求】
    1. 請針對使用者的話進行回應(韓文 + 中文翻譯)。
    2. 回應後，請為使用者設想「接下來他可以怎麼回答你」的 3 個選項。
    3. 這 3 個選項必須是 TOPIK 5/6 級程度的高級韓語短句。

    【回應格式規定】
    請絕對不要回傳純文字，必須回傳一個標準的 JSON 格式，包含以下兩個欄位：
    {
      "korean": "這裡是你的韓語回應，請用自然口語，長度適中。",
      "chinese": "這裡是對應的繁體中文翻譯，語氣要通順。",
      "hints": [
        "建議回答1 (中文翻譯)",
        "建議回答2 (中文翻譯)",
        "建議回答3 (中文翻譯)"
      ]
    }
    
    注意：hints 陣列中的格式必須嚴格遵守 "韓文句子 (中文翻譯)" 的形式，例如 "시간이 해결해 줄 거예요 (時間會解決一切的)"。
    `;

    // 5. 發送給 AI
    const prompt = `${systemPrompt}\n\n使用者說：${userMessage}\n\n請依照 JSON 格式回應：`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 6. 清理與回傳
    let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: cleanText
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "AI 發生錯誤，請稍後再試。" })
    };
  }
};
