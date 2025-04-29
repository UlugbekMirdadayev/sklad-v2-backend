const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const productSchema = withBaseFields({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    enum: ["Oil", "Filter", "SparePart", "Other"],
    default: "Other",
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Manager",
    required: true,
  },
});

module.exports = mongoose.model("Product", productSchema);
