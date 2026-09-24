```javascript
require("dotenv").config();

const express = require("express");
const redis = require("redis");
const { GoogleGenAI } = require("@google/genai");

const app = express();

// ==========================================
// CONFIGURATION
// ==========================================

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==========================================
// GEMINI AI
// ==========================================

if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY tsy hita ao amin'ny Environment Variables.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// ==========================================
// REDIS
// ==========================================

const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (err) => {
    console.error("❌ Hadisoana Redis:", err);
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
    res.status(200).json({
        status: "online",
        message: "FAST BOT MALAGASY server mandeha tsara.",
        webhook: "/webhook"
    });
});

// ==========================================
// FACEBOOK WEBHOOK VERIFICATION
// ==========================================

app.get("/webhook", (req, res) => {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("📩 Facebook Webhook verification request");

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {

        console.log("✅ Facebook Webhook voamarina!");

        return res.status(200).send(challenge);
    }

    console.log("❌ Facebook Webhook verification tsy nahomby.");

    return res.sendStatus(403);
});

// ==========================================
// FACEBOOK WEBHOOK POST
// ==========================================

app.post("/webhook", async (req, res) => {

    // Valio avy hatrany Facebook
    res.sendStatus(200);

    const body = req.body;

    console.log("=================================");
    console.log("📩 FACEBOOK WEBHOOK RECEIVED");
    console.log(JSON.stringify(body, null, 2));
    console.log("=================================");

    // ======================================
    // FACEBOOK PAGE EVENT
    // ======================================

    if (body.object !== "page") {
        console.log("⚠️ Tsy Page event.");
        return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {

        const messagingEvents = entry.messaging || [];

        for (const webhookEvent of messagingEvents) {

            try {

                // ==================================
                // Sender PSID
                // ==================================

                if (
                    !webhookEvent.sender ||
                    !webhookEvent.sender.id
                ) {
                    console.log("⚠️ Tsy misy sender PSID.");
                    continue;
                }

                const sender_psid = webhookEvent.sender.id;

                // ==================================
                // Tsy message text
                // ==================================

                if (
                    !webhookEvent.message ||
                    !webhookEvent.message.text
                ) {
                    console.log("⚠️ Event tsy text message.");
                    continue;
                }

                const userMessage =
                    webhookEvent.message.text.trim();

                console.log(
                    `👤 [${sender_psid}] : ${userMessage}`
                );

                // ==================================
                // STATUS FREE / PRO
                // ==================================

                let userStatus =
                    await redisClient.get(
                        `status:${sender_psid}`
                    );

                userStatus = userStatus || "FREE";

                // ==================================
                // PRO USER
                // ==================================

                if (userStatus === "PRO") {

                    console.log(
                        `⭐ [PRO USER] ${sender_psid}`
                    );

                    const cacheKey =
                        `chat_history:${sender_psid}`;

                    let historyRaw =
                        await redisClient.get(cacheKey);

                    let history = [];

                    if (historyRaw) {
                        try {
                            history = JSON.parse(historyRaw);
                        } catch (e) {
                            console.log(
                                "⚠️ Memory Redis simba."
                            );

                            history = [];
                        }
                    }

                    // Hafatra avy amin'ny user
                    history.push({
                        role: "user",
                        parts: [
                            {
                                text: userMessage
                            }
                        ]
                    });

                    try {

                        const response =
                            await ai.models.generateContent({

                                model: "gemini-2.5-flash",

                                contents: history,

                                config: {
                                    systemInstruction:
                                        "Mpanampy nomerika matihanina ianao. " +
                                        "Mamalia amin'ny teny Malagasy foana. " +
                                        "Mazava, haingana ary manampy ny mpampiasa."
                                }
                            });

                        const aiResponse =
                            response.text || "Miala tsiny, tsy nahazo valiny aho.";

                        console.log(
                            `🤖 GEMINI PRO: ${aiResponse}`
                        );

                        // Ampidiro ao amin'ny memory
                        history.push({
                            role: "model",
                            parts: [
                                {
                                    text: aiResponse
                                }
                            ]
                        });

                        // Tazomina 10 messages farany
                        if (history.length > 10) {
                            history =
                                history.slice(-10);
                        }

                        // Tehirizo Redis
                        await redisClient.set(
                            cacheKey,
                            JSON.stringify(history)
                        );

                        // TODO:
                        // Alefa eto amin'ny Facebook Messenger
                        // ny aiResponse

                        console.log(
                            "📤 PRO response vonona halefa amin'ny Messenger."
                        );

                    } catch (aiError) {

                        console.error(
                            "❌ Gemini PRO error:",
                            aiError
                        );
                    }

                }

                // ==================================
                // FREE USER
                // ==================================

                else {

                    let messageCount =
                        await redisClient.get(
                            `count:${sender_psid}`
                        );

                    messageCount =
                        messageCount
                            ? parseInt(messageCount, 10)
                            : 0;

                    // ------------------------------
                    // Mbola manana FREE message
                    // ------------------------------

                    if (messageCount < 5) {

                        messageCount++;

                        await redisClient.set(
                            `count:${sender_psid}`,
                            messageCount.toString()
                        );

                        console.log(
                            `🆓 FREE USER - Message ${messageCount}/5`
                        );

                        try {

                            const response =
                                await ai.models.generateContent({

                                    model: "gemini-2.5-flash",

                                    contents: userMessage,

                                    config: {
                                        systemInstruction:
                                            "Mpanampy nomerika amin'ny teny Malagasy ianao. " +
                                            "Mamalia amin'ny teny Malagasy foana. " +
                                            "Ataovy mazava sy fohy ny valiny."
                                    }
                                });

                            const aiResponse =
                                response.text ||
                                "Miala tsiny, tsy nahazo valiny aho.";

                            console.log(
                                `🤖 GEMINI FREE: ${aiResponse}`
                            );

                            // TODO:
                            // Alefa amin'ny Facebook Messenger

                            console.log(
                                "📤 FREE response vonona halefa."
                            );

                        } catch (aiError) {

                            console.error(
                                "❌ Gemini FREE error:",
                                aiError
                            );
                        }

                    }

                    // ------------------------------
                    // FREE lany
                    // ------------------------------

                    else {

                        const proInstructions =
                            `Miala tsiny indrindra! Efa lany ny hafatra 5 maimaim-poana ho anao.

Mba hahafahanao manohy mampiasa ilay bot, miaraka amin'ny memory sy valiny haingana, afaka miditra amin'ny tolotra PRO ianao.

💰 PRO: 25 000 Ar / volana

📱 MVola / Airtel Money / Orange Money:
032 66 606 95

Rehefa vita ny fandoavana dia alefaso eto ny capture d'écran na porofo fandoavana mba hampandehanana ny kaontinao PRO.`;

                        console.log(
                            "💳 FREE quota lany."
                        );

                        console.log(
                            proInstructions
                        );

                        // TODO:
                        // Alefa amin'ny Messenger
                        // proInstructions
                    }
                }

            } catch (error) {

                console.error(
                    "❌ Error processing webhook event:",
                    error
                );
            }
        }
    }
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {

    console.error(
        "❌ Server Error:",
        err
    );

    if (!res.headersSent) {
        res.status(500).json({
            error: "Internal Server Error"
        });
    }
});

// ==========================================
// START SERVER
// ==========================================

async function startServer() {

    try {

        // Connect Redis
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        console.log("✅ Redis connected.");

        app.listen(PORT, "0.0.0.0", () => {

            console.log(
                `🚀 Server mandeha amin'ny port ${PORT}`
            );

            console.log(
                `🌐 Webhook: /webhook`
            );
        });

    } catch (error) {

        console.error(
            "❌ Tsy afaka nanomboka ny serveur:",
            error
        );

        process.exit(1);
    }
}

startServer();
```

