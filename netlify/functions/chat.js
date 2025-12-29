exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const userMessage = data.message || "";
    const scenario = data.scenario || "一般對話";
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. 【新邏輯】先詢問 Google 這把鑰匙有哪些模型可用
    const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const modelsResp = await fetch(modelsUrl);
    
    if (!modelsResp.ok) {
      const err = await modelsResp.json();
      throw new Error(`無法獲取模型列表: ${err.error?.message || modelsResp.statusText}`);
    }

    const modelsData = await modelsResp.json();
    
    // 2. 自動挑選一個支援 "generateContent" 的模型 (優先找 flash, 次選 pro)
    let validModel = modelsData.models.find(m => 
      m.supportedGenerationMethods.includes("generateContent") && m.name.includes("flash")
    );
    
    if (!validModel) {
      validModel = modelsData.models.find(m => 
        m.supportedGenerationMethods.includes("generateContent") && m.name.includes("pro")
      );
    }
    
    // 如果真的都沒找到，隨便抓一個能用的
    if (!validModel) {
      validModel = modelsData.models.find(m => m.supportedGenerationMethods.includes("generateContent"));
    }

    if (!validModel) {
      throw new Error("您的 API Key 似乎沒有任何可用的對話模型權限。");
    }

    console.log("Auto-selected Model:", validModel.name); // 記錄選到了誰

    // 3. 設定 Prompt (維持不變)
    const systemPrompt = `
    你是一位嚴格但溫柔的韓語專業家教，同時也是韓國綜藝《換乘戀愛(Transit Love)》S1~S4 的粉絲&忠實觀眾。
    
    【重要指令：長度控制】
    1. 你的回應必須 **簡潔有力**，就像真實的通訊軟體聊天。
    2. **韓文回應長度請限制在 2~3 句話以內 (約 100 字內)**。
    3. 嚴禁發表長篇大論或演講，請給使用者說話的機會。
    
    【角色設定】
    1. 性格：教學時嚴格但溫柔，說話帶有綜藝節目的戲劇感與感性，喜歡分析情感。
    2. 語言風格：請務必使用韓國人實際生活中的自然口語 (Colloquial Korean)，例如 "~더라고요", "~거든요", "~잖아요" 等語尾。
    3. 應對原則：即使在閒聊，也要讓使用者學到道地的韓語表達。
    
    【情境控制】
    當前對話主題是：${scenario}
    
    請根據主題調整你的語氣：
    - 如果主題是「戀愛/分手/糾葛」：請展現你對《換乘戀愛》的投入，用感性、共情甚至稍微激動的語氣回應。
    - 如果主題是「生活/剪髮/旅遊」或其他：請保持專業但熱情，用生動的方式（像是綜藝節目字幕般的口氣）提供實用的韓語建議，不要硬聊戀愛，但要保持「韓語專業家教」的身份。

    【任務要求】
    1. 針對使用者的話進行簡短回應 (韓文 + 中文翻譯)。
    2. 回應後，請為使用者設想「接下來他可以怎麼回答你」的 3 個選項。
    3. 這 3 個選項必須是 TOPIK 5/6 級程度的高級韓語短句。

    【回應格式規定】
    請絕對不要回傳純文字，必須回傳一個標準的 JSON 格式 (嚴禁使用 markdown 符號)：
    {
      "korean": "你的韓語簡短回應(2-3句內)",
      "chinese": "對應的繁體中文翻譯",
      "hints": ["建議1 (中)", "建議2 (中)", "建議3 (中)"]
    }

    注意：hints 陣列中的格式必須嚴格遵守 "韓文句子 (中文翻譯)" 的形式，例如 "시간이 해결해 줄 거예요 (時間會解決一切的)"。
    `;

    const finalPrompt = `${systemPrompt}\n\n使用者說：${userMessage}\n\n請依照 JSON 格式回應：`;

    // 4. 使用自動選到的模型發送請求
    // validModel.name 格式通常是 "models/gemini-1.5-flash"
    const chatUrl = `https://generativelanguage.googleapis.com/v1beta/${validModel.name}:generateContent?key=${apiKey}`;

    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error (${validModel.name}): ${errorData.error?.message}`);
    }

    const resultData = await response.json();
    
    if (!resultData.candidates || resultData.candidates.length === 0) {
      throw new Error("No content generated");
    }

    const rawText = resultData.candidates[0].content.parts[0].text;
    let cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: cleanText
    };

  } catch (error) {
    console.error("Critical Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `系統錯誤: ${error.message}` })
    };
  }
};
