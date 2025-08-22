const { default: axios } = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
 * Отправляет фото в Telegram и возвращает объект с file_id и fileURL
 * @param {Buffer} photoBuffer - Буфер изображения
 * @param {string} caption - Подпись к фото (опционально)
 * @returns {Promise<{file_id: string, fileURL: string}>} Объект с file_id и URL
 */
const uploadPhotoToTelegram = async (photoBuffer, caption = "") => {
  try {
    const FormData = require("form-data");
    const form = new FormData();

    form.append("chat_id", CHAT_ID);
    form.append("photo", photoBuffer, {
      filename: `product-${Date.now()}.jpg`,
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

      return {
        file_id: largestPhoto.file_id,
        fileURL: fileURL,
        width: largestPhoto.width,
        height: largestPhoto.height,
        file_size: largestPhoto.file_size,
      };
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
    console.error("Ошибка при получении файла из Telegram:", JSON.stringify(error.response?.data || error.message));
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

/**
 * Массовая загрузка фотографий в Telegram
 * @param {Buffer[]} photoBuffers - Массив буферов изображений
 * @param {string} caption - Общая подпись (опционально)
 * @returns {Promise<Array>} Массив объектов с file_id и fileURL
 */
const uploadMultiplePhotosToTelegram = async (photoBuffers, caption = "") => {
  try {
    const uploadPromises = photoBuffers.map((buffer, index) => {
      const imageCaption = caption
        ? `${caption} (${index + 1}/${photoBuffers.length})`
        : "";
      return uploadPhotoToTelegram(buffer, imageCaption);
    });

    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error("Ошибка при массовой загрузке фото:", error.message);
    throw error;
  }
};

/**
 * Проверяет валидность file_id в Telegram
 * @param {string} fileId - ID файла для проверки
 * @returns {Promise<boolean>} true если файл существует
 */
const validateTelegramFileId = async (fileId) => {
  try {
    await getFileUrlFromTelegram(fileId);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Получает информацию о файле из Telegram
 * @param {string} fileId - ID файла в Telegram
 * @returns {Promise<Object>} Информация о файле
 */
const getFileInfoFromTelegram = async (fileId) => {
  try {
    const response = await telegramAPI.get(`/getFile?file_id=${fileId}`);

    if (response.data.ok && response.data.result) {
      const fileInfo = response.data.result;
      return {
        file_id: fileInfo.file_id,
        file_unique_id: fileInfo.file_unique_id,
        file_size: fileInfo.file_size,
        file_path: fileInfo.file_path,
        file_url: `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`,
      };
    } else {
      throw new Error("Не удалось получить информацию о файле");
    }
  } catch (error) {
    console.error("Ошибка при получении информации о файле:", error.message);
    throw error;
  }
};

module.exports = {
  uploadPhotoToTelegram,
  getFileUrlFromTelegram,
  downloadFileFromTelegram,
  sendTelegramMessage,
  uploadMultiplePhotosToTelegram,
  validateTelegramFileId,
  getFileInfoFromTelegram,
  telegramAPI,
};
