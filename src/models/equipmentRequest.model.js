const mongoose = require("mongoose");

const equipmentRequestSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    stockItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockItem",
      required: [true, "Equipment / stock item is required"],
    },

    requestedQuantity: {
      type: Number,
      required: [true, "Requested quantity is required"],
      min: [1, "Requested quantity must be at least 1"],
    },

    reason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "APPROVED",
        "REJECTED",
        "ISSUED",
        "RETURNED",
        "CANCELLED",
      ],
      default: "PENDING",
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Requested by is required"],
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    issuedAt: {
      type: Date,
      default: null,
    },

    returnedAt: {
      type: Date,
      default: null,
    },

    managerNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

equipmentRequestSchema.index({ task: 1 });
equipmentRequestSchema.index({ requestedBy: 1, status: 1 });
equipmentRequestSchema.index({ stockItem: 1, status: 1 });
equipmentRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("EquipmentRequest", equipmentRequestSchema);
