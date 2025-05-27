const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const orderProductSchema = new mongoose.Schema({
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
});

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
  paymentType: {
    type: String,
    enum: ["cash", "card", "debt"],
    default: "cash",
    required: true,
  },
  date_returned: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "cancelled"],
    default: "pending",
    required: true,
  },
  car: {
    type: String,
    default: "",
  },
});

module.exports = mongoose.model("Order", orderSchema);
