const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = require("../src/app");
const User = require("../src/models/user.model");
const Task = require("../src/models/task.model");
const StockItem = require("../src/models/stockItem.model");
const StockTransaction = require("../src/models/stockTransaction.model");
const EquipmentRequest = require("../src/models/equipmentRequest.model");
const Expense = require("../src/models/expense.model");
const { generateToken } = require("../src/utils/jwt");

test.describe("E2E Task Management & Equipment Request Workflow Integration Test", () => {
  let server;
  let baseUrl;

  let managerUser;
  let managerToken;
  let staffUserA;
  let staffTokenA;
  let staffUserB;
  let staffTokenB;

  let createdStockItem;
  let createdTaskId;
  let createdEquipmentRequestId;

  const cleanupUserIds = [];
  const cleanupTaskIds = [];
  const cleanupStockItemIds = [];
  const cleanupRequestIds = [];
  const cleanupExpenseIds = [];

  const apiRequest = async (endpoint, method = "GET", token = null, body = null) => {
    const url = new URL(`${baseUrl}${endpoint}`);
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, data };
  };

  test.before(async () => {
    const mongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}/api`;

    const ts = Date.now();
    const hashedPassword = await bcrypt.hash("Password123!", 10);

    // 1. Manager User
    managerUser = await User.create({
      name: "Task Operations Manager",
      username: `manager_${ts}`,
      email: `manager_${ts}@tasktest.com`,
      password: hashedPassword,
      role: "manager",
      department: "Operations",
      isActive: true,
    });
    cleanupUserIds.push(managerUser._id);
    managerToken = generateToken(managerUser);

    // 2. Staff User A
    staffUserA = await User.create({
      name: "Field Technician Alice",
      username: `alice_${ts}`,
      email: `alice_${ts}@tasktest.com`,
      password: hashedPassword,
      role: "staff",
      department: "Technical",
      isActive: true,
    });
    cleanupUserIds.push(staffUserA._id);
    staffTokenA = generateToken(staffUserA);

    // 3. Staff User B
    staffUserB = await User.create({
      name: "Field Technician Bob",
      username: `bob_${ts}`,
      email: `bob_${ts}@tasktest.com`,
      password: hashedPassword,
      role: "staff",
      department: "Technical",
      isActive: true,
    });
    cleanupUserIds.push(staffUserB._id);
    staffTokenB = generateToken(staffUserB);

    // 4. Stock Item
    createdStockItem = await StockItem.create({
      name: `Heavy Duty Power Cord ${ts}`,
      category: "Audio/Visual",
      totalQuantity: 20,
      availableQuantity: 20,
      unit: "pcs",
      isRentable: true,
    });
    cleanupStockItemIds.push(createdStockItem._id);
  });

  test.after(async () => {
    if (cleanupExpenseIds.length) await Expense.deleteMany({ _id: { $in: cleanupExpenseIds } });
    if (cleanupRequestIds.length) await EquipmentRequest.deleteMany({ _id: { $in: cleanupRequestIds } });
    if (cleanupStockItemIds.length) {
      await StockTransaction.deleteMany({ stockItem: { $in: cleanupStockItemIds } });
      await StockItem.deleteMany({ _id: { $in: cleanupStockItemIds } });
    }
    if (cleanupTaskIds.length) await Task.deleteMany({ _id: { $in: cleanupTaskIds } });
    if (cleanupUserIds.length) await User.deleteMany({ _id: { $in: cleanupUserIds } });

    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  test("1. Manager Workflow: Create task with multi-staff, equipment, and voice recording", async () => {
    const payload = {
      title: "Set up Audio System and Test Generators",
      description: "Ensure all high-voltage lines are grounded before connecting sound rack.",
      dueDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      dueTime: "14:00",
      priority: "HIGH",
      assignedStaff: [staffUserA._id.toString()],
      requiredEquipment: [
        {
          item: createdStockItem._id.toString(),
          quantity: 2,
          notes: "Check continuity first",
        },
      ],
      voiceRecording: {
        url: "/uploads/audio/voice-sample-test.webm",
        duration: 25,
        mimeType: "audio/webm",
        transcription: "Make sure all power supplies are surge protected.",
      },
      estimatedExpenses: 2500,
      location: "Main Stage Area",
    };

    const res = await apiRequest("/tasks", "POST", managerToken, payload);
    assert.equal(res.status, 201, `Failed to create task: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.success);
    assert.ok(res.data.data.task);

    const task = res.data.data.task;
    createdTaskId = task._id;
    cleanupTaskIds.push(createdTaskId);

    assert.equal(task.title, payload.title);
    assert.equal(task.status, "ASSIGNED"); // auto-transitions to ASSIGNED when staff assigned
    assert.equal(task.priority, "HIGH");
    assert.equal(task.assignedStaff.length, 1);
    assert.equal(task.voiceRecording.duration, 25);
    assert.equal(task.requiredEquipment.length, 1);

    // Verify persisted directly in MongoDB
    const persisted = await Task.findById(createdTaskId).lean();
    assert.ok(persisted);
    assert.equal(persisted.estimatedExpenses, 2500);
    assert.equal(persisted.statusHistory.length, 1);
  });

  test("2. Staff Scoping & RBAC: Staff A can view assigned task, Staff B cannot", async () => {
    // Staff A requests their tasks
    const resA = await apiRequest("/tasks", "GET", staffTokenA);
    assert.equal(resA.status, 200);
    const staffATasks = resA.data.data;
    assert.ok(Array.isArray(staffATasks));
    const foundA = staffATasks.find((t) => t._id.toString() === createdTaskId.toString());
    assert.ok(foundA, "Staff A should see their assigned task");
    assert.equal(foundA.voiceRecording.url, "/uploads/audio/voice-sample-test.webm");

    // Staff B requests their tasks
    const resB = await apiRequest("/tasks", "GET", staffTokenB);
    assert.equal(resB.status, 200);
    const staffBTasks = resB.data.data;
    const foundB = staffBTasks.find((t) => t._id.toString() === createdTaskId.toString());
    assert.equal(foundB, undefined, "Staff B must NOT see tasks assigned to Staff A");

    // Staff B directly tries to fetch Staff A's task by ID -> 403 Forbidden
    const resDirectB = await apiRequest(`/tasks/${createdTaskId}`, "GET", staffTokenB);
    assert.equal(resDirectB.status, 403, "Staff B should receive 403 Forbidden accessing other staff's task");
  });

  test("3. Task Lifecycle: Staff A starts task (IN_PROGRESS) and completes task (COMPLETED)", async () => {
    // Staff B attempts to update status of Staff A's task -> 403
    const unauthorizedUpdate = await apiRequest(`/tasks/${createdTaskId}/status`, "PATCH", staffTokenB, {
      status: "IN_PROGRESS",
      notes: "Hacking status",
    });
    assert.equal(unauthorizedUpdate.status, 403, "Staff B cannot update status of Staff A's task");

    // Staff A starts task -> IN_PROGRESS
    const startRes = await apiRequest(`/tasks/${createdTaskId}/status`, "PATCH", staffTokenA, {
      status: "IN_PROGRESS",
      notes: "Starting setup on site",
    });
    assert.equal(startRes.status, 200);
    assert.equal(startRes.data.data.task.status, "IN_PROGRESS");

    // Staff A completes task -> COMPLETED
    const completeRes = await apiRequest(`/tasks/${createdTaskId}/status`, "PATCH", staffTokenA, {
      status: "COMPLETED",
      notes: "Setup verified and working",
    });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.data.data.task.status, "COMPLETED");
    assert.ok(completeRes.data.data.task.completedAt);

    // Verify MongoDB history audit trail
    const updatedDoc = await Task.findById(createdTaskId).lean();
    assert.equal(updatedDoc.status, "COMPLETED");
    assert.equal(updatedDoc.statusHistory.length, 3); // CREATED/ASSIGNED, IN_PROGRESS, COMPLETED
  });

  test("4. Manager Edit Workflow: Manager edits task details & priority", async () => {
    const editPayload = {
      priority: "URGENT",
      location: "VIP Main Stage Area",
      notes: "Client requested additional sound check at 13:00",
    };

    const res = await apiRequest(`/tasks/${createdTaskId}`, "PUT", managerToken, editPayload);
    assert.equal(res.status, 200);
    assert.equal(res.data.data.task.priority, "URGENT");
    assert.equal(res.data.data.task.location, "VIP Main Stage Area");

    const inDb = await Task.findById(createdTaskId).lean();
    assert.equal(inDb.priority, "URGENT");
  });

  test("5. Equipment Request Workflow: Staff requests equipment for task", async () => {
    const payload = {
      task: createdTaskId,
      stockItem: createdStockItem._id.toString(),
      requestedQuantity: 5,
      reason: "Need 5 extra power cords for lighting rig",
    };

    const res = await apiRequest("/equipment-requests", "POST", staffTokenA, payload);
    assert.equal(res.status, 201, `Failed to submit equipment request: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.data.request);

    createdEquipmentRequestId = res.data.data.request._id;
    cleanupRequestIds.push(createdEquipmentRequestId);

    assert.equal(res.data.data.request.status, "PENDING");
    assert.equal(res.data.data.request.requestedQuantity, 5);
  });

  test("6. RBAC on Equipment Requests: Staff cannot approve; Manager approves", async () => {
    // Staff A tries to approve their own request -> 403 Forbidden
    const staffApprove = await apiRequest(
      `/equipment-requests/${createdEquipmentRequestId}/approve`,
      "PATCH",
      staffTokenA,
      { managerNotes: "Self-approving" }
    );
    assert.equal(staffApprove.status, 403, "Staff must not be authorized to approve equipment requests");

    // Manager approves request -> 200 OK
    const mgrApprove = await apiRequest(
      `/equipment-requests/${createdEquipmentRequestId}/approve`,
      "PATCH",
      managerToken,
      { managerNotes: "Approved for stage setup" }
    );
    assert.equal(mgrApprove.status, 200);
    assert.equal(mgrApprove.data.data.request.status, "APPROVED");
  });

  test("7. Equipment Issuance & Stock Integrity: Manager issues equipment, stock deducted, StockTransaction created", async () => {
    const initialItem = await StockItem.findById(createdStockItem._id).lean();
    assert.equal(initialItem.availableQuantity, 20);

    // Manager issues equipment
    const issueRes = await apiRequest(
      `/equipment-requests/${createdEquipmentRequestId}/issue`,
      "PATCH",
      managerToken
    );
    assert.equal(issueRes.status, 200);
    assert.equal(issueRes.data.data.request.status, "ISSUED");

    // Verify Stock quantity was deducted from 20 to 15
    const updatedItem = await StockItem.findById(createdStockItem._id).lean();
    assert.equal(updatedItem.availableQuantity, 15);

    // Verify StockTransaction was recorded in MongoDB
    const tx = await StockTransaction.findOne({
      stockItem: createdStockItem._id,
      type: "TAKEN",
      task: createdTaskId,
    }).lean();
    assert.ok(tx, "StockTransaction of type TAKEN must be recorded");
    assert.equal(tx.quantity, 5);
    assert.equal(tx.previousAvailable, 20);
    assert.equal(tx.newAvailable, 15);

    // Duplicate issuance prevention: calling issue again must fail
    const dupIssue = await apiRequest(
      `/equipment-requests/${createdEquipmentRequestId}/issue`,
      "PATCH",
      managerToken
    );
    assert.equal(dupIssue.status, 400, "Duplicate issuance must be rejected");
  });

  test("8. Equipment Return: Equipment returned, stock restored, StockTransaction created", async () => {
    // Return equipment
    const returnRes = await apiRequest(
      `/equipment-requests/${createdEquipmentRequestId}/return`,
      "PATCH",
      managerToken
    );
    assert.equal(returnRes.status, 200);
    assert.equal(returnRes.data.data.request.status, "RETURNED");

    // Verify Stock quantity restored back to 20
    const restoredItem = await StockItem.findById(createdStockItem._id).lean();
    assert.equal(restoredItem.availableQuantity, 20);

    // Verify StockTransaction of type RETURNED was recorded
    const returnTx = await StockTransaction.findOne({
      stockItem: createdStockItem._id,
      type: "RETURNED",
      task: createdTaskId,
    }).lean();
    assert.ok(returnTx, "StockTransaction of type RETURNED must be recorded");
    assert.equal(returnTx.quantity, 5);
    assert.equal(returnTx.newAvailable, 20);

    // Duplicate return prevention
    const dupReturn = await apiRequest(
      `/equipment-requests/${createdEquipmentRequestId}/return`,
      "PATCH",
      managerToken
    );
    assert.equal(dupReturn.status, 400, "Duplicate return must be rejected");
  });

  test("9. Task-Associated Expenses: Create expense without event, tied to task", async () => {
    const expensePayload = {
      title: "Audio Cables and Grounding Clamps",
      category: "Equipment",
      amount: 1450,
      date: new Date().toISOString().split("T")[0],
      paymentMethod: "UPI",
      status: "Paid",
      taskId: createdTaskId.toString(),
      description: "Purchased local grounding clamps for the generator setup",
      // Notice: NO 'event' or 'eventId' provided
    };

    const res = await apiRequest("/expenses", "POST", managerToken, expensePayload);
    assert.equal(res.status, 201, `Failed to create expense: ${JSON.stringify(res.data)}`);
    assert.ok(res.data.success);

    const expenseId = res.data.data.id || res.data.data._id;
    cleanupExpenseIds.push(expenseId);

    // Verify in MongoDB
    const expenseDoc = await Expense.findById(expenseId).lean();
    assert.ok(expenseDoc);
    assert.equal(expenseDoc.amount, 1450);
    assert.equal(expenseDoc.taskId.toString(), createdTaskId.toString());
    assert.ok(expenseDoc.event); // Defaults to task title or "General" without requiring event input

    // Query expenses by taskId
    const listRes = await apiRequest(`/expenses?taskId=${createdTaskId}`, "GET", managerToken);
    assert.equal(listRes.status, 200);
    const matching = (listRes.data.data || []).filter(
      (e) => (e.taskId?._id || e.taskId)?.toString() === createdTaskId.toString()
    );
    assert.ok(matching.length >= 1, "Should retrieve expense filtered by taskId");
  });

  test("10. Audio Voice Recording Upload: Multi-part upload saves file and returns valid URL", async () => {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const audioChunk = Buffer.from("RIFF....WAVEfmt ....data....test-audio-content");

    let body = "";
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="audio"; filename="test-voice-message.webm"\r\n`;
    body += `Content-Type: audio/webm\r\n\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(body, "utf8"),
      audioChunk,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);

    const res = await fetch(`${baseUrl}/tasks/voice-upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managerToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Audio upload failed: ${JSON.stringify(data)}`);
    assert.ok(data.success);
    assert.ok(data.data.url.startsWith("/uploads/audio/"));

    // Verify the file was saved on disk
    const diskPath = path.join(__dirname, "../uploads/audio", data.data.filename);
    const fileExists = fs.existsSync(diskPath);
    assert.ok(fileExists, `Uploaded audio file should exist on disk at ${diskPath}`);

    // Clean up test audio file
    if (fileExists) {
      try {
        fs.unlinkSync(diskPath);
      } catch (e) {}
    }
  });
});
