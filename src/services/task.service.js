const Task = require("../models/task.model");
const User = require("../models/user.model");
const Service = require("../models/service.model");
const StockItem = require("../models/stockItem.model");

/**
 * Create task
 */
const createTask = async ({
  title,
  description = "",
  taskDate = new Date(),
  dueDate,
  dueTime = "",
  priority = "MEDIUM",
  service = null,
  assignedStaff = [],
  requiredEquipment = [],
  voiceRecording = null,
  attachments = [],
  estimatedExpenses = 0,
  location = "",
  notes = "",
  createdBy,
  duty = null,
}) => {
  if (!title || !title.trim()) {
    const error = new Error("Task title is required");
    error.statusCode = 400;
    throw error;
  }

  if (!dueDate) {
    const error = new Error("Due date is required");
    error.statusCode = 400;
    throw error;
  }

  // Normalize assigned staff array of IDs
  const staffIds = Array.isArray(assignedStaff)
    ? assignedStaff.filter(Boolean)
    : [];

  const initialStatus = staffIds.length > 0 ? "ASSIGNED" : "TODO";

  const task = await Task.create({
    title: title.trim(),
    description: description?.trim() || "",
    taskDate: taskDate || new Date(),
    dueDate,
    dueTime: dueTime?.trim() || "",
    priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority?.toUpperCase())
      ? priority.toUpperCase()
      : "MEDIUM",
    status: initialStatus,
    service: service || null,
    assignedStaff: staffIds,
    requiredEquipment: Array.isArray(requiredEquipment) ? requiredEquipment : [],
    voiceRecording: voiceRecording || {
      url: "",
      duration: 0,
      format: "audio/webm",
      transcribedText: "",
    },
    attachments: Array.isArray(attachments) ? attachments : [],
    estimatedExpenses: Number(estimatedExpenses) || 0,
    location: location?.trim() || "",
    notes: notes?.trim() || "",
    createdBy,
    duty: duty || null,
    statusHistory: [
      {
        status: initialStatus,
        changedBy: createdBy,
        changedAt: new Date(),
        notes: "Task created",
      },
    ],
  });

  return getTaskById(task._id);
};

/**
 * Get tasks with multi-field filtering and role boundaries
 */
const getTasks = async (query = {}, currentUser = null) => {
  const {
    status,
    priority,
    service,
    assignedStaff,
    search,
    startDate,
    endDate,
    page = 1,
    limit = 50,
  } = query;

  const currentPage = Math.max(Number(page) || 1, 1);
  const perPage = Math.min(Math.max(Number(limit) || 50, 1), 1000);

  const filter = {};

  // Role-based scoping: Staff can ONLY view tasks assigned to them
  if (currentUser && currentUser.role?.toLowerCase() === "staff") {
    filter.assignedStaff = currentUser.userId || currentUser.id || currentUser._id;
  } else if (assignedStaff) {
    filter.assignedStaff = assignedStaff;
  }

  if (status) {
    if (status.includes(",")) {
      filter.status = { $in: status.split(",").map((s) => s.trim().toUpperCase()) };
    } else {
      filter.status = status.toUpperCase();
    }
  }

  if (priority) {
    filter.priority = priority.toUpperCase();
  }

  if (service) {
    filter.service = service;
  }

  if (startDate || endDate) {
    filter.dueDate = {};
    if (startDate) {
      filter.dueDate.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.dueDate.$lte = end;
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    filter.$or = [
      { title: { $regex: term, $options: "i" } },
      { description: { $regex: term, $options: "i" } },
      { location: { $regex: term, $options: "i" } },
      { notes: { $regex: term, $options: "i" } },
    ];
  }

  const skip = (currentPage - 1) * perPage;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignedStaff", "name username email employeeId avatar department role")
      .populate("service", "name category basePrice unitLabel")
      .populate("requiredEquipment.item", "name category totalQuantity availableQuantity unit")
      .populate("createdBy", "name username role email")
      .populate("statusHistory.changedBy", "name username")
      .sort({ dueDate: 1, dueTime: 1, createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),
    Task.countDocuments(filter),
  ]);

  return {
    tasks,
    pagination: {
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.ceil(total / perPage) || 1,
    },
  };
};

/**
 * Get task by ID with authorization verification
 */
const getTaskById = async (taskId, currentUser = null) => {
  const task = await Task.findById(taskId)
    .populate("assignedStaff", "name username email employeeId avatar department role phone")
    .populate("service", "name category basePrice unitLabel description")
    .populate("requiredEquipment.item", "name category totalQuantity availableQuantity unit location")
    .populate("createdBy", "name username role email")
    .populate("statusHistory.changedBy", "name username role");

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  // If user is Staff, ensure they are assigned to this task
  if (currentUser && currentUser.role?.toLowerCase() === "staff") {
    const currentUserId = (currentUser.userId || currentUser.id || currentUser._id).toString();
    const isAssigned = task.assignedStaff.some(
      (staff) => (staff._id || staff).toString() === currentUserId
    );
    if (!isAssigned) {
      const error = new Error("Unauthorized to access this task");
      error.statusCode = 403;
      throw error;
    }
  }

  return task;
};

/**
 * Update task
 */
const updateTask = async (taskId, updateData, currentUser) => {
  const task = await Task.findById(taskId);

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  const isStaff = currentUser && currentUser.role?.toLowerCase() === "staff";
  const currentUserId = currentUser?.userId || currentUser?.id || currentUser?._id;

  if (isStaff) {
    const isAssigned = task.assignedStaff.some(
      (staffId) => staffId.toString() === currentUserId.toString()
    );
    if (!isAssigned) {
      const error = new Error("Unauthorized to modify this task");
      error.statusCode = 403;
      throw error;
    }

    // Staff can only update status and completion notes
    if (updateData.status) {
      return updateTaskStatus(taskId, updateData.status, updateData.notes || "", currentUser);
    }
    return getTaskById(taskId);
  }

  // Manager updates
  if (updateData.title !== undefined) {
    task.title = updateData.title.trim();
  }

  if (updateData.description !== undefined) {
    task.description = updateData.description.trim();
  }

  if (updateData.taskDate !== undefined) {
    task.taskDate = updateData.taskDate;
  }

  if (updateData.dueDate !== undefined) {
    task.dueDate = updateData.dueDate;
  }

  if (updateData.dueTime !== undefined) {
    task.dueTime = updateData.dueTime.trim();
  }

  if (updateData.priority !== undefined) {
    const p = updateData.priority.toUpperCase();
    if (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(p)) {
      task.priority = p;
    }
  }

  if (updateData.service !== undefined) {
    task.service = updateData.service || null;
  }

  if (updateData.assignedStaff !== undefined) {
    const staffArray = Array.isArray(updateData.assignedStaff)
      ? updateData.assignedStaff.filter(Boolean)
      : [];
    task.assignedStaff = staffArray;

    // Automatically transition TODO to ASSIGNED if staff added and task was TODO
    if (task.status === "TODO" && staffArray.length > 0) {
      task.status = "ASSIGNED";
      task.statusHistory.push({
        status: "ASSIGNED",
        changedBy: currentUserId,
        changedAt: new Date(),
        notes: "Staff assigned",
      });
    } else if (task.status === "ASSIGNED" && staffArray.length === 0) {
      task.status = "TODO";
      task.statusHistory.push({
        status: "TODO",
        changedBy: currentUserId,
        changedAt: new Date(),
        notes: "Staff unassigned",
      });
    }
  }

  if (updateData.requiredEquipment !== undefined) {
    task.requiredEquipment = Array.isArray(updateData.requiredEquipment)
      ? updateData.requiredEquipment
      : [];
  }

  if (updateData.voiceRecording !== undefined) {
    task.voiceRecording = updateData.voiceRecording;
  }

  if (updateData.attachments !== undefined) {
    task.attachments = Array.isArray(updateData.attachments)
      ? updateData.attachments
      : [];
  }

  if (updateData.estimatedExpenses !== undefined) {
    task.estimatedExpenses = Number(updateData.estimatedExpenses) || 0;
  }

  if (updateData.location !== undefined) {
    task.location = updateData.location.trim();
  }

  if (updateData.notes !== undefined) {
    task.notes = updateData.notes.trim();
  }

  if (updateData.status && updateData.status !== task.status) {
    const allowedStatuses = ["TODO", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
    const newStatus = updateData.status.toUpperCase();
    if (allowedStatuses.includes(newStatus)) {
      task.status = newStatus;
      if (newStatus === "COMPLETED") {
        task.completedAt = new Date();
      } else {
        task.completedAt = null;
      }
      task.statusHistory.push({
        status: newStatus,
        changedBy: currentUserId,
        changedAt: new Date(),
        notes: updateData.statusNotes || "Status updated",
      });
    }
  }

  await task.save();

  return getTaskById(task._id);
};

/**
 * Update task status specifically (supports staff and manager actions)
 */
const updateTaskStatus = async (taskId, status, notes = "", currentUser) => {
  const task = await Task.findById(taskId);

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  const isStaff = currentUser && currentUser.role?.toLowerCase() === "staff";
  const currentUserId = currentUser?.userId || currentUser?.id || currentUser?._id;

  if (isStaff) {
    const isAssigned = task.assignedStaff.some(
      (staffId) => staffId.toString() === currentUserId.toString()
    );
    if (!isAssigned) {
      const error = new Error("Unauthorized to update this task");
      error.statusCode = 403;
      throw error;
    }
  }

  const allowedStatuses = ["TODO", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
  const newStatus = status.toUpperCase();

  if (!allowedStatuses.includes(newStatus)) {
    const error = new Error(`Invalid status. Allowed statuses: ${allowedStatuses.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  task.status = newStatus;
  if (newStatus === "COMPLETED") {
    task.completedAt = new Date();
  } else if (newStatus !== "COMPLETED") {
    task.completedAt = null;
  }

  task.statusHistory.push({
    status: newStatus,
    changedBy: currentUserId,
    changedAt: new Date(),
    notes: notes || `Status changed to ${newStatus}`,
  });

  await task.save();

  return getTaskById(task._id);
};

/**
 * Delete or Cancel task
 */
const deleteTask = async (taskId) => {
  const task = await Task.findById(taskId);

  if (!task) {
    const error = new Error("Task not found");
    error.statusCode = 404;
    throw error;
  }

  task.status = "CANCELLED";
  task.statusHistory.push({
    status: "CANCELLED",
    changedAt: new Date(),
    notes: "Task cancelled by manager",
  });

  await task.save();

  return task;
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
};