const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const discountSchema = new mongoose.Schema(
  {
    price: {
      type: Number,
      default: 0,
    },
    children: [
      {
        quantity: {
          type: Number,
          required: true,
        },
        value: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  { _id: false } // prevent creating extra _id for embedded schema
);

const productSchema = withBaseFields({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  costPrice: {
    type: Number,
    required: true,
    default: 0,
  },
  salePrice: {
    type: Number,
    required: true,
    default: 0,
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
  },
  minQuantity: {
    type: Number,
    required: true,
    default: 0,
  },
  oilKm: {
    type: Number,
    default: 0,
  },
  images: {
    type: [String], // Массив URL или путей к изображениям
    required: true,
    validate: (v) => Array.isArray(v) && v.length > 0,
  },
  unit: {
    type: String,
    required: true,
    trim: true,
  },
  currency: {
    type: String,
    enum: ["UZS", "USD"],
    required: true,
    default: "UZS",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
  },
  batch_number: {
    type: String,
    ref: "Batch",
    required: true,
  },
  discount: {
    type: discountSchema,
    default: () => ({}),
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
});

module.exports = mongoose.model("Product", productSchema);
