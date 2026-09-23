require('dotenv').config();
const express = require('express');
const redis = require('redis');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());

// 1. Mampifandray amin'ny Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 2. Mampifandray amin'ny Redis Cache 25MB
const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});
redisClient.on('error', (err) => console.log('Hadisoana Redis:', err));
redisClient.connect().then(() => console.log('Tafapindray amin\'ny Redis cache 25MB!'));

// 3. Webhook ho an'ny Facebook (Verification GET)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('Webhook voamarina soa aman-tsara!');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// 4. Fandraisana hafatra sy Fitantanana ny tolotra Free/Pro (POST)
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Valio avy hatrany ny Facebook mba tsy hisy timeout (Alohan'ny hanaovana lojika lava)
  res.status(200).send('EVENT_RECEIVED');

  // Asiana log eto mba hahitana ny test rehetra tonga
  console.log("Payload tonga:", JSON.stringify(body));

  // Lojika fanamarinana raha hafatra tena izy avy amin'ny pejy na test fotsiny
  if (body.object === 'page' || body.sample) {
    const entries = body.entry || (body.sample ? [{ messaging: [body.sample.value] }] : []);
    
    for (const entry of entries) {
      if (!entry.messaging || entry.messaging.length === 0) continue;
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;
        
      // Tohizo eto ny ambin'ny kaody napetrakao teo aloha...
      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;
                // Tadiavina ao amin'ny Redis cache raha efa PRO na FREE ilay olona
                const userStatus = await redisClient.get(`status:${sender_psid}`) || 'FREE';
                
                if (userStatus === 'PRO') {
                    console.log(`[PRO User] Mandefa hafatra: ${userMessage}`);
                    
                    // A) Alaina avy ao amin'ny Redis ny tantaran'ny resaka teo aloha (Memory)
                    const cacheKey = `chat_history:${sender_psid}`;
                    let historyRaw = await redisClient.get(cacheKey);
                    let history = historyRaw ? JSON.parse(historyRaw) : [];

                    // B) Ampiana ny hafatra vaovao an'ny mpanjifa ao amin'ny tantara
                    history.push({ role: 'user', parts: [{ text: userMessage }] });

                    try {
                        // D) Antsoina ny Gemini AI miaraka amin'ilay tantaran'ny resaka manontolo
                        const response = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: history,
                            systemInstruction: "Mpanampy nomerika matihanina amin'ny teny malagasy ianao. Mamalia amin'ny teny malagasy foana.",
                        });

                        const aiResponse = response.text;
                        console.log(`[Gemini AI PRO]: ${aiResponse}`);

                        // E) Ampiana ny valintenin'ny AI ao amin'ny tantara
                        history.push({ role: 'model', parts: [{ text: aiResponse }] });

                        // F) Ferana ho 10 ihany ny tantara hotahirizina mba tsy ho lany ny 25MB
                        if (history.length > 10) {
                            history = history.slice(history.length - 10);
                        }

                        // G) Averina tahirizina ao amin'ny Redis Cache ilay Memory nohavaozina
                        await redisClient.set(cacheKey, JSON.stringify(history));

                        // TODO: Alefa any amin'ny Facebook Messenger ny aiResponse
                        
                    } catch (aiError) {
                        console.error("Hadisoana teo amin'ny Gemini AI:", aiError);
                    }

                } else {
                    // Tolotra FREE: Kajiana ny isan'ny hafatra nalefany (max 5)
                    let messageCount = await redisClient.get(`count:${sender_psid}`);
                    messageCount = messageCount ? parseInt(messageCount) : 0;

                    if (messageCount < 5) {
                        messageCount++;
                        await redisClient.set(`count:${sender_psid}`, messageCount.toString());
                        console.log(`[FREE User] Hafatra faha-${messageCount}`);

                        try {
                            // Ny Free user dia tsy manana memory (hafatra tokana ihany no alefa)
                            const response = await ai.models.generateContent({
                                model: 'gemini-2.5-flash',
                                contents: userMessage,
                                systemInstruction: "Mpanampy nomerika amin'ny teny malagasy ianao. Mamalia amin'ny teny malagasy foana.",
                            });
                            
                            const aiResponse = response.text;
                            console.log(`[Gemini AI FREE]: ${aiResponse}`);
                            // TODO: Alefa any amin'ny Facebook Messenger ny aiResponse

                        } catch (aiError) {
                            console.error("Hadisoana teo amin'ny Gemini AI:", aiError);
                        }
                        
                    } else {
                        // Efa lany ny message 5 maimaim-poana -> Omena torolalana hiditra PRO
                        const proInstructions = "Miala tsiny indrindra! Efa lany ny tolotra maimaim-poana (hafatra 5) ho anao.\n\nMba hahafahanao manohy miresaka amin'ilay bot haingana be sady mahatadidy resaka, midira amin'ny tolotra PRO amin'ny alalan'ny fandoavana 25 000 Ar/volana fotsiny.\n\nAzonao alefa amin'ny alalan'ny MVola/AirtelMoney/OrangeMoney any amin'ny laharana 032 66 606 95 ny sarany, ary alefaso eto ny sary porofo (capture d'écran) fandoavam-bola mba hampandehanana ny kaontinao Pro avy hatrany!";
                        console.log("Mpanjifa efa lany tolotra maimaim-poana. Alefa ny torolalana PRO.");
                    }
                }
            }
        res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Port listening voadio tsara
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log(`Ny API dia mandeha ao amin'ny port ${process.env.PORT || 3000}`);
});
