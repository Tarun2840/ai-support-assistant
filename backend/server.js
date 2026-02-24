
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20
});
app.use(limiter);

const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function buildPrompt(docs, history, userMessage) {
  return `You are a support assistant.
Only answer using the provided documentation.
If answer not found, reply exactly:
"Sorry, I don’t have information about that."

DOCUMENTATION:
${docs.map(d => d.title + ": " + d.content).join("\n")}

CHAT HISTORY:
${history.map(m => m.role + ": " + m.content).join("\n")}

USER QUESTION:
${userMessage}

Answer:`;
}

app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: "Missing sessionId or message" });
  }

  db.run("INSERT OR IGNORE INTO sessions (id) VALUES (?)", [sessionId]);
  db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
    [sessionId, "user", message]);

  db.all(`SELECT role, content FROM messages
          WHERE session_id = ?
          ORDER BY created_at DESC LIMIT 10`,
    [sessionId], async (err, rows) => {

      const history = rows.reverse();
      const docs = JSON.parse(fs.readFileSync("./docs.json"));

      const prompt = buildPrompt(docs, history, message);

      try {
        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
            }
          }
        );

        const reply = response.data.choices[0].message.content;

        db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
          [sessionId, "assistant", reply]);

        res.json({ reply, tokensUsed: response.data.usage.total_tokens });

      } catch (error) {
        res.status(500).json({ error: "LLM API failure" });
      }
    });
});

app.get("/api/conversations/:sessionId", (req, res) => {
  db.all("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
    [req.params.sessionId], (err, rows) => {
      res.json(rows);
    });
});

app.get("/api/sessions", (req, res) => {
  db.all("SELECT * FROM sessions ORDER BY updated_at DESC", [], (err, rows) => {
    res.json(rows);
  });
});

app.listen(5000, () => console.log("Server running on port 5000"));
