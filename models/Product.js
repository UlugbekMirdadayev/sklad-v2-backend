const mongoose = require("mongoose");

const ProductsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    ingredients: [
      {
        ingredient: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ingredient",
          required: true,
        },
        quantity: { type: Number, required: true },
        unit: { type: String, required: true },
      },
    ],
    sku: { type: String, unique: true },
    unit: { type: String, required: true },
    salePrice: { type: Number, default: 0 },
    costPrice: { type: Number, default: 0 },
    collaboration: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Product", ProductsSchema);
