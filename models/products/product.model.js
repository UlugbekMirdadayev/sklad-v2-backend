const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const productSchema = withBaseFields({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    default: 0,
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin",
    required: true,
  },
  batch_number: {
    type: mongoose.Schema.Types.String,
    ref: "Batch",
    required: true,
  },
});

module.exports = mongoose.model("Product", productSchema);
