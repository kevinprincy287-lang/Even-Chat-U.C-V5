require("dotenv").config();

const express = require("express");
const redis = require("redis");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const REDIS_URL = process.env.REDIS_URL;

const FREE_LIMIT = 5;
const PRO_PRICE = "25 000 Ar / volana";
const PAYMENT_NUMBER = "0326660695";
const MAX_HISTORY = 10;

console.log("=================================");
console.log("FAST BOT MALAGASY - STARTING");
console.log("=================================");

if (!GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY tsy hita.");
    process.exit(1);
}

if (!VERIFY_TOKEN) {
    console.error("ERROR: VERIFY_TOKEN tsy hita.");
    process.exit(1);
}

if (!PAGE_ACCESS_TOKEN) {
    console.error("ERROR: PAGE_ACCESS_TOKEN tsy hita.");
    process.exit(1);
}

if (!REDIS_URL) {
    console.error("ERROR: REDIS_URL tsy hita.");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});

const redisClient = redis.createClient({
    url: REDIS_URL
});

redisClient.on("error", function (error) {
    console.error("Redis Error:", error);
});

redisClient.on("connect", function () {
    console.log("Redis connecting...");
});

redisClient.on("ready", function () {
    console.log("Redis ready.");
});


// =====================================
// HOME
// =====================================

app.get("/", function (req, res) {
    res.status(200).json({
        status: "online",
        service: "FAST BOT MALAGASY",
        webhook: "/webhook"
    });
});


// =====================================
// HEALTH CHECK
// =====================================

app.get("/health", function (req, res) {
    res.status(200).json({
        server: "OK",
        redis: redisClient.isReady ? "OK" : "NOT_READY",
        gemini: GEMINI_API_KEY ? "OK" : "MISSING",
        facebook: PAGE_ACCESS_TOKEN ? "OK" : "MISSING"
    });
});


// =====================================
// FACEBOOK WEBHOOK VERIFICATION
// =====================================

app.get("/webhook", function (req, res) {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("=================================");
    console.log("FACEBOOK WEBHOOK GET");
    console.log("Mode:", mode);
    console.log("Token received:", token ? "YES" : "NO");
    console.log("Challenge received:", challenge ? "YES" : "NO");
    console.log("=================================");

    if (
        mode === "subscribe" &&
        token === VERIFY_TOKEN
    ) {
        console.log("FACEBOOK WEBHOOK VERIFIED.");

        return res
            .status(200)
            .send(challenge);
    }

    console.log("FACEBOOK WEBHOOK VERIFICATION FAILED.");

    return res.sendStatus(403);
});


// =====================================
// FACEBOOK SEND MESSAGE
// =====================================

async function sendFacebookMessage(psid, message) {

    try {

        const response = await fetch(
            "https://graph.facebook.com/v26.0/me/messages",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    recipient: {
                        id: psid
                    },

                    messaging_type: "RESPONSE",

                    message: {
                        text: message
                    },

                    access_token: PAGE_ACCESS_TOKEN
                })
            }
        );

        const data = await response.json();

        console.log("FACEBOOK SEND RESPONSE:");
        console.log(JSON.stringify(data, null, 2));

        if (!response.ok) {

            console.error(
                "Facebook Send API Error:",
                JSON.stringify(data)
            );

            return false;
        }

        console.log("Facebook message sent.");

        return true;

    } catch (error) {

        console.error(
            "Facebook Send Error:",
            error
        );

        return false;
    }
}


// =====================================
// GEMINI FREE
// =====================================

async function generateFreeResponse(userMessage) {

    try {

        const response = await ai.models.generateContent({

            model: "gemini-2.5-flash",

            contents: userMessage,

            config: {

                systemInstruction:
                    "Ianao dia mpanampy nomerika matihanina. " +
                    "Mamalia amin'ny teny Malagasy foana. " +
                    "Ataovy mazava, fohy ary manampy. " +
                    "Aza mamorona vaovao tsy fantatra."

            }
        });

        return (
            response.text ||
            "Miala tsiny, tsy nahazo valiny aho."
        );

    } catch (error) {

        console.error(
            "Gemini FREE Error:",
            error
        );

        throw error;
    }
}


// =====================================
// GEMINI PRO WITH MEMORY
// =====================================

async function generateProResponse(history) {

    try {

        const response = await ai.models.generateContent({

            model: "gemini-2.5-flash",

            contents: history,

            config: {

                systemInstruction:
                    "Ianao dia mpanampy nomerika PRO matihanina. " +
                    "Mamalia amin'ny teny Malagasy foana. " +
                    "Tadidio ny contexte sy ny resaka teo aloha. " +
                    "Ataovy mazava, haingana ary manampy. " +
                    "Aza averina tsy amin'ny antony ny valiny teo aloha."

            }
        });

        return (
            response.text ||
            "Miala tsiny, tsy nahazo valiny aho."
        );

    } catch (error) {

        console.error(
            "Gemini PRO Error:",
            error
        );

        throw error;
    }
}


// =====================================
// PRO MESSAGE
// =====================================

function getProMessage() {

    return (
        "EFA LANY NY HAFATRA FREE 5 NAO.\n\n" +

        "TOLOTRA PRO\n" +

        "Vidiny: " +
        PRO_PRICE +
        "\n\n" +

        "Ny PRO dia ahafahanao:\n" +

        "- Mahazo valiny haingana\n" +

        "- Mitahiry sy mahatadidy ny resaka\n" +

        "- Manohy mampiasa ny bot\n" +

        "- Mahazo traikefa PRO\n\n" +

        "FANDOAVANA:\n" +

        "MVola / Airtel Money / Orange Money\n" +

        "Laharana: " +
        PAYMENT_NUMBER +
        "\n\n" +

        "Rehefa vita ny fandoavana dia alefaso eto " +
        "ny capture na porofo fandoavana mba " +
        "hampandehanana ny kaontinao PRO."
    );
}


// =====================================
// FACEBOOK WEBHOOK POST
// =====================================

app.post("/webhook", async function (req, res) {

    console.log("=================================");
    console.log("FACEBOOK EVENT RECEIVED");
    console.log("=================================");

    console.log(
        JSON.stringify(
            req.body,
            null,
            2
        )
    );

    // Valio haingana i Meta
    res.sendStatus(200);

    const body = req.body;

    if (!body) {
        console.log("Empty body.");
        return;
    }

    if (body.object !== "page") {

        console.log(
            "Not a Facebook Page event."
        );

        return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {

        const messaging =
            entry.messaging || [];

        for (const event of messaging) {

            try {

                console.log("---------------------------------");
                console.log("MESSAGING EVENT");

                if (
                    event.sender &&
                    event.sender.id
                ) {

                    console.log(
                        "Sender:",
                        event.sender.id
                    );
                }

                // Ignore delivery
                if (event.delivery) {

                    console.log(
                        "Delivery event ignored."
                    );

                    continue;
                }

                // Ignore read
                if (event.read) {

                    console.log(
                        "Read event ignored."
                    );

                    continue;
                }

                // Ignore postback for now
                if (event.postback) {

                    console.log(
                        "Postback received."
                    );

                    continue;
                }

                // Need message
                if (!event.message) {

                    console.log(
                        "No message object."
                    );

                    continue;
                }

                const senderPSID =
                    event.sender &&
                    event.sender.id;

                if (!senderPSID) {

                    console.log(
                        "Sender PSID missing."
                    );

                    continue;
                }

                const userMessage =
                    event.message.text;

                if (!userMessage) {

                    console.log(
                        "Message has no text."
                    );

                    continue;
                }

                console.log(
                    "USER [" +
                    senderPSID +
                    "]: " +
                    userMessage
                );


                // =================================
                // USER STATUS
                // =================================

                let userStatus =
                    await redisClient.get(
                        "status:" +
                        senderPSID
                    );

                if (!userStatus) {

                    userStatus = "FREE";

                    await redisClient.set(
                        "status:" +
                        senderPSID,
                        "FREE"
                    );
                }

                console.log(
                    "USER STATUS:",
                    userStatus
                );


                // =================================
                // PRO USER
                // =================================

                if (userStatus === "PRO") {

                    console.log(
                        "PRO USER:",
                        senderPSID
                    );

                    const historyKey =
                        "chat_history:" +
                        senderPSID;

                    let history = [];

                    const historyRaw =
                        await redisClient.get(
                            historyKey
                        );

                    if (historyRaw) {

                        try {

                            history =
                                JSON.parse(
                                    historyRaw
                                );

                        } catch (error) {

                            console.error(
                                "Invalid Redis history."
                            );

                            history = [];
                        }
                    }

                    history.push({

                        role: "user",

                        parts: [
                            {
                                text: userMessage
                            }
                        ]

                    });

                    if (
                        history.length >
                        MAX_HISTORY
                    ) {

                        history =
                            history.slice(
                                -MAX_HISTORY
                            );
                    }

                    try {

                        const aiResponse =
                            await generateProResponse(
                                history
                            );

                        console.log(
                            "GEMINI PRO RESPONSE:",
                            aiResponse
                        );

                        history.push({

                            role: "model",

                            parts: [
                                {
                                    text: aiResponse
                                }
                            ]

                        });

                        if (
                            history.length >
                            MAX_HISTORY
                        ) {

                            history =
                                history.slice(
                                    -MAX_HISTORY
                                );
                        }

                        await redisClient.set(
                            historyKey,
                            JSON.stringify(
                                history
                            )
                        );

                        await sendFacebookMessage(
                            senderPSID,
                            aiResponse
                        );

                    } catch (error) {

                        console.error(
                            "PRO processing error:",
                            error
                        );

                        await sendFacebookMessage(
                            senderPSID,
                            "Miala tsiny, misy olana vetivety amin'ny bot. Avereno afaka fotoana fohy."
                        );
                    }

                    continue;
                }


                // =================================
                // FREE USER
                // =================================

                const countKey =
                    "count:" +
                    senderPSID;

                let messageCount =
                    await redisClient.get(
                        countKey
                    );

                if (messageCount) {

                    messageCount =
                        parseInt(
                            messageCount,
                            10
                        );

                } else {

                    messageCount = 0;
                }


                // =================================
                // FREE LIMIT
                // =================================

                if (
                    messageCount <
                    FREE_LIMIT
                ) {

                    messageCount++;

                    await redisClient.set(
                        countKey,
                        String(
                            messageCount
                        )
                    );

                    console.log(
                        "FREE MESSAGE " +
                        messageCount +
                        "/" +
                        FREE_LIMIT
                    );


                    try {

                        const aiResponse =
                            await generateFreeResponse(
                                userMessage
                            );

                        console.log(
                            "GEMINI FREE RESPONSE:",
                            aiResponse
                        );

                        await sendFacebookMessage(
                            senderPSID,
                            aiResponse
                        );


                        // Reached 5 messages
                        if (
                            messageCount ===
                            FREE_LIMIT
                        ) {

                            console.log(
                                "FREE LIMIT REACHED."
                            );

                            await sendFacebookMessage(
                                senderPSID,
                                getProMessage()
                            );
                        }

                    } catch (error) {

                        console.error(
                            "FREE processing error:",
                            error
                        );

                        await sendFacebookMessage(
                            senderPSID,
                            "Miala tsiny, misy olana vetivety amin'ny bot. Avereno afaka fotoana fohy."
                        );
                    }

                } else {

                    console.log(
                        "FREE LIMIT EXCEEDED:",
                        senderPSID
                    );

                    await sendFacebookMessage(
                        senderPSID,
                        getProMessage()
                    );
                }

            } catch (error) {

                console.error(
                    "Webhook processing error:",
                    error
                );
            }
        }
    }
});


// =====================================
// SERVER ERROR HANDLER
// =====================================

app.use(
    function (error, req, res, next) {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (!res.headersSent) {

            res.status(500).json({
                error: "Internal Server Error"
            });
        }
    }
);


// =====================================
// START SERVER
// =====================================

async function startServer() {

    try {

        if (!redisClient.isOpen) {

            await redisClient.connect();
        }

        console.log(
            "Redis connected."
        );

        app.listen(
            PORT,
            "0.0.0.0",
            function () {

                console.log(
                    "================================="
                );

                console.log(
                    "FAST BOT MALAGASY"
                );

                console.log(
                    "Server PORT: " +
                    PORT
                );

                console.log(
                    "FREE: 5 messages"
                );

                console.log(
                    "PRO: 25 000 Ar / volana"
                );

                console.log(
                    "Payment: " +
                    PAYMENT_NUMBER
                );

                console.log(
                    "Gemini: ENABLED"
                );

                console.log(
                    "Redis: ENABLED"
                );

                console.log(
                    "Facebook Webhook: ENABLED"
                );

                console.log(
                    "================================="
                );
            }
        );

    } catch (error) {

        console.error(
            "SERVER STARTUP ERROR:",
            error
        );

        process.exit(1);
    }
}

startServer();
