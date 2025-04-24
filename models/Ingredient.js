const mongoose = require("mongoose");

const IngredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    unit: { type: String, required: true }, //["kg", "g", "l", "ml", "dona"]
    minStock: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    purchasePrice: { type: Number, default: 0 },
    paymentType: {
      type: String,
      enum: ["cash", "card", "credit"],
      default: "cash",
    },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Ingredient", IngredientSchema);
