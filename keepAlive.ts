import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
    res.send("Bot is running");
});

app.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
});
