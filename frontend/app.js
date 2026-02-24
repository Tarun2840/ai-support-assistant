
const root = document.getElementById("root");

let sessionId = localStorage.getItem("sessionId");
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem("sessionId", sessionId);
}

root.innerHTML = `
  <h2>AI Support Assistant</h2>
  <div id="messages"></div>
  <input id="msg" placeholder="Type message..." />
  <button onclick="send()">Send</button>
`;

async function send() {
  const msgInput = document.getElementById("msg");
  const message = msgInput.value;

  if (!message) return;

  msgInput.value = "";

  try {
    const res = await fetch("http://localhost:5000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message })
    });

    const data = await res.json();

    document.getElementById("messages").innerHTML += `
      <p><b>You:</b> ${message}</p>
      <p><b>Assistant:</b> ${data.reply || data.error || "No response"}</p>
    `;

  } catch (error) {
    document.getElementById("messages").innerHTML += `
      <p><b>Error:</b> Server not reachable</p>
    `;
  }
}
