# Solana Wallet Bot 🤖💰

A Discord bot that tracks Solana wallets in real time and sends transaction alerts to Discord channels.

---

## 🌐 Product Page

👉 Learn more about the bot and pricing :
https://www.notion.so/Solana-Wallet-Monitor-Discord-Bot-2df16adf72e4802abed1d06ca4b350cd 

---

## 🚀 Features

- Track one or multiple Solana wallets
- Detect incoming and outgoing transactions
- Send real-time alerts to Discord
- Store wallet and transaction data in MongoDB
- Built with scalability in mind (alerts, premium features, future dashboard)

---

## 🛠 Tech Stack

- **Node.js / TypeScript**
- **Discord.js**
- **@solana/web3.js**
- **MongoDB**
- **Express** (keep-alive / future API)
- **Render** (deployment)

---

## ⚙️ How It Works

1. The bot listens to Solana blockchain events using `@solana/web3.js`
2. Tracked wallets are monitored for new transactions
3. Relevant transactions are processed and stored in MongoDB
4. Alerts are sent to configured Discord channels
5. An Express server keeps the service alive on Render

---

## 🧑‍💻 Local Installation

```bash
git clone https://github.com/ydaci/solana-wallet-bot.git
cd solana-wallet-bot
npm install

## 🧑‍💻 Build & Run

npm run build
npm start

```
---

## 🔐 Environment Variables

---Create a .env file at the root of the project:

DISCORD_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_connection_string
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

## ☁️ Deployment

This bot is designed to run as:

-Render Web Service (with keep-alive HTTP server)
-or Background Worker if HTTP is not needed

## Build command:
```
npm install && npm run build
```

## Start command:
```
node dist/wallet.js
```
---

## 🗺 Roadmap

- Slash commands
- Wallet management via Discord
- Advanced transaction filters
- Web dashboard
- Premium / subscription features


## ⚠️ Disclaimer

- This project is for educational and informational purposes only.
- It is not financial advice. Use at your own risk.




