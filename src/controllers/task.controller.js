const taskService = require("../services/task.service");

/**
 * Create task
 * POST /api/tasks
 */
const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      taskDate,
      dueDate,
      dueTime,
      priority,
      service,
      assignedStaff,
      requiredEquipment,
      voiceRecording,
      attachments,
      estimatedExpenses,
      location,
      notes,
      duty,
    } = req.body;

    const task = await taskService.createTask({
      title,
      description,
      taskDate,
      dueDate,
      dueTime,
      priority,
      service,
      assignedStaff,
      requiredEquipment,
      voiceRecording,
      attachments,
      estimatedExpenses,
      location,
      notes,
      duty,
      createdBy: req.user.userId || req.user.id || req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get tasks
 * GET /api/tasks
 */
const getTasks = async (req, res, next) => {
  try {
    const result = await taskService.getTasks(req.query, req.user);

    res.status(200).json({
      success: true,
      data: result.tasks,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get task by ID
 * GET /api/tasks/:id
 */
const getTaskById = async (req, res, next) => {
  try {
    const task = await taskService.getTaskById(req.params.id, req.user);

    res.status(200).json({
      success: true,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update task
 * PUT /api/tasks/:id
 */
const updateTask = async (req, res, next) => {
  try {
    const task = await taskService.updateTask(
      req.params.id,
      req.body,
      req.user
    );

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update task status (available to staff & managers)
 * PATCH /api/tasks/:id/status
 */
const updateTaskStatus = async (req, res, next) => {
  try {
    const { status, notes } = req.body;
    if (!status) {
      const error = new Error("Status is required");
      error.statusCode = 400;
      throw error;
    }

    const task = await taskService.updateTaskStatus(
      req.params.id,
      status,
      notes || "",
      req.user
    );

    res.status(200).json({
      success: true,
      message: `Task status updated to ${status}`,
      data: {
        task,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel task
 * DELETE /api/tasks/:id
 */
const deleteTask = async (req, res, next) => {
  try {
    await taskService.deleteTask(req.params.id);

    res.status(200).json({
      success: true,
      message: "Task cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle voice recording audio upload
 * POST /api/tasks/voice-upload
 */
const uploadVoiceRecording = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error("No audio file provided");
      error.statusCode = 400;
      throw error;
    }

    const fileUrl = `/uploads/audio/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: "Audio uploaded successfully",
      data: {
        url: fileUrl,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  uploadVoiceRecording,
};