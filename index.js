const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const moment = require('moment-timezone');
require('dotenv').config();

// Log startup time
console.log(`Script started at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`);
console.log(`Server timezone offset: ${new Date().getTimezoneOffset() / -60} hours`);

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox'] }
});

const groupName = process.env.GROUPNAME;

const schedules = [
  { cron: '0 11 * * *', message: process.env.START },
  { cron: '0 15 * * *', message: process.env.BREAK },
  { cron: '0 18 * * *', message: process.env.START },
  { cron: '0 22 * * *', message: process.env.LEAVE }
];

// Generate QR code for authentication
client.on('qr', (qr) => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code with your WhatsApp app.');
});

client.on("ready", async () => {
  console.log("WhatsApp client is ready!");

  const chats = await client.getChats();
  const groupChat = chats.find((chat) => chat.isGroup && chat.name === groupName);

  if (!groupChat) {
    console.error(`Group "${groupName}" not found. Check the name and try again.`);
    process.exit(1);
  }

  const groupChatId = groupChat.id._serialized;
  console.log(`Found group: ${groupName} (ID: ${groupChatId})`);

  const now = moment().tz("Asia/Dhaka");
  schedules.forEach(({ cron: cronExp, message }) => {
    const [minute, hour] = cronExp.split(" ").slice(0, 2).map(Number);
    const scheduledTime = moment().tz("Asia/Dhaka").hour(hour).minute(minute).second(0);
    const isMissed = now.isAfter(scheduledTime) && now.isBefore(scheduledTime.clone().add(15, "minutes"));  

    if (isMissed) {
      (async () => {
        try {
          await client.sendMessage(groupChatId, message);
          console.log(`Sent missed message "${message}" to ${groupName} at ${now.format("YYYY-MM-DD HH:mm:ss")}`);
        } catch (error) {
          console.error(`Failed to send missed message "${message}":`, error);
        }
      })();
    }
  });

  schedules.forEach(({ cron: cronExp, message }) => {
    cron.schedule(cronExp, async () => {
        try {
          const now = moment().tz("Asia/Dhaka").format("YYYY-MM-DD HH:mm:ss");
          await client.sendMessage(groupChatId, message);
          console.log(`Sent message "${message}" to ${groupName} at ${now}`);
        } catch (error) {
          console.error(`Failed to send message "${message}":`, error);
        }
      },
      {
        timezone: "Asia/Dhaka",
      }
    );
  });

  setInterval(async () => {
    try {
      const state = await client.getState();
      console.log(`Client state at ${new Date().toLocaleTimeString()}: ${state}`);
    } catch (error) {
      console.error("Error checking client state:", error);
    }
  }, 5 * 60 * 1000);

  console.log("Schedules set. The script will run in the background.");
});

client.on('disconnected', (reason) => {
  console.log('Client disconnected:', reason);
  console.log('Reconnecting...');
  client.initialize();
});

client.initialize();