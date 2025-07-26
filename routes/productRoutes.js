const express = require("express");
const router = express.Router();
const Product = require("../models/products/product.model");
const authMiddleware = require("../middleware/authMiddleware");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const {
  uploadPhotoToTelegram,
  getFileUrlFromTelegram,
} = require("../config/tg");

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

/**
 * Обновляет fileURL для изображений продукта, получая актуальные URL из Telegram
 * @param {Object} product - Объект продукта
 * @returns {Promise<Object>} - Продукт с обновленными fileURL
 */
async function updateProductImageUrls(product) {
  if (!product || !product.images || product.images.length === 0) {
    return product;
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
        } else {
          updatedImages.push(image);
        }
      } catch (error) {
        console.warn(
          `Не удалось обновить URL для file_id ${image.file_id}:`,
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
      console.log(`Обновлены URL изображений для продукта ${product._id}`);
    } catch (error) {
      console.warn(
        `Не удалось сохранить обновленные URL для продукта ${product._id}:`,
        error.message
      );
    }
  }

  // Возвращаем продукт с обновленными URL
  const updatedProduct = product.toObject ? product.toObject() : { ...product };
  updatedProduct.images = updatedImages;
  return updatedProduct;
}

/** Multer config for memory storage (для загрузки в Telegram) */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB лимит (Telegram поддерживает до 20MB для фото)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

/** Product validation rules */
const productValidation = [
  body("name").trim().notEmpty().withMessage("Product name is required"),
  body("costPrice").isNumeric().withMessage("Cost price must be a number"),
  body("salePrice").isNumeric().withMessage("Sale price must be a number"),
  body("quantity")
    .isNumeric({ min: 0 })
    .withMessage("Quantity must be a non-negative number"),
  body("minQuantity")
    .isNumeric({ min: 0 })
    .withMessage("Minimal quantity must be a non-negative number"),
  body("unit").notEmpty().withMessage("Unit is required"),
  body("currency")
    .isIn(["UZS", "USD"])
    .withMessage("Currency must be UZS or USD"),
  body("createdBy").isMongoId().withMessage("Invalid creator ID"),
  body("branch").isMongoId().withMessage("Invalid branch ID"),
  body("images")
    .optional()
    .custom((value) => {
      // Если это строка, преобразуем в массив
      if (typeof value === "string") {
        return true;
      }
      // Если это массив, проверяем что все элементы - строки
      if (Array.isArray(value)) {
        return value.every((item) => typeof item === "string");
      }
      throw new Error("Images must be a string or array of strings");
    })
    .withMessage("Images must be a string or array of strings"),
  body("oldImages")
    .optional()
    .custom((value) => {
      // Если это строка (JSON массив URL-адресов или объектов)
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            // Проверяем что все элементы - строки (URL или file_id) или объекты с url/fileURL
            return parsed.every((item) => {
              // Поддерживаем как строки, так и объекты с полем url или fileURL
              return (
                typeof item === "string" ||
                (typeof item === "object" &&
                  item !== null &&
                  (typeof item.url === "string" ||
                    typeof item.fileURL === "string"))
              );
            });
          }
          return false;
        } catch (e) {
          return false;
        }
      }
      // Если это массив
      if (Array.isArray(value)) {
        return value.every((item) => {
          // Поддерживаем как строки, так и объекты с полем url или fileURL
          return (
            typeof item === "string" ||
            (typeof item === "object" &&
              item !== null &&
              (typeof item.url === "string" ||
                typeof item.fileURL === "string"))
          );
        });
      }
      return false;
    })
    .withMessage(
      "Old images must be a JSON string array of URLs/objects or array of strings/objects"
    ),
  body("deletedImages")
    .optional()
    .custom((value) => {
      // Если это строка (JSON массив URL-адресов или объектов)
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            // Проверяем что все элементы - строки (URL или file_id) или объекты с url/fileURL
            return parsed.every((item) => {
              // Поддерживаем как строки, так и объекты с полем url или fileURL
              return (
                typeof item === "string" ||
                (typeof item === "object" &&
                  item !== null &&
                  (typeof item.url === "string" ||
                    typeof item.fileURL === "string"))
              );
            });
          }
          return false;
        } catch (e) {
          return false;
        }
      }
      // Если это массив
      if (Array.isArray(value)) {
        return value.every((item) => {
          // Поддерживаем как строки, так и объекты с полем url или fileURL
          return (
            typeof item === "string" ||
            (typeof item === "object" &&
              item !== null &&
              (typeof item.url === "string" ||
                typeof item.fileURL === "string"))
          );
        });
      }
      return false;
    })
    .withMessage(
      "Deleted images must be a JSON string array of URLs/objects or array of strings/objects"
    ),
  body("discount")
    .optional()
    .custom((value) => {
      if (typeof value === "string") value = JSON.parse(value);
      if (typeof value !== "object")
        throw new Error("Discount must be an object");
      if (value.price !== undefined && typeof value.price !== "number")
        throw new Error("Discount price must be a number");
      if (value.children && !Array.isArray(value.children))
        throw new Error("Discount children must be an array");
      if (value.children) {
        value.children.forEach((child) => {
          if (
            typeof child.quantity !== "number" ||
            typeof child.value !== "number"
          ) {
            throw new Error(
              "Discount children must have numeric quantity and value"
            );
          }
        });
      }
      return true;
    }),
  body("description")
    .optional()
    .isString()
    .withMessage("Description must be a string"),
  body("vipPrice")
    .optional()
    .isNumeric()
    .withMessage("vipPrice must be a number"),
  body("isAvailable")
    .optional()
    .isBoolean()
    .withMessage("isAvailable must be a boolean"),
];

/** Create product with images uploaded to Telegram */
router.post(
  "/",
  authMiddleware,
  upload.array("images", 10),
  productValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let images = [];

      // Загружаем файлы в Telegram и получаем объекты с file_id и fileURL
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file) => {
          const caption = `Product: ${req.body.name || "Unknown"}`;
          return await uploadPhotoToTelegram(file.buffer, caption);
        });
        images = await Promise.all(uploadPromises);
      } else if (req.body.images) {
        // Если передаются уже существующие file_id, преобразуем в нужный формат
        if (typeof req.body.images === "string") {
          if (isURL(req.body.images)) {
            images = [{ file_id: "", fileURL: req.body.images }];
          } else if (isValidFileId(req.body.images)) {
            const fileURL = await getFileUrlFromTelegram(req.body.images);
            images = [{ file_id: req.body.images, fileURL }];
          }
        } else if (Array.isArray(req.body.images)) {
          const imagePromises = req.body.images.map(async (item) => {
            if (isURL(item)) {
              return { file_id: "", fileURL: item };
            } else if (isValidFileId(item)) {
              const fileURL = await getFileUrlFromTelegram(item);
              return { file_id: item, fileURL };
            }
            return null; // Пропускаем невалидные элементы
          });
          const resolvedImages = await Promise.all(imagePromises);
          images = resolvedImages.filter((img) => img !== null);
        }
      }

      if (typeof req.body.discount === "string") {
        req.body.discount = JSON.parse(req.body.discount);
      }

      const product = new Product({ ...req.body, images });
      await product.save();
      const populatedProduct = await Product.findById(product._id)
        .populate("createdBy", "-password")
        .populate("branch")
        .populate("batch_number");

      // Обновляем fileURL перед отправкой ответа
      const updatedProduct = await updateProductImageUrls(populatedProduct);

      res.status(201).json(updatedProduct);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({
        message: error.message,
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
);

/** Get all products */
router.get("/", async (req, res) => {
  try {
    const {
      name,
      createdBy,
      minCostPrice,
      maxCostPrice,
      minSalePrice,
      maxSalePrice,
      search,
      batch_number,
      isAvailable,
    } = req.query;

    const query = { isDeleted: false };
    if (name) query.name = { $regex: name, $options: "i" };
    if (createdBy) query.createdBy = createdBy;
    if (batch_number) query.batch_number = batch_number;
    if (minCostPrice || maxCostPrice) {
      query.costPrice = {};
      if (minCostPrice) query.costPrice.$gte = Number(minCostPrice);
      if (maxCostPrice) query.costPrice.$lte = Number(maxCostPrice);
    }
    if (minSalePrice || maxSalePrice) {
      query.salePrice = {};
      if (minSalePrice) query.salePrice.$gte = Number(minSalePrice);
      if (maxSalePrice) query.salePrice.$lte = Number(maxSalePrice);
    }
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === "true";
    }
    if (search) query.name = { $regex: search, $options: "i" };
    const products = await Product.find(query)
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number")
      .sort({ createdAt: -1 });

    // Обновляем fileURL для всех продуктов
    const updatedProducts = await Promise.all(
      products.map(async (product) => {
        return await updateProductImageUrls(product);
      })
    );

    res.json(updatedProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Get product by ID */
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    })
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number");
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Обновляем fileURL для продукта
    const updatedProduct = await updateProductImageUrls(product);

    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Update product by ID */
router.patch(
  "/:id",
  authMiddleware,
  upload.array("newImages", 10),
  productValidation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const product = await Product.findOne({
        _id: req.params.id,
        isDeleted: false,
      });
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      let finalImages = [];

      // 1. Обрабатываем старые изображения (oldImages)
      if (req.body.oldImages) {
        let oldImages = [];

        if (typeof req.body.oldImages === "string") {
          try {
            oldImages = JSON.parse(req.body.oldImages);
          } catch (e) {
            console.warn(
              "Не удалось распарсить oldImages:",
              req.body.oldImages
            );
            oldImages = [];
          }
        } else if (Array.isArray(req.body.oldImages)) {
          oldImages = req.body.oldImages;
        }

        // Добавляем старые изображения (URL-адреса, file_id или объекты)
        for (const oldImg of oldImages) {
          if (typeof oldImg === "string" && isURL(oldImg)) {
            // Строка с URL
            finalImages.push({ file_id: "", fileURL: oldImg });
          } else if (typeof oldImg === "string" && isValidFileId(oldImg)) {
            // Строка с file_id
            try {
              const fileURL = await getFileUrlFromTelegram(oldImg);
              finalImages.push({ file_id: oldImg, fileURL });
            } catch (error) {
              console.warn(
                `Не удалось получить URL для старого file_id ${oldImg}:`,
                error.message
              );
            }
          } else if (oldImg && typeof oldImg === "object") {
            // Объект с данными изображения
            if (
              oldImg.url &&
              typeof oldImg.url === "string" &&
              isURL(oldImg.url)
            ) {
              // Объект с полем url
              finalImages.push({ file_id: "", fileURL: oldImg.url });
            } else if (oldImg.fileURL && typeof oldImg.fileURL === "string") {
              // Объект с полем fileURL (уже в правильном формате)
              const imageToAdd = { ...oldImg };
              if (!imageToAdd.file_id) {
                imageToAdd.file_id = "";
              }
              finalImages.push(imageToAdd);
            } else if (
              oldImg.file_id &&
              typeof oldImg.file_id === "string" &&
              isValidFileId(oldImg.file_id)
            ) {
              // Объект с полем file_id
              try {
                const fileURL = await getFileUrlFromTelegram(oldImg.file_id);
                finalImages.push({ file_id: oldImg.file_id, fileURL });
              } catch (error) {
                console.warn(
                  `Не удалось получить URL для старого file_id ${oldImg.file_id}:`,
                  error.message
                );
              }
            }
          }
        }
      }

      // 2. Загружаем новые файлы в Telegram (newImages)
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map(async (file) => {
          const caption = `Product Update: ${req.body.name || product.name}`;
          return await uploadPhotoToTelegram(file.buffer, caption);
        });
        const newImages = await Promise.all(uploadPromises);
        finalImages = [...finalImages, ...newImages];
      }

      // 3. Обрабатываем удаленные изображения (deletedImages)
      if (req.body.deletedImages) {
        let deletedImages = [];

        if (typeof req.body.deletedImages === "string") {
          try {
            deletedImages = JSON.parse(req.body.deletedImages);
          } catch (e) {
            console.warn(
              "Не удалось распарсить deletedImages:",
              req.body.deletedImages
            );
            deletedImages = [];
          }
        } else if (Array.isArray(req.body.deletedImages)) {
          deletedImages = req.body.deletedImages;
        }

        // 3. Логируем удаленные изображения (deletedImages) для отладки
        if (deletedImages.length > 0) {
          console.log(
            `Удалены изображения для продукта ${product.name || product._id}:`,
            deletedImages
          );
        }
      }

      if (typeof req.body.discount === "string") {
        req.body.discount = JSON.parse(req.body.discount);
      }

      // Обновляем данные продукта
      const updatedData = { ...req.body };
      delete updatedData.oldImages;
      delete updatedData.deletedImages;
      updatedData.images = finalImages;

      Object.assign(product, updatedData);
      await product.save();

      const populatedProduct = await Product.findById(product._id)
        .populate("createdBy", "-password")
        .populate("branch")
        .populate("batch_number");

      // Обновляем fileURL перед отправкой ответа
      const updatedProduct = await updateProductImageUrls(populatedProduct);

      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({
        message: error.message,
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
);

/** Soft delete product by ID */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      isDeleted: false,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save();
    res.json({ message: "Product soft deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Add new images to existing product */
router.post(
  "/:id/images",
  authMiddleware,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const { id } = req.params;

      const product = await Product.findOne({
        _id: id,
        isDeleted: false,
      });

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No images provided" });
      }

      // Загружаем новые файлы в Telegram
      const uploadPromises = req.files.map(async (file) => {
        const caption = `Product Add Images: ${product.name}`;
        return await uploadPhotoToTelegram(file.buffer, caption);
      });

      const newImages = await Promise.all(uploadPromises);

      // Добавляем новые изображения к существующим
      product.images.push(...newImages);
      await product.save();

      const populatedProduct = await Product.findById(product._id)
        .populate("createdBy", "-password")
        .populate("branch")
        .populate("batch_number");

      // Обновляем fileURL перед отправкой ответа
      const updatedProduct = await updateProductImageUrls(populatedProduct);

      res.json({
        message: "Images added successfully",
        product: updatedProduct,
        addedImages: newImages,
      });
    } catch (error) {
      console.error("Error adding images:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

/** Remove specific image from product */
router.delete("/:id/images/:fileId", authMiddleware, async (req, res) => {
  try {
    const { id, fileId } = req.params;

    const product = await Product.findOne({
      _id: id,
      isDeleted: false,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Находим и удаляем изображение с указанным file_id
    const imageIndex = product.images.findIndex(
      (img) => img.file_id === fileId
    );

    if (imageIndex === -1) {
      return res.status(404).json({ message: "Image not found in product" });
    }

    product.images.splice(imageIndex, 1);
    await product.save();

    const populatedProduct = await Product.findById(product._id)
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number");

    // Обновляем fileURL перед отправкой ответа
    const updatedProduct = await updateProductImageUrls(populatedProduct);

    res.json({
      message: "Image removed successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error removing image:", error);
    res.status(500).json({ message: error.message });
  }
});

/** Quick search products by name */
router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;
    const { isAvailable } = req.query;

    const searchQuery = {
      name: { $regex: query, $options: "i" },
      isDeleted: false,
    };

    if (isAvailable !== undefined) {
      searchQuery.isAvailable = isAvailable === "true";
    }

    const products = await Product.find(searchQuery)
      .populate("createdBy", "-password")
      .populate("branch")
      .populate("batch_number")
      .limit(10);

    // Обновляем fileURL для всех найденных продуктов
    const updatedProducts = await Promise.all(
      products.map(async (product) => {
        return await updateProductImageUrls(product);
      })
    );

    res.json(updatedProducts);
  } catch (error) {
    console.error("Error searching products:", error);
    res.status(500).json({ message: error.message });
  }
});

/** Get image from Telegram by file_id */
router.get("/image/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const imageUrl = await getFileUrlFromTelegram(fileId);

    // Можем либо вернуть URL, либо проксировать изображение
    if (req.query.proxy === "true") {
      // Проксируем изображение через наш сервер
      const axios = require("axios");
      const response = await axios.get(imageUrl, { responseType: "stream" });

      res.setHeader(
        "Content-Type",
        response.headers["content-type"] || "image/jpeg"
      );
      res.setHeader("Cache-Control", "public, max-age=86400"); // Кешируем на день

      response.data.pipe(res);
    } else {
      // Просто возвращаем URL
      res.json({ imageUrl });
    }
  } catch (error) {
    console.error("Error getting image from Telegram:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - costPrice
 *         - salePrice
 *         - quantity
 *         - minQuantity
 *         - unit
 *         - currency
 *         - createdBy
 *         - branch
 *       properties:
 *         _id:
 *           type: string
 *           description: Unique identifier for the product
 *         name:
 *           type: string
 *           description: Product name
 *         costPrice:
 *           type: number
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           description: Minimum quantity threshold
 *         images:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fileURL:
 *                 type: string
 *                 description: Direct URL to the image from Telegram
 *               file_id:
 *                 type: string
 *                 description: Telegram file_id of uploaded image (empty string for direct URLs)
 *           description: Array of image objects with file_id and fileURL
 *         unit:
 *           type: string
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           description: VIP price for special customers
 *         discount:
 *           type: object
 *           properties:
 *             price:
 *               type: number
 *               default: 0
 *               description: Fixed discount price
 *             children:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   quantity:
 *                     type: number
 *                     description: Quantity threshold for discount
 *                   value:
 *                     type: number
 *                     description: Discount percentage or value
 *               description: Array of quantity-based discounts
 *           description: Discount configuration for the product
 *         description:
 *           type: string
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           default: true
 *           description: Whether the product is available for sale
 *         isDeleted:
 *           type: boolean
 *           default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     ProductInput:
 *       type: object
 *       required:
 *         - name
 *         - costPrice
 *         - salePrice
 *         - quantity
 *         - minQuantity
 *         - unit
 *         - currency
 *         - createdBy
 *         - branch
 *       properties:
 *         name:
 *           type: string
 *           example: "Motor Oil 5W-30"
 *           description: Product name
 *         costPrice:
 *           type: number
 *           example: 50000
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           example: 75000
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           example: 100.5
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           example: 10.5
 *           description: Minimum quantity threshold
 *         images:
 *           oneOf:
 *             - type: string
 *               description: Single Telegram file_id
 *               example: "BAADBAADtgIAAuWfHwTKrF1rVVxxdRYE"
 *             - type: array
 *               items:
 *                 type: string
 *                 example: "BAADBAADtgIAAuWfHwTKrF1rVVxxdRYE"
 *               description: Array of Telegram file_ids
 *           description: Single file_id or array of Telegram file_ids
 *         unit:
 *           type: string
 *           example: "литр"
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           example: "UZS"
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           example: "507f1f77bcf86cd799439012"
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           example: "BATCH001"
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           example: 70000
 *           description: VIP price for special customers
 *         discount:
 *           type: object
 *           properties:
 *             price:
 *               type: number
 *               example: 5000
 *               description: Fixed discount price
 *             children:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   quantity:
 *                     type: number
 *                     example: 5
 *                     description: Quantity threshold for discount
 *                   value:
 *                     type: number
 *                     example: 10
 *                     description: Discount percentage or value
 *               description: Array of quantity-based discounts
 *           description: Discount configuration for the product
 *         description:
 *           type: string
 *           example: "High quality motor oil for modern engines"
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           example: true
 *           description: Whether the product is available for sale
 *
 *     ProductFormUpdateInput:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Product name
 *         costPrice:
 *           type: number
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           description: Minimum quantity threshold
 *         newImages:
 *           type: array
 *           items:
 *             type: string
 *             format: binary
 *           description: New image files to upload (max 10 files, 20MB each)
 *         oldImages:
 *           type: string
 *           description: JSON string array of existing images to keep (URLs, file_ids, or objects with url/fileURL field)
 *           example: '[{"fileURL":"https://example.com/img1.jpg","file_id":"ABC123"}, "https://example.com/img2.jpg", "file_id_123"]'
 *         deletedImages:
 *           type: string
 *           description: JSON string array of images to delete (URLs, file_ids, or objects with url/fileURL field)
 *           example: '[{"fileURL":"https://example.com/img3.jpg","file_id":"XYZ789"}, "file_id_456"]'
 *         unit:
 *           type: string
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           description: VIP price for special customers
 *         discount:
 *           type: string
 *           description: JSON string of discount configuration
 *         description:
 *           type: string
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           description: Whether the product is available for sale
 *
 *     ProductFormInput:
 *       type: object
 *       required:
 *         - name
 *         - costPrice
 *         - salePrice
 *         - quantity
 *         - minQuantity
 *         - unit
 *         - currency
 *         - createdBy
 *         - branch
 *       properties:
 *         name:
 *           type: string
 *           description: Product name
 *         costPrice:
 *           type: number
 *           description: Cost price of the product
 *         salePrice:
 *           type: number
 *           description: Sale price of the product
 *         quantity:
 *           type: number
 *           minimum: 0
 *           description: Current quantity in stock
 *         minQuantity:
 *           type: number
 *           minimum: 0
 *           description: Minimum quantity threshold
 *         images:
 *           type: array
 *           items:
 *             type: string
 *             format: binary
 *           description: Image files to upload (max 10 files, 20MB each)
 *         unit:
 *           type: string
 *           description: Unit of measurement
 *         currency:
 *           type: string
 *           enum: [UZS, USD]
 *           description: Currency type
 *         createdBy:
 *           type: string
 *           description: ID of the admin who created the product
 *         branch:
 *           type: string
 *           description: ID of the branch
 *         batch_number:
 *           type: string
 *           description: Batch number
 *         vipPrice:
 *           type: number
 *           description: VIP price for special customers
 *         discount:
 *           type: string
 *           description: JSON string of discount configuration
 *         description:
 *           type: string
 *           description: Product description
 *         isAvailable:
 *           type: boolean
 *           description: Whether the product is available for sale
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Create a new product with multipart form data or JSON
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductFormInput'
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *           example:
 *             name: "Motor Oil 5W-30"
 *             costPrice: 50000
 *             salePrice: 75000
 *             quantity: 100.5
 *             minQuantity: 10.5
 *             images: "BAADBAADtgIAAuWfHwTKrF1rVVxxdRYE"
 *             unit: "литр"
 *             currency: "UZS"
 *             createdBy: "507f1f77bcf86cd799439011"
 *             branch: "507f1f77bcf86cd799439012"
 *             batch_number: "BATCH001"
 *             description: "High quality motor oil"
 *             vipPrice: 70000
 *             isAvailable: true
 *             discount:
 *               price: 5000
 *               children:
 *                 - quantity: 5
 *                   value: 10
 *                 - quantity: 10
 *                   value: 15
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                       param:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter by product name (case insensitive)
 *       - in: query
 *         name: createdBy
 *         schema:
 *           type: string
 *         description: Filter by creator ID
 *       - in: query
 *         name: batch_number
 *         schema:
 *           type: string
 *         description: Filter by batch number
 *       - in: query
 *         name: minCostPrice
 *         schema:
 *           type: number
 *         description: Minimum cost price filter
 *       - in: query
 *         name: maxCostPrice
 *         schema:
 *           type: number
 *         description: Maximum cost price filter
 *       - in: query
 *         name: minSalePrice
 *         schema:
 *           type: number
 *         description: Minimum sale price filter
 *       - in: query
 *         name: maxSalePrice
 *         schema:
 *           type: number
 *         description: Maximum sale price filter
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by product name
 *       - in: query
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *         description: Filter by product availability
 *     responses:
 *       200:
 *         description: List of products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 *
 *   patch:
 *     summary: Update product by ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ProductFormUpdateInput'
 *           example:
 *             name: "Updated Motor Oil 5W-30"
 *             costPrice: 55000
 *             salePrice: 80000
 *             newImages: ["binary file 1", "binary file 2"]
 *             oldImages: '[{"fileURL":"https://api.telegram.org/file/bot123/photo1.jpg","file_id":"ABC123"}, "file_id_123"]'
 *             deletedImages: '[{"fileURL":"https://api.telegram.org/file/bot123/photo2.jpg","file_id":"XYZ789"}]'
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Motor Oil 5W-30"
 *               costPrice:
 *                 type: number
 *                 example: 55000
 *               salePrice:
 *                 type: number
 *                 example: 80000
 *               oldImages:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                       example: "https://api.telegram.org/file/bot123/photo1.jpg"
 *                     - type: object
 *                       properties:
 *                         fileURL:
 *                           type: string
 *                           example: "https://api.telegram.org/file/bot123/photo1.jpg"
 *                         file_id:
 *                           type: string
 *                           example: "ABC123"
 *                 description: Array of existing images to keep (URLs, file_ids, or objects with fileURL/file_id)
 *               deletedImages:
 *                 type: array
 *                 items:
 *                   oneOf:
 *                     - type: string
 *                       example: "https://api.telegram.org/file/bot123/photo2.jpg"
 *                     - type: object
 *                       properties:
 *                         fileURL:
 *                           type: string
 *                           example: "https://api.telegram.org/file/bot123/photo2.jpg"
 *                         file_id:
 *                           type: string
 *                           example: "XYZ789"
 *                 description: Array of images to delete (URLs, file_ids, or objects with fileURL/file_id)
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 *
 *   delete:
 *     summary: Soft delete product by ID
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Product soft deleted successfully"
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/search/{query}:
 *   get:
 *     summary: Quick search products by name
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query for product name
 *       - in: query
 *         name: isAvailable
 *         schema:
 *           type: boolean
 *         description: Filter by product availability
 *     responses:
 *       200:
 *         description: Search results (limited to 10)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/image/{fileId}:
 *   get:
 *     summary: Get image from Telegram by file_id
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram file_id of the image
 *       - in: query
 *         name: proxy
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: Whether to proxy the image through our server or return the URL
 *     responses:
 *       200:
 *         description: Image URL or proxied image
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imageUrl:
 *                   type: string
 *                   example: "https://api.telegram.org/file/bot123:ABC/photos/file_123.jpg"
 *                   description: Direct URL to the image (when proxy=false)
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Image binary data (when proxy=true)
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Image binary data (when proxy=true)
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/{id}/images:
 *   post:
 *     summary: Add new images to existing product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files to upload (max 10 files, 20MB each)
 *     responses:
 *       200:
 *         description: Images added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Images added successfully"
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *                 addedImages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fileURL:
 *                         type: string
 *                       file_id:
 *                         type: string
 *       400:
 *         description: No images provided
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /api/products/{id}/images/{fileId}:
 *   delete:
 *     summary: Remove specific image from product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: Telegram file_id of the image to remove
 *     responses:
 *       200:
 *         description: Image removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Image removed successfully"
 *                 product:
 *                   $ref: '#/components/schemas/Product'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product or image not found
 *       500:
 *         description: Internal server error
 */
