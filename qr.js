const { exec } = require("child_process");
const { upload } = require("./mega");
const express = require("express");
const router = express.Router();
const pino = require("pino");
const { toBuffer } = require("qrcode");
const path = require("path");
const fs = require("fs-extra");
const { Boom } = require("@hapi/boom");

// Default message
const MESSAGE = process.env.MESSAGE || `> SESSION GENERATED SUCCESSFULLY ✅`;

// Clear the existing authentication directory
if (fs.existsSync("./auth_info_baileys")) {
  fs.emptyDirSync(path.join(__dirname, "/auth_info_baileys"));
}

// Main route to handle QR code generation and session management
router.get("/", async (req, res) => {
  const {
    default: SuhailWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    DisconnectReason,
    makeInMemoryStore,
  } = require("@whiskeysockets/baileys");

  const store = makeInMemoryStore({
    logger: pino().child({ level: "silent", stream: "store" }),
  });

  async function SUHAIL() {
    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, "/auth_info_baileys")
    );

    try {
      const Smd = SuhailWASocket({
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Desktop"),
        auth: state,
      });

      Smd.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Send QR code
        if (qr && !res.headersSent) {
          try {
            const qrBuffer = await toBuffer(qr);
            res.setHeader("Content-Type", "image/png");
            res.end(qrBuffer);
          } catch (error) {
            console.error("Error generating QR code:", error);
            res.status(500).send("Failed to generate QR code.");
            return;
          }
        }

        // When connection is established
        if (connection === "open") {
          console.log("Connection established!");

          // Generate unique session ID
          function randomMegaId(length = 6, numberLength = 4) {
            const characters =
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let result = "";
            for (let i = 0; i < length; i++) {
              result += characters.charAt(
                Math.floor(Math.random() * characters.length)
              );
            }
            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
            return `${result}${number}`;
          }

          const authPath = "./auth_info_baileys/";
          const megaUrl = await upload(
            fs.createReadStream(path.join(authPath, "creds.json")),
            `${randomMegaId()}.json`
          );

          const sessionId = megaUrl.replace("https://mega.nz/file/", "");
          console.log(`
==================== SESSION ID ==========================                   
SESSION-ID ==> ${sessionId}
------------------- SESSION CLOSED -----------------------
          `);

          // Send session ID to user
          const user = Smd.user.id;
          const msg = await Smd.sendMessage(user, { text: `BHASHI-MD~${sessionId}` });
          await Smd.sendMessage(user, {
              document: fs.readFileSync('./auth_info_baileys/creds.json'),
              fileName: 'creds.json',
              mimetype: 'application/json',
              caption: '*Upload This File to BHASHI-MD-SESSION folder*'
          });
          await Smd.sendMessage(user, { text: MESSAGE }, { quoted: msg });

          await delay(1000);
          try {
            fs.emptyDirSync(path.join(__dirname, "/auth_info_baileys"));
          } catch (err) {
            console.error("Error clearing auth directory:", err);
          }
        }

        // Reconnection logic
        if (connection === "close") {
          const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
          if (reason === DisconnectReason.restartRequired) {
            console.log("Restart Required, Restarting...");
            SUHAIL().catch(console.error);
          } else if (reason === DisconnectReason.connectionLost) {
            console.log("Connection Lost from Server!");
          } else {
            console.log("Connection closed with bot. Please run again.");
            console.log(reason);
            exec("pm2 restart qasim");
            process.exit(0);
          }
        }
      });

      Smd.ev.on("creds.update", saveCreds);
    } catch (err) {
      console.error("Error in SUHAIL:", err);
      exec("pm2 restart qasim");
      fs.emptyDirSync(path.join(__dirname, "/auth_info_baileys"));
    }
  }

  SUHAIL().catch((err) => {
    console.error("Error initializing SUHAIL:", err);
    fs.emptyDirSync(path.join(__dirname, "/auth_info_baileys"));
    exec("pm2 restart qasim");
  });
});

module.exports = router;
