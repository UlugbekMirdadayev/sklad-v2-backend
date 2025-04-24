const { default: axios } = require("axios");

const postTelegramMessage = (message) =>
  axios.post(
    `https://api.telegram.org/bot6238483226:AAGqfmihU3eWu478Q2uNPqqP0QfD3kOCAM8/sendMessage`,
    {
      chat_id: "-1002631455210",
      text: message,
      parse_mode: "html",
    }
  );

module.exports = postTelegramMessage;
