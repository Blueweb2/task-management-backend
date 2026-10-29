const mongoose = require("mongoose");

const taskEquipmentItemSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockItem",
      required: [true, "Equipment item is required"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
      default: 1,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  { _id: true }
);

const taskAttachmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      default: "",
    },
    size: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const taskStatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      minlength: [2, "Task title must be at least 2 characters"],
      maxlength: [200, "Task title cannot exceed 200 characters"],
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    taskDate: {
      type: Date,
      default: Date.now,
    },

    dueDate: {
      type: Date,
      required: [true, "Task due date is required"],
    },

    dueTime: {
      type: String,
      trim: true,
      default: "",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },

    status: {
      type: String,
      enum: [
        "TODO",
        "ASSIGNED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ],
      default: "TODO",
    },

    // Category / Service
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      default: null,
    },

    // Assigned staff members (multiple staff members can be assigned)
    assignedStaff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Required equipment
    requiredEquipment: {
      type: [taskEquipmentItemSchema],
      default: [],
    },

    // Voice recording associated with the task
    voiceRecording: {
      url: {
        type: String,
        default: "",
      },
      duration: {
        type: Number,
        default: 0,
      },
      format: {
        type: String,
        default: "audio/webm",
      },
      transcribedText: {
        type: String,
        default: "",
      },
    },

    // Reference images or documents
    attachments: {
      type: [taskAttachmentSchema],
      default: [],
    },

    // Estimated expenses for the task
    estimatedExpenses: {
      type: Number,
      default: 0,
      min: [0, "Estimated expenses cannot be negative"],
    },

    location: {
      type: String,
      trim: true,
      default: "",
      maxlength: 250,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1500,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
    },

    completedAt: {
      type: Date,
      default: null,
    },

    statusHistory: {
      type: [taskStatusHistorySchema],
      default: [],
    },

    // Optional legacy reference for existing duty linkages
    duty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Duty",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast querying
taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ assignedStaff: 1, status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ service: 1 });
taskSchema.index({ createdBy: 1 });
taskSchema.index({ taskDate: -1 });

module.exports = mongoose.model("Task", taskSchema);