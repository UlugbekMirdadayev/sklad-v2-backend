const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const carSchema = new mongoose.Schema({
  model: { type: String, required: true }, // Mashina rusumi
  plateNumber: { type: String, required: true }, // Mashina raqami
});

const clientSchema = withBaseFields({
  fullName: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  cars: {
    type: [carSchema],
    default: [],
  },
  isVip: {
    type: Boolean,
    default: false,
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
  },
  debt: {
    type: Number,
    default: 0,
  },
  partialPayments: {
    type: [
      {
        amount: Number,
        date: Date,
      },
    ],
    default: [],
  },
  notes: {
    type: String,
    default: "",
  },
  password: {
    type: String,
    default: "123456",
  },
});

module.exports = mongoose.model("Client", clientSchema);
