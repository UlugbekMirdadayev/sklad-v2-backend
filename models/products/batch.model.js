const { withBaseFields } = require("../base.model");
const mongoose = require("mongoose");

const batchSchema = withBaseFields({
  batch_number: {
    type: String,
    unique: true,
    required: true
  }
});

module.exports = mongoose.model("Batch", batchSchema);
