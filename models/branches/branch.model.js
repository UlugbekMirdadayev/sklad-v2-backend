const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const branchSchema = withBaseFields({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  address: {
    type: String,
    required: false,
    trim: true,
    default: "",
  },
  phone: {
    type: String,
    required: false,
    trim: true,
    default: "",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model("Branch", branchSchema);
