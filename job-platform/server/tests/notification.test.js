import test from "node:test";
import assert from "node:assert/strict";
import Notification from "../models/Notification.js";
import { listNotifications, markRead, markAllRead } from "../controllers/notificationController.js";
import Application from "../models/Application.js";
import { notify, generateDeadlineReminders } from "../services/notificationService.js";
import { mockRes } from "./helpers.js";

const id = "507f1f77bcf86cd799439011";
const other = "507f191e810c19729de860ea";
const originalApplicationFind = Application.find;
const originals = {
  find: Notification.find, count: Notification.countDocuments,
  one: Notification.findOneAndUpdate, many: Notification.updateMany,
  create: Notification.create, upsert: Notification.updateOne,
};
test.afterEach(() => {
  Application.find = originalApplicationFind;
  Notification.find = originals.find;
  Notification.countDocuments = originals.count;
  Notification.findOneAndUpdate = originals.one;
  Notification.updateMany = originals.many;
  Notification.create = originals.create;
  Notification.updateOne = originals.upsert;
});

test("recruiter sees only their own notifications and unread count", async () => {
  let query;
  Notification.find = (q) => { query = q; return { sort: () => ({ limit: () => ({ lean: async () => [{ title: "New application" }] }) }) }; };
  Notification.countDocuments = async (q) => { assert.equal(q.recipient, id); assert.equal(q.read, false); return 1; };
  const res = mockRes();
  await listNotifications({ user: { _id: id, role: "recruiter" } }, res);
  assert.equal(query.recipient, id);
  assert.equal(res.body.unreadCount, 1);
  assert.equal(res.body.notifications.length, 1);
});

test("mark read requires matching notification recipient", async () => {
  let filter;
  Notification.findOneAndUpdate = async (q) => { filter = q; return null; };
  const res = mockRes();
  await markRead({ params: { id: other }, user: { _id: id } }, res);
  assert.equal(filter.recipient, id);
  assert.equal(res.statusCode, 404);
});

test("invalid notification ID returns 404", async () => {
  const res = mockRes();
  await markRead({ params: { id: "bad" }, user: { _id: id } }, res);
  assert.equal(res.statusCode, 404);
});

test("mark all read is scoped to authenticated user", async () => {
  let filter;
  Notification.updateMany = async (q) => { filter = q; };
  const res = mockRes();
  await markAllRead({ user: { _id: id } }, res);
  assert.deepEqual(filter, { recipient: id, read: false });
  assert.equal(res.statusCode, 200);
});

test("deduplicated deadline reminders use upsert", async () => {
  let options;
  Notification.updateOne = async (q, update, opts) => { options = opts; assert.equal(q.dedupeKey, "deadline:1"); assert.equal(update.$setOnInsert.recipient, id); };
  await notify({ recipient: id, dedupeKey: "deadline:1", type: "deadline_reminder", title: "Deadline", message: "Soon" });
  assert.equal(options.upsert, true);
});

test("regular notifications create a new record", async () => {
  let created;
  Notification.create = async (data) => { created = data; };
  await notify({ recipient: id, type: "status_update", title: "Updated", message: "Reviewing" });
  assert.equal(created.type, "status_update");
});

test("deadline reminders query active applications and the next 48 hours", async () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const deadline = new Date("2026-11-27T12:00:00Z");
  const writes = [];
  Application.find = (filter) => {
    assert.deepEqual(filter, { applicant: id, status: { $in: ["submitted", "reviewing", "shortlisted"] } });
    return { populate: async (options) => {
      assert.deepEqual(options.match, { status: "open", deadline: { $gt: now, $lte: deadline } });
      return [{ _id: other, job: { _id: id, title: "Developer", deadline } }, { job: null }];
    } };
  };
  Notification.updateOne = async (filter, update, options) => writes.push({ filter, update, options });
  await generateDeadlineReminders(id, now);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].filter.dedupeKey, `deadline:${id}:${deadline.toISOString()}`);
  assert.equal(writes[0].update.$setOnInsert.application, other);
  assert.equal(writes[0].options.upsert, true);
});
test("reminder query failure does not hide existing notifications", async () => {
  Application.find = () => { throw new Error("Unavailable"); };
  Notification.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ title: "Existing" }] }) }) });
  Notification.countDocuments = async () => 1;
  const res = mockRes();
  await listNotifications({ user: { _id: id, role: "applicant" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.unreadCount, 1);
});
