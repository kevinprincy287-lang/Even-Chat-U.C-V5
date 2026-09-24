
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

if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY tsy hita.");
    process.exit(1);
}

if (!VERIFY_TOKEN) {
    console.error("VERIFY_TOKEN tsy hita.");
    process.exit(1);
}

if (!PAGE_ACCESS_TOKEN) {
    console.error("PAGE_ACCESS_TOKEN tsy hita.");
    process.exit(1);
}

if (!REDIS_URL) {
    console.error("REDIS_URL tsy hita.");
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


/* =====================================================
   HOME
   ===================================================== */

app.get("/", function (req, res) {
    res.status(200).json({
        status: "online",
        service: "FAST BOT MALAGASY",
        webhook: "/webhook"
    });
});


/* =====================================================
   HEALTH
   ===================================================== */

app.get("/health", function (req, res) {
    res.status(200).json({
        server: "OK",
        redis: redisClient.isReady ? "OK" : "NOT_READY",
        gemini: GEMINI_API_KEY ? "OK" : "MISSING"
    });
});


/* =====================================================
   FACEBOOK WEBHOOK VERIFICATION
   ===================================================== */

app.get("/webhook", function (req, res) {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Facebook verification request received.");

    if (
        mode === "subscribe" &&
        token === VERIFY_TOKEN
    ) {
        console.log("Facebook Webhook VERIFIED.");
        return res.status(200).send(challenge);
    }

    console.log("Facebook Webhook verification FAILED.");
    return res.sendStatus(403);
});


/* =====================================================
   FACEBOOK SEND MESSAGE
   ===================================================== */

async function sendFacebookMessage(psid, message) {

    try {

        const response = await fetch(
            "https://graph.facebook.com/v23.0/me/messages",
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

        if (!response.ok) {
            console.error(
                "Facebook Send API Error:",
                JSON.stringify(data)
            );

            return false;
        }

        console.log("Message Facebook envoyé.");
        return true;

    } catch (error) {

        console.error(
            "Facebook Send Error:",
            error
        );

        return false;
    }
}


/* =====================================================
   GEMINI FREE
   ===================================================== */

async function generateFreeResponse(userMessage) {

    const response = await ai.models.generateContent({

        model: "gemini-2.5-flash",

        contents: userMessage,

        config: {
            systemInstruction:
                "Ianao dia mpanampy nomerika matihanina. " +
                "Mamalia amin'ny teny Malagasy foana. " +
                "Ataovy mazava sy ilaina ny valiny. " +
                "Aza mamorona vaovao tsy fantatra."
        }
    });

    return response.text ||
        "Miala tsiny, tsy nahazo valiny aho.";
}


/* =====================================================
   GEMINI PRO AVEC MEMORY
   ===================================================== */

async function generateProResponse(history) {

    const response = await ai.models.generateContent({

        model: "gemini-2.5-flash",

        contents: history,

        config: {
            systemInstruction:
                "Ianao dia mpanampy nomerika PRO matihanina. " +
                "Mamalia amin'ny teny Malagasy foana. " +
                "Tadidio ny contexte sy ny resaka teo aloha. " +
                "Ataovy mazava, haingana ary manampy ny mpampiasa. " +
                "Aza averina tsy amin'ny antony ny valiny teo aloha."
        }
    });

    return response.text ||
        "Miala tsiny, tsy nahazo valiny aho.";
}


/* =====================================================
   PRO MESSAGE
   ===================================================== */

function getProMessage() {

    return (
        "EFA LANY NY HAFATRA FREE 5 NAO.\n\n" +

        "TOLOTRA PRO\n" +
        "Vidiny: " + PRO_PRICE + "\n\n" +

        "Ny PRO dia ahafahanao:\n" +
        "- Mahazo valiny haingana\n" +
        "- Mitahiry sy mahatadidy ny resaka\n" +
        "- Manohy mampiasa ny bot amin'ny tolotra PRO\n\n" +

        "FANDOAВANA:\n" +
        "MVola / Airtel Money / Orange Money\n" +
        "Laharana: " + PAYMENT_NUMBER + "\n\n" +

        "Rehefa vita ny fandoavana dia alefaso eto " +
        "ny capture na porofo fandoavana mba " +
        "hampandehanana ny kaontinao PRO."
    );
}


/* =====================================================
   FACEBOOK WEBHOOK POST
   ===================================================== */

app.post("/webhook", async function (req, res) {

    /*
       Valiana avy hatrany Facebook.
       Izany no misoroka timeout.
    */

    res.sendStatus(200);

    const body = req.body;

    console.log("=================================");
    console.log("FACEBOOK EVENT RECEIVED");
    console.log("=================================");

    console.log(
        JSON.stringify(body, null, 2)
    );

    if (!body || body.object !== "page") {
        console.log("Tsy Page event.");
        return;
    }

    const entries = body.entry || [];

    for (const entry of entries) {

        const messaging = entry.messaging || [];

        for (const event of messaging) {

            try {

                /* =====================================
                   SENDER
                   ===================================== */

                if (
                    !event.sender ||
                    !event.sender.id
                ) {
                    continue;
                }

                const senderPSID = event.sender.id;


                /* =====================================
                   IGNORE DELIVERY / READ
                   ===================================== */

                if (
                    event.delivery ||
                    event.read
                ) {
                    continue;
                }


                /* =====================================
                   TEXT MESSAGE
                   ===================================== */

                if (
                    !event.message ||
                    !event.message.text
                ) {
                    continue;
                }

                const userMessage =
                    event.message.text.trim();

                if (!userMessage) {
                    continue;
                }

                console.log(
                    "USER [" +
                    senderPSID +
                    "]: " +
                    userMessage
                );


                /* =====================================
                   USER STATUS
                   ===================================== */

                let userStatus =
                    await redisClient.get(
                        "status:" + senderPSID
                    );

                if (!userStatus) {

                    userStatus = "FREE";

                    await redisClient.set(
                        "status:" + senderPSID,
                        "FREE"
                    );
                }

                console.log(
                    "STATUS: " + userStatus
                );


                /* =====================================
                   PRO USER
                   ===================================== */

                if (userStatus === "PRO") {

                    console.log(
                        "PRO USER: " +
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
                                JSON.parse(historyRaw);

                        } catch (error) {

                            history = [];

                            console.log(
                                "Memory Redis invalid."
                            );
                        }
                    }


                    /* =================================
                       ADD USER MESSAGE
                       ================================= */

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
                            history.slice(-MAX_HISTORY);
                    }


                    /* =================================
                       GEMINI PRO
                       ================================= */

                    try {

                        const aiResponse =
                            await generateProResponse(
                                history
                            );

                        console.log(
                            "GEMINI PRO: " +
                            aiResponse
                        );


                        /* =============================
                           ADD AI RESPONSE
                           ============================= */

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
                                history.slice(-MAX_HISTORY);
                        }


                        /* =============================
                           SAVE REDIS MEMORY
                           ============================= */

                        await redisClient.set(
                            historyKey,
                            JSON.stringify(history)
                        );


                        /* =============================
                           SEND FACEBOOK
                           ============================= */

                        await sendFacebookMessage(
                            senderPSID,
                            aiResponse
                        );

                    } catch (error) {

                        console.error(
                            "Gemini PRO Error:",
                            error
                        );

                        await sendFacebookMessage(
                            senderPSID,
                            "Miala tsiny, misy olana vetivety amin'ny bot. Avereno afaka fotoana fohy."
                        );
                    }

                    continue;
                }


                /* =====================================
                   FREE USER
                   ===================================== */

                const countKey =
                    "count:" + senderPSID;

                let messageCount =
                    await redisClient.get(
                        countKey
                    );

                messageCount =
                    messageCount
                        ? parseInt(
                            messageCount,
                            10
                        )
                        : 0;


                /* =====================================
                   FREE MESSAGE mbola misy
                   ===================================== */

                if (messageCount < FREE_LIMIT) {

                    messageCount++;

                    await redisClient.set(
                        countKey,
                        messageCount.toString()
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
                            "GEMINI FREE: " +
                            aiResponse
                        );


                        /* =============================
                           SEND AI RESPONSE
                           ============================= */

                        await sendFacebookMessage(
                            senderPSID,
                            aiResponse
                        );


                        /* =============================
                           MESSAGE FAHA-5
                           ============================= */

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
                            "Gemini FREE Error:",
                            error
                        );

                        await sendFacebookMessage(
                            senderPSID,
                            "Miala tsiny, misy olana vetivety amin'ny bot. Avereno afaka fotoana fohy."
                        );
                    }

                }


                /* =====================================
                   FREE LANY
                   ===================================== */

                else {

                    console.log(
                        "FREE LIMIT EXCEEDED: " +
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


/* =====================================================
   ERROR HANDLER
   ===================================================== */

app.use(function (error, req, res, next) {

    console.error(
        "SERVER ERROR:",
        error
    );

    if (!res.headersSent) {

        res.status(500).json({
            error: "Internal Server Error"
        });
    }
});


/* =====================================================
   START SERVER
   ===================================================== */

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
                    "Server PORT: " + PORT
                );

                console.log(
                    "FREE: 5 messages"
                );

                console.log(
                    "PRO: 25 000 Ar / volana"
                );

                console.log(
                    "Payment: " + PAYMENT_NUMBER
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
            "Server startup error:",
            error
        );

        process.exit(1);
    }
}

startServer();
