const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Task = require("../src/models/task.model");
const EquipmentRequest = require("../src/models/equipmentRequest.model");
const Expense = require("../src/models/expense.model");

test.describe("Task & Equipment Request Schema and Model Unit Tests", () => {
  test("1. Task Model: validates required fields and sets default values", () => {
    const task = new Task({
      title: "Inspect Generator Equipment",
    });

    assert.equal(task.title, "Inspect Generator Equipment");
    assert.equal(task.status, "TODO");
    assert.equal(task.priority, "MEDIUM");
    assert.ok(Array.isArray(task.assignedStaff));
    assert.equal(task.assignedStaff.length, 0);
    assert.ok(Array.isArray(task.requiredEquipment));
    assert.equal(task.requiredEquipment.length, 0);
    assert.ok(Array.isArray(task.statusHistory));
  });

  test("2. Task Model: enforces title validation failure when missing", () => {
    const task = new Task({});
    const error = task.validateSync();
    assert.ok(error);
    assert.ok(error.errors.title);
  });

  test("3. Task Model: accepts valid priority and status enums", () => {
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    const statuses = ["TODO", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

    const createdBy = new mongoose.Types.ObjectId();
    const dueDate = new Date();

    priorities.forEach((priority) => {
      const task = new Task({ title: "Priority test", priority, createdBy, dueDate });
      const error = task.validateSync();
      assert.ifError(error);
      assert.equal(task.priority, priority);
    });

    statuses.forEach((status) => {
      const task = new Task({ title: "Status test", status, createdBy, dueDate });
      const error = task.validateSync();
      assert.ifError(error);
      assert.equal(task.status, status);
    });
  });

  test("4. Task Model: rejects invalid priority or status enums", () => {
    const invalidTask = new Task({
      title: "Invalid enums",
      priority: "SUPER_URGENT",
      status: "RUNNING_NOW",
    });
    const error = invalidTask.validateSync();
    assert.ok(error);
    assert.ok(error.errors.priority);
    assert.ok(error.errors.status);
  });

  test("5. Task Model: accommodates voice recording and multi-staff assignment", () => {
    const staffId1 = new mongoose.Types.ObjectId();
    const staffId2 = new mongoose.Types.ObjectId();
    const stockItemId1 = new mongoose.Types.ObjectId();
    const stockItemId2 = new mongoose.Types.ObjectId();
    const createdBy = new mongoose.Types.ObjectId();

    const task = new Task({
      title: "Audio Guided Task",
      createdBy,
      dueDate: new Date(Date.now() + 86400000),
      assignedStaff: [staffId1, staffId2],
      voiceRecording: {
        url: "/uploads/audio/recording-12345.webm",
        duration: 42,
        mimeType: "audio/webm",
        transcription: "Make sure all sound cables are checked before noon.",
      },
      requiredEquipment: [
        { item: stockItemId1, quantity: 3, notes: "Heavy duty" },
        { item: stockItemId2, quantity: 2 },
      ],
      estimatedExpenses: 1500,
    });

    const error = task.validateSync();
    assert.ifError(error);
    assert.equal(task.assignedStaff.length, 2);
    assert.equal(task.voiceRecording.duration, 42);
    assert.equal(task.requiredEquipment.length, 2);
    assert.equal(task.estimatedExpenses, 1500);
  });

  test("6. EquipmentRequest Model: validates required fields and sets defaults", () => {
    const requestedById = new mongoose.Types.ObjectId();
    const stockItemId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();

    const req = new EquipmentRequest({
      requestedBy: requestedById,
      stockItem: stockItemId,
      task: taskId,
      requestedQuantity: 5,
      reason: "Need extra connectors for sound setup",
    });

    const error = req.validateSync();
    assert.ifError(error);
    assert.equal(req.status, "PENDING");
    assert.equal(req.requestedQuantity, 5);
    assert.equal(req.reason, "Need extra connectors for sound setup");
  });

  test("7. EquipmentRequest Model: rejects non-positive requested quantity and missing required refs", () => {
    const req = new EquipmentRequest({
      requestedQuantity: 0,
    });

    const error = req.validateSync();
    assert.ok(error);
    assert.ok(error.errors.requestedBy);
    assert.ok(error.errors.stockItem);
    assert.ok(error.errors.requestedQuantity);
  });

  test("8. EquipmentRequest Model: accepts valid lifecycle statuses", () => {
    const statuses = ["PENDING", "APPROVED", "REJECTED", "ISSUED", "RETURNED", "CANCELLED"];

    statuses.forEach((status) => {
      const req = new EquipmentRequest({
        requestedBy: new mongoose.Types.ObjectId(),
        stockItem: new mongoose.Types.ObjectId(),
        task: new mongoose.Types.ObjectId(),
        requestedQuantity: 1,
        status,
      });

      const error = req.validateSync();
      assert.ifError(error);
      assert.equal(req.status, status);
    });
  });

  test("9. Expense Model: supports taskId linking for task-associated expenses", () => {
    const taskId = new mongoose.Types.ObjectId();
    const expense = new Expense({
      title: "Fuel for transport",
      amount: 1200,
      category: "Transport",
      date: "2026-10-28",
      paymentMethod: "UPI",
      status: "Paid",
      taskId,
      task: "Inspect Generator Equipment",
    });

    const error = expense.validateSync();
    assert.ifError(error);
    assert.equal(expense.taskId.toString(), taskId.toString());
    assert.equal(expense.task, "Inspect Generator Equipment");
    assert.equal(expense.paymentMethod, "UPI");
    assert.equal(expense.status, "Paid");
  });
});
