const cron = require("node-cron");
const Product = require("../models/products/product.model");
const { getFileUrlFromTelegram } = require("../config/tg");

/**
 * Проверяет, является ли строка URL-адресом
 * @param {string} str - Строка для проверки
 * @returns {boolean} true если строка является URL
 */
const isURL = (str) => {
  return (
    typeof str === "string" &&
    (str.startsWith("http://") || str.startsWith("https://"))
  );
};

/**
 * Проверяет, является ли строка валидным Telegram file_id
 * @param {string} str - Строка для проверки
 * @returns {boolean} true если строка может быть file_id
 */
const isValidFileId = (str) => {
  return typeof str === "string" && !isURL(str) && str.length > 0;
};

class ProductImageUpdateService {
  constructor() {
    this.isRunning = false;
    this.cronTask = null;
  }

  /**
   * Обновляет fileURL для изображений одного продукта
   * @param {Object} product - Объект продукта
   * @returns {Promise<boolean>} - true если были обновления
   */
  async updateSingleProductImageUrls(product) {
    if (!product || !product.images || product.images.length === 0) {
      return false;
    }

    let needsUpdate = false;
    const updatedImages = [];

    for (const image of product.images) {
      if (image.file_id && isValidFileId(image.file_id)) {
        try {
          // Получаем актуальный URL из Telegram
          const freshFileURL = await getFileUrlFromTelegram(image.file_id);

          // Если URL изменился, обновляем
          if (freshFileURL !== image.fileURL) {
            updatedImages.push({
              ...(image.toObject ? image.toObject() : image),
              fileURL: freshFileURL,
            });
            needsUpdate = true;
            console.log(`Обновлен URL для продукта ${product._id}, file_id: ${image.file_id}`);
          } else {
            updatedImages.push(image);
          }
        } catch (error) {
          console.warn(
            `Не удалось обновить URL для продукта ${product._id}, file_id ${image.file_id}:`,
            error.message
          );
          updatedImages.push(image); // Оставляем старый URL
        }
      } else {
        updatedImages.push(image); // Если нет file_id, оставляем как есть
      }
    }

    // Если были обновления, сохраняем в базу данных
    if (needsUpdate && product._id) {
      try {
        await Product.findByIdAndUpdate(product._id, { images: updatedImages });
        console.log(`✅ Обновлены URL изображений для продукта ${product._id} (${product.name})`);
        return true;
      } catch (error) {
        console.error(
          `❌ Не удалось сохранить обновленные URL для продукта ${product._id}:`,
          error.message
        );
        return false;
      }
    }

    return false;
  }

  /**
   * Обновляет URL изображений для всех продуктов
   */
  async updateAllProductImageUrls() {
    try {
      console.log("🔄 Начинаем обновление URL изображений продуктов...");

      // Получаем все неудаленные продукты с изображениями
      const products = await Product.find({
        isDeleted: false,
        "images.0": { $exists: true }, // Только продукты с изображениями
      });

      console.log(`📦 Найдено ${products.length} продуктов с изображениями`);

      let updatedCount = 0;
      let errorCount = 0;

      // Обрабатываем продукты партиями, чтобы не перегрузить Telegram API
      const batchSize = 10; // Обрабатываем по 10 продуктов одновременно
      
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (product) => {
          try {
            const wasUpdated = await this.updateSingleProductImageUrls(product);
            if (wasUpdated) {
              updatedCount++;
            }
          } catch (error) {
            console.error(`❌ Ошибка обновления продукта ${product._id}:`, error.message);
            errorCount++;
          }
        });

        await Promise.all(batchPromises);

        // Небольшая пауза между партиями, чтобы не перегрузить Telegram API
        if (i + batchSize < products.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ Обновление изображений завершено:`);
      console.log(`   - Всего продуктов обработано: ${products.length}`);
      console.log(`   - Продуктов обновлено: ${updatedCount}`);
      console.log(`   - Ошибок: ${errorCount}`);

      return {
        success: true,
        totalProcessed: products.length,
        totalUpdated: updatedCount,
        totalErrors: errorCount
      };

    } catch (error) {
      console.error("❌ Ошибка при массовом обновлении изображений продуктов:", error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Запускает cron job для обновления изображений каждые 4 часа
   */
  startScheduledUpdates() {
    if (this.isRunning) {
      console.log("📸 Product image update service уже запущен");
      return;
    }

    // Создаем cron job для обновления каждые 4 часа (в 00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
    this.cronTask = cron.schedule(
      "0 0,4,8,12,16,20 * * *",
      async () => {
        console.log("⏰ Запуск планового обновления изображений продуктов");
        await this.updateAllProductImageUrls();
      },
      {
        scheduled: false,
        timezone: "Asia/Tashkent",
      }
    );

    // Запускаем task
    this.cronTask.start();

    this.isRunning = true;
    console.log("📸 Product Image Update Service запущен!");
    console.log("⏰ Обновление изображений будет происходить каждые 4 часа");
    console.log("   - Время обновлений: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 (Ташкент)");
    
    // Запускаем первоначальное обновление через 1 минуту после старта
    setTimeout(async () => {
      console.log("🚀 Запуск первоначального обновления изображений...");
      await this.updateAllProductImageUrls();
    }, 60000); // 60 секунд
  }

  /**
   * Останавливает cron job
   */
  stopScheduledUpdates() {
    if (!this.isRunning) {
      console.log("📸 Product image update service не запущен");
      return;
    }

    if (this.cronTask) {
      this.cronTask.destroy();
      this.cronTask = null;
    }

    this.isRunning = false;
    console.log("📸 Product Image Update Service остановлен");
  }

  /**
   * Возвращает текущий статус сервиса
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: "0 0,4,8,12,16,20 * * *", // каждые 4 часа
      timezone: "Asia/Tashkent",
      description: "Обновление URL изображений продуктов каждые 4 часа",
      nextExecutions: [
        "00:00", "04:00", "08:00", "12:00", "16:00", "20:00"
      ]
    };
  }

  /**
   * Ручной запуск обновления (для тестирования)
   */
  async manualUpdate() {
    console.log("🔧 Ручной запуск обновления изображений продуктов");
    return await this.updateAllProductImageUrls();
  }
}

module.exports = new ProductImageUpdateService();
