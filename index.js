const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { createClient } = require("redis");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const REDIS_URL = process.env.REDIS_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const META_GRAPH_VERSION =
    process.env.META_GRAPH_VERSION || "v26.0";

const FREE_LIMIT = 5;
const PRO_PRICE = "25 000 Ar / volana";
const PAYMENT_NUMBER = "0326660695";

let redisClient = null;
let gemini = null;


// =====================================================
// START
// =====================================================

console.log("");
console.log("=================================");
console.log("FAST BOT MALAGASY - STARTING");
console.log("=================================");


// =====================================================
// GEMINI
// =====================================================

if (GEMINI_API_KEY) {
    try {
        gemini = new GoogleGenAI({
            apiKey: GEMINI_API_KEY
        });

        console.log("Gemini: ENABLED");

    } catch (error) {
        console.log(
            "Gemini initialization error:",
            error.message
        );

        gemini = null;
    }

} else {
    console.log("Gemini: DISABLED");
}


// =====================================================
// REDIS
// =====================================================

async function connectRedis() {

    if (!REDIS_URL) {
        console.log("Redis: DISABLED");
        return;
    }

    try {

        console.log("Redis connecting...");

        redisClient = createClient({
            url: REDIS_URL
        });

        redisClient.on(
            "error",
            function (error) {
                console.log(
                    "Redis error:",
                    error.message
                );
            }
        );

        await redisClient.connect();

        console.log("Redis ready.");
        console.log("Redis connected.");

    } catch (error) {

        console.log(
            "Redis connection failed:",
            error.message
        );

        redisClient = null;
    }
}


// =====================================================
// HOME
// =====================================================

app.get(
    "/",
    function (req, res) {

        res.json({
            status: "online",
            service: "FAST BOT MALAGASY",
            webhook: "/webhook",
            gemini: gemini
                ? "enabled"
                : "disabled",
            redis: redisClient
                ? "connected"
                : "disabled"
        });
    }
);


// =====================================================
// FACEBOOK WEBHOOK VERIFICATION
// =====================================================

app.get(
    "/webhook",
    function (req, res) {

        console.log("");
        console.log("=================================");
        console.log("FACEBOOK VERIFICATION REQUEST");
        console.log("=================================");

        const mode =
            req.query["hub.mode"];

        const token =
            req.query["hub.verify_token"];

        const challenge =
            req.query["hub.challenge"];

        console.log(
            "hub.mode:",
            mode
        );

        console.log(
            "hub.challenge:",
            challenge
                ? "RECEIVED"
                : "MISSING"
        );

        if (token) {

            if (token === VERIFY_TOKEN) {

                console.log(
                    "VERIFY_TOKEN: MATCH"
                );

            } else {

                console.log(
                    "VERIFY_TOKEN: NOT MATCH"
                );
            }

        } else {

            console.log(
                "VERIFY_TOKEN: MISSING"
            );
        }

        console.log(
            "Render VERIFY_TOKEN:",
            VERIFY_TOKEN
                ? "CONFIGURED"
                : "MISSING"
        );

        if (
            mode === "subscribe" &&
            token === VERIFY_TOKEN
        ) {

            console.log("");
            console.log(
                "FACEBOOK WEBHOOK VERIFICATION SUCCESS"
            );
            console.log("");

            return res
                .status(200)
                .send(challenge);
        }

        console.log("");
        console.log(
            "FACEBOOK WEBHOOK VERIFICATION FAILED"
        );
        console.log("");

        return res.sendStatus(403);
    }
);


// =====================================================
// FACEBOOK WEBHOOK
// =====================================================

app.post(
    "/webhook",
    function (req, res) {

        console.log("");
        console.log("=================================");
        console.log("FACEBOOK EVENT RECEIVED");
        console.log("=================================");

        console.log(
            "Object:",
            req.body && req.body.object
        );

        // Valio 200 avy hatrany
        res.sendStatus(200);

        if (!req.body) {

            console.log(
                "Empty Facebook request."
            );

            return;
        }

        if (
            req.body.object !== "page"
        ) {

            console.log(
                "Not a Facebook Page event."
            );

            return;
        }

        const entries =
            req.body.entry || [];

        console.log(
            "Entries:",
            entries.length
        );

        for (
            const entry of entries
        ) {

            const messaging =
                entry.messaging || [];

            console.log(
                "Messaging events:",
                messaging.length
            );

            for (
                const event of messaging
            ) {

                try {

                    // -----------------------------
                    // DELIVERY
                    // -----------------------------

                    if (event.delivery) {

                        console.log(
                            "Delivery event ignored."
                        );

                        continue;
                    }


                    // -----------------------------
                    // READ
                    // -----------------------------

                    if (event.read) {

                        console.log(
                            "Read event ignored."
                        );

                        continue;
                    }


                    // -----------------------------
                    // SENDER
                    // -----------------------------

                    if (!event.sender) {

                        console.log(
                            "Sender missing."
                        );

                        continue;
                    }

                    const senderId =
                        event.sender.id;

                    if (!senderId) {

                        console.log(
                            "Sender ID missing."
                        );

                        continue;
                    }


                    // -----------------------------
                    // POSTBACK
                    // -----------------------------

                    if (event.postback) {

                        console.log("");
                        console.log(
                            "POSTBACK RECEIVED"
                        );

                        console.log(
                            "Sender:",
                            senderId
                        );

                        const postbackText =
                            event.postback.title ||
                            event.postback.payload ||
                            "";

                        console.log(
                            "Postback:",
                            postbackText
                        );

                        handleMessage(
                            senderId,
                            postbackText
                        ).catch(
                            function (error) {

                                console.log(
                                    "Postback error:",
                                    error.message
                                );
                            }
                        );

                        continue;
                    }


                    // -----------------------------
                    // TEXT MESSAGE
                    // -----------------------------

                    if (
                        event.message &&
                        event.message.text
                    ) {

                        const messageText =
                            event.message.text;

                        console.log("");
                        console.log(
                            "MESSAGE RECEIVED"
                        );

                        console.log(
                            "Sender:",
                            senderId
                        );

                        console.log(
                            "Message:",
                            messageText
                        );

                        handleMessage(
                            senderId,
                            messageText
                        ).catch(
                            function (error) {

                                console.log(
                                    "Message handling error:",
                                    error.message
                                );
                            }
                        );

                        continue;
                    }


                    console.log(
                        "Other Facebook event received."
                    );

                } catch (error) {

                    console.log(
                        "Facebook event error:",
                        error.message
                    );
                }
            }
        }
    }
);


// =====================================================
// HANDLE MESSAGE
// =====================================================

async function handleMessage(
    senderId,
    userMessage
) {

    console.log("");
    console.log("---------------------------------");
    console.log("HANDLE MESSAGE");
    console.log(
        "Sender:",
        senderId
    );
    console.log(
        "Message:",
        userMessage
    );
    console.log("---------------------------------");


    if (!userMessage) {
        return;
    }


    // =================================================
    // CHECK PRO
    // =================================================

    let status = null;

    if (redisClient) {

        try {

            status =
                await redisClient.get(
                    "status:" + senderId
                );

        } catch (error) {

            console.log(
                "Redis status error:",
                error.message
            );
        }
    }


    // =================================================
    // PRO USER
    // =================================================

    if (status === "PRO") {

        console.log(
            "User status: PRO"
        );

        const response =
            await generateGeminiResponse(
                senderId,
                userMessage,
                true
            );

        await sendFacebookMessage(
            senderId,
            response
        );

        return;
    }


    // =================================================
    // FREE USER
    // =================================================

    let count = 0;

    if (redisClient) {

        try {

            const savedCount =
                await redisClient.get(
                    "count:" + senderId
                );

            if (savedCount) {

                count =
                    parseInt(
                        savedCount,
                        10
                    );
            }

        } catch (error) {

            console.log(
                "Redis count error:",
                error.message
            );
        }
    }


    console.log(
        "FREE messages:",
        count + "/" + FREE_LIMIT
    );


    // =================================================
    // FREE LIMIT REACHED
    // =================================================

    if (
        count >= FREE_LIMIT
    ) {

        console.log(
            "FREE LIMIT REACHED"
        );

        const limitMessage =
            "Tapitra ny hafatra FREE 5 anao.\n\n" +
            "Raha te hanohy hiresaka amin'ny " +
            "FAST BOT MALAGASY ianao:\n\n" +
            "PRO: " +
            PRO_PRICE +
            "\n" +
            "Fandoavana: MVola / Airtel Money / Orange Money\n" +
            "Numéro: " +
            PAYMENT_NUMBER +
            "\n\n" +
            "Alefaso ny preuve de paiement rehefa vita.";

        await sendFacebookMessage(
            senderId,
            limitMessage
        );

        return;
    }


    // =================================================
    // INCREMENT FREE COUNT
    // =================================================

    if (redisClient) {

        try {

            await redisClient.incr(
                "count:" + senderId
            );

        } catch (error) {

            console.log(
                "Redis increment error:",
                error.message
            );
        }
    }


    // =================================================
    // GEMINI
    // =================================================

    const response =
        await generateGeminiResponse(
            senderId,
            userMessage,
            false
        );


    await sendFacebookMessage(
        senderId,
        response
    );


    // =================================================
    // PRO OFFER AFTER 5TH MESSAGE
    // =================================================

    if (
        count + 1 >= FREE_LIMIT
    ) {

        const offerMessage =
            "🎁 Hafatra FREE 5/5.\n\n" +
            "Raha te hanohy:\n" +
            "PRO = " +
            PRO_PRICE +
            "\n" +
            "MVola / Airtel Money / Orange Money\n" +
            "Numéro: " +
            PAYMENT_NUMBER;

        await sendFacebookMessage(
            senderId,
            offerMessage
        );
    }
}


// =====================================================
// GEMINI
// =====================================================

async function generateGeminiResponse(
    senderId,
    userMessage,
    isPro
) {

    if (!gemini) {

        return (
            "Miala tsiny, Gemini mbola tsy mandeha " +
            "amin'izao fotoana izao."
        );
    }


    try {

        let historyText = "";


        // =================================================
        // LOAD HISTORY
        // =================================================

        if (
            isPro &&
            redisClient
        ) {

            try {

                const history =
                    await redisClient.lRange(
                        "chat_history:" + senderId,
                        0,
                        9
                    );

                if (
                    history &&
                    history.length > 0
                ) {

                    historyText =
                        "\n\nResaka teo aloha:\n" +
                        history.join("\n");
                }

            } catch (error) {

                console.log(
                    "Redis history error:",
                    error.message
                );
            }
        }


        // =================================================
        // GEMINI PROMPT
        // =================================================

        const prompt =
            "Ianao dia FAST BOT MALAGASY, " +
            "chatbot mahay miteny Malagasy." +
            "\nValio amin'ny teny Malagasy mazava sy manampy." +
            "\nAza mamorona vaovao tsy fantatra." +
            "\nAtaovy fohy sy mazava ny valiny raha azo atao." +
            historyText +
            "\n\nUser: " +
            userMessage;


        console.log(
            "Sending request to Gemini..."
        );


        const result =
            await gemini.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt
            });


        let responseText =
            "Tsy nahazo valiny avy amin'i Gemini.";


        if (
            result &&
            result.text
        ) {

            responseText =
                result.text;
        }


        console.log(
            "Gemini response received."
        );


        // =================================================
        // SAVE HISTORY
        // =================================================

        if (
            isPro &&
            redisClient
        ) {

            try {

                await redisClient.lPush(
                    "chat_history:" + senderId,
                    "User: " + userMessage
                );

                await redisClient.lPush(
                    "chat_history:" + senderId,
                    "Bot: " + responseText
                );

                await redisClient.lTrim(
                    "chat_history:" + senderId,
                    0,
                    9
                );

            } catch (error) {

                console.log(
                    "Redis history save error:",
                    error.message
                );
            }
        }


        return responseText;

    } catch (error) {

        console.log(
            "Gemini error:",
            error.message
        );

        return (
            "Miala tsiny, nisy olana tamin'i Gemini. " +
            "Andramo indray afaka kelikely."
        );
    }
}


// =====================================================
// SEND FACEBOOK MESSAGE
// =====================================================

async function sendFacebookMessage(
    recipientId,
    message
) {

    if (!PAGE_ACCESS_TOKEN) {

        console.log(
            "PAGE_ACCESS_TOKEN is missing."
        );

        return;
    }


    try {

        const url =
            "https://graph.facebook.com/" +
            META_GRAPH_VERSION +
            "/me/messages?access_token=" +
            encodeURIComponent(
                PAGE_ACCESS_TOKEN
            );


        const response =
            await fetch(
                url,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        recipient: {
                            id: recipientId
                        },

                        messaging_type:
                            "RESPONSE",

                        message: {
                            text: message
                        }
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            console.log(
                "Facebook Send API ERROR:",
                JSON.stringify(data)
            );

            return;
        }


        console.log(
            "Facebook message sent successfully."
        );

    } catch (error) {

        console.log(
            "Facebook Send API error:",
            error.message
        );
    }
}


// =====================================================
// START SERVER
// =====================================================

async function startServer() {

    await connectRedis();


    app.listen(
        PORT,
        function () {

            console.log("");
            console.log("=================================");
            console.log("FAST BOT MALAGASY");
            console.log(
                "Server PORT:",
                PORT
            );
            console.log(
                "FREE:",
                FREE_LIMIT,
                "messages"
            );
            console.log(
                "PRO:",
                PRO_PRICE
            );
            console.log(
                "Payment:",
                PAYMENT_NUMBER
            );
            console.log(
                "Gemini:",
                gemini
                    ? "ENABLED"
                    : "DISABLED"
            );
            console.log(
                "Redis:",
                redisClient
                    ? "ENABLED"
                    : "DISABLED"
            );
            console.log(
                "Facebook Webhook: ENABLED"
            );
            console.log(
                "Meta Graph:",
                META_GRAPH_VERSION
            );
            console.log("=================================");
        }
    );
}


startServer();
