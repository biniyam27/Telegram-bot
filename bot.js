import TelegramBot from "node-telegram-bot-api";
import cron from "node-cron";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import express from "express";

dotenv.config();
const token = process.env.TELEGRAM_BOT_TOKEN;
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

import { GoogleGenerativeAI } from "@google/generative-ai";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Telegram and DB setup
const bot = new TelegramBot(token, { webHook: true });
const url = `https://your-render-app.onrender.com`;
bot.setWebHook(`${url}/bot${token}`);

const db = new Database("subs.db");
db.prepare(
  "CREATE TABLE IF NOT EXISTS subs (chat_id INTEGER PRIMARY KEY)"
).run();

// ✅ Fallback data (when API quota fails)
const fallbackTips = [
  "💡 Use `async/await` instead of callbacks for cleaner async code.",
  "💡 Always validate user input to prevent SQL Injection.",
  "💡 Use environment variables for sensitive data like API keys.",
];

const fallbackTools = [
  "🛠 Postman – Great for testing APIs.",
  "🛠 Docker – Helps you containerize and deploy apps.",
  "🛠 ESLint – Keeps your JavaScript code clean and consistent.",
];
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function retry(fn, attempts = 3, delay = 2000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.warn(`Retry ${i + 1} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Generate using Gemini
async function generateTip(category = "full-stack") {
  try {
    const result = await model.generateContent(
      `Give me one ${category} development tip with an example.`
    );
    return result.response.text() + "\n 🧑‍💻Bina";
  } catch (err) {
    console.error("Gemini API Error:", err.message);
    return "⚠️ Unable to fetch tip right now.";
  }
}

async function generateTool() {
  try {
    const resp = await model.generateContent(
      `Recommend one useful full-stack dev tool with reason.`
    );
    return resp.response.text() + "\n 🧑‍💻Bina";
  } catch (err) {
    console.error("Gemini Tool Error:", err.message);
    return getRandom(fallbackTools);
  }
}

// Subscriber helpers
const addSub = (id) =>
  db.prepare("INSERT OR IGNORE INTO subs (chat_id) VALUES (?)").run(id);
const removeSub = (id) =>
  db.prepare("DELETE FROM subs WHERE chat_id = ?").run(id);
const getSubs = () =>
  db
    .prepare("SELECT chat_id FROM subs")
    .all()
    .map((r) => r.chat_id);

// Commands
bot.onText(/\/start/, (msg) => {
  addSub(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    `✅ You are now subscribed to Bina daily full-stack tips, \n 
    🧑‍💻For More Information use this command \n 
       ${"/start"} For restart bot \n
       ${"/stop"} For stop or log out from bot \n
       ${"/tip"} For coding tips \n
       ${"/tool"} For tool recommendation \n
       ${"/about"} For about developer \n
       🥰Happy Coding! \n`.trim()
  );
});
bot.onText(/\/stop/, (msg) => {
  removeSub(msg.chat.id);
  bot.sendMessage(msg.chat.id, "❌ Unsubscribed.");
});
bot.onText(/\/tip(?: (.+))?/, async (msg, match) => {
  const cat = (match[1] || "full-stack").toLowerCase();
  const valid = ["frontend", "backend", "database", "devops", "full-stack"];
  if (!valid.includes(cat))
    return bot.sendMessage(
      msg.chat.id,
      "Use: frontend, backend, database, devops."
    );
  const tip = await retry(() => generateTip(cat), 3, 2000).catch((_) =>
    getRandom(fallbackTips)
  );
  bot.sendMessage(msg.chat.id, `🔥 ${cat.toUpperCase()} Tip:\n${tip}`);
});
bot.onText(/\/tool/, async (msg) => {
  const tool = await retry(generateTool, 3, 2000).catch((_) =>
    getRandom(fallbackTools)
  );
  bot.sendMessage(msg.chat.id, `🛠 Tool Recommendation:\n${tool}`);
});

//About Developer
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `✅ I'm Binyam Tadele Full-Stack Web Developer,
     This Bot is support your coding journey,
     \n you can Join my Telegram channel t.me/aibina_tube
     Happy Coding!`
  );
});

// Daily job at 2 AM
cron.schedule(
  "0 23 * * *",
  async () => {
    const subs = getSubs();
    subs.forEach(async (id) => {
      const tip = await retry(generateTip, 3, 2000).catch((_) =>
        getRandom(fallbackTips)
      );
      const tool = await retry(generateTool, 3, 2000).catch((_) =>
        getRandom(fallbackTools)
      );
      bot.sendMessage(id, `*Daily Full-Stack Tip*\n${tip}`, {
        parse_mode: "Markdown",
      });
      bot.sendMessage(id, `*Tool Recommendation*\n${tool}`, {
        parse_mode: "Markdown",
      });
    });
  },
  {
    timezone: "Africa/Addis_Ababa",
  }
);

console.log("🚀 Gemini-powered bot running!");

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Simple route for health check
app.get("/", (req, res) => {
  res.send("Telegram Bot is running ✅");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
