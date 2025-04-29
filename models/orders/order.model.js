const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const orderProductSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    price: {
      type: Number,
      required: true,
    },
    nextOilChangeDate: {
      type: Date, // Har bir mahsulot uchun keyingi almashtirish sanasi
    },
  },
  {
    versionKey: false,
  }
);

const orderSchema = withBaseFields({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  products: {
    type: [orderProductSchema],
    required: true,
  },
  totalAmount: {
    type: Number,
    required: true,
  },
  paidAmount: {
    type: Number,
    default: 0, // VIP mijozlar uchun qisman to'lovni ko'rsatadi
  },
  debtAmount: {
    type: Number,
    default: 0, // Agar VIP mijoz qarz olsa
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },
  orderType: {
    type: String,
    enum: ["vip", "regular"],
    required: true,
  },
  notes: {
    type: String,
    default: "",
  },
});

module.exports = mongoose.model("Order", orderSchema);
