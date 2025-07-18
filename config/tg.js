const { default: axios } = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID =
  process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
  console.warn("TELEGRAM_BOT_TOKEN не установлен в переменных окружения");
}

if (!CHAT_ID) {
  console.warn("TELEGRAM_CHAT_ID не установлен в переменных окружения");
}

const telegramAPI = axios.create({
  baseURL: `https://api.telegram.org/bot${BOT_TOKEN}`,
  timeout: 30000,
});

/**
 * Отправляет фото в Telegram и возвращает file_id
 * @param {Buffer} photoBuffer - Буфер изображения
 * @param {string} caption - Подпись к фото (опционально)
 * @returns {Promise<string>} file_id фотографии
 */
const uploadPhotoToTelegram = async (photoBuffer, caption = "") => {
  try {
    const FormData = require("form-data");
    const form = new FormData();

    form.append("chat_id", CHAT_ID);
    form.append("photo", photoBuffer, {
      filename: "product-image.jpg",
      contentType: "image/jpeg",
    });

    if (caption) {
      form.append("caption", caption);
    }

    const response = await telegramAPI.post("/sendPhoto", form, {
      headers: {
        ...form.getHeaders(),
      },
    });

    if (response.data.ok && response.data.result.photo) {
      // Берем самое большое изображение (последнее в массиве)
      const photos = response.data.result.photo;
      const largestPhoto = photos[photos.length - 1];
      const fileURL = await getFileUrlFromTelegram(largestPhoto.file_id);
      return fileURL;
    } else {
      throw new Error("Не удалось загрузить фото в Telegram");
    }
  } catch (error) {
    console.error("Ошибка при загрузке фото в Telegram:", error.message);
    throw error;
  }
};

/**
 * Получает URL файла из Telegram по file_id
 * @param {string} fileId - ID файла в Telegram
 * @returns {Promise<string>} URL файла
 */
const getFileUrlFromTelegram = async (fileId) => {
  try {
    const response = await telegramAPI.get(`/getFile?file_id=${fileId}`);

    if (response.data.ok && response.data.result.file_path) {
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${response.data.result.file_path}`;
    } else {
      throw new Error("Не удалось получить путь к файлу");
    }
  } catch (error) {
    console.error("Ошибка при получении файла из Telegram:", error.message);
    throw error;
  }
};

/**
 * Загружает файл из Telegram по file_id
 * @param {string} fileId - ID файла в Telegram
 * @returns {Promise<Buffer>} Буфер файла
 */
const downloadFileFromTelegram = async (fileId) => {
  try {
    const fileUrl = await getFileUrlFromTelegram(fileId);
    const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
  } catch (error) {
    console.error("Ошибка при скачивании файла из Telegram:", error.message);
    throw error;
  }
};

/**
 * Отправляет сообщение в Telegram
 * @param {string} message - Текст сообщения
 * @returns {Promise<Object>} Ответ от Telegram API
 */
const sendTelegramMessage = async (message) => {
  try {
    const response = await telegramAPI.post("/sendMessage", {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
    });
    return response.data;
  } catch (error) {
    console.error("Ошибка при отправке сообщения в Telegram:", error.message);
    throw error;
  }
};

module.exports = {
  uploadPhotoToTelegram,
  getFileUrlFromTelegram,
  downloadFileFromTelegram,
  sendTelegramMessage,
  telegramAPI,
};
